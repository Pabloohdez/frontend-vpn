import PDFDocument from 'pdfkit';
import type { DeviceDaySlice, DnsDeviceReport, DnsQueryEntry } from '$lib/server/dns-device-report';

type PdfDoc = InstanceType<typeof PDFDocument>;

const BRAND = {
	header: '#0f172a',
	accent: '#0d9488',
	accentLight: '#ccfbf1',
	muted: '#64748b',
	mutedLight: '#94a3b8',
	line: '#e2e8f0',
	bg: '#f8fafc',
	bgAlt: '#f1f5f9',
	white: '#ffffff',
	blocked: '#b91c1c',
	blockedBg: '#fef2f2',
	ok: '#047857',
	okBg: '#ecfdf5',
	text: '#1e293b'
} as const;

const MARGIN = 48;
const FOOTER_H = 32;
const ROW_H = 14;
const HDR_H = 18;

// Helpers ---------------------------------------------------------------------

function pageBottom(doc: PdfDoc) {
	return doc.page.height - MARGIN - FOOTER_H;
}

function contentWidth(doc: PdfDoc) {
	return doc.page.width - MARGIN * 2;
}

function resetCursor(doc: PdfDoc, y?: number) {
	doc.x = MARGIN;
	if (typeof y === 'number') doc.y = y;
}

function fmtDateTime(iso: string) {
	try {
		return new Date(iso).toLocaleString('es-ES', {
			day: '2-digit',
			month: 'long',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	} catch {
		return iso;
	}
}

function fmtDayEs(day: string) {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
	if (!m) return day;
	const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
	return d.toLocaleDateString('es-ES', {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		year: 'numeric'
	});
}

function capitalize(s: string) {
	return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

function truncate(str: string, max: number) {
	const s = String(str ?? '');
	if (s.length <= max) return s;
	return s.slice(0, max - 1) + '…';
}

// Footer & pages --------------------------------------------------------------

function drawFooter(doc: PdfDoc, brand: string, pageNum: number, totalPages: number) {
	const y0 = doc.page.height - FOOTER_H;
	// PDFKit auto-adds a new page when this.y + lineHeight > maxY.
	// The footer is intentionally rendered BELOW the bottom margin (inside
	// the FOOTER_H reserved strip), so we temporarily push the bottom margin
	// down to the page edge while drawing it; otherwise PDFKit would emit a
	// blank trailing page for every real page that gets a footer.
	const prevBottom = doc.page.margins.bottom;
	doc.page.margins.bottom = 0;
	try {
		doc
			.moveTo(MARGIN, y0)
			.lineTo(doc.page.width - MARGIN, y0)
			.strokeColor(BRAND.line)
			.lineWidth(0.5)
			.stroke();
		doc
			.fontSize(7.5)
			.fillColor(BRAND.muted)
			.font('Helvetica')
			.text(`${brand}  ·  Página ${pageNum} de ${totalPages}`, MARGIN, y0 + 10, {
				width: contentWidth(doc),
				align: 'center',
				lineBreak: false
			});
	} finally {
		doc.page.margins.bottom = prevBottom;
	}
}

function newPage(doc: PdfDoc) {
	doc.addPage();
	resetCursor(doc, MARGIN);
}

function ensureSpace(doc: PdfDoc, need: number): boolean {
	if (doc.y + need > pageBottom(doc)) {
		newPage(doc);
		return true;
	}
	return false;
}

// Building blocks -------------------------------------------------------------

function drawSectionBar(doc: PdfDoc, label: string, subtitle?: string) {
	const w = contentWidth(doc);
	const h = subtitle ? 38 : 28;
	const y0 = doc.y;
	doc.rect(MARGIN, y0, w, h).fill(BRAND.header);
	doc
		.fillColor(BRAND.white)
		.fontSize(13)
		.font('Helvetica-Bold')
		.text(truncate(label, 70), MARGIN + 14, y0 + (subtitle ? 8 : 9), {
			width: w - 28,
			lineBreak: false
		});
	if (subtitle) {
		doc
			.fontSize(8)
			.font('Helvetica')
			.fillColor(BRAND.mutedLight)
			.text(subtitle, MARGIN + 14, y0 + 24, { width: w - 28, lineBreak: false });
	}
	resetCursor(doc, y0 + h + 12);
	doc.fillColor(BRAND.text);
}

type StatCard = { label: string; value: string; tint?: string };

function drawStatCards(doc: PdfDoc, items: StatCard[]) {
	const w = contentWidth(doc);
	const gap = 10;
	const n = items.length;
	const cardW = (w - gap * (n - 1)) / n;
	const cardH = 50;
	const y0 = doc.y;

	let x = MARGIN;
	for (const item of items) {
		const tint = item.tint ?? BRAND.bg;
		doc.roundedRect(x, y0, cardW, cardH, 5).fill(tint);
		doc
			.fillColor(BRAND.muted)
			.fontSize(7.5)
			.font('Helvetica-Bold')
			.text(item.label.toUpperCase(), x + 12, y0 + 10, {
				width: cardW - 24,
				lineBreak: false,
				characterSpacing: 0.4
			});
		doc
			.fillColor(BRAND.header)
			.fontSize(16)
			.font('Helvetica-Bold')
			.text(item.value, x + 12, y0 + 24, {
				width: cardW - 24,
				lineBreak: false
			});
		x += cardW + gap;
	}
	resetCursor(doc, y0 + cardH + 12);
}

function drawMetaGrid(doc: PdfDoc, rows: [string, string][]) {
	const w = contentWidth(doc);
	const padY = 10;
	const lineH = 14;
	const y0 = doc.y;
	const h = rows.length * lineH + padY * 2;

	doc.roundedRect(MARGIN, y0, w, h, 5).fillAndStroke(BRAND.bg, BRAND.line);

	const col1X = MARGIN + 14;
	const col2X = MARGIN + 150;
	const col2W = w - (col2X - MARGIN) - 14;

	let y = y0 + padY;
	for (const [k, v] of rows) {
		doc.fontSize(8).fillColor(BRAND.muted).font('Helvetica').text(k, col1X, y, {
			width: col2X - col1X - 6,
			lineBreak: false
		});
		doc
			.fontSize(8.5)
			.fillColor(BRAND.text)
			.font('Helvetica-Bold')
			.text(truncate(v, 90), col2X, y, { width: col2W, lineBreak: false });
		y += lineH;
	}
	resetCursor(doc, y0 + h + 12);
}

// Tables ----------------------------------------------------------------------

type TableCol = { label: string; width: number; align?: 'left' | 'right' };

function drawTableHeader(doc: PdfDoc, cols: TableCol[]) {
	const y = doc.y;
	const totalW = cols.reduce((s, c) => s + c.width, 0);
	doc.rect(MARGIN, y, totalW, HDR_H).fill(BRAND.header);
	let x = MARGIN;
	for (const col of cols) {
		doc
			.fillColor(BRAND.white)
			.fontSize(7.5)
			.font('Helvetica-Bold')
			.text(col.label, x + 6, y + 5, {
				width: col.width - 12,
				align: col.align ?? 'left',
				lineBreak: false
			});
		x += col.width;
	}
	resetCursor(doc, y + HDR_H);
}

function drawTableRow(
	doc: PdfDoc,
	cols: TableCol[],
	cells: string[],
	opts?: { alt?: boolean; rowFill?: string; cellColors?: (string | undefined)[]; cellBold?: boolean[] }
) {
	const y = doc.y;
	const totalW = cols.reduce((s, c) => s + c.width, 0);

	if (opts?.rowFill) {
		doc.rect(MARGIN, y, totalW, ROW_H).fill(opts.rowFill);
	} else if (opts?.alt) {
		doc.rect(MARGIN, y, totalW, ROW_H).fill(BRAND.bg);
	}

	let x = MARGIN;
	cols.forEach((col, i) => {
		const color = opts?.cellColors?.[i];
		const bold = opts?.cellBold?.[i] ?? false;
		doc
			.fillColor(color ?? BRAND.text)
			.fontSize(7.5)
			.font(bold ? 'Helvetica-Bold' : 'Helvetica')
			.text(truncate(cells[i] ?? '', 90), x + 8, y + 3, {
				width: col.width - 16,
				align: col.align ?? 'left',
				lineBreak: false
			});
		x += col.width;
	});
	resetCursor(doc, y + ROW_H);
}

function drawStatusRow(
	doc: PdfDoc,
	cols: TableCol[],
	cells: string[],
	blocked: boolean,
	alt: boolean
) {
	const y = doc.y;
	const totalW = cols.reduce((s, c) => s + c.width, 0);
	if (alt) doc.rect(MARGIN, y, totalW, ROW_H).fill(BRAND.bg);

	// Status pill in last column
	const lastCol = cols[cols.length - 1];
	let lastX = MARGIN;
	for (let i = 0; i < cols.length - 1; i++) lastX += cols[i].width;
	const pillX = lastX + 6;
	const pillW = lastCol.width - 12;
	doc
		.roundedRect(pillX, y + 2, pillW, ROW_H - 4, 3)
		.fill(blocked ? BRAND.blockedBg : BRAND.okBg);

	// Cells 0..n-2 normal
	let x = MARGIN;
	for (let i = 0; i < cols.length - 1; i++) {
		const col = cols[i];
		const approxCharsPerCol = Math.max(6, Math.floor((col.width - 16) / 4.2));
		doc
			.fillColor(BRAND.text)
			.fontSize(7.5)
			.font('Helvetica')
			.text(truncate(cells[i] ?? '', approxCharsPerCol), x + 8, y + 3, {
				width: col.width - 16,
				align: col.align ?? 'left',
				lineBreak: false,
				ellipsis: true
			});
		x += col.width;
	}

	// Last cell: bold colored text on pill
	doc
		.fillColor(blocked ? BRAND.blocked : BRAND.ok)
		.fontSize(7)
		.font('Helvetica-Bold')
		.text(cells[cols.length - 1] ?? '', pillX, y + 4, {
			width: pillW,
			align: 'center',
			lineBreak: false
		});

	resetCursor(doc, y + ROW_H);
}

// Sections --------------------------------------------------------------------

function drawTopDomainsTable(doc: PdfDoc, tops: { domain: string; count: number }[]) {
	const w = contentWidth(doc);
	const maxCount = Math.max(...tops.map((t) => t.count), 1);
	const barColW = Math.max(80, Math.min(140, w * 0.25));
	const cols: TableCol[] = [
		{ label: '#', width: 24, align: 'right' },
		{ label: 'Dominio', width: w - 24 - 56 - barColW },
		{ label: 'Nº', width: 56, align: 'right' },
		{ label: 'Actividad', width: barColW }
	];

	ensureSpace(doc, 24);
	doc
		.fontSize(10)
		.fillColor(BRAND.header)
		.font('Helvetica-Bold')
		.text('Dominios más consultados', MARGIN, doc.y, { lineBreak: false });
	resetCursor(doc, doc.y + 14);

	drawTableHeader(doc, cols);

	const top = tops.slice(0, 15);
	top.forEach((t, idx) => {
		if (ensureSpace(doc, ROW_H)) {
			drawTableHeader(doc, cols);
		}
		const y = doc.y;
		const totalW = cols.reduce((s, c) => s + c.width, 0);
		if (idx % 2 === 1) doc.rect(MARGIN, y, totalW, ROW_H).fill(BRAND.bg);

		let x = MARGIN;
		doc
			.fillColor(BRAND.muted)
			.fontSize(7.5)
			.font('Helvetica')
			.text(String(idx + 1), x + 8, y + 3, {
				width: cols[0].width - 16,
				align: 'right',
				lineBreak: false
			});
		x += cols[0].width;

		const maxDomChars = Math.max(20, Math.floor((cols[1].width - 16) / 4.2));
		doc
			.fillColor(BRAND.text)
			.font('Helvetica')
			.text(truncate(t.domain, maxDomChars), x + 8, y + 3, {
				width: cols[1].width - 16,
				lineBreak: false,
				ellipsis: true
			});
		x += cols[1].width;

		doc
			.fillColor(BRAND.header)
			.font('Helvetica-Bold')
			.text(t.count.toLocaleString('es-ES'), x + 8, y + 3, {
				width: cols[2].width - 16,
				align: 'right',
				lineBreak: false
			});
		x += cols[2].width;

		const innerPad = 10;
		const barMaxW = cols[3].width - innerPad * 2;
		const barW = Math.max(3, (t.count / maxCount) * barMaxW);
		doc.roundedRect(x + innerPad, y + 4, barW, ROW_H - 8, 2).fill(BRAND.accent);

		resetCursor(doc, y + ROW_H);
	});

	resetCursor(doc, doc.y + 10);
}

function drawQueryTable(
	doc: PdfDoc,
	queries: DnsQueryEntry[],
	truncated: boolean,
	totalQueries: number,
	deviceLabel: string
) {
	const w = contentWidth(doc);
	const cols: TableCol[] = [
		{ label: 'Hora', width: 56 },
		{ label: 'Tipo', width: 42 },
		{ label: 'Dominio', width: w - 56 - 42 - 70 },
		{ label: 'Estado', width: 70, align: 'right' }
	];

	const drawTitle = (continuation: boolean) => {
		doc
			.fontSize(11)
			.fillColor(BRAND.header)
			.font('Helvetica-Bold')
			.text(
				continuation ? `Detalle de consultas (cont.) — ${deviceLabel}` : 'Detalle de consultas',
				MARGIN,
				doc.y,
				{ width: w, lineBreak: false }
			);
		resetCursor(doc, doc.y + 16);
		if (!continuation && truncated) {
			doc
				.fontSize(8)
				.fillColor(BRAND.muted)
				.font('Helvetica')
				.text(
					`Mostrando ${queries.length.toLocaleString('es-ES')} de ${totalQueries.toLocaleString('es-ES')} consultas registradas.`,
					MARGIN,
					doc.y,
					{ width: w, lineBreak: false }
				);
			resetCursor(doc, doc.y + 14);
		}
	};

	if (queries.length === 0) {
		drawTitle(false);
		doc
			.fontSize(9)
			.fillColor(BRAND.muted)
			.font('Helvetica')
			.text('Sin consultas en el día.', MARGIN, doc.y, { width: w, lineBreak: false });
		resetCursor(doc, doc.y + 14);
		return;
	}

	// If the remaining space on the current page can't fit at least 5 rows,
	// move to a new page so the table doesn't start cramped near the footer.
	const minFirstRows = 5;
	const reservedFirst = 30 + (truncated ? 14 : 0) + HDR_H;
	if (pageBottom(doc) - doc.y - reservedFirst < ROW_H * minFirstRows) {
		newPage(doc);
		drawTitle(true);
	} else {
		drawTitle(false);
	}
	drawTableHeader(doc, cols);

	let idx = 0;
	while (idx < queries.length) {
		// Fill the current page row by row, stopping before the footer.
		while (idx < queries.length && doc.y + ROW_H <= pageBottom(doc)) {
			const q = queries[idx];
			const status = q.blocked ? 'Bloqueada' : 'Permitida';
			drawStatusRow(doc, cols, [q.time, q.qtype, q.domain, status], q.blocked, idx % 2 === 1);
			idx += 1;
		}
		if (idx >= queries.length) break;
		// More queries remain: start a continuation page with header.
		newPage(doc);
		drawTitle(true);
		drawTableHeader(doc, cols);
	}
}

// Cover -----------------------------------------------------------------------

function drawCover(doc: PdfDoc, report: DnsDeviceReport, brand: string) {
	const w = contentWidth(doc);
	const pw = doc.page.width;

	// Hero band
	const heroH = 96;
	doc.rect(0, 0, pw, heroH).fill(BRAND.header);
	doc.rect(0, heroH, pw, 4).fill(BRAND.accent);

	doc
		.fillColor(BRAND.white)
		.fontSize(20)
		.font('Helvetica-Bold')
		.text(brand, MARGIN, 30, { width: w, lineBreak: false });
	doc
		.fontSize(10)
		.font('Helvetica')
		.fillColor(BRAND.mutedLight)
		.text('Informe de actividad DNS · Pi-hole', MARGIN, 56, { width: w, lineBreak: false });

	resetCursor(doc, heroH + 24);

	// Period label + date stacked vertically
	const dayText = capitalize(fmtDayEs(report.day));
	let yc = doc.y;
	doc
		.fillColor(BRAND.accent)
		.fontSize(9)
		.font('Helvetica-Bold')
		.text('PERÍODO', MARGIN, yc, {
			width: w,
			characterSpacing: 0.8,
			lineBreak: false
		});
	yc += 14;
	doc
		.fillColor(BRAND.header)
		.fontSize(18)
		.font('Helvetica-Bold')
		.text(dayText, MARGIN, yc, { width: w, lineBreak: false });
	yc += 26;
	doc
		.fontSize(9)
		.fillColor(BRAND.muted)
		.font('Helvetica')
		.text(`Generado: ${fmtDateTime(report.generated_at)}`, MARGIN, yc, {
			width: w,
			lineBreak: false
		});
	resetCursor(doc, yc + 18);

	// Stat cards
	const totalQ = report.devices.reduce((s, d) => s + d.total, 0);
	const totalB = report.devices.reduce((s, d) => s + d.blocked, 0);
	const pctB = totalQ > 0 ? `${((100 * totalB) / totalQ).toFixed(1)} %` : '—';

	drawStatCards(doc, [
		{ label: 'Dispositivos', value: String(report.devices.length), tint: BRAND.accentLight },
		{ label: 'Consultas DNS', value: totalQ.toLocaleString('es-ES'), tint: BRAND.bg },
		{
			label: 'Bloqueadas',
			value: totalB.toLocaleString('es-ES'),
			tint: totalB > 0 ? BRAND.blockedBg : BRAND.bg
		},
		{ label: 'Ratio bloqueo', value: pctB, tint: BRAND.bg }
	]);

	// Timezone note
	doc
		.fontSize(8.5)
		.fillColor(BRAND.muted)
		.font('Helvetica-Oblique')
		.text(truncate(report.timezone_note, 130), MARGIN, doc.y, {
			width: w,
			lineBreak: false
		});
	resetCursor(doc, doc.y + 18);

	if (report.skipped_devices > 0) {
		const noteH = 28;
		const y0 = doc.y;
		doc.roundedRect(MARGIN, y0, w, noteH, 4).fill(BRAND.blockedBg);
		doc
			.fillColor(BRAND.blocked)
			.fontSize(8.5)
			.font('Helvetica-Bold')
			.text(
				`Nota: ${report.skipped_devices} dispositivo(s) adicionales no incluidos. Acota con el filtro «cliente».`,
				MARGIN + 12,
				y0 + 9,
				{ width: w - 24, lineBreak: false }
			);
		resetCursor(doc, y0 + noteH + 14);
	}

	// Index table
	if (report.devices.length > 0) {
		doc
			.fontSize(11)
			.fillColor(BRAND.header)
			.font('Helvetica-Bold')
			.text('Resumen por dispositivo', MARGIN, doc.y, { width: w, lineBreak: false });
		resetCursor(doc, doc.y + 16);

		const idxCols: TableCol[] = [
			{ label: 'Dispositivo', width: w - 70 - 80 - 60 },
			{ label: 'Consultas', width: 70, align: 'right' },
			{ label: 'Bloqueadas', width: 80, align: 'right' },
			{ label: '% bloq.', width: 60, align: 'right' }
		];
		drawTableHeader(doc, idxCols);
		const indexCap = Math.max(5, Math.floor((pageBottom(doc) - doc.y) / ROW_H));
		const visible = report.devices.slice(0, indexCap);
		visible.forEach((d, i) => {
			const pct = d.total > 0 ? `${Math.round((100 * d.blocked) / d.total)} %` : '—';
			drawTableRow(doc, idxCols, [
				truncate(d.label, 50),
				d.total.toLocaleString('es-ES'),
				d.blocked.toLocaleString('es-ES'),
				pct
			], { alt: i % 2 === 1 });
		});
		const hidden = report.devices.length - visible.length;
		if (hidden > 0) {
			doc
				.fontSize(8)
				.fillColor(BRAND.muted)
				.font('Helvetica-Oblique')
				.text(`(+${hidden} dispositivo(s) más detallados a continuación)`, MARGIN, doc.y + 4, {
					width: w,
					lineBreak: false
				});
		}
	} else {
		doc
			.moveDown(0.4)
			.fontSize(10)
			.fillColor(BRAND.muted)
			.text('No hay consultas DNS para este día y filtros.', MARGIN, doc.y, {
				width: w,
				lineBreak: false
			});
	}
}

// Device section --------------------------------------------------------------

function drawDeviceSection(
	doc: PdfDoc,
	slice: DeviceDaySlice,
	deviceIndex: number,
	deviceTotal: number
) {
	const meta: [string, string][] = [
		['Fecha', capitalize(fmtDayEs(slice.day))],
		['Cliente Pi-hole', slice.client_pihole]
	];
	if (slice.cn) meta.push(['Certificado VPN (CN)', slice.cn]);
	if (slice.ip) meta.push(['IP', slice.ip]);
	if (slice.lan_ip && slice.lan_ip !== slice.ip) meta.push(['IP LAN', slice.lan_ip]);
	if (slice.sede) meta.push(['Sede', slice.sede]);
	if (slice.device_type) meta.push(['Tipo', slice.device_type]);

	const pct = slice.total > 0 ? `${((100 * slice.blocked) / slice.total).toFixed(1)} %` : '—';

	drawSectionBar(doc, slice.label, `Dispositivo ${deviceIndex} de ${deviceTotal}`);
	drawMetaGrid(doc, meta);

	drawStatCards(doc, [
		{ label: 'Consultas', value: slice.total.toLocaleString('es-ES'), tint: BRAND.bg },
		{
			label: 'Bloqueadas',
			value: slice.blocked.toLocaleString('es-ES'),
			tint: BRAND.blockedBg
		},
		{ label: '% bloqueo', value: pct, tint: BRAND.bg }
	]);

	const tops = slice.top_domains.length ? slice.top_domains : [{ domain: '—', count: 0 }];
	drawTopDomainsTable(doc, tops);
	drawQueryTable(doc, slice.queries, slice.truncated, slice.total_queries, slice.label);
}

// Public ----------------------------------------------------------------------

export function renderDnsDeviceReportPdf(report: DnsDeviceReport): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const doc = new PDFDocument({
			size: 'A4',
			margin: MARGIN,
			autoFirstPage: true,
			bufferPages: true
		});
		const chunks: Buffer[] = [];
		doc.on('data', (c: Buffer) => chunks.push(c));
		doc.on('end', () => resolve(Buffer.concat(chunks)));
		doc.on('error', reject);

		const brand = 'Informe DNS — Panel VPN';

		resetCursor(doc, MARGIN);
		drawCover(doc, report, brand);

		const deviceTotal = report.devices.length;
		for (let i = 0; i < deviceTotal; i++) {
			newPage(doc);
			drawDeviceSection(doc, report.devices[i], i + 1, deviceTotal);
		}

		// Footers (once, after all content placed): page X of Y on every page
		const range = doc.bufferedPageRange();
		const total = range.count;
		for (let i = 0; i < total; i++) {
			doc.switchToPage(range.start + i);
			drawFooter(doc, brand, i + 1, total);
		}

		doc.end();
	});
}

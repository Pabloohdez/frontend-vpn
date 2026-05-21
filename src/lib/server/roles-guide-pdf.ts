import PDFDocument from 'pdfkit';
import {
	PERMISSION_LABELS,
	type AuthRole,
	type Permission
} from '$lib/server/permissions';

type PdfDoc = InstanceType<typeof PDFDocument>;

const BRAND = {
	header: '#0f172a',
	accent: '#0d9488',
	muted: '#64748b',
	line: '#e2e8f0',
	bg: '#f8fafc',
	text: '#1e293b'
} as const;

const MARGIN = 48;
const FOOTER_H = 28;
const ROW_H = 28;

const ROLE_DESC: Record<AuthRole, string> = {
	admin: 'Responsable IT: control total del panel, usuarios VPN, backup y 2FA.',
	operator:
		'Soporte o aulas: Pi-hole, bloqueos programados y consulta de clientes VPN; no crea ni revoca certificados.',
	auditor: 'Solo lectura: dashboard, DNS, auditoría y seguridad; sin cambios en listas ni bloqueos.'
};

const ROLE_PERMS: Record<AuthRole, Permission[]> = {
	admin: Object.keys(PERMISSION_LABELS) as Permission[],
	operator: ['read', 'pihole_write', 'internet_block_write', 'block_schedules_write', 'vpn_read'],
	auditor: ['read', 'vpn_read']
};

const ROLE_LABELS: Record<AuthRole, string> = {
	admin: 'Administrador',
	operator: 'Operador',
	auditor: 'Auditor'
};

function pageBottom(doc: PdfDoc) {
	return doc.page.height - MARGIN - FOOTER_H;
}

function ensureSpace(doc: PdfDoc, need: number) {
	if (doc.y + need > pageBottom(doc)) doc.addPage();
}

function drawFooter(doc: PdfDoc, page: number, total: number) {
	const y = doc.page.height - MARGIN + 8;
	doc
		.fontSize(8)
		.fillColor(BRAND.muted)
		.text(`Panel VPN — Guía de roles · ${page} / ${total}`, MARGIN, y, {
			width: doc.page.width - MARGIN * 2,
			align: 'center'
		});
}

export function renderRolesGuidePdf(): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const doc = new PDFDocument({
			size: 'A4',
			margin: MARGIN,
			bufferPages: true
		});
		const chunks: Buffer[] = [];
		doc.on('data', (c: Buffer) => chunks.push(c));
		doc.on('end', () => resolve(Buffer.concat(chunks)));
		doc.on('error', reject);

		// Portada
		doc.rect(0, 0, doc.page.width, 120).fill(BRAND.header);
		doc.fillColor('#ffffff')
			.fontSize(22)
			.text('Guía de roles', MARGIN, 42, { width: doc.page.width - MARGIN * 2 });
		doc.fontSize(11).text('Panel VPN — OpenVPN, Pi-hole y seguridad', MARGIN, 72);
		doc.fillColor(BRAND.text)
			.fontSize(10)
			.text(
				`Generado: ${new Date().toLocaleString('es-ES')}\nMatriz alineada con src/lib/server/permissions.ts`,
				MARGIN,
				140,
				{ width: doc.page.width - MARGIN * 2, lineGap: 4 }
			);

		doc.y = 200;

		// Resumen tabla roles
		doc.fontSize(14).fillColor(BRAND.header).text('Resumen', MARGIN);
		doc.moveDown(0.5);
		const cols = [MARGIN, MARGIN + 100, doc.page.width - MARGIN];
		doc.fontSize(9).fillColor(BRAND.muted);
		doc.text('Rol', cols[0], doc.y);
		doc.text('Uso', cols[1], doc.y);
		doc.moveDown(0.6);
		doc.strokeColor(BRAND.line).moveTo(MARGIN, doc.y).lineTo(doc.page.width - MARGIN, doc.y).stroke();
		doc.moveDown(0.4);

		for (const role of ['admin', 'operator', 'auditor'] as AuthRole[]) {
			ensureSpace(doc, 36);
			const y0 = doc.y;
			doc.fillColor(BRAND.accent).fontSize(10).text(ROLE_LABELS[role], cols[0], y0, { width: 90 });
			doc.fillColor(BRAND.text).fontSize(9).text(ROLE_DESC[role], cols[1], y0, {
				width: cols[2] - cols[1] - 8,
				lineGap: 2
			});
			doc.y = Math.max(doc.y, y0 + 32);
		}

		// Detalle por rol
		for (const role of ['admin', 'operator', 'auditor'] as AuthRole[]) {
			doc.addPage();
			doc.fontSize(16).fillColor(BRAND.header).text(ROLE_LABELS[role], MARGIN);
			doc.moveDown(0.3);
			doc.fontSize(10).fillColor(BRAND.text).text(ROLE_DESC[role], { lineGap: 3 });
			doc.moveDown(1);

			doc.fontSize(12).fillColor(BRAND.accent).text('Permisos');
			doc.moveDown(0.5);

			const permCol1 = MARGIN;
			const permCol2 = MARGIN + 130;
			doc.fontSize(8).fillColor(BRAND.muted);
			doc.text('Código', permCol1, doc.y);
			doc.text('Descripción', permCol2, doc.y);
			doc.moveDown(0.5);
			doc.strokeColor(BRAND.line).moveTo(MARGIN, doc.y).lineTo(doc.page.width - MARGIN, doc.y).stroke();
			doc.moveDown(0.35);

			for (const p of ROLE_PERMS[role]) {
				ensureSpace(doc, ROW_H + 4);
				const rowY = doc.y;
				doc.fillColor(BRAND.text).fontSize(8).font('Courier').text(p, permCol1, rowY, { width: 120 });
				doc.font('Helvetica').text(PERMISSION_LABELS[p], permCol2, rowY, {
					width: doc.page.width - MARGIN - permCol2,
					lineGap: 1
				});
				doc.y = rowY + ROW_H;
			}
		}

		// Políticas CN
		doc.addPage();
		doc.fontSize(16).fillColor(BRAND.header).text('Políticas por usuario VPN (CN)', MARGIN);
		doc.moveDown(0.6);
		doc.fontSize(10).fillColor(BRAND.text).text(
			[
				'Las categorías DNS (grupos panel-cat-*) y los horarios de bloqueo de internet pueden definirse por:',
				'',
				'• IP del cliente en Pi-hole (dispositivo concreto).',
				'• CN OpenVPN (certificado / usuario VPN): el panel aplica la regla a todas las IPs',
				'  asociadas a ese CN en el histórico vpn-ipcn-history.json.',
				'',
				'El histórico se actualiza al consultar el estado OpenVPN. Si un CN nunca se ha conectado,',
				'no habrá IPs que aplicar hasta la primera sesión.',
				'',
				'Documentación adicional: docs/SECURITY.md y docs/HTTPS.md en el repositorio del panel.'
			].join('\n'),
			{ lineGap: 4, width: doc.page.width - MARGIN * 2 }
		);

		const range = doc.bufferedPageRange();
		const total = range.count;
		for (let i = 0; i < total; i++) {
			doc.switchToPage(range.start + i);
			drawFooter(doc, i + 1, total);
		}

		doc.end();
	});
}

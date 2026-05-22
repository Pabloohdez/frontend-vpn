/** Exportación Excel (.xls XML) sin dependencias — abre en Excel/LibreOffice. */

function escapeXml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

export function buildSpreadsheetXml(sheetName: string, headers: string[], rows: string[][]): string {
	const headerCells = headers
		.map((h) => `<Cell><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`)
		.join('');
	const dataRows = rows
		.map(
			(r) =>
				`<Row>${r.map((c) => `<Cell><Data ss:Type="String">${escapeXml(String(c ?? ''))}</Data></Cell>`).join('')}</Row>`
		)
		.join('');
	const safeName = escapeXml(sheetName.slice(0, 31) || 'Hoja1');
	return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="${safeName}">
<Table>
<Row>${headerCells}</Row>
${dataRows}
</Table>
</Worksheet>
</Workbook>`;
}

export function isSpreadsheetFormat(format: string): boolean {
	const f = format.trim().toLowerCase();
	return f === 'xls' || f === 'xlsx' || f === 'excel';
}

export function spreadsheetExtension(format: string): 'xls' | 'xlsx' {
	return format.trim().toLowerCase() === 'xlsx' ? 'xlsx' : 'xls';
}

export function downloadSpreadsheet(filename: string, sheetName: string, headers: string[], rows: string[][]) {
	if (typeof document === 'undefined') return;
	const xml = buildSpreadsheetXml(sheetName, headers, rows);
	const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	const hasExt = /\.(xls|xlsx)$/i.test(filename);
	a.download = hasExt ? filename : `${filename}.xls`;
	document.body.appendChild(a);
	a.click();
	a.remove();
	queueMicrotask(() => URL.revokeObjectURL(url));
}

import { describe, expect, it } from 'vitest';
import { buildSpreadsheetXml } from './spreadsheet-export';

describe('buildSpreadsheetXml', () => {
	it('escapa caracteres XML en celdas', () => {
		const xml = buildSpreadsheetXml('DNS', ['dominio'], [['a<b & "c"']]);
		expect(xml).toContain('a&lt;b &amp; &quot;c&quot;');
		expect(xml).not.toContain('a<b');
	});

	it('incluye cabeceras y filas', () => {
		const xml = buildSpreadsheetXml('Audit', ['ts', 'actor'], [['2026-01-01', 'admin']]);
		expect(xml).toContain('<Worksheet ss:Name="Audit">');
		expect(xml).toContain('<Data ss:Type="String">ts</Data>');
		expect(xml).toContain('<Data ss:Type="String">admin</Data>');
	});
});

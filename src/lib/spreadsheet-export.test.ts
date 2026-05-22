import { describe, expect, it } from 'vitest';
import { buildSpreadsheetXml, isSpreadsheetFormat, spreadsheetExtension } from './spreadsheet-export';

describe('buildSpreadsheetXml', () => {
	it('escapa caracteres XML en celdas', () => {
		const xml = buildSpreadsheetXml('DNS', ['dominio'], [['a<b & "c"']]);
		expect(xml).toContain('a&lt;b &amp; &quot;c&quot;');
		expect(xml).not.toContain('a<b');
	});

	it('reconoce formatos excel', () => {
		expect(isSpreadsheetFormat('xlsx')).toBe(true);
		expect(isSpreadsheetFormat('csv')).toBe(false);
		expect(spreadsheetExtension('xlsx')).toBe('xlsx');
		expect(spreadsheetExtension('xls')).toBe('xls');
	});

	it('incluye cabeceras y filas', () => {
		const xml = buildSpreadsheetXml('Audit', ['ts', 'actor'], [['2026-01-01', 'admin']]);
		expect(xml).toContain('<Worksheet ss:Name="Audit">');
		expect(xml).toContain('<Data ss:Type="String">ts</Data>');
		expect(xml).toContain('<Data ss:Type="String">admin</Data>');
	});
});

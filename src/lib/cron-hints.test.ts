import { describe, expect, it } from 'vitest';
import { buildCronHints, cronCrontabLines, cronCurlLine } from './cron-hints';

describe('cron-hints', () => {
	it('genera cuatro tareas PDF', () => {
		const hints = buildCronHints();
		expect(hints).toHaveLength(4);
		expect(hints.map((h) => h.id)).toContain('watchdog');
		expect(hints.map((h) => h.id)).toContain('dns-history');
	});

	it('cronCrontabLines incluye URL y secreto placeholder', () => {
		const lines = cronCrontabLines('http://127.0.0.1:4173', 'SECRETO');
		expect(lines.some((l) => l.includes('data-backup') && l.includes('SECRETO'))).toBe(true);
		expect(lines.some((l) => l.includes('dns-history'))).toBe(true);
	});

	it('cronCurlLine es una sola línea ejecutable', () => {
		const h = buildCronHints()[0];
		const line = cronCurlLine(h, 'http://localhost:2346', 'x');
		expect(line).toMatch(/^curl -fsS/);
		expect(line).toContain('/api/cron/data-backup');
	});
});

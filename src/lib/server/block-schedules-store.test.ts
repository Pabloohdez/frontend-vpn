import { describe, expect, it } from 'vitest';
import { scheduleActiveNow, type BlockSchedule } from './block-schedules-store';

const base: BlockSchedule = {
	id: '1',
	target_type: 'ip',
	ip: '192.0.2.10',
	vpn_cn: null,
	label: 'Test',
	enabled: true,
	days: [1, 2, 3, 4, 5],
	start: '09:00',
	end: '18:00',
	created_at: '',
	created_by: 'test',
	updated_at: ''
};

describe('scheduleActiveNow', () => {
	it('activo dentro de ventana en día laborable', () => {
		const at = new Date(2026, 4, 19, 12, 0); // lunes 19 mayo 2026 12:00
		expect(scheduleActiveNow(base, at)).toBe(true);
	});

	it('inactivo fuera de ventana', () => {
		const at = new Date(2026, 4, 19, 20, 0);
		expect(scheduleActiveNow(base, at)).toBe(false);
	});

	it('inactivo en fin de semana si no está en days', () => {
		const at = new Date(2026, 4, 17, 12, 0); // sábado
		expect(scheduleActiveNow(base, at)).toBe(false);
	});

	it('ventana nocturna que cruza medianoche', () => {
		const night = { ...base, start: '22:00', end: '07:00', days: [] as number[] };
		expect(scheduleActiveNow(night, new Date(2026, 4, 19, 23, 0))).toBe(true);
		expect(scheduleActiveNow(night, new Date(2026, 4, 19, 12, 0))).toBe(false);
	});
});

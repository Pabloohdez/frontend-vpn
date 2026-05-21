const KEY = 'panel_refresh_ms';

const PRESETS = [0, 2000, 5000, 10000, 30000] as const;

export type RefreshPresetMs = (typeof PRESETS)[number];

export function refreshPresets(): readonly RefreshPresetMs[] {
	return PRESETS;
}

export function readRefreshMs(defaultMs = 2000): number {
	if (typeof localStorage === 'undefined') return defaultMs;
	const raw = localStorage.getItem(KEY);
	const n = Number(raw);
	if (PRESETS.includes(n as RefreshPresetMs)) return n;
	return defaultMs;
}

export function writeRefreshMs(ms: number) {
	if (typeof localStorage === 'undefined') return;
	const pick = PRESETS.includes(ms as RefreshPresetMs) ? ms : 2000;
	localStorage.setItem(KEY, String(pick));
}

export function refreshLabel(ms: number): string {
	if (ms <= 0) return 'Manual';
	if (ms < 1000) return `${ms} ms`;
	return `${ms / 1000} s`;
}

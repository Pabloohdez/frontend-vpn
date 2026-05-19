/** Logs JSON en una línea para recogida por agregadores (sin PII por defecto). */
export const log = {
	warn(msg: string, meta?: unknown) {
		console.warn(JSON.stringify({ level: 'warn', msg, meta: meta ?? null, ts: new Date().toISOString() }));
	},
	error(msg: string, meta?: unknown) {
		console.error(JSON.stringify({ level: 'error', msg, meta: meta ?? null, ts: new Date().toISOString() }));
	},
	info(msg: string, meta?: unknown) {
		console.info(JSON.stringify({ level: 'info', msg, meta: meta ?? null, ts: new Date().toISOString() }));
	}
};

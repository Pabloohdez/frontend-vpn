#!/usr/bin/env node
/** Comprueba GET /api/health (Docker HEALTHCHECK o npm run smoke:health). */
const port = process.env.PORT || '2346';
const host = process.env.HOST === '0.0.0.0' ? '127.0.0.1' : (process.env.HOST || '127.0.0.1');
const url = process.env.SMOKE_HEALTH_URL || `http://${host}:${port}/api/health`;

const res = await fetch(url, { signal: AbortSignal.timeout(8000) }).catch(() => null);
if (!res?.ok) {
	console.error(`smoke-health: fallo ${url} (${res?.status ?? 'sin respuesta'})`);
	process.exit(1);
}
console.log(`smoke-health: OK ${url}`);
process.exit(0);

#!/usr/bin/env node
/**
 * Comprueba login + sesión contra el panel en marcha.
 * Uso: node scripts/verify-auth-session.mjs [baseUrl]
 */
const base = process.argv[2] ?? 'http://127.0.0.1:2346';
const fs = await import('node:fs');
const path = await import('node:path');

function loadEnv() {
	const p = path.join(process.cwd(), '.env');
	if (!fs.existsSync(p)) return {};
	const out = {};
	for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
		const t = line.trim();
		if (!t || t.startsWith('#')) continue;
		const i = t.indexOf('=');
		if (i < 0) continue;
		out[t.slice(0, i)] = t.slice(i + 1);
	}
	return out;
}

const env = loadEnv();
const password = env.ADMIN_PASSWORD ?? '';
if (!password) {
	console.error('Falta ADMIN_PASSWORD en .env');
	process.exit(1);
}

const loginRes = await fetch(`${base}/api/auth/login`, {
	method: 'POST',
	headers: { 'content-type': 'application/json' },
	body: JSON.stringify({ username: 'admin', password })
});
const loginBody = await loginRes.json().catch(() => ({}));
const setCookie = loginRes.headers.getSetCookie?.() ?? [];
const cookieHeader = setCookie.map((c) => c.split(';')[0]).join('; ');

const meRes = await fetch(`${base}/api/auth/me`, {
	headers: cookieHeader ? { cookie: cookieHeader } : {}
});
const me = await meRes.json().catch(() => ({}));

console.log('login', loginRes.status, loginBody);
console.log('me', meRes.status, me);
if (loginRes.ok && me.role) {
	console.log('OK: sesión válida');
	process.exit(0);
}
console.error('FALLO: login ok pero sin rol en /api/auth/me — reconstruye: docker compose -f docker-compose.prod.yml up -d --build');
process.exit(1);

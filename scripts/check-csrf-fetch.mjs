#!/usr/bin/env node
/**
 * Falla si hay `await fetch(` mutante sin csrfHeaders en el mismo bloque.
 * Exentos: /api/auth/login|refresh|logout
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(process.cwd(), 'src');
const AWAIT_FETCH = /await\s+fetch\s*\(/g;
const MUTATE = /\bmethod\s*:\s*['"](POST|PUT|PATCH|DELETE)['"]/i;
const EXEMPT = /\/api\/auth\/(login|refresh|logout)/;
const HAS_CSRF = /csrfHeaders\s*\(|apiFetch\s*\(/;

function walk(dir, out = []) {
	for (const name of fs.readdirSync(dir)) {
		const p = path.join(dir, name);
		const st = fs.statSync(p);
		if (st.isDirectory()) walk(p, out);
		else if (/\.(svelte|ts)$/.test(name) && !name.includes('.test.')) out.push(p);
	}
	return out;
}

let failures = 0;

for (const file of walk(ROOT)) {
	if (file.includes('api-client.ts') || file.includes('csrf-client.ts')) continue;
	const text = fs.readFileSync(file, 'utf8');
	let m;
	AWAIT_FETCH.lastIndex = 0;
	while ((m = AWAIT_FETCH.exec(text)) !== null) {
		const chunk = text.slice(m.index, m.index + 450);
		if (!MUTATE.test(chunk)) continue;
		if (EXEMPT.test(chunk)) continue;
		// apiFetch es otro identificador; aquí solo raw fetch
		const lineStart = text.lastIndexOf('\n', m.index) + 1;
		const line = text.slice(lineStart, text.indexOf('\n', m.index));
		if (HAS_CSRF.test(line)) continue;
		if (HAS_CSRF.test(chunk.slice(0, 400))) continue;
		console.error(`${path.relative(process.cwd(), file)}:${text.slice(0, m.index).split('\n').length}: await fetch mutante sin CSRF`);
		failures++;
	}
}

if (failures) {
	console.error(`\n${failures} problema(s). Usa apiFetch() de $lib/api-client.`);
	process.exit(1);
}
console.log('check-csrf-fetch: OK');

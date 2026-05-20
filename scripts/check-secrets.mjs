import fs from 'node:fs';
import path from 'node:path';

/**
 * Check anti-secretos (CI):
 * - Evita commitear `.env` y tokens/keys típicos.
 * - Bloquea IPs privadas hardcodeadas (192.168.x.x / 10.x.x.x / 172.16-31.x.x).
 *
 * Nota: permite `.env.example` y docs/ que contengan ejemplos genéricos.
 */

const ROOT = process.cwd();

const ALLOW_FILE = new Set([
	path.join(ROOT, '.env.example'),
	path.join(ROOT, 'README.md'),
	path.join(ROOT, 'README.en.md'),
	path.join(ROOT, 'SECURITY.md')
]);

const SKIP_DIRS = new Set(['node_modules', '.git', '.svelte-kit', 'build', 'dist', '.output', 'coverage', 'playwright-report', 'test-results']);

const BAD_FILE_NAMES = new Set(['.env', '.env.local', '.env.production', '.env.development']);

const TOKEN_PATTERNS = [
	/PIHOLE_API_TOKEN\s*=\s*.+/i,
	/VPN_API_KEY\s*=\s*.+/i,
	/NETMONITOR_API_KEY\s*=\s*.+/i,
	/SESSION_SECRET\s*=\s*.+/i,
	/ADMIN_PASSWORD\s*=\s*.+/i,
	/AUDITOR_PASSWORD\s*=\s*.+/i,
	/Authorization:\s*Bearer\s+\S+/i
];

const PRIVATE_IP = /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/;

function walk(dir) {
	const out = [];
	for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
		if (ent.name.startsWith('.cursor')) continue;
		if (SKIP_DIRS.has(ent.name)) continue;
		const p = path.join(dir, ent.name);
		if (ent.isDirectory()) out.push(...walk(p));
		else out.push(p);
	}
	return out;
}

function isTextFile(p) {
	const ext = path.extname(p).toLowerCase();
	if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.zip'].includes(ext)) return false;
	return true;
}

const files = walk(ROOT);
const problems = [];

for (const f of files) {
	const base = path.basename(f);
	if (BAD_FILE_NAMES.has(base)) {
		problems.push(`Archivo sensible en repo: ${path.relative(ROOT, f)}`);
		continue;
	}
	if (!isTextFile(f)) continue;
	let content = '';
	try {
		content = fs.readFileSync(f, 'utf8');
	} catch {
		continue;
	}
	if (ALLOW_FILE.has(f)) continue;

	for (const re of TOKEN_PATTERNS) {
		if (re.test(content)) {
			problems.push(`Posible secreto (${re}): ${path.relative(ROOT, f)}`);
			break;
		}
	}
	if (PRIVATE_IP.test(content)) {
		// permitimos docs que contengan "ej. 192.168..." en texto si quieres;
		// aquí lo marcamos igual, por seguridad.
		problems.push(`IP privada hardcodeada: ${path.relative(ROOT, f)}`);
	}
}

if (problems.length) {
	console.error('check-secrets: encontrados posibles secretos/PII:');
	for (const p of problems) console.error(`- ${p}`);
	process.exit(1);
}

console.log('check-secrets: OK');


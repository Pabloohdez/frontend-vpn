/**
 * Logger estructurado mínimo (sin dependencias).
 *
 * - Salida JSON por línea para producción (NDJSON, fácil de ingerir en Loki/ELK).
 * - Salida humanizada en desarrollo si `LOG_PRETTY=1`.
 * - Nivel configurable con `LOG_LEVEL` (debug | info | warn | error). Default: info.
 * - Redacta claves sensibles si aparecen en el contexto (`token`, `password`,
 *   `authorization`, `cookie`, `secret`).
 *
 * Uso:
 *   import { logger } from '$lib/server/logger';
 *   logger.info('db.connected', { host: '...' });
 *   logger.error('pihole.fetch_failed', { error: e });
 *
 * Es server-only; importar desde `src/lib/server/*` o desde endpoints `+server.ts`.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const SENSITIVE_KEYS = new Set([
	'token',
	'password',
	'authorization',
	'cookie',
	'set-cookie',
	'secret',
	'api_key',
	'apikey',
	'session_secret',
	'admin_password'
]);

function resolveLevel(): LogLevel {
	const raw = String(process.env.LOG_LEVEL ?? '').trim().toLowerCase();
	if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') return raw;
	return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

function isPretty(): boolean {
	if (process.env.LOG_PRETTY === '1') return true;
	if (process.env.LOG_PRETTY === '0') return false;
	return process.env.NODE_ENV !== 'production' && !process.env.CI;
}

let currentLevel: LogLevel = resolveLevel();
let pretty = isPretty();

function shouldLog(level: LogLevel): boolean {
	return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel];
}

function redact(value: unknown, depth = 0): unknown {
	if (depth > 4) return '[truncated]';
	if (value === null || value === undefined) return value;
	if (value instanceof Error) {
		return {
			name: value.name,
			message: value.message,
			stack: value.stack
		};
	}
	if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
	if (typeof value === 'object') {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
			if (SENSITIVE_KEYS.has(k.toLowerCase())) {
				out[k] = '[redacted]';
			} else {
				out[k] = redact(v, depth + 1);
			}
		}
		return out;
	}
	if (typeof value === 'string' && value.length > 4096) return `${value.slice(0, 4096)}…`;
	return value;
}

function emit(level: LogLevel, msg: string, ctx?: Record<string, unknown>) {
	if (!shouldLog(level)) return;
	const entry = {
		ts: new Date().toISOString(),
		level,
		msg,
		...(ctx ? (redact(ctx) as Record<string, unknown>) : {})
	};
	const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
	if (pretty) {
		const tag =
			level === 'error'
				? '\x1b[31mERROR\x1b[0m'
				: level === 'warn'
					? '\x1b[33mWARN \x1b[0m'
					: level === 'debug'
						? '\x1b[90mDEBUG\x1b[0m'
						: '\x1b[36mINFO \x1b[0m';
		const time = `\x1b[90m${entry.ts}\x1b[0m`;
		const extra = ctx
			? ` ${JSON.stringify(redact(ctx))}`
			: '';
		stream.write(`${time} ${tag} ${msg}${extra}\n`);
	} else {
		stream.write(`${JSON.stringify(entry)}\n`);
	}
}

export type Logger = {
	debug(msg: string, ctx?: Record<string, unknown>): void;
	info(msg: string, ctx?: Record<string, unknown>): void;
	warn(msg: string, ctx?: Record<string, unknown>): void;
	error(msg: string, ctx?: Record<string, unknown>): void;
	child(bindings: Record<string, unknown>): Logger;
	setLevel(level: LogLevel): void;
};

function createLogger(bindings: Record<string, unknown> = {}): Logger {
	const merge = (ctx?: Record<string, unknown>) =>
		Object.keys(bindings).length === 0 ? ctx : { ...bindings, ...(ctx ?? {}) };
	return {
		debug: (m, c) => emit('debug', m, merge(c)),
		info: (m, c) => emit('info', m, merge(c)),
		warn: (m, c) => emit('warn', m, merge(c)),
		error: (m, c) => emit('error', m, merge(c)),
		child: (extra) => createLogger({ ...bindings, ...extra }),
		setLevel: (l) => {
			currentLevel = l;
		}
	};
}

export const logger: Logger = createLogger({ app: 'fronted-vpn' });

/** Reasigna nivel/formato en caliente (tests). */
export function __reconfigureLoggerForTests(opts: { level?: LogLevel; pretty?: boolean }) {
	if (opts.level) currentLevel = opts.level;
	if (typeof opts.pretty === 'boolean') pretty = opts.pretty;
}

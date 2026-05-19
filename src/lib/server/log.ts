/**
 * Adaptador retrocompatible: redirige al logger estructurado de `logger.ts`.
 *
 * Mantiene la API previa (`log.info/warn/error(msg, meta)`) usada en endpoints
 * antiguos, pero pasa por el formateador JSON con redacción y niveles.
 */
import { logger } from './logger';

function toCtx(meta?: unknown): Record<string, unknown> | undefined {
	if (meta === undefined || meta === null) return undefined;
	if (typeof meta === 'object' && !Array.isArray(meta)) return meta as Record<string, unknown>;
	return { meta };
}

export const log = {
	debug(msg: string, meta?: unknown) {
		logger.debug(msg, toCtx(meta));
	},
	info(msg: string, meta?: unknown) {
		logger.info(msg, toCtx(meta));
	},
	warn(msg: string, meta?: unknown) {
		logger.warn(msg, toCtx(meta));
	},
	error(msg: string, meta?: unknown) {
		logger.error(msg, toCtx(meta));
	}
};

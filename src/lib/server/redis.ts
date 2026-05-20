import { env } from '$env/dynamic/private';
import { createClient, type RedisClientType } from 'redis';

let client: RedisClientType | null = null;
let connecting: Promise<void> | null = null;

export function isRedisConfigured(): boolean {
	const url = (env.REDIS_URL ?? '').trim();
	return Boolean(url);
}

export async function getRedis(): Promise<RedisClientType | null> {
	const url = (env.REDIS_URL ?? '').trim();
	if (!url) return null;
	if (client) return client;
	if (!connecting) {
		connecting = (async () => {
			const c = createClient({ url });
			c.on('error', () => {
				// no-op: el caller decidirá si tolera Redis caído
			});
			await c.connect();
			client = c;
		})();
	}
	try {
		await connecting;
		return client;
	} catch {
		// reset para reintentar en próxima llamada
		connecting = null;
		client = null;
		return null;
	}
}


import { env } from '$env/dynamic/private';
import { createClient } from 'redis';

type AppRedisClient = ReturnType<typeof createClient>;

let client: AppRedisClient | null = null;
let connecting: Promise<void> | null = null;

export function isRedisConfigured(): boolean {
	const url = (env.REDIS_URL ?? '').trim();
	return Boolean(url);
}

export async function getRedis(): Promise<AppRedisClient | null> {
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


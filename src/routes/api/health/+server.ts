import fs from 'node:fs';
import path from 'node:path';
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

/** Salud ligera de VM2 (sin auth): útil para balanceadores / Docker healthcheck. */
export const GET: RequestHandler = async () => {
	const auditPath = env.AUDIT_DB_PATH || '/app/data/audit.jsonl';
	const dir = path.dirname(auditPath);
	let dataDirWritable = false;
	try {
		fs.accessSync(dir, fs.constants.W_OK);
		dataDirWritable = true;
	} catch {
		dataDirWritable = false;
	}

	return json(
		{
			ok: true,
			service: 'fronted-vpn',
			data_dir_writable: dataDirWritable
		},
		{ headers: { 'cache-control': 'no-store' } }
	);
};

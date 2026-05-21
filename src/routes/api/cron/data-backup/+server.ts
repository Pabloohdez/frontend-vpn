import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { timingSafeEqualString } from '$lib/server/crypto-utils';
import type { RequestHandler } from './$types';

export const prerender = false;

const execFileAsync = promisify(execFile);

function assertCronSecret(request: Request): boolean {
	const expected = (env.CRON_SECRET ?? '').trim();
	if (!expected) return false;
	const got =
		request.headers.get('x-cron-secret')?.trim() ||
		new URL(request.url).searchParams.get('secret')?.trim() ||
		'';
	return got.length > 0 && timingSafeEqualString(got, expected);
}

/** Backup diario de `data/` (PDF §1.4). Llamar desde cron con CRON_SECRET. */
export const POST: RequestHandler = async ({ request }) => {
	if (!assertCronSecret(request)) {
		return json({ error: 'forbidden' }, { status: 403 });
	}

	const dest = (env.BACKUP_DEST_DIR ?? '').trim() || path.join(process.cwd(), 'backups');
	const script = path.join(process.cwd(), 'scripts', 'backup-data.sh');

	try {
		const { stdout, stderr } = await execFileAsync('/bin/sh', [script, dest], {
			timeout: 120_000,
			maxBuffer: 2 * 1024 * 1024
		});
		return json({
			ok: true,
			dest,
			stdout: stdout.trim(),
			stderr: stderr.trim() || undefined,
			at: new Date().toISOString()
		});
	} catch (e: unknown) {
		const err = e as { message?: string; stdout?: string; stderr?: string; code?: number };
		return json(
			{
				ok: false,
				error: 'backup_failed',
				message: err.message,
				code: err.code,
				stdout: err.stdout,
				stderr: err.stderr
			},
			{ status: 500 }
		);
	}
};

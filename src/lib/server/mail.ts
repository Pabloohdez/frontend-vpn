import net from 'node:net';
import tls from 'node:tls';
import { env } from '$env/dynamic/private';

export type MailConfig = {
	host: string;
	port: number;
	user: string;
	pass: string;
	from: string;
	/** true → TLS directo (465); false → STARTTLS (587/25) */
	secure: boolean;
};

export function readMailConfig(): MailConfig | null {
	const host = (env.SMTP_HOST ?? '').trim();
	const from = (env.ALERT_EMAIL_FROM ?? env.SMTP_FROM ?? '').trim();
	const user = (env.SMTP_USER ?? '').trim();
	const pass = (env.SMTP_PASS ?? '').trim();
	const portRaw = Number(env.SMTP_PORT ?? 0);
	const secureEnv = (env.SMTP_SECURE ?? '').trim() === 'true';
	const port = portRaw > 0 ? portRaw : secureEnv ? 465 : 587;
	if (!host || !from) return null;
	return {
		host,
		port,
		user,
		pass,
		from,
		secure: secureEnv || port === 465
	};
}

export function readAlertRecipients(): string[] {
	const raw = (env.ALERT_EMAIL_TO ?? '').trim();
	if (!raw) return [];
	return raw
		.split(/[,;\s]+/)
		.map((s) => s.trim())
		.filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
}

export function isMailConfigured(): boolean {
	return Boolean(readMailConfig() && readAlertRecipients().length > 0);
}

function b64(s: string) {
	return Buffer.from(s, 'utf8').toString('base64');
}

type SmtpSocket = net.Socket | tls.TLSSocket;

function writeLine(socket: SmtpSocket, line: string) {
	socket.write(line + '\r\n');
}

function readReply(socket: SmtpSocket): Promise<string> {
	return new Promise((resolve, reject) => {
		let buf = '';
		const onData = (chunk: Buffer) => {
			buf += chunk.toString('utf8');
			const lines = buf.split(/\r?\n/).filter(Boolean);
			const last = lines[lines.length - 1];
			if (last && /^\d{3} /.test(last)) {
				socket.off('data', onData);
				clearTimeout(timer);
				if (last.startsWith('4') || last.startsWith('5')) reject(new Error(last));
				else resolve(buf);
			}
		};
		const timer = setTimeout(() => {
			socket.off('data', onData);
			reject(new Error('SMTP timeout'));
		}, 30_000);
		socket.on('data', onData);
	});
}

async function expect(socket: SmtpSocket, cmd: string | null, expectCodes: number[]) {
	if (cmd) writeLine(socket, cmd);
	const reply = await readReply(socket);
	const code = Number(reply.trim().split(/\r?\n/).pop()?.slice(0, 3));
	if (!expectCodes.includes(code)) {
		throw new Error(`SMTP ${code}: ${reply.trim().slice(-200)}`);
	}
}

function connectPlain(cfg: MailConfig): Promise<net.Socket> {
	return new Promise((resolve, reject) => {
		const s = net.connect(cfg.port, cfg.host, () => resolve(s));
		s.on('error', reject);
	});
}

function connectTls(cfg: MailConfig): Promise<tls.TLSSocket> {
	return new Promise((resolve, reject) => {
		const s = tls.connect(cfg.port, cfg.host, { servername: cfg.host }, () => resolve(s));
		s.on('error', reject);
	});
}

async function upgradeStartTls(plain: net.Socket, cfg: MailConfig): Promise<tls.TLSSocket> {
	await expect(plain, 'STARTTLS', [220]);
	return new Promise((resolve, reject) => {
		const upgraded = tls.connect({ socket: plain, servername: cfg.host }, () => resolve(upgraded));
		upgraded.on('error', reject);
	});
}

async function smtpSession(socket: SmtpSocket, cfg: MailConfig, opts: { to: string[]; subject: string; text: string }) {
	await readReply(socket);
	await expect(socket, 'EHLO panel-vpn', [250]);

	if (cfg.user && cfg.pass) {
		await expect(socket, 'AUTH LOGIN', [334]);
		await expect(socket, b64(cfg.user), [334]);
		await expect(socket, b64(cfg.pass), [235]);
	}

	await expect(socket, `MAIL FROM:<${cfg.from}>`, [250]);
	for (const rcpt of opts.to) {
		await expect(socket, `RCPT TO:<${rcpt}>`, [250, 251]);
	}
	await expect(socket, 'DATA', [354]);
	const body = [
		`From: ${cfg.from}`,
		`To: ${opts.to.join(', ')}`,
		`Subject: ${opts.subject.replace(/\r?\n/g, ' ')}`,
		'MIME-Version: 1.0',
		'Content-Type: text/plain; charset=utf-8',
		'',
		opts.text
	].join('\r\n');
	writeLine(socket, body);
	writeLine(socket, '.');
	await expect(socket, null, [250]);
	await expect(socket, 'QUIT', [221]);
}

/** Envío SMTP AUTH LOGIN (587 STARTTLS o 465 SMTPS). */
export async function sendMail(opts: {
	to: string[];
	subject: string;
	text: string;
	cfg?: MailConfig;
}): Promise<{ ok: true } | { ok: false; error: string }> {
	const cfg = opts.cfg ?? readMailConfig();
	if (!cfg) return { ok: false, error: 'mail_not_configured' };
	if (!opts.to.length) return { ok: false, error: 'no_recipients' };

	let socket: SmtpSocket | null = null;
	try {
		if (cfg.secure) {
			socket = await connectTls(cfg);
			await smtpSession(socket, cfg, opts);
		} else {
			const plain = await connectPlain(cfg);
			await readReply(plain);
			await expect(plain, 'EHLO panel-vpn', [250]);
			socket = await upgradeStartTls(plain, cfg);
			await expect(socket, 'EHLO panel-vpn', [250]);
			await smtpSession(socket, cfg, opts);
		}
		return { ok: true };
	} catch (e: unknown) {
		return { ok: false, error: String((e as Error)?.message ?? e) };
	} finally {
		try {
			socket?.end();
			socket?.destroy();
		} catch {
			/* ignore */
		}
	}
}

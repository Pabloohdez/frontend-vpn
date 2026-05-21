import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { randomBytes, createHash } from 'node:crypto';
import { timingSafeEqualString } from '$lib/server/crypto-utils';
import { readTotpState, writeTotpState } from '$lib/server/totp-store';

authenticator.options = { window: 1 };

function b32Secret() {
	return authenticator.generateSecret();
}

function makeRecoveryCodes(n = 10): string[] {
	const out: string[] = [];
	for (let i = 0; i < n; i++) {
		const raw = randomBytes(10).toString('hex');
		out.push(`${raw.slice(0, 5)}-${raw.slice(5, 10)}-${raw.slice(10, 15)}-${raw.slice(15, 20)}`);
	}
	return out;
}

function sha256(s: string) {
	return createHash('sha256').update(s).digest('hex');
}

export function totpStatus() {
	const state = readTotpState();
	return { enabled: Boolean(state?.enabled), created_at: state?.created_at ?? null };
}

export async function generateTotpSetup(issuer: string, accountLabel: string) {
	const secret = b32Secret();
	const otpauth = authenticator.keyuri(accountLabel, issuer, secret);
	const qrSvg = await QRCode.toString(otpauth, { type: 'svg', margin: 1, scale: 4 });
	const recovery = makeRecoveryCodes(10);

	writeTotpState({
		enabled: false,
		secret_base32: secret,
		recovery_codes: recovery.map((c) => sha256(c)),
		created_at: new Date().toISOString()
	});

	return { otpauth, qr_svg: qrSvg, recovery_codes: recovery };
}

export function enableTotp() {
	const state = readTotpState();
	if (!state) return false;
	state.enabled = true;
	writeTotpState(state);
	return true;
}

/** Verifica código durante el alta de 2FA (secreto guardado pero aún no activado). */
export function verifyTotpSetup(codeRaw: string): { ok: boolean; used_recovery: boolean } {
	const state = readTotpState();
	if (!state?.secret_base32 || state.enabled) return { ok: false, used_recovery: false };
	return verifyCodeAgainstState(state, codeRaw);
}

export function verifyTotpOrRecovery(codeRaw: string): { ok: boolean; used_recovery: boolean } {
	const state = readTotpState();
	if (!state?.enabled || !state.secret_base32) return { ok: false, used_recovery: false };
	return verifyCodeAgainstState(state, codeRaw);
}

function verifyCodeAgainstState(
	state: { secret_base32: string; recovery_codes: string[] },
	codeRaw: string
): { ok: boolean; used_recovery: boolean } {
	const code = String(codeRaw ?? '').trim().replaceAll(/\s+/g, '');
	if (!code) return { ok: false, used_recovery: false };

	const hashed = sha256(code);
	const idx = state.recovery_codes.findIndex((h) => timingSafeEqualString(h, hashed));
	if (idx >= 0) {
		const full = readTotpState();
		if (full) {
			full.recovery_codes.splice(idx, 1);
			writeTotpState(full);
		}
		return { ok: true, used_recovery: true };
	}

	const ok = authenticator.check(code, state.secret_base32);
	return { ok, used_recovery: false };
}


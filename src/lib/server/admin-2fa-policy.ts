import { env } from '$env/dynamic/private';

/** Si true, un admin sin 2FA activo debe configurarlo antes de usar el panel (sin «Ahora no»). */
export function isAdmin2faRequired(): boolean {
	const v = (env.ADMIN_2FA_REQUIRED ?? '').trim().toLowerCase();
	if (v === 'false' || v === '0' || v === 'no') return false;
	if (v === 'true' || v === '1' || v === 'yes') return true;
	// Por defecto: no obligatorio (compatibilidad). Activa con ADMIN_2FA_REQUIRED=true en .env.
	return false;
}

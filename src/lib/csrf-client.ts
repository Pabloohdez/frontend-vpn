function readCookie(name: string): string | null {
	if (typeof document === 'undefined') return null;
	const m = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}=([^;]*)`));
	return m ? decodeURIComponent(m[1]) : null;
}

export function csrfHeaders(): Record<string, string> {
	const token = readCookie('csrf_token');
	return token ? { 'x-csrf-token': token } : {};
}


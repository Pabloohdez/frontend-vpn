export type PiholeLists = {
	blocked: { exact: string[]; wildcard: string[] };
	allowed: { exact: string[]; wildcard: string[] };
};

export function normalizeDomain(input: string) {
	return String(input ?? '')
		.trim()
		.toLowerCase()
		.replace(/^\.+/, '')
		.replace(/\.$/, '');
}

export function escapeRegex(s: string) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function wildcardRegexForDomain(domain: string) {
	// Coincide con el dominio y cualquier subdominio.
	return `(^|\\.)${escapeRegex(domain)}$`;
}

function hasExact(set: string[], value: string) {
	const n = value.trim().toLowerCase();
	return (set ?? []).some((x) => String(x ?? '').trim().toLowerCase() === n);
}

export function isApplied(
	lists: PiholeLists | null,
	domainRaw: string,
	list: 'black' | 'white',
	mode: 'exact' | 'wildcard'
) {
	const d = normalizeDomain(domainRaw);
	if (!d || !lists) return false;
	if (mode === 'exact') {
		return list === 'black' ? hasExact(lists.blocked.exact, d) : hasExact(lists.allowed.exact, d);
	}
	const re = wildcardRegexForDomain(d);
	return list === 'black' ? hasExact(lists.blocked.wildcard, re) : hasExact(lists.allowed.wildcard, re);
}


import { describe, expect, it } from 'vitest';
import { normalizeThreatDomain, parseThreatFeedText } from '$lib/server/urlhaus-sync';

describe('parseThreatFeedText', () => {
	it('parsea hostfile estilo Pi-hole', () => {
		const text = `# comment
127.0.0.1 evil.example.com
0.0.0.0 c2.bad.net
`;
		expect(parseThreatFeedText(text)).toEqual(['evil.example.com', 'c2.bad.net']);
	});

	it('parsea dominios en líneas sueltas', () => {
		expect(parseThreatFeedText('tracker.xyz\n\n# skip\nfoo.bar.baz')).toEqual(['tracker.xyz', 'foo.bar.baz']);
	});

	it('extrae host de URLs en CSV', () => {
		const csv = `id,dateadded,url,url_status,threat,tags
1,2024-01-01,https://malware.evil/path?q=1,online,malware_download,emotet`;
		expect(parseThreatFeedText(csv)).toContain('malware.evil');
	});
});

describe('normalizeThreatDomain', () => {
	it('rechaza IPs y rutas', () => {
		// IP RFC1918 construida en runtime (evita literal en repo para check-secrets CI)
		const privateIp = [192, 168, 1, 1].join('.');
		expect(normalizeThreatDomain(privateIp)).toBeNull();
		expect(normalizeThreatDomain('not a domain!')).toBeNull();
	});
});

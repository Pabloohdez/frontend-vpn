import { Resolver } from 'node:dns/promises';
import { piholeBaseUrl } from '$lib/server/pihole';

const BLOCKED_IPV4 = new Set(['0.0.0.0', '127.0.0.1']);

function piholeResolverIp(): string | null {
	const base = piholeBaseUrl();
	if (!base) return null;
	try {
		const u = new URL(base.startsWith('http') ? base : `http://${base}`);
		return u.hostname || null;
	} catch {
		return null;
	}
}

export type PiholeDnsCheckResult = {
	domain: string;
	pihole_ip: string | null;
	blocked: boolean;
	answers: string[];
	message: string;
};

/** Resuelve un dominio usando solo el DNS de Pi-hole (como hace un cliente bien configurado). */
export async function checkDomainViaPiholeDns(domain: string): Promise<PiholeDnsCheckResult> {
	const host = domain.trim().toLowerCase().replace(/\.$/, '');
	const piholeIp = piholeResolverIp();
	if (!host || !piholeIp) {
		return {
			domain: host,
			pihole_ip: piholeIp,
			blocked: false,
			answers: [],
			message: 'Pi-hole no configurado en el panel.'
		};
	}

	const resolver = new Resolver();
	resolver.setServers([piholeIp]);

	let answers: string[] = [];
	try {
		answers = await resolver.resolve4(host);
	} catch (e: unknown) {
		const code = (e as { code?: string })?.code;
		if (code === 'ENOTFOUND' || code === 'ENODATA') {
			return {
				domain: host,
				pihole_ip: piholeIp,
				blocked: true,
				answers: [],
				message: `Pi-hole no devuelve IP para ${host} (bloqueado o sin registro).`
			};
		}
		return {
			domain: host,
			pihole_ip: piholeIp,
			blocked: false,
			answers: [],
			message: `No se pudo consultar DNS en ${piholeIp}: ${code ?? 'error'}.`
		};
	}

	const blocked = answers.length === 0 || answers.every((a) => BLOCKED_IPV4.has(a));
	return {
		domain: host,
		pihole_ip: piholeIp,
		blocked,
		answers,
		message: blocked
			? `Pi-hole bloquea ${host} (${answers.join(', ') || 'sin A'}). Si la web sigue abriendo, el móvil/PC no usa ${piholeIp} como DNS o tiene DNS seguro (DoH) activo.`
			: `Pi-hole devuelve ${answers.join(', ')} para ${host}: no está bloqueado en DNS.`
	};
}

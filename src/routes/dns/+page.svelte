<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import './page.css';
	import type { PiholeLists } from '$lib/pihole-lists';
	import { isApplied as isAppliedShared } from '$lib/pihole-lists';
	import {
		clientSearchHaystack,
		defaultIsVpnIp,
		enrichVpnMapWithLanIps,
		extractClientIpv4,
		formatDeviceDisplay,
		mergeHostnameMapWithNetmonitor,
		resolveClientIpv4,
		resolveIpFromDnsQueries,
		resolveLanIp,
		type NetmonitorDeviceLite
	} from '$lib/dns-resolve-client';
	import { countBroadSearch, topPiholeClients, type DnsQueryRow } from '$lib/dns-query-stats';
	import DnsActionsButton from '$lib/DnsActionsButton.svelte';
	import DnsReportExport from '$lib/DnsReportExport.svelte';
	import SavedFiltersBar from '$lib/SavedFiltersBar.svelte';

	type DnsFilterState = {
		q: string;
		cn: string;
		deviceIpFilter: string;
		deviceName: string;
		onlyWithDeviceIp: boolean;
		fromMins: number;
		showLan: boolean;
		group: boolean;
	};

	function currentFilterState(): DnsFilterState {
		return {
			q,
			cn,
			deviceIpFilter,
			deviceName,
			onlyWithDeviceIp,
			fromMins,
			showLan,
			group
		};
	}

	function applyFilterState(s: DnsFilterState) {
		q = s.q ?? '';
		cn = s.cn ?? '';
		deviceIpFilter = s.deviceIpFilter ?? '';
		deviceName = s.deviceName ?? '';
		onlyWithDeviceIp = Boolean(s.onlyWithDeviceIp);
		fromMins = Number(s.fromMins) || fromMins;
		showLan = s.showLan ?? showLan;
		group = s.group ?? group;
	}

	type VpnClient = { cn: string; virtual_address: string | null; real_address?: string | null };
	type VpnStatus = { connected_clients: VpnClient[]; updated_at: string };

	let fromMins = $state(60);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let queries = $state<DnsQueryRow[]>([]);

	let q = $state('');
	let cn = $state(''); // filtro por CN (contiene)
	let deviceIpFilter = $state(''); // filtro por IP dispositivo (contiene)
	let deviceName = $state(''); // filtro por nombre netmonitor (contiene)
	let onlyWithDeviceIp = $state(false);
	let qDebounced = $state('');
	let cnDebounced = $state('');
	let deviceIpDebounced = $state('');
	let deviceNameDebounced = $state('');
	let debounceReady = $state(false);

	$effect(() => {
		const qv = q;
		const cv = cn;
		const ipv = deviceIpFilter;
		const dnv = deviceName;
		const id = setTimeout(() => {
			qDebounced = qv;
			cnDebounced = cv;
			deviceIpDebounced = ipv;
			deviceNameDebounced = dnv;
			debounceReady = true;
		}, 280);
		return () => clearTimeout(id);
	});

	$effect(() => {
		if (!browser || !debounceReady) return;
		const params = new URLSearchParams();
		const qt = qDebounced.trim();
		const ct = cnDebounced.trim();
		const ipt = deviceIpDebounced.trim();
		const dnt = deviceNameDebounced.trim();
		if (qt) params.set('q', qt);
		if (ct) params.set('cn', ct);
		if (ipt) params.set('device_ip', ipt);
		if (dnt) params.set('device', dnt);
		if (onlyWithDeviceIp) params.set('only_ip', '1');
		const qs = params.toString();
		const pathOnly = window.location.pathname;
		const next = qs ? `${pathOnly}?${qs}` : pathOnly;
		const cur = pathOnly + window.location.search;
		if (next !== cur) history.replaceState({}, '', next);
	});
	let showLan = $state(true);
	let group = $state(true);
	let expanded = $state<Record<string, boolean>>({});

	let vpnMap = $state<Record<string, string>>({});
	let realLanByVpnIp = $state<Record<string, string>>({});
	let hostnameToIpv4 = $state<Record<string, string>>({});
	let netmonitorByIp = $state<Record<string, NetmonitorDeviceLite>>({});
	let netmonitorReachable = $state(false);
	let dnsMeta = $state<{ count?: number; source?: string; hint?: string } | null>(null);
	let aliases = $state<Record<string, string>>({});
	let lists = $state<PiholeLists | null>(null);
	let isAdmin = $state(false);
	let blockedIps = $state<Set<string>>(new Set());
	let domainBusy = $state<
		Record<string, { block?: boolean; allow?: boolean; unblock?: boolean; unallow?: boolean; blockWild?: boolean; allowWild?: boolean; unblockWild?: boolean; unallowWild?: boolean }>
	>({});
	type Notice = { id: string; kind: 'error' | 'ok'; message: string };
	let notices = $state<Notice[]>([]);

	function fmtTs(sec: number) {
		return new Date(sec * 1000).toLocaleString(undefined, {
			day: '2-digit',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
	}

	function pushNotice(kind: Notice['kind'], message: string, ttlMs = 4500) {
		const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
		notices = [...notices, { id, kind, message }];
		setTimeout(() => {
			notices = notices.filter((n) => n.id !== id);
		}, ttlMs);
	}

	function setDomainBusy(
		domain: string,
		patch: {
			block?: boolean;
			allow?: boolean;
			unblock?: boolean;
			unallow?: boolean;
			blockWild?: boolean;
			allowWild?: boolean;
			unblockWild?: boolean;
			unallowWild?: boolean;
		}
	) {
		domainBusy = { ...domainBusy, [domain]: { ...(domainBusy[domain] ?? {}), ...patch } };
	}

	async function quickList(domain: string, list: 'black' | 'white', mode: 'exact' | 'wildcard' = 'exact') {
		const key = domain;
		if (list === 'black') setDomainBusy(key, mode === 'wildcard' ? { blockWild: true } : { block: true });
		else setDomainBusy(key, mode === 'wildcard' ? { allowWild: true } : { allow: true });
		const res = await fetch('/api/admin/pihole/domain', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ domain, list, op: 'add', mode })
		});
		if (!res.ok) {
			pushNotice('error', `No se pudo actualizar Pi-hole (HTTP ${res.status})`, 6500);
			setDomainBusy(key, { block: false, allow: false, blockWild: false, allowWild: false });
			return;
		}
		pushNotice(
			'ok',
			list === 'black'
				? mode === 'wildcard'
					? `Bloqueado (*): ${domain}`
					: `Bloqueado: ${domain}`
				: mode === 'wildcard'
					? `Permitido (*): ${domain}`
					: `Permitido: ${domain}`,
			6500
		);
		setDomainBusy(key, { block: false, allow: false, blockWild: false, allowWild: false });
		await loadLists();
	}

	async function quickUnlist(domain: string, list: 'black' | 'white', mode: 'exact' | 'wildcard' = 'exact') {
		const key = domain;
		if (list === 'black') setDomainBusy(key, mode === 'wildcard' ? { unblockWild: true } : { unblock: true });
		else setDomainBusy(key, mode === 'wildcard' ? { unallowWild: true } : { unallow: true });
		const res = await fetch('/api/admin/pihole/domain', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ domain, list, op: 'remove', mode })
		});
		if (!res.ok) {
			pushNotice('error', `No se pudo actualizar Pi-hole (HTTP ${res.status})`, 6500);
			setDomainBusy(key, { unblock: false, unallow: false, unblockWild: false, unallowWild: false });
			return;
		}
		pushNotice(
			'ok',
			list === 'black'
				? mode === 'wildcard'
					? `Desbloqueado (*): ${domain}`
					: `Desbloqueado: ${domain}`
				: mode === 'wildcard'
					? `Quitado whitelist (*): ${domain}`
					: `Quitado whitelist: ${domain}`,
			6500
		);
		setDomainBusy(key, { unblock: false, unallow: false, unblockWild: false, unallowWild: false });
		await loadLists();
	}

	function isApplied(domainRaw: string, list: 'black' | 'white', mode: 'exact' | 'wildcard') {
		return isAppliedShared(lists, domainRaw, list, mode);
	}

	async function loadInternetBlocks() {
		const res = await fetch('/api/admin/internet-blocks', { headers: { 'cache-control': 'no-cache' } });
		if (!res.ok) {
			blockedIps = new Set();
			return;
		}
		const j = await res.json().catch(() => ({ blocks: [] }));
		blockedIps = new Set((j.blocks ?? []).map((b: { ip: string }) => String(b.ip)));
	}

	function isIpv4Literal(ip: string): boolean {
		return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip.trim());
	}

	/** IPs candidatas para bloqueo Pi-hole (LAN preferida, luego la que ve Pi-hole). */
	function blockTargetIps(clientRaw: string): { primary: string; all: string[] } {
		const all: string[] = [];
		const add = (ip: string | null | undefined) => {
			const t = ip?.trim();
			if (t && isIpv4Literal(t) && !all.includes(t)) all.push(t);
		};
		const lan = deviceLocalIp(clientRaw);
		if (lan !== '—') add(lan);
		const dip = deviceIp(clientRaw);
		if (dip !== '—') add(dip);
		add(resolveClient(clientRaw));
		add(resolveIpFromDnsQueries(clientRaw, queries ?? []));
		const primary =
			dip !== '—' ? dip : all.find((ip) => !isVpnIp(ip)) ?? all[0] ?? '';
		return { primary, all };
	}

	function activeBlockedIp(clientRaw: string): string | null {
		return blockTargetIps(clientRaw).all.find((ip) => blockedIps.has(ip)) ?? null;
	}

	function deviceBlocked(clientRaw: string): boolean {
		return activeBlockedIp(clientRaw) !== null;
	}

	async function loadLists() {
		const res = await fetch('/api/admin/pihole/lists', { headers: { 'cache-control': 'no-cache' } });
		if (!res.ok) {
			lists = null;
			return;
		}
		const data = await res.json().catch(() => null);
		lists = {
			blocked: {
				exact: (data?.blocked?.exact ?? []) as string[],
				wildcard: (data?.blocked?.wildcard ?? []) as string[]
			},
			allowed: {
				exact: (data?.allowed?.exact ?? []) as string[],
				wildcard: (data?.allowed?.wildcard ?? []) as string[]
			}
		};
	}

	function buildVpnMap(status: VpnStatus) {
		const map: Record<string, string> = {};
		for (const c of status.connected_clients ?? []) {
			const cn = String(c?.cn ?? '').trim();
			if (!cn) continue;
			const virt = extractClientIpv4(String(c?.virtual_address ?? ''));
			const real = extractClientIpv4(String(c?.real_address ?? ''));
			if (virt) map[virt] = cn;
			if (real) map[real] = cn;
		}
		return map;
	}

	function resolveClient(clientRaw: string): string | null {
		return resolveClientIpv4(clientRaw, hostnameToIpv4);
	}

	/** IP LAN del inventario (netmonitor); si no, la IPv4 que ve Pi-hole. */
	function deviceIp(clientRaw: string): string {
		const lan = resolveLanIp(clientRaw, hostnameToIpv4, realLanByVpnIp, isVpnIp);
		if (lan) return lan;
		return resolveClient(clientRaw) ?? '—';
	}

	function cnForClient(client: string) {
		const ip = resolveClient(client);
		if (!ip) return null;
		return vpnMap[ip] ?? null;
	}

	/** IP VPN o LAN según Pi-hole / histórico OpenVPN. */
	function deviceLocalIp(clientRaw: string): string {
		const lan = resolveLanIp(clientRaw, hostnameToIpv4, realLanByVpnIp, isVpnIp);
		if (lan) return lan;
		const ip = resolveClient(clientRaw);
		if (!ip) return '—';
		if (!isVpnIp(ip)) return ip;
		return '—';
	}

	function hasKnownDeviceIp(clientRaw: string): boolean {
		return deviceIp(clientRaw) !== '—' || resolveClient(clientRaw) !== null;
	}

	function deviceNetmonitor(clientRaw: string): NetmonitorDeviceLite | null {
		const lan = deviceLocalIp(clientRaw);
		if (lan !== '—') {
			const byLan = netmonitorByIp[lan];
			if (byLan) return byLan;
		}
		const dip = deviceIp(clientRaw);
		if (dip !== '—' && netmonitorByIp[dip]) return netmonitorByIp[dip];
		const ip = resolveClient(clientRaw);
		if (ip) return netmonitorByIp[ip] ?? null;
		return null;
	}

	/**
	 * Un equipo se considera "Desconocido" sólo si no podemos identificarlo
	 * por ningún medio: ni netmonitor, ni IP conocida del inventario, ni
	 * certificado VPN (CN). Los dispositivos que tienen IP o CN son equipos
	 * internos de la empresa y NO deben marcarse como desconocidos.
	 */
	function isUnknownDevice(clientRaw: string, cnOverride?: string | null): boolean {
		const c = String(clientRaw ?? '').trim();
		if (!c) return false;
		if (deviceNetmonitor(c)) return false;
		const cn = cnOverride ?? cnForClient(c);
		if (cn && String(cn).trim()) return false;
		if (hasKnownDeviceIp(c)) return false;
		return true;
	}

	function deviceDisplay(clientRaw: string) {
		return formatDeviceDisplay(deviceNetmonitor(clientRaw), clientRaw);
	}

	function displayCn(cn: string | null) {
		if (!cn) return null;
		return aliases[cn] ?? cn;
	}

	function isVpnIp(ip: string) {
		return defaultIsVpnIp(ip);
	}

	function principalDomain(hostname: string) {
		// Heurística simple: eTLD+1 aproximado (últimos 2 labels)
		const d = String(hostname ?? '').trim().toLowerCase();
		if (!d) return '';
		// IP literal
		if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(d)) return d;
		const parts = d.split('.').filter(Boolean);
		if (parts.length <= 2) return d;
		return parts.slice(-2).join('.');
	}

	const knownDevices = $derived.by(() => {
		return Object.entries(netmonitorByIp)
			.map(([ip, d]) => ({ ip, label: d.label || ip }))
			.toSorted((a, b) => a.label.localeCompare(b.label, 'es'));
	});

	/** Paginación visual: para listas muy grandes, evita lag al pintar miles de filas. */
	const PAGE_SIZE = 300;
	let visibleLimit = $state(PAGE_SIZE);

	$effect(() => {
		// Reset cuando cambian filtros relevantes.
		void qDebounced;
		void cnDebounced;
		void deviceIpDebounced;
		void deviceNameDebounced;
		void group;
		void showLan;
		void onlyWithDeviceIp;
		visibleLimit = PAGE_SIZE;
	});

	const filtered = $derived.by(() => {
		const needle = qDebounced.trim().toLowerCase();
		const cnNeedle = cnDebounced.trim().toLowerCase();
		const ipNeedle = deviceIpDebounced.trim().toLowerCase();
		const deviceNeedle = deviceNameDebounced.trim().toLowerCase();
		return (queries ?? [])
			.filter((row) => {
				const domain = String(row[2] ?? '');
				const client = String(row[3] ?? '');
				const resolved = resolveClient(client);
				if (!showLan) {
					if (!resolved || !isVpnIp(resolved)) return false;
				}
				const dlabel = deviceDisplay(client).display;
				if (onlyWithDeviceIp && !hasKnownDeviceIp(client)) return false;
				const hay = clientSearchHaystack(client, {
					hostnameToIpv4,
					realLanByVpnIp,
					vpnMap,
					deviceLabel: dlabel,
					isVpnIp
				});
				if (ipNeedle && !hay.includes(ipNeedle)) return false;
				if (deviceNeedle) {
					if (dlabel === '—' || !dlabel.toLowerCase().includes(deviceNeedle)) return false;
				}
				const hitCn = cnForClient(client);
				if (needle) {
					const domainL = domain.toLowerCase();
					const clientL = client.toLowerCase();
					const typeL = String(row[1] ?? '').toLowerCase();
					if (
						!domainL.includes(needle) &&
						!clientL.includes(needle) &&
						!typeL.includes(needle) &&
						!hay.includes(needle)
					) {
						return false;
					}
				}
				if (cnNeedle) {
					const cnHay = `${hitCn ?? ''} ${hay}`;
					if (!cnHay.includes(cnNeedle)) return false;
				}
				return true;
			})
			.toSorted((a, b) => Number(b[0] ?? 0) - Number(a[0] ?? 0));
	});

	const withDeviceIpCount = $derived.by(() => {
		let n = 0;
		for (const row of queries ?? []) {
			if (hasKnownDeviceIp(String(row[3] ?? ''))) n += 1;
		}
		return n;
	});

	const piholeClientsInWindow = $derived.by(() => topPiholeClients(queries ?? [], 18));

	const broadSearchHits = $derived.by(() => countBroadSearch(queries ?? [], qDebounced));

	/** Con filtro IP: ocultar columnas duplicadas (misma IP en 3 sitios). */
	const compactTable = $derived(Boolean(deviceIpDebounced.trim()));

	function piHoleActions(domain: string, stopRow = false) {
		const d = domain.trim();
		const noop = () => {};
		return {
			domain: d,
			isAdmin,
			lists,
			busy: domainBusy[d] ?? {},
			onPointerDown: stopRow
				? (e: MouseEvent) => {
						e.stopPropagation();
					}
				: undefined,
			onAllow: d ? () => quickList(d, 'white') : noop,
			onBlock: d ? () => quickList(d, 'black') : noop,
			onAllowWild: d ? () => quickList(d, 'white', 'wildcard') : noop,
			onBlockWild: d ? () => quickList(d, 'black', 'wildcard') : noop,
			onUnallow: d ? () => quickUnlist(d, 'white') : noop,
			onUnblock: d ? () => quickUnlist(d, 'black') : noop,
			onUnallowWild: d ? () => quickUnlist(d, 'white', 'wildcard') : noop,
			onUnblockWild: d ? () => quickUnlist(d, 'black', 'wildcard') : noop
		};
	}

	function dnsRowProps(domain: string, client: string, stopRow = false, cnOverride?: string | null) {
		const cn =
			cnOverride !== undefined
				? (displayCn(cnOverride) ?? undefined)
				: (displayCn(cnForClient(client)) ?? undefined);
		const targets = blockTargetIps(client);
		return {
			...piHoleActions(domain, stopRow),
			deviceIp: targets.primary || '—',
			ipChoices: targets.all,
			tableDeviceIp: deviceIp(client),
			tableVpnLan: deviceLocalIp(client),
			piholeClient: client.trim(),
			unknownDevice: isUnknownDevice(client, cnOverride),
			deviceLabel: deviceDisplay(client).display,
			deviceCn: cn,
			internetBlocked: deviceBlocked(client),
			activeBlockedIp: activeBlockedIp(client),
			onInternetChange: loadInternetBlocks
		};
	}

	function csvEscapeCell(val: string): string {
		const s = String(val ?? '');
		if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
		return s;
	}

	function exportFilteredDnsCsv() {
		if (!browser) return;
		const rows = filtered;
		const header = [
			'timestamp_iso',
			'tipo',
			'dominio',
			'cliente_pihole',
			'cn',
			'ip_dispositivo',
			'dispositivo',
			'ip_vpn_lan',
			'tipo_dispositivo',
			'sede',
			'estado_ftl'
		];
		const lines = [header.map(csvEscapeCell).join(',')];
		for (const row of rows) {
			const ts = Number(row[0] ?? 0);
			const iso = Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000).toISOString() : '';
			const client = String(row[3] ?? '');
			const cn = displayCn(cnForClient(client)) ?? '';
			const ipDev = deviceIp(client);
			const localIp = deviceLocalIp(client);
			const nm = deviceNetmonitor(client);
			const cols = [
				iso,
				String(row[1] ?? ''),
				String(row[2] ?? ''),
				client,
				cn,
				ipDev,
				nm?.label ?? '',
				localIp,
				nm?.type ?? '',
				nm?.sedeName ?? '',
				String(row[4] ?? '')
			];
			lines.push(cols.map(csvEscapeCell).join(','));
		}
		const body = '\uFEFF' + lines.join('\n');
		const blob = new Blob([body], { type: 'text/csv;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '');
		a.download = `dns-consultas-${stamp}.csv`;
		a.click();
		queueMicrotask(() => URL.revokeObjectURL(url));
	}

	type GroupRow = {
		key: string;
		ts: number;
		cn: string | null;
		client: string;
		main: string;
		count: number;
		items: { ts: number; domain: string; qtype: string; client: string }[];
	};

	const grouped = $derived.by(() => {
		const map = new Map<string, GroupRow>();
		for (const row of filtered) {
			const ts = Number(row[0] ?? 0);
			const qtype = String(row[1] ?? '');
			const domain = String(row[2] ?? '');
			const client = String(row[3] ?? '');
			const hitCn = cnForClient(client);
			const main = principalDomain(domain);
			const key = `${hitCn ?? '-'}|${client}|${main}`;
			const existing = map.get(key);
			if (!existing) {
				map.set(key, {
					key,
					ts,
					cn: hitCn,
					client,
					main,
					count: 1,
					items: [{ ts, domain, qtype, client }]
				});
			} else {
				existing.count += 1;
				if (ts > existing.ts) existing.ts = ts;
				existing.items.push({ ts, domain, qtype, client });
			}
		}

		const list = Array.from(map.values());
		for (const g of list) {
			g.items.sort((a, b) => b.ts - a.ts);
		}
		return list.sort((a, b) => b.ts - a.ts);
	});

	function toggleExpand(key: string) {
		expanded = { ...expanded, [key]: !expanded[key] };
	}

	const connectedCns = $derived.by(() => {
		const set = new Set<string>();
		for (const v of Object.values(vpnMap)) set.add(v);
		return Array.from(set)
			.toSorted()
			.map((x) => displayCn(x) ?? x);
	});

	async function load() {
		loading = true;
		error = null;

		const meRes = await fetch('/api/auth/me', { headers: { 'cache-control': 'no-cache' } });
		if (meRes.ok) {
			const me = (await meRes.json().catch(() => null)) as { isAdmin?: boolean } | null;
			isAdmin = Boolean(me?.isAdmin);
		} else {
			isAdmin = false;
		}

		// Primero status VPN: en servidor actualiza el histórico (CN + IP LAN) antes de leer ipcn-history.
		const vpnRes = await fetch('/api/vpn/status', { headers: { 'cache-control': 'no-cache' } });
		const [histRes, aliasRes] = await Promise.all([
			fetch('/api/vpn/ipcn-history', { headers: { 'cache-control': 'no-cache' } }),
			fetch('/api/admin/user-aliases', { headers: { 'cache-control': 'no-cache' } })
		]);
		// Mejor esfuerzo: si no eres admin, esto dará 401 y lo ignoramos.
		await Promise.all([loadLists(), loadInternetBlocks()]);

		let status: VpnStatus | null = null;
		if (vpnRes.ok) {
			status = (await vpnRes.json()) as VpnStatus;
		} else {
			await vpnRes.json().catch(() => null);
		}

		const histBody = histRes.ok
			? ((await histRes.json().catch(() => null)) as {
					ip_to_cn?: Record<string, string>;
					virtual_to_real_lan?: Record<string, string>;
				} | null)
			: null;
		const histMap = (histBody?.ip_to_cn ?? {}) as Record<string, string>;
		realLanByVpnIp = (histBody?.virtual_to_real_lan ?? {}) as Record<string, string>;
		let mergedCn = { ...histMap };
		if (status) {
			mergedCn = { ...mergedCn, ...buildVpnMap(status) };
		}
		vpnMap = enrichVpnMapWithLanIps(mergedCn, realLanByVpnIp);
		aliases = aliasRes.ok ? ((await aliasRes.json()) as Record<string, string>) : {};

		const now = Math.floor(Date.now() / 1000);
		const from = now - Math.max(1, fromMins) * 60;
		const dnsRes = await fetch(`/api/admin/dns?from=${from}&until=${now + 5}`, {
			headers: { 'cache-control': 'no-cache' }
		});

		if (!dnsRes.ok) {
			const body = await dnsRes.json().catch(() => null) as { message?: string } | null;
			error =
				dnsRes.status === 401
					? 'Necesitas sesión de administrador o auditor'
					: dnsRes.status === 502
						? (body?.message ?? 'Pi-hole no respondió')
						: `Error ${dnsRes.status}`;
			queries = [];
			loading = false;
			return;
		}
		const data = await dnsRes.json();
		queries = (data?.data ?? []) as DnsQueryRow[];
		dnsMeta = (data?.meta ?? null) as { count?: number; source?: string; hint?: string } | null;
		netmonitorByIp = (data?.meta?.netmonitor_by_ip ?? {}) as Record<string, NetmonitorDeviceLite>;
		netmonitorReachable = Boolean(data?.meta?.netmonitor_reachable);
		hostnameToIpv4 = mergeHostnameMapWithNetmonitor(
			(data?.meta?.hostname_to_ipv4 ?? {}) as Record<string, string>,
			netmonitorByIp
		);
		// Tras hostname map, re-enriquecer CN por si netmonitor aportó hostnames nuevos.
		vpnMap = enrichVpnMapWithLanIps(vpnMap, realLanByVpnIp);
		loading = false;
	}

	let minsFilterReady = $state(false);

	onMount(() => {
		if (browser) {
			const sp = new URLSearchParams(window.location.search);
			const pq = sp.get('q');
			const pc = sp.get('cn');
			const pip = sp.get('device_ip');
			const pd = sp.get('device');
			if (pq !== null) q = pq;
			if (pc !== null) cn = pc;
			if (pip !== null) deviceIpFilter = pip;
			if (pd !== null) deviceName = pd;
			onlyWithDeviceIp = sp.get('only_ip') === '1';
		}
		load();
		minsFilterReady = true;
	});

	function clearAllFilters() {
		q = '';
		cn = '';
		deviceIpFilter = '';
		deviceName = '';
		onlyWithDeviceIp = false;
		showLan = true;
		if (browser) history.replaceState({}, '', window.location.pathname);
	}

	function pickKnownDevice(ip: string) {
		deviceIpFilter = ip;
	}

	$effect(() => {
		const mins = fromMins;
		if (!browser || !minsFilterReady) return;
		const t = setTimeout(() => load(), 400);
		return () => clearTimeout(t);
	});
</script>

<main class="pageWrap pageWide page-dns" id="contenido-principal" tabindex="-1">
	{#if notices.length}
		<div
			class="toasts"
			role="region"
			aria-label="Notificaciones"
			aria-live="polite"
			aria-relevant="additions"
		>
			{#each notices as n (n.id)}
				<div class="toast {n.kind}">
					<span>{n.message}</span>
					<button
						type="button"
						class="toastClose"
						aria-label="Cerrar notificación"
						onclick={() => (notices = notices.filter((x) => x.id !== n.id))}
					>
						×
					</button>
				</div>
			{/each}
		</div>
	{/if}

	<header class="dnsHero">
		<div class="dnsHero__text">
			<h1 class="dnsHero__title">Consultas DNS</h1>
			<p class="dnsHero__sub">Registro en vivo de Pi-hole con correlación VPN, LAN y dispositivos.</p>
		</div>
		<div class="dnsHero__actions">
			<button
				type="button"
				class="btn secondary"
				disabled={loading || filtered.length === 0}
				onclick={exportFilteredDnsCsv}
				aria-label="Exportar consultas DNS filtradas a CSV"
			>
				Exportar CSV
			</button>
			<button
				type="button"
				class="btn secondary btnAccent"
				onclick={load}
				disabled={loading}
				aria-busy={loading ? 'true' : undefined}
				aria-label={loading ? 'Recargando consultas DNS' : 'Recargar consultas DNS'}
			>
				{loading ? 'Cargando…' : 'Recargar'}
			</button>
		</div>
	</header>

	<section class="dnsPanel dnsPanel--filters" aria-label="Filtros de consultas DNS">
		<div class="dnsFilterGrid">
			<fieldset class="dnsFilterGroup">
				<legend>Intervalo</legend>
				<label class="dnsFilterLab" for="dns-filter-mins">Últimos (minutos)</label>
				<input id="dns-filter-mins" class="input" type="number" min="1" max="1440" bind:value={fromMins} />
			</fieldset>
			<fieldset class="dnsFilterGroup dnsFilterGroup--wide">
				<legend>Búsqueda</legend>
				<label class="dnsFilterLab" for="dns-filter-domain">Dominio o cliente</label>
				<input
					id="dns-filter-domain"
					class="input"
					placeholder="ej. google.com o 192.168.1.x"
					bind:value={q}
					autocomplete="off"
					data-shortcut="search"
				/>
				<label class="dnsFilterLab" for="dns-filter-cn">CN VPN</label>
				<input id="dns-filter-cn" class="input" placeholder="nombre del certificado" bind:value={cn} autocomplete="off" />
			</fieldset>
			<fieldset class="dnsFilterGroup dnsFilterGroup--wide">
				<legend>Dispositivo</legend>
				<label class="dnsFilterLab" for="dns-filter-device-ip">IP dispositivo</label>
			<input
				id="dns-filter-device-ip"
				class="input mono"
				placeholder="192.168.x.x o 10.8.0.x"
				bind:value={deviceIpFilter}
				autocomplete="off"
				list="dns-known-ips"
			/>
			<datalist id="dns-known-ips">
				{#each knownDevices as d (d.ip)}
					<option value={d.ip}>{d.label}</option>
				{/each}
			</datalist>
			<label class="dnsFilterLab" for="dns-filter-device-name">Dispositivo contiene</label>
			<input
				id="dns-filter-device-name"
				class="input"
				placeholder="iPhone, Samsung…"
				bind:value={deviceName}
				autocomplete="off"
			/>
			<label class="dnsFilterLab" for="dns-filter-pick-device">Elegir del inventario</label>
			<select
				id="dns-filter-pick-device"
				class="input"
				onchange={(e) => {
					const v = (e.currentTarget as HTMLSelectElement).value;
					if (v) pickKnownDevice(v);
					(e.currentTarget as HTMLSelectElement).value = '';
				}}
			>
				<option value="">— Seleccionar IP —</option>
				{#each knownDevices as d (d.ip)}
					<option value={d.ip}>{d.label} ({d.ip})</option>
				{/each}
			</select>
			</fieldset>
		</div>
		<div class="dnsChips" role="group" aria-label="Opciones de vista">
			<label class="dnsChip"><input type="checkbox" bind:checked={showLan} /><span>LAN + VPN</span></label>
			<label class="dnsChip"><input type="checkbox" bind:checked={onlyWithDeviceIp} /><span>Solo con IP conocida</span></label>
			<label class="dnsChip"><input type="checkbox" bind:checked={group} /><span>Agrupar dominios</span></label>
		</div>
		<SavedFiltersBar
			section="dns"
			current={currentFilterState()}
			apply={applyFilterState}
			labelPrefix="Filtros DNS"
		/>

		<DnsReportExport
			clientHint={deviceIpDebounced || deviceNameDebounced || cnDebounced || qDebounced}
			busy={loading}
		/>

		<details class="dnsHelp">
			<summary>Ayuda: correlación IP, CN y CSV</summary>
			<div class="dnsHelp__body">
				<p><strong>Exportar CSV</strong> (arriba): solo filas visibles, UTF-8 con BOM para Excel.</p>
				<p>
					<strong>Informe PDF</strong>: consultas agrupadas por dispositivo y día; opcionalmente filtra por IP, nombre o CN
					antes de generar.
				</p>
				<p>
					Correlacionamos la IP de Pi-hole (<span class="mono">10.8.0.x</span> o LAN) con CN y dispositivo (netmonitor).
					Los equipos <strong>Desconocidos</strong> se pueden cortar con <strong>Acciones → Cortar internet</strong>.
				</p>
				<p>Si no te ves: desmarca «Solo con IP conocida», amplía minutos y conecta VPN para mapear LAN↔CN.</p>
				{#if !netmonitorReachable}
					<p class="dnsVpnHint">Netmonitor no respondió. En Docker: <span class="mono">http://host.docker.internal:2347</span> en .env.</p>
				{/if}
				{#if Object.keys(vpnMap).length === 0}
					<p class="dnsVpnHint">Sin VPN conectada: el CN por IP puede no estar disponible.</p>
				{/if}
				{#if connectedCns.length}
					<p>CN conectados: <span class="mono">{connectedCns.join(', ')}</span></p>
				{/if}
			</div>
		</details>
	</section>

	{#if error}
	<section class="panel cardError">{error}</section>
	{:else if loading}
		<section class="dnsPanel dnsPanel--loading"><p class="muted">Cargando consultas…</p></section>
	{:else}
		<section class="dnsPanel dnsPanel--results">
			{#if queries.length > 0}
				<div class="dnsStats">
					<div class="dnsStat"><span class="dnsStat__k">Consultas</span><span class="dnsStat__v">{queries.length.toLocaleString()}</span></div>
					<div class="dnsStat"><span class="dnsStat__k">Visibles</span><span class="dnsStat__v">{filtered.length.toLocaleString()}</span></div>
					<div class="dnsStat"><span class="dnsStat__k">Con IP</span><span class="dnsStat__v">{withDeviceIpCount.toLocaleString()}</span></div>
					<div class="dnsStat"><span class="dnsStat__k">Clientes</span><span class="dnsStat__v">{piholeClientsInWindow.length.toLocaleString()}</span></div>
				</div>
				<details class="dnsClientDiag">
					<summary>¿Por qué no me veo? — Clientes que Pi-hole sí registró</summary>
					<p class="muted dnsClientDiag__lead">
						Si <strong>tu IP o nombre no está en esta lista</strong>, Pi-hole no está recibiendo el DNS de tu
						equipo (DNS privado del móvil, 8.8.8.8, fuera de VPN sin DNS al Pi-hole, etc.). El panel no puede
						inventar consultas que Pi-hole no guardó.
					</p>
					<ul class="dnsClientDiag__list">
						{#each piholeClientsInWindow as row (row.client)}
							<li>
								<button
									type="button"
									class="dnsClientDiag__pick mono"
									title="Filtrar por este cliente"
									onclick={() => {
										q = row.client.startsWith('(sin') ? '' : row.client;
										deviceIpFilter = '';
										cn = '';
										deviceName = '';
										onlyWithDeviceIp = false;
										showLan = true;
									}}
								>
									{row.client}
								</button>
								<span class="dnsClientDiag__count">{row.count.toLocaleString()}</span>
							</li>
						{/each}
					</ul>
					<p class="muted">
						En VPN: el perfil debe usar el DNS del Pi-hole. En LAN: el router o el DHCP deben apuntar al Pi-hole, no a
						otro resolver.
					</p>
				</details>
			{/if}
			{#if filtered.length === 0}
				<div class="dnsEmpty">
					<p class="dnsEmpty__title">No hay consultas que coincidan</p>
					<p class="muted">
						{#if queries.length > 0}
							Pi-hole devolvió <strong>{queries.length.toLocaleString()}</strong> consultas en el intervalo, pero
							<strong>ninguna</strong> pasa los filtros actuales.
							{#if qDebounced.trim() || cnDebounced.trim() || deviceIpDebounced.trim() || deviceNameDebounced.trim() || onlyWithDeviceIp}
								<br />Filtros activos:{#if qDebounced.trim()} dominio «{qDebounced}»{/if}{#if cnDebounced.trim()}{#if qDebounced.trim()},{/if} CN «{cnDebounced}»{/if}{#if deviceIpDebounced.trim()}{#if qDebounced.trim() || cnDebounced.trim()},{/if} IP «{deviceIpDebounced}»{/if}{#if deviceNameDebounced.trim()}{#if qDebounced.trim() || cnDebounced.trim() || deviceIpDebounced.trim()},{/if} dispositivo «{deviceNameDebounced}»{/if}{#if onlyWithDeviceIp}, solo con IP{/if}.
							{/if}
							{#if !showLan}
								<br />Marca <strong>«Mostrar todo el tráfico (LAN y VPN)»</strong> para ver equipos de la red local.
							{/if}
							{#if qDebounced.trim() && broadSearchHits > 0 && filtered.length === 0}
								<br />
								Pi-hole tiene <strong>{broadSearchHits.toLocaleString()}</strong> consultas que coinciden con «{qDebounced}» en
								dominio/cliente, pero <strong>otros filtros</strong> (IP, CN, «solo con IP», solo VPN) las ocultan. Pulsa
								<strong>Quitar todos los filtros</strong> o revisa IP/CN.
							{:else if qDebounced.trim() && broadSearchHits === 0}
								<br />
								Pi-hole <strong>no tiene</strong> consultas con «{qDebounced}» en este intervalo. Tu equipo probablemente
								<strong>no usa Pi-hole como DNS</strong> para esas búsquedas (mira la lista de clientes arriba).
							{/if}
						{:else}
							No hay datos de Pi-hole en los últimos {fromMins} minutos.
							{#if dnsMeta?.hint}
								<br />{dnsMeta.hint}
							{/if}
							{#if dnsMeta?.source}
								<br />Origen API: <span class="mono">{dnsMeta.source}</span>
							{/if}
							Amplía el intervalo (p. ej. 180 min) o pulsa Recargar.
							<br />Si sigue en 0, abre
							<a
								href="/api/admin/dns-probe?from={Math.floor(Date.now() / 1000) - fromMins * 60}&until={Math.floor(Date.now() / 1000)}"
								target="_blank"
								rel="noopener">/api/admin/dns-probe</a
							>
							(con sesión iniciada) para ver qué URL de Pi-hole responde.
						{/if}
					</p>
					{#if queries.length > 0 && (qDebounced.trim() || cnDebounced.trim() || deviceIpDebounced.trim() || deviceNameDebounced.trim() || onlyWithDeviceIp || !showLan)}
						<button type="button" class="btn secondary btnAccent" style="margin-top: 12px" onclick={clearAllFilters}>
							Quitar todos los filtros
						</button>
					{/if}
				</div>
			{:else}
			{#if compactTable}
				<p class="muted dnsCompactHint">Vista compacta: filtro por IP activo (columnas repetidas ocultas).</p>
			{/if}
			<div class="tableWrap dnsTableScroll">
				<table class="dnsTable">
					<caption class="visually-hidden">
						Consultas DNS con CN, IP local, dispositivo netmonitor y cliente según Pi-hole
					</caption>
					<thead>
						<tr>
							<th scope="col" class="col-ts">Hora</th>
							<th scope="col" class="dnsDomain-col">Dominio</th>
							<th scope="col">CN</th>
							<th scope="col">IP dispositivo</th>
							<th scope="col" class="col-device">Dispositivo</th>
							{#if !compactTable}
								<th scope="col" class="col-extra-ip">IP VPN/LAN</th>
							{/if}
							<th scope="col" class="actions" title={isAdmin ? undefined : 'Solo administradores'}>Acciones</th>
						</tr>
					</thead>
					<tbody>
						{#if group}
							{#each grouped.slice(0, visibleLimit) as g (`${g.key}:${g.ts}`)}
								{@const devG = deviceDisplay(g.client)}
								<tr
									class="groupRow"
									role="button"
									tabindex="0"
									aria-expanded={expanded[g.key] ? 'true' : 'false'}
									aria-label={`Grupo ${g.main}, ${g.count} consultas. ${expanded[g.key] ? 'Contraer' : 'Expandir'} detalle`}
									onclick={() => toggleExpand(g.key)}
									onkeydown={(e) => {
										if (e.key === 'Enter' || e.key === ' ') {
											e.preventDefault();
											toggleExpand(g.key);
										}
									}}
								>
									<td class="mono col-ts">{fmtTs(g.ts)}</td>
									<td class="mono dnsDomain" title={g.items[0]?.domain ?? g.main}>
										<span class="caret">{expanded[g.key] ? '▾' : '▸'}</span>
										{g.main || g.items[0]?.domain || '—'}
										<span class="count">({g.count})</span>
									</td>
									<td class="mono">{displayCn(g.cn) ?? '-'}</td>
									<td class="dnsDeviceIp" class:dnsDeviceIp--blocked={deviceBlocked(g.client)}>
										<div class="dnsDeviceIp__cell">
											<span class="mono-line">{deviceIp(g.client)}</span>
											{#if deviceBlocked(g.client)}
												<span class="dnsNetBadge" title="Internet cortado vía Pi-hole">Sin red</span>
											{/if}
										</div>
									</td>
									<td class="dnsDevice" title={devG.title || undefined}>
										<div class="dnsDevice__cell">
											<span class="dnsDevice__name">{devG.display}</span>
											{#if isUnknownDevice(g.client, g.cn)}
												<span class="dnsUnknownBadge" title="No está en el inventario, sin IP conocida ni certificado VPN">Desconocido</span>
											{/if}
										</div>
									</td>
									{#if !compactTable}
										<td class="dnsLocalIp">{deviceLocalIp(g.client)}</td>
									{/if}
									<td class="actions actions--dns">
										<DnsActionsButton
											{...dnsRowProps(
												g.main || principalDomain(g.items[0]?.domain ?? ''),
												g.client,
												true,
												g.cn
											)}
										/>
									</td>
								</tr>
								{#if expanded[g.key]}
									{#each g.items as it, ii (`${g.key}:${it.ts}:${ii}`)}
										{@const devIt = deviceDisplay(it.client)}
										<tr class="childRow">
											<td class="mono col-ts">{fmtTs(it.ts)}</td>
											<td class="mono dnsDomain">{it.domain || '—'} <span class="qtype">{it.qtype}</span></td>
											<td class="mono">{displayCn(g.cn) ?? '-'}</td>
											<td class="dnsDeviceIp" class:dnsDeviceIp--blocked={deviceBlocked(it.client)}>
												<div class="dnsDeviceIp__cell">
													<span class="mono-line">{deviceIp(it.client)}</span>
													{#if deviceBlocked(it.client)}
														<span class="dnsNetBadge" title="Internet cortado vía Pi-hole">Sin red</span>
													{/if}
												</div>
											</td>
											<td class="dnsDevice" title={devIt.title || undefined}>
												<div class="dnsDevice__cell">
													<span class="dnsDevice__name">{devIt.display}</span>
													{#if isUnknownDevice(it.client, g.cn)}
														<span class="dnsUnknownBadge" title="No está en el inventario, sin IP conocida ni certificado VPN">Desconocido</span>
													{/if}
												</div>
											</td>
											{#if !compactTable}
												<td class="dnsLocalIp">{deviceLocalIp(it.client)}</td>
											{/if}
											<td class="actions actions--dns">
												<DnsActionsButton
													{...dnsRowProps(principalDomain(it.domain), it.client, true, g.cn)}
												/>
											</td>
										</tr>
									{/each}
								{/if}
							{/each}
						{:else}
							{#each filtered.slice(0, visibleLimit) as row, i (`${row[0]}:${row[1]}:${row[2]}:${i}`)}
								{@const clientRaw = String(row[3] ?? '')}
								{@const devRow = deviceDisplay(clientRaw)}
								<tr>
									<td class="mono col-ts">{fmtTs(row[0])}</td>
									<td class="mono dnsDomain">{String(row[2] ?? '') || '—'} <span class="qtype">{row[1]}</span></td>
									<td class="mono">{displayCn(cnForClient(clientRaw)) ?? '-'}</td>
									<td class="dnsDeviceIp" class:dnsDeviceIp--blocked={deviceBlocked(clientRaw)}>
										<div class="dnsDeviceIp__cell">
											<span class="mono-line">{deviceIp(clientRaw)}</span>
											{#if deviceBlocked(clientRaw)}
												<span class="dnsNetBadge" title="Internet cortado vía Pi-hole">Sin red</span>
											{/if}
										</div>
									</td>
									<td class="dnsDevice" title={devRow.title || undefined}>
										<div class="dnsDevice__cell">
											<span class="dnsDevice__name">{devRow.display}</span>
											{#if isUnknownDevice(clientRaw)}
												<span class="dnsUnknownBadge" title="No está en el inventario, sin IP conocida ni certificado VPN">Desconocido</span>
											{/if}
										</div>
									</td>
									{#if !compactTable}
										<td class="dnsLocalIp">{deviceLocalIp(String(row[3] ?? ''))}</td>
									{/if}
									<td class="actions actions--dns">
										<DnsActionsButton
											{...dnsRowProps(principalDomain(String(row[2] ?? '')), String(row[3] ?? ''))}
										/>
									</td>
								</tr>
							{/each}
						{/if}
					</tbody>
				</table>
			</div>
			{@const totalVisible = group ? grouped.length : filtered.length}
			{#if totalVisible > visibleLimit}
				<div class="dnsLoadMore">
					<span class="dnsLoadMore__info">
						Mostrando <strong>{visibleLimit.toLocaleString('es-ES')}</strong>
						de <strong>{totalVisible.toLocaleString('es-ES')}</strong>
					</span>
					<button
						type="button"
						class="btn"
						onclick={() => (visibleLimit = Math.min(totalVisible, visibleLimit + PAGE_SIZE))}
					>
						Cargar +{Math.min(PAGE_SIZE, totalVisible - visibleLimit).toLocaleString('es-ES')}
					</button>
					<button
						type="button"
						class="btn secondary"
						onclick={() => (visibleLimit = totalVisible)}
					>
						Mostrar todo
					</button>
				</div>
			{/if}
			{/if}
		</section>
	{/if}
</main>


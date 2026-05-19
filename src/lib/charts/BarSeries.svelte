<script lang="ts">
	type Point = { label: string; allowed: number; blocked: number };
	let {
		points,
		height = 220,
		ariaLabel = 'Serie temporal de consultas'
	}: { points: Point[]; height?: number; ariaLabel?: string } = $props();

	const padding = { top: 12, right: 12, bottom: 28, left: 36 };
	const width = $derived(Math.max(320, points.length * 28 + padding.left + padding.right));
	const max = $derived(
		Math.max(1, ...points.map((p) => p.allowed + p.blocked))
	);
	const chartH = $derived(height - padding.top - padding.bottom);
	const chartW = $derived(width - padding.left - padding.right);
	const barW = $derived(points.length > 0 ? chartW / points.length : 0);

	function yFor(value: number, h: number, maxVal: number) {
		return padding.top + h - (value / maxVal) * h;
	}

	const ticks = $derived(buildTicks(max));
	function buildTicks(maxVal: number): number[] {
		const steps = 4;
		const out: number[] = [];
		for (let i = 0; i <= steps; i++) {
			out.push(Math.round((maxVal / steps) * i));
		}
		return out;
	}

	function fmt(v: number): string {
		if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
		return String(v);
	}
</script>

<div class="barSeriesWrap" role="img" aria-label={ariaLabel}>
	<svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMinYMid meet" class="barSeries">
		<!-- gridlines + Y ticks -->
		{#each ticks as t (t)}
			{@const y = yFor(t, chartH, max)}
			<line
				x1={padding.left}
				x2={width - padding.right}
				y1={y}
				y2={y}
				stroke="currentColor"
				stroke-opacity="0.08"
				stroke-width="1"
			/>
			<text
				x={padding.left - 6}
				y={y + 3}
				text-anchor="end"
				font-size="10"
				fill="currentColor"
				opacity="0.55"
			>
				{fmt(t)}
			</text>
		{/each}

		{#each points as p, i (i)}
			{@const xBase = padding.left + i * barW + Math.max(1, barW * 0.1)}
			{@const w = Math.max(2, barW * 0.8)}
			{@const allowedH = (p.allowed / max) * chartH}
			{@const blockedH = (p.blocked / max) * chartH}
			{@const total = p.allowed + p.blocked}
			<g>
				<rect
					x={xBase}
					y={padding.top + chartH - allowedH - blockedH}
					width={w}
					height={blockedH}
					rx="2"
					fill="#dc2626"
					opacity="0.92"
				>
					<title>{p.label} · {p.blocked.toLocaleString('es-ES')} bloqueadas</title>
				</rect>
				<rect
					x={xBase}
					y={padding.top + chartH - allowedH}
					width={w}
					height={allowedH}
					rx="2"
					fill="#0d9488"
					opacity="0.92"
				>
					<title>{p.label} · {p.allowed.toLocaleString('es-ES')} permitidas</title>
				</rect>
				{#if i === 0 || i === points.length - 1 || i % Math.max(1, Math.floor(points.length / 8)) === 0}
					<text
						x={xBase + w / 2}
						y={height - padding.bottom + 14}
						text-anchor="middle"
						font-size="10"
						fill="currentColor"
						opacity="0.65"
					>
						{p.label}
					</text>
				{/if}
				{#if total > 0 && barW > 32}
					<text
						x={xBase + w / 2}
						y={padding.top + chartH - allowedH - blockedH - 4}
						text-anchor="middle"
						font-size="9.5"
						fill="currentColor"
						opacity="0.7"
					>
						{fmt(total)}
					</text>
				{/if}
			</g>
		{/each}
	</svg>
</div>

<style>
	.barSeriesWrap {
		width: 100%;
		overflow-x: auto;
	}
	.barSeries {
		min-width: 100%;
		height: auto;
		font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
	}
</style>

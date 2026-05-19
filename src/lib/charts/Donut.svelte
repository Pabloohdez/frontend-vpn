<script lang="ts">
	let {
		allowed,
		blocked,
		size = 160,
		stroke = 22
	}: { allowed: number; blocked: number; size?: number; stroke?: number } = $props();

	const total = $derived(allowed + blocked);
	const ratio = $derived(total > 0 ? blocked / total : 0);
	const radius = $derived(size / 2 - stroke / 2);
	const circ = $derived(2 * Math.PI * radius);
	const dash = $derived(ratio * circ);
</script>

<div class="donutWrap">
	<svg
		viewBox={`0 0 ${size} ${size}`}
		width={size}
		height={size}
		role="img"
		aria-label={`Bloqueadas ${blocked.toLocaleString('es-ES')} de ${total.toLocaleString('es-ES')} consultas`}
	>
		<circle
			cx={size / 2}
			cy={size / 2}
			r={radius}
			fill="none"
			stroke="#0d9488"
			stroke-opacity="0.18"
			stroke-width={stroke}
		/>
		<circle
			cx={size / 2}
			cy={size / 2}
			r={radius}
			fill="none"
			stroke="#dc2626"
			stroke-width={stroke}
			stroke-dasharray={`${dash} ${circ - dash}`}
			stroke-dashoffset={circ / 4}
			stroke-linecap="butt"
			transform={`rotate(-90 ${size / 2} ${size / 2})`}
		/>
		<text
			x={size / 2}
			y={size / 2 - 2}
			text-anchor="middle"
			font-size="22"
			font-weight="700"
			fill="currentColor"
		>
			{(ratio * 100).toFixed(1)}%
		</text>
		<text
			x={size / 2}
			y={size / 2 + 16}
			text-anchor="middle"
			font-size="10.5"
			fill="currentColor"
			opacity="0.65"
		>
			bloqueadas
		</text>
	</svg>
</div>

<style>
	.donutWrap {
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.donutWrap svg {
		font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
	}
</style>

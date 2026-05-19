<script lang="ts">
	type Props = {
		width?: string;
		height?: string;
		rounded?: 'sm' | 'md' | 'lg' | 'pill';
		class?: string;
	};
	let { width = '100%', height = '12px', rounded = 'md', class: cls = '' }: Props = $props();
	const radius = {
		sm: '4px',
		md: '6px',
		lg: '12px',
		pill: '999px'
	}[rounded];
</script>

<span
	class="skeleton {cls}"
	style:width
	style:height
	style:border-radius={radius}
	aria-hidden="true"
></span>

<style>
	.skeleton {
		display: inline-block;
		background: linear-gradient(
				90deg,
				color-mix(in srgb, currentColor 6%, transparent),
				color-mix(in srgb, currentColor 14%, transparent),
				color-mix(in srgb, currentColor 6%, transparent)
			);
		background-size: 200% 100%;
		animation: skeletonShimmer 1.2s ease-in-out infinite;
		opacity: 0.6;
	}
	@keyframes skeletonShimmer {
		from { background-position: 200% 0; }
		to { background-position: -200% 0; }
	}
	@media (prefers-reduced-motion: reduce) {
		.skeleton { animation: none; }
	}
</style>

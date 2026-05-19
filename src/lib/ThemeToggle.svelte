<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';

	let dark = $state(false);

	function apply(theme: 'light' | 'dark') {
		dark = theme === 'dark';
		if (!browser) return;
		document.documentElement.dataset.theme = theme;
		try {
			localStorage.setItem('theme', theme);
		} catch {
			/* ignore */
		}
	}

	function toggle() {
		apply(dark ? 'light' : 'dark');
	}

	onMount(() => {
		try {
			const saved = localStorage.getItem('theme');
			if (saved === 'dark' || saved === 'light') {
				apply(saved);
				return;
			}
		} catch {
			/* ignore */
		}
		const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
		apply(prefersDark ? 'dark' : 'light');
	});
</script>

<button
	type="button"
	class="themeToggle"
	onclick={toggle}
	aria-pressed={dark ? 'true' : 'false'}
	aria-label={dark ? 'Activar modo claro' : 'Activar modo oscuro'}
	title={dark ? 'Modo claro' : 'Modo oscuro'}
>
	{#if dark}
		<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
			<path
				fill="currentColor"
				d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Zm0-16a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1Zm0 18a1 1 0 0 1-1-1v-1a1 1 0 1 1 2 0v1a1 1 0 0 1-1 1ZM4.22 5.64l.71.71a1 1 0 1 1-1.42 1.42l-.71-.71a1 1 0 1 1 1.42-1.42Zm15.56 12.72-.71-.71a1 1 0 1 1 1.42-1.42l.71.71a1 1 0 1 1-1.42 1.42ZM5.64 19.78l-.71-.71a1 1 0 1 1 1.42-1.42l.71.71a1 1 0 1 1-1.42 1.42Zm12.72-15.56.71.71a1 1 0 1 1-1.42 1.42l-.71-.71a1 1 0 1 1 1.42-1.42ZM19 11h1a1 1 0 1 1 0 2h-1a1 1 0 1 1 0-2ZM4 13H3a1 1 0 1 1 0-2h1a1 1 0 1 1 0 2Z"
			/>
		</svg>
	{:else}
		<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
			<path
				fill="currentColor"
				d="M21 14.5A7.5 7.5 0 0 1 9.5 3 9.46 9.46 0 0 0 12 21a9.43 9.43 0 0 0 9-6.5Z"
			/>
		</svg>
	{/if}
</button>

<style>
	.themeToggle {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 32px;
		padding: 0;
		border: 1px solid var(--border-default, #e5e7eb);
		border-radius: 999px;
		background: var(--nav-link-bg, #fff);
		color: var(--nav-link-fg, #111827);
		cursor: pointer;
		transition: background 0.15s, border-color 0.15s;
	}
	.themeToggle:hover {
		filter: brightness(0.97);
	}
</style>

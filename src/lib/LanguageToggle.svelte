<script lang="ts">
	import { i18n, t } from '$lib/i18n/locale.svelte';
	import type { Locale } from '$lib/i18n/messages';

	const options: { value: Locale; labelKey: 'lang.es' | 'lang.en' }[] = [
		{ value: 'es', labelKey: 'lang.es' },
		{ value: 'en', labelKey: 'lang.en' }
	];
</script>

<label class="langToggle" title={t('lang.label')}>
	<span class="sr-only">{t('lang.label')}</span>
	<select
		class="langToggle__select"
		aria-label={t('lang.label')}
		value={i18n.locale}
		onchange={(e) => i18n.set((e.currentTarget as HTMLSelectElement).value as Locale)}
	>
		{#each options as opt (opt.value)}
			<option value={opt.value}>{t(opt.labelKey)}</option>
		{/each}
	</select>
</label>

<style>
	.langToggle {
		display: inline-flex;
		align-items: center;
	}
	.langToggle__select {
		font-size: 12px;
		padding: 4px 8px;
		border-radius: 8px;
		border: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.12));
		background: var(--bg-card, #fff);
		color: inherit;
		cursor: pointer;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>

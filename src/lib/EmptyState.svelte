<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		icon?: string;
		title: string;
		description?: string;
		action?: Snippet;
	};

	let { icon = '📭', title, description, action }: Props = $props();
</script>

<div class="emptyState" role="status">
	<div class="emptyState__icon" aria-hidden="true">{icon}</div>
	<h3 class="emptyState__title">{title}</h3>
	{#if description}
		<p class="emptyState__desc">{description}</p>
	{/if}
	{#if action}
		<div class="emptyState__action">
			{@render action()}
		</div>
	{/if}
</div>

<style>
	.emptyState {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 40px 24px;
		border: 1px dashed var(--border-subtle, #e2e8f0);
		border-radius: 12px;
		background: var(--bg-subtle, #f8fafc);
		color: var(--color-text-muted, #64748b);
		gap: 8px;
	}
	.emptyState__icon {
		font-size: 36px;
		line-height: 1;
		margin-bottom: 4px;
		opacity: 0.85;
	}
	.emptyState__title {
		margin: 0;
		font-size: 16px;
		color: var(--color-text, #0f172a);
		font-weight: 700;
	}
	.emptyState__desc {
		margin: 0;
		max-width: 480px;
		font-size: 13.5px;
		line-height: 1.55;
	}
	.emptyState__action { margin-top: 8px; }
</style>

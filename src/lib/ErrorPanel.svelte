<script lang="ts">
	let {
		title = 'Error',
		detail,
		onRetry
	}: {
		title?: string;
		detail: string;
		onRetry?: () => void;
	} = $props();
</script>

<section class="panel cardError errorExplain">
	<h2 class="panel__h2">{title}</h2>
	<p class="errorDetail">{detail}</p>
	{#if onRetry}
		<div class="errorActions">
			<button type="button" class="btn secondary" onclick={onRetry}>Reintentar</button>
		</div>
	{/if}
</section>

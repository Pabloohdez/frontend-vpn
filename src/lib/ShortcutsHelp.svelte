<script lang="ts">
	import { onMount } from 'svelte';
	import {
		closeHelp,
		installShortcuts,
		shortcuts,
		shortcutsState,
		type Shortcut
	} from './keyboard-shortcuts.svelte';

	onMount(() => installShortcuts());

	const open = $derived(shortcutsState.helpOpen);

	const groups = $derived.by(() => {
		const map = new Map<string, Shortcut[]>();
		for (const s of shortcuts()) {
			const arr = map.get(s.category) ?? [];
			arr.push(s);
			map.set(s.category, arr);
		}
		return [...map.entries()];
	});
</script>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="shHelpBackdrop"
		role="dialog"
		aria-modal="true"
		aria-label="Atajos de teclado"
		onclick={closeHelp}
	>
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div
			class="shHelp"
			role="document"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			<header class="shHelp__head">
				<h2>Atajos de teclado</h2>
				<button type="button" class="shHelp__close" onclick={closeHelp} aria-label="Cerrar">
					×
				</button>
			</header>
			<div class="shHelp__body">
				{#each groups as [cat, items] (cat)}
					<section>
						<h3>{cat}</h3>
						<ul>
							{#each items as s (s.keys.join('+'))}
								<li>
									<span class="shHelp__keys">
										{#each s.keys as k (k)}
											<kbd>{k}</kbd>
										{/each}
									</span>
									<span class="shHelp__desc">{s.description}</span>
								</li>
							{/each}
						</ul>
					</section>
				{/each}
			</div>
			<footer class="shHelp__foot">
				Pulsa <kbd>?</kbd> en cualquier momento para abrir esta ayuda.
			</footer>
		</div>
	</div>
{/if}

<style>
	.shHelpBackdrop {
		position: fixed;
		inset: 0;
		z-index: 9998;
		background: rgba(15, 23, 42, 0.55);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px;
		backdrop-filter: blur(2px);
	}
	.shHelp {
		max-width: 560px;
		width: 100%;
		max-height: min(80vh, 640px);
		background: #ffffff;
		border-radius: 14px;
		border: 1px solid #e2e8f0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		box-shadow: 0 30px 60px -20px rgba(15, 23, 42, 0.45);
		color: #0f172a;
	}
	.shHelp__head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 20px;
		border-bottom: 1px solid #e2e8f0;
		background: #f8fafc;
	}
	.shHelp__head h2 { margin: 0; font-size: 17px; }
	.shHelp__close {
		background: transparent;
		border: 0;
		font-size: 22px;
		cursor: pointer;
		padding: 4px 10px;
		border-radius: 6px;
		color: #475569;
	}
	.shHelp__close:hover { background: #e2e8f0; color: #0f172a; }
	.shHelp__body {
		padding: 16px 20px;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	.shHelp__body section h3 {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: #64748b;
		margin: 0 0 8px;
		font-weight: 700;
	}
	.shHelp__body ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.shHelp__body li {
		display: flex;
		align-items: center;
		gap: 12px;
		font-size: 13.5px;
	}
	.shHelp__keys {
		display: inline-flex;
		gap: 4px;
		min-width: 70px;
	}
	.shHelp__desc { color: #334155; }
	.shHelp__foot {
		padding: 12px 20px;
		border-top: 1px solid #e2e8f0;
		font-size: 12px;
		color: #64748b;
		background: #f8fafc;
	}
	kbd {
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		font-size: 12px;
		padding: 2px 8px;
		border: 1px solid #cbd5e1;
		border-bottom-width: 2px;
		border-radius: 5px;
		background: #ffffff;
		color: #0f172a;
		font-weight: 600;
	}
</style>

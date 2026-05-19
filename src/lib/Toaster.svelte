<script lang="ts">
	import { toast, type ToastItem } from './toast';

	const items = $derived(toast.items);

	function iconFor(kind: ToastItem['kind']) {
		switch (kind) {
			case 'success':
				return '✓';
			case 'error':
				return '✕';
			case 'warn':
				return '⚠';
			default:
				return 'i';
		}
	}
</script>

<div class="toaster" role="region" aria-live="polite" aria-label="Notificaciones">
	{#each items as t (t.id)}
		<div
			class="toast toast--{t.kind}"
			role={t.kind === 'error' ? 'alert' : 'status'}
			aria-live={t.kind === 'error' ? 'assertive' : 'polite'}
		>
			<span class="toast__icon" aria-hidden="true">{iconFor(t.kind)}</span>
			<div class="toast__body">
				{#if t.title}
					<div class="toast__title">{t.title}</div>
				{/if}
				<div class="toast__msg">{t.message}</div>
			</div>
			<button
				type="button"
				class="toast__close"
				aria-label="Cerrar notificación"
				onclick={() => toast.dismiss(t.id)}
			>
				×
			</button>
		</div>
	{/each}
</div>

<style>
	.toaster {
		position: fixed;
		top: 12px;
		right: 12px;
		z-index: 9999;
		display: flex;
		flex-direction: column;
		gap: 8px;
		max-width: min(360px, calc(100vw - 24px));
		pointer-events: none;
	}

	.toast {
		pointer-events: auto;
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: 10px;
		align-items: start;
		padding: 10px 12px;
		border-radius: 10px;
		background: #ffffff;
		color: #0f172a;
		border: 1px solid #e2e8f0;
		box-shadow: 0 12px 30px -16px rgba(15, 23, 42, 0.35), 0 4px 10px -6px rgba(15, 23, 42, 0.18);
		animation: toastIn 180ms ease-out;
		font-size: 13.5px;
		line-height: 1.4;
	}

	.toast--success {
		border-color: #a7f3d0;
		background: #ecfdf5;
		color: #065f46;
	}
	.toast--error {
		border-color: #fecaca;
		background: #fef2f2;
		color: #991b1b;
	}
	.toast--warn {
		border-color: #fde68a;
		background: #fffbeb;
		color: #92400e;
	}
	.toast--info {
		border-color: #bae6fd;
		background: #f0f9ff;
		color: #075985;
	}

	.toast__icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: currentColor;
		color: #fff;
		font-weight: 700;
		font-size: 12px;
		flex-shrink: 0;
	}
	.toast--success .toast__icon { background: #047857; }
	.toast--error .toast__icon { background: #b91c1c; }
	.toast--warn .toast__icon { background: #b45309; }
	.toast--info .toast__icon { background: #0369a1; }

	.toast__body { min-width: 0; }
	.toast__title {
		font-weight: 700;
		margin-bottom: 2px;
	}
	.toast__msg {
		word-break: break-word;
	}

	.toast__close {
		background: transparent;
		border: 0;
		color: inherit;
		opacity: 0.65;
		font-size: 18px;
		line-height: 1;
		cursor: pointer;
		padding: 0 4px;
		border-radius: 4px;
	}
	.toast__close:hover { opacity: 1; }
	.toast__close:focus-visible {
		outline: 2px solid currentColor;
		outline-offset: 2px;
	}

	@keyframes toastIn {
		from {
			opacity: 0;
			transform: translateX(12px) scale(0.96);
		}
		to {
			opacity: 1;
			transform: translateX(0) scale(1);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.toast { animation: none; }
	}
</style>

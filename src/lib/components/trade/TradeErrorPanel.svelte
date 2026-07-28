<script lang="ts">
	import type { UserFacingTradeError } from '$lib/services/tradeError';

	export let error: UserFacingTradeError;

	let copied = false;

	$: supportDetails = [
		`Error code: ${error.code}`,
		...(error.requestId ? [`Request ID: ${error.requestId}`] : []),
		`Stage: ${error.stage}`
	].join('\n');

	async function copySupportDetails(): Promise<void> {
		try {
			await navigator.clipboard.writeText(supportDetails);
			copied = true;
			setTimeout(() => (copied = false), 2_000);
		} catch {
			copied = false;
		}
	}
</script>

<div
	class="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-left"
	data-testid="trade-error-panel"
	data-error-code={error.code}
	data-error-stage={error.stage}
	role="alert"
>
	<div class="flex items-start gap-2.5">
		<div
			class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-red-400/50 text-xs font-semibold text-red-300"
			aria-hidden="true"
		>
			!
		</div>
		<div class="min-w-0 flex-1">
			<p class="text-sm font-medium text-red-200">{error.title}</p>
			<p class="mt-1 text-xs leading-5 text-red-200/80">{error.message}</p>

			<div class="mt-2.5 border-t border-red-400/20 pt-2.5">
				<div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px]">
					<span class="text-red-200/60">Error code</span>
					<code
						class="break-all rounded border border-red-400/20 bg-black/20 px-1.5 py-0.5 font-mono text-red-100"
						data-testid="trade-error-code">{error.code}</code
					>
					{#if error.requestId}
						<span class="text-red-200/60">Reference</span>
						<code class="break-all font-mono text-red-100/80" data-testid="trade-error-request-id"
							>{error.requestId}</code
						>
					{/if}
				</div>

				<button
					type="button"
					class="mt-2 text-[11px] font-medium text-red-200/70 underline decoration-red-300/30 underline-offset-2 transition-colors hover:text-red-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-red-300/60"
					on:click={copySupportDetails}
					aria-label="Copy error details"
				>
					{copied ? 'Copied' : 'Copy details'}
				</button>
			</div>
		</div>
	</div>
</div>

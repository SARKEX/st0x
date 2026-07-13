<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import IconExternalLink from '$lib/components/icons/IconExternalLink.svelte';

	export let show = false;
	export let ratio: number;
	export let wrappedSymbol: string;
	export let assetSymbol: string;
	export let equityName: string;
	export let onClose: () => void;
	/** When provided, shows a "Don't show this again" button. */
	export let onDontShow: (() => void) | undefined = undefined;
	/** Optional override for the dashboard unwrap link. */
	export let dashboardHref: string = '/dashboard';

	$: ratioLabel = Number.isInteger(ratio)
		? String(ratio)
		: ratio.toLocaleString('en-US', { maximumFractionDigits: 4 });

	const EXAMPLE_SHARES = 2;
	$: exampleWrapped =
		Number.isFinite(ratio) && ratio > 0
			? (EXAMPLE_SHARES / ratio).toLocaleString('en-US', { maximumFractionDigits: 4 })
			: '0';

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && show) onClose();
	}
</script>

<svelte:window on:keydown={onKeydown} />

{#if show}
	<div
		class="fixed inset-0 z-[10080] flex items-center justify-center px-3 py-6"
		role="presentation"
	>
		<button
			type="button"
			aria-label="Close explainer"
			class="absolute inset-0 bg-[rgba(2,6,15,0.74)] backdrop-blur-sm"
			on:click={onClose}
			transition:fade={{ duration: 120 }}
		/>
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby="wrap-explainer-title"
			data-testid="wrap-explainer-modal"
			class="relative w-full max-w-[640px] overflow-hidden rounded-2xl border border-line bg-surface-1 shadow-2xl dark:bg-gradient-to-b dark:from-gray-900 dark:to-gray-950"
			transition:fly={{ y: 12, duration: 180 }}
		>
			<!-- Header -->
			<div
				class="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6 sm:py-5"
			>
				<div class="min-w-0">
					<p class="text-[10px] uppercase tracking-[0.14em] text-accent sm:text-xs">
						New on {wrappedSymbol}
					</p>
					<h2 id="wrap-explainer-title" class="mt-0.5 text-lg font-semibold text-text sm:text-xl">
						What's a Wrapped tStock?
					</h2>
				</div>
				<button
					type="button"
					on:click={onClose}
					aria-label="Close explainer"
					class="rounded-lg p-2 text-text-2 transition hover:bg-surface-2 hover:text-text"
				>
					<svg
						viewBox="0 0 24 24"
						width="18"
						height="18"
						fill="none"
						stroke="currentColor"
						stroke-width="1.6"
						stroke-linecap="round"
						aria-hidden="true"
					>
						<path d="M6 6l12 12M6 18L18 6" />
					</svg>
				</button>
			</div>

			<!-- Body -->
			<div class="max-h-[68vh] overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
				<!-- Ratio illustration -->
				<div class="mb-5 rounded-xl border border-yellow-400/25 bg-yellow-400/[0.06] p-4 sm:p-5">
					<p class="text-[11px] uppercase tracking-wide text-accent">The Wrap Ratio</p>
					<div class="mt-2 flex flex-wrap items-baseline gap-x-3 leading-tight">
						<span
							class="whitespace-nowrap font-mono text-2xl font-semibold tabular-nums text-text sm:text-3xl"
							>1&nbsp;{wrappedSymbol}</span
						>
						<span class="text-2xl text-text-2 sm:text-3xl">=</span>
						<span
							class="whitespace-nowrap font-mono text-2xl font-semibold tabular-nums text-text sm:text-3xl"
							>{ratioLabel}&nbsp;{assetSymbol}</span
						>
					</div>
					<p class="mt-3 text-xs text-text-2 sm:text-sm">
						Each <span class="text-text-2">{wrappedSymbol}</span> in your wallet is redeemable for
						<span class="text-text-2">{ratioLabel}</span>
						{assetSymbol} — each of which has right of redemption for one share of {equityName}.
					</p>
				</div>

				<h3 class="text-sm font-semibold text-text">Prices and history use shares.</h3>
				<p class="mt-1 text-sm text-text-2">
					Every chart, oracle price, and quote on this page is shown in
					<span class="text-text-2">shares of {equityName}</span> — the same units you'd see on a brokerage.
				</p>

				<div class="my-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
					<div class="rounded-lg border border-line bg-surface-2 p-3">
						<p class="text-[10px] uppercase tracking-wide text-text-3">On the chart</p>
						<p class="mt-1 font-mono text-base font-medium tabular-nums text-text-2">$ per share</p>
						<p class="text-[11px] text-text-3">{assetSymbol} — same price as {equityName}</p>
					</div>
					<div class="rounded-lg border border-line bg-surface-2 p-3">
						<p class="text-[10px] uppercase tracking-wide text-text-3">In your wallet</p>
						<p class="mt-1 font-mono text-base font-medium tabular-nums text-text-2">
							{wrappedSymbol}
						</p>
						<p class="text-[11px] text-text-3">
							1 {wrappedSymbol} bundles {ratioLabel}
							{assetSymbol}
						</p>
					</div>
				</div>

				<h3 class="mt-5 text-sm font-semibold text-text">What you'll actually receive.</h3>
				<p class="mt-1 text-sm text-text-2">
					When you order
					<span class="text-text-2">{EXAMPLE_SHARES} shares</span>, your wallet will show
					<span class="text-text-2">{exampleWrapped} {wrappedSymbol}</span>
					— not {EXAMPLE_SHARES} tokens. The token count is smaller because each one is worth
					{ratioLabel}× more.
				</p>
				<div
					class="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface-2 px-3 py-3 text-sm"
				>
					<div class="flex items-baseline gap-1.5">
						<span class="text-text-2">You order</span>
						<span class="font-mono font-medium tabular-nums text-text-2"
							>{EXAMPLE_SHARES} {assetSymbol}</span
						>
					</div>
					<svg
						viewBox="0 0 24 24"
						width="16"
						height="16"
						class="text-text-3"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						aria-hidden="true"
					>
						<path d="M5 12h14M13 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
					<div class="flex items-baseline gap-1.5">
						<span class="text-text-2">Wallet shows</span>
						<span class="font-mono font-medium tabular-nums text-accent"
							>{exampleWrapped} {wrappedSymbol}</span
						>
					</div>
				</div>

				<h3 class="mt-6 text-sm font-semibold text-text">Built for DeFi</h3>
				<p class="mt-1 text-sm text-text-2">
					Wrapping makes the token DeFi-ready. DeFi protocols track deposited balances internally —
					they can't see when a dividend or stock split changes your underlying holdings. By rolling
					those events into the wrap ratio, your {wrappedSymbol} quietly compounds (each token becomes
					worth a bit more {assetSymbol} over time) without throwing the protocol's accounting out of
					sync.
				</p>

				<h3 class="mt-6 text-sm font-semibold text-text">
					Need {assetSymbol} instead? Unwrap them.
				</h3>
				<p class="mt-1 text-sm text-text-2">
					Wrapping is reversible at the ratio above and at no cost. Head to
					<a
						href={dashboardHref}
						class="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 hover:underline dark:text-blue-300 dark:hover:text-blue-200"
					>
						Dashboard → Holdings <IconExternalLink width="11" height="11" />
					</a>
					and use <span class="text-text-2">Unwrap</span> on any {wrappedSymbol} balance to get back
					the underlying {assetSymbol}.
				</p>
			</div>

			<!-- Footer -->
			<div
				class="flex flex-col-reverse gap-2 border-t border-line bg-surface-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
			>
				{#if onDontShow}
					<button
						type="button"
						on:click={onDontShow}
						class="text-xs text-text-2 transition hover:text-text-2 sm:text-sm"
					>
						Don't show this again
					</button>
				{:else}
					<span />
				{/if}
				<button
					type="button"
					on:click={onClose}
					class="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-[#05231a] shadow-lg transition hover:bg-accent-bright sm:text-base"
				>
					Got it
				</button>
			</div>
		</div>
	</div>
{/if}

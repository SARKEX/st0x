<script lang="ts">
	/**
	 * Three-field linked amount input for the trade panel: USDC + wt* + t*.
	 *
	 * All three fields are visible all the time so the user always sees, e.g.,
	 *   100 USDC  ·  0.060 wtCOIN  ·  0.300 tCOIN
	 *
	 * Whichever field the user types into becomes the "anchor"; the other two
	 * update reactively. The anchor maps onto the existing MarketOrder /
	 * LimitOrder semantics:
	 *
	 *   anchor = 'usdc'    →  inputMode='spend',  selectedAmount in payment decimals
	 *   anchor = 'wrapped' →  inputMode='amount', selectedAmount in asset (wt*) decimals
	 *   anchor = 'shares'  →  inputMode='amount', selectedAmount in asset (wt*) decimals
	 *                          (user types shares; we divide by ratio to get wt*)
	 *
	 * Conversion math uses the wrap ratio (`ratio` = number of t* per 1 wt*)
	 * and the best executable price (`bestPrice` = USDC per share).
	 */
	import { formatUnits, parseUnits } from 'viem';
	import type { CategorizedToken } from '$lib/config/tokens';
	import type { Token } from '$lib/types';

	export let paymentToken: Token | undefined;
	/** Wrapped (wt*) — what gets settled into the user's wallet. */
	export let wrappedToken: CategorizedToken | undefined;
	/** Wrap ratio = how many underlying t* shares per 1 wt*. */
	export let ratio: number = 1;
	/** Best executable price in USDC per share (oracle or best ask/bid). */
	export let bestPrice: number = 0;
	export let side: 'Buy' | 'Sell' = 'Buy';

	/** Bound output: the canonical bigint MarketOrder/LimitOrder consume. */
	export let selectedAmount: bigint = 0n;
	/** Bound output: 'spend' when anchor=usdc, 'amount' otherwise. */
	export let inputMode: 'amount' | 'spend' = 'amount';
	/** Bound output: which field the user is currently typing in. */
	export let anchor: 'usdc' | 'wrapped' | 'shares' = 'wrapped';

	export let disabled = false;
	export let isError = false;
	export let dataTestId: string = '';

	$: paymentDecimals = paymentToken?.decimals ?? 6;
	$: wrappedDecimals = wrappedToken?.decimals ?? 18;
	$: paymentSymbol = paymentToken?.symbol ?? 'USDC';
	$: wrappedSymbol = wrappedToken?.symbol ?? 'wt';
	// The underlying t* asset symbol — derived from the wt* symbol (we don't
	// ship a separate token entry for the unwrapped variant; conversion is
	// purely via ratio and the symbol prefix strip).
	$: sharesSymbol = wrappedSymbol.replace(/^wt/, 't');

	// Local string state per field. The "active" one is what the user types
	// into; the others are computed and shown as plain text values inside the
	// same input shape (still editable — typing into one makes it active).
	let usdcStr = '';
	let wrappedStr = '';
	let sharesStr = '';

	// ───────────────── conversion helpers ─────────────────
	function asNumber(value: string): number {
		if (!value) return 0;
		const n = parseFloat(value);
		return Number.isFinite(n) ? n : 0;
	}
	function trim(n: number, dp: number): string {
		if (!Number.isFinite(n) || n === 0) return '';
		// Avoid scientific notation; cap displayed precision per field
		const fixed = n.toFixed(dp);
		// strip trailing zeros without losing the decimal point
		return fixed.replace(/\.?0+$/, '') || '0';
	}

	// ───────────────── reactive: anchor drives others ─────────────────
	$: if (anchor === 'usdc') {
		const usdc = asNumber(usdcStr);
		// USDC → shares: shares = usdc / price. shares → wrapped: wrapped = shares / ratio.
		const shares = bestPrice > 0 ? usdc / bestPrice : 0;
		const wrapped = ratio > 0 ? shares / ratio : 0;
		sharesStr = trim(shares, 6);
		wrappedStr = trim(wrapped, 6);
	} else if (anchor === 'wrapped') {
		const wrapped = asNumber(wrappedStr);
		const shares = wrapped * ratio;
		const usdc = shares * bestPrice;
		sharesStr = trim(shares, 6);
		usdcStr = trim(usdc, 2);
	} else {
		const shares = asNumber(sharesStr);
		const wrapped = ratio > 0 ? shares / ratio : 0;
		const usdc = shares * bestPrice;
		wrappedStr = trim(wrapped, 6);
		usdcStr = trim(usdc, 2);
	}

	// ───────────────── anchor → MarketOrder bindings ─────────────────
	// `selectedAmount` must match `inputMode`'s decimals:
	//   spend → payment decimals
	//   amount → wrapped (asset) decimals
	$: {
		if (anchor === 'usdc') {
			inputMode = 'spend';
			selectedAmount = safeParse(usdcStr, paymentDecimals);
		} else if (anchor === 'wrapped') {
			inputMode = 'amount';
			selectedAmount = safeParse(wrappedStr, wrappedDecimals);
		} else {
			// shares anchor → still 'amount' mode under the hood, but the bigint
			// is in wt decimals (shares / ratio expressed in wt decimals).
			inputMode = 'amount';
			selectedAmount = safeParseShares(sharesStr, ratio, wrappedDecimals);
		}
	}

	function safeParse(value: string, decimals: number): bigint {
		if (!value || value === '.') return 0n;
		try {
			// parseUnits is strict — trim leading/trailing whitespace and reject
			// non-numeric chars before handing it off.
			const cleaned = value.replace(/[^0-9.]/g, '');
			if (!cleaned || cleaned === '.') return 0n;
			return parseUnits(cleaned, decimals);
		} catch {
			return 0n;
		}
	}
	function safeParseShares(value: string, r: number, wDec: number): bigint {
		if (!value || value === '.' || r <= 0) return 0n;
		try {
			const cleaned = value.replace(/[^0-9.]/g, '');
			if (!cleaned || cleaned === '.') return 0n;
			const sharesNum = parseFloat(cleaned);
			if (!Number.isFinite(sharesNum)) return 0n;
			// Convert shares → wt amount via ratio, then parse at wt decimals.
			const wrappedNum = sharesNum / r;
			return parseUnits(wrappedNum.toFixed(Math.min(wDec, 18)), wDec);
		} catch {
			return 0n;
		}
	}

	// ───────────────── input handlers ─────────────────
	function onUsdcInput(ev: Event) {
		anchor = 'usdc';
		usdcStr = (ev.target as HTMLInputElement).value.replace(/[^0-9.]/g, '');
	}
	function onWrappedInput(ev: Event) {
		anchor = 'wrapped';
		wrappedStr = (ev.target as HTMLInputElement).value.replace(/[^0-9.]/g, '');
	}
	function onSharesInput(ev: Event) {
		anchor = 'shares';
		sharesStr = (ev.target as HTMLInputElement).value.replace(/[^0-9.]/g, '');
	}

	/** Programmatically set the wrapped (wt*) amount — used by percentage / max
	 * buttons in the parent. Keeps the existing API contract that MarketOrder
	 * already relies on (setAmountValue). */
	export function setAmountValue(newAmount: bigint) {
		// newAmount is in wrapped decimals (= what MarketOrder's percentage
		// logic computes for the 'amount' inputMode path); we mirror it into
		// `wrappedStr`, becoming the active anchor.
		anchor = 'wrapped';
		try {
			wrappedStr = formatUnits(newAmount, wrappedDecimals);
		} catch {
			wrappedStr = '0';
		}
	}

	function inputClass(active: boolean): string {
		return (
			'w-full rounded-md border bg-gray-800/40 px-3 py-2.5 text-base font-mono tabular-nums text-white outline-none transition placeholder:text-gray-600 ' +
			(active
				? isError
					? 'border-red-500/60 focus:border-red-400'
					: 'border-yellow-400/60 focus:border-yellow-400'
				: 'border-white/10 hover:border-white/20 focus:border-yellow-400/40')
		);
	}
</script>

<div class="space-y-2" data-testid={dataTestId || undefined}>
	<!-- USDC field -->
	<label class="block">
		<span class="mb-1 flex items-center justify-between text-[11px] uppercase tracking-wide text-gray-500">
			<span>{side === 'Buy' ? 'You pay' : 'You receive'} ({paymentSymbol})</span>
			{#if anchor === 'usdc'}
				<span class="rounded-full bg-yellow-400/15 px-1.5 py-0.5 text-[10px] text-yellow-200"
					>Anchor</span
				>
			{/if}
		</span>
		<div class="relative">
			<input
				type="text"
				inputmode="decimal"
				placeholder="0"
				value={usdcStr}
				on:input={onUsdcInput}
				class={inputClass(anchor === 'usdc')}
				{disabled}
				aria-label="{side === 'Buy' ? 'Pay' : 'Receive'} {paymentSymbol}"
				data-testid="trifield-usdc"
			/>
			<span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
				{paymentSymbol}
			</span>
		</div>
	</label>

	<!-- Wrapped field -->
	<label class="block">
		<span class="mb-1 flex items-center justify-between text-[11px] uppercase tracking-wide text-gray-500">
			<span>{side === 'Buy' ? 'You receive' : 'You pay'} ({wrappedSymbol}) — what your wallet shows</span>
			{#if anchor === 'wrapped'}
				<span class="rounded-full bg-yellow-400/15 px-1.5 py-0.5 text-[10px] text-yellow-200"
					>Anchor</span
				>
			{/if}
		</span>
		<div class="relative">
			<input
				type="text"
				inputmode="decimal"
				placeholder="0"
				value={wrappedStr}
				on:input={onWrappedInput}
				class={inputClass(anchor === 'wrapped')}
				{disabled}
				aria-label="{side === 'Buy' ? 'Receive' : 'Pay'} {wrappedSymbol}"
				data-testid="trifield-wrapped"
			/>
			<span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
				{wrappedSymbol}
			</span>
		</div>
	</label>

	<!-- Shares field — only meaningful when ratio !== 1; still rendered for
		 consistency so the user always sees all three. When ratio = 1, the
		 wrapped and shares columns numerically agree. -->
	<label class="block">
		<span class="mb-1 flex items-center justify-between text-[11px] uppercase tracking-wide text-gray-500">
			<span>= {sharesSymbol} (equivalent shares of the underlying equity)</span>
			{#if anchor === 'shares'}
				<span class="rounded-full bg-yellow-400/15 px-1.5 py-0.5 text-[10px] text-yellow-200"
					>Anchor</span
				>
			{/if}
		</span>
		<div class="relative">
			<input
				type="text"
				inputmode="decimal"
				placeholder="0"
				value={sharesStr}
				on:input={onSharesInput}
				class={inputClass(anchor === 'shares')}
				{disabled}
				aria-label="Equivalent {sharesSymbol} shares"
				data-testid="trifield-shares"
			/>
			<span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
				{sharesSymbol}
			</span>
		</div>
	</label>

	<p class="text-[11px] text-gray-500">
		1 {wrappedSymbol} = {Number.isInteger(ratio)
			? ratio
			: ratio.toLocaleString('en-US', { maximumFractionDigits: 4 })}
		{sharesSymbol}{#if bestPrice > 0}
			· quoted at <span class="font-mono tabular-nums text-gray-400"
				>${bestPrice.toFixed(2)}/{sharesSymbol}</span
			>{/if}. Type in any field — the others update automatically.
	</p>
</div>

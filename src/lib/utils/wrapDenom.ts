/**
 * Wrap-ratio denomination helpers.
 *
 * The trade page and OrdersTable both need to re-label and re-scale numbers
 * between the wrapped token's native unit (wt*, what the orderbook holds and
 * what the wallet shows) and the underlying share unit (t*, what the chart
 * axis and the brokerage display). The math is small but easy to get the
 * direction wrong on, so it lives here behind one set of named helpers with
 * unit tests instead of inline `* ratio` / `/ ratio` sprinkled across
 * components.
 *
 * Convention:
 *   - `ratio` = assetsPerShare = the count of t* that 1 wt* unwraps into.
 *     wtSGOV today: 1.0027 — so 1 wt holds 1.0027 t (shares accrue into the
 *     wrapper as the underlying yield/dividends do).
 *   - Orderbook amounts and ioRatios are denominated in wt* — they are the
 *     primitive on-chain quantity. Per-share equivalents are derived.
 *   - When `denomination === 'wrapped'` everything is identity (no scale).
 *   - When `ratio` is missing/zero/non-finite (defensive default for parity
 *     wrappers) every helper falls through to identity too, so it's always
 *     safe to call with `1` or a stale value.
 */

export type Denomination = 'wrapped' | 'unwrapped';

function safeRatio(ratio: number | null | undefined): number {
	if (ratio == null || !Number.isFinite(ratio) || ratio <= 0) return 1;
	return ratio;
}

/**
 * Display symbol for a wrapped token in the requested denomination. Strips
 * the leading `wt` prefix (wtCOIN → tCOIN) when the override isn't supplied;
 * an explicit `unwrappedSymbolOverride` always wins.
 */
export function displaySymbol(
	tokenSymbol: string,
	denomination: Denomination,
	unwrappedSymbolOverride?: string
): string {
	if (denomination === 'wrapped') return tokenSymbol;
	if (unwrappedSymbolOverride) return unwrappedSymbolOverride;
	return tokenSymbol.replace(/^wt/, 't');
}

/**
 * Convert a quantity expressed in wt* to the requested denomination.
 * Returns `null` for null/NaN inputs so callers can show "—" without
 * branching on the input shape twice.
 */
export function displayAmount(
	amount: number | null | undefined,
	denomination: Denomination,
	ratio: number | null | undefined
): number | null {
	if (amount == null || !Number.isFinite(amount)) return null;
	if (denomination === 'wrapped') return amount;
	return amount * safeRatio(ratio);
}

/**
 * Convert a USD-per-wt price to the requested denomination. USD-per-share is
 * `USD-per-wt / ratio` because 1 wt holds `ratio` shares.
 */
export function displayPrice(
	price: number | null | undefined,
	denomination: Denomination,
	ratio: number | null | undefined
): number | null {
	if (price == null || !Number.isFinite(price)) return null;
	if (denomination === 'wrapped') return price;
	return price / safeRatio(ratio);
}

/**
 * Single multiplier for re-scaling OHLC and depth prices (USD-per-wt → the
 * displayed denomination). `1` for wrapped/identity, `1 / ratio` for shares.
 * Charts iterate over many points, so it's worth computing the multiplier
 * once at the reactive boundary and multiplying inside the loop.
 */
export function priceScale(
	denomination: Denomination,
	ratio: number | null | undefined
): number {
	if (denomination === 'wrapped') return 1;
	return 1 / safeRatio(ratio);
}

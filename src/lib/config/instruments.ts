/**
 * Instrument classification for the issued programme.
 *
 * The programme is not equities-only. Of the instruments currently listed,
 * eleven are exchange-traded funds, commodity grantor trusts, a closed-end fund
 * or a leveraged ETF. Describing all of them as "equities" understates the book,
 * so category language and per-instrument risk disclosure are both driven off
 * this map rather than being written by hand into page copy.
 *
 * Keyed by the underlying ticker (uppercased). Anything absent is treated as a
 * single-name equity, which is the common case.
 */
export type InstrumentType =
	| 'equity'
	| 'etf'
	| 'bond-etf'
	| 'leveraged-etf'
	| 'commodity-trust'
	| 'closed-end-fund'
	| 'fund';

export const INSTRUMENT_TYPES: Readonly<Record<string, InstrumentType>> = {
	ARKK: 'etf',
	DRAM: 'etf',
	IAU: 'commodity-trust',
	PPLT: 'commodity-trust',
	PTY: 'closed-end-fund',
	QQQM: 'etf',
	SGOV: 'bond-etf',
	SIVR: 'commodity-trust',
	SPYM: 'etf',
	TQQQ: 'leveraged-etf',
	VWO: 'fund'
};

export function getInstrumentType(ticker: string): InstrumentType {
	return INSTRUMENT_TYPES[ticker.toUpperCase()] ?? 'equity';
}

/**
 * Risk disclosure rendered above the trade button for instruments whose risk
 * profile is not conveyed by the underlying's name alone. Single-name equities
 * and plain broad-market funds return null — the generic risk line already on
 * the page covers them.
 */
export function getInstrumentRiskDisclosure(type: InstrumentType): string | null {
	switch (type) {
		case 'leveraged-etf':
			return (
				'This instrument is a leveraged exchange-traded fund. It aims to deliver three times the ' +
				'daily return of its index. Returns compound daily, so over any period longer than one ' +
				'day the result can differ substantially from three times the index return over that ' +
				'period, including in a rising market. It is not designed to be held long term.'
			);
		case 'commodity-trust':
			return (
				'This instrument is a commodity grantor trust. It holds physical metal rather than shares ' +
				'in an operating company, and it is not an equity security. Its value tracks the metal ' +
				'price less the expenses of the trust, and it pays no dividend.'
			);
		case 'closed-end-fund':
			return (
				'This instrument is a closed-end fund. Its shares trade at a price that can differ ' +
				'significantly from the value of the fund’s underlying holdings, and the fund may use ' +
				'leverage.'
			);
		default:
			return null;
	}
}

/** Human-readable category label, used where copy needs to name the instrument type. */
export function getInstrumentLabel(type: InstrumentType): string {
	switch (type) {
		case 'etf':
			return 'exchange-traded fund';
		case 'bond-etf':
			return 'bond exchange-traded fund';
		case 'leveraged-etf':
			return 'leveraged exchange-traded fund';
		case 'commodity-trust':
			return 'commodity grantor trust';
		case 'closed-end-fund':
			return 'closed-end fund';
		case 'fund':
			return 'fund';
		default:
			return 'listed security';
	}
}

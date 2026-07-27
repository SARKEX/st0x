import { parseUnits } from 'viem';

export interface MarketOrderAnchor {
	amount: bigint;
	inputMode: 'amount' | 'spend' | 'receive';
}

/** Preserve the field the user edited as the authoritative REST request anchor. */
export function resolveMarketOrderAnchor(args: {
	orderSide: 'Buy' | 'Sell';
	editedField: 'top' | 'bottom' | null;
	paymentAmount: string;
	assetAmount: string;
	paymentDecimals: number;
	assetDecimals: number;
}): MarketOrderAnchor | null {
	if (!args.editedField) return null;
	const paymentAnchored = args.editedField === 'top';
	const rawAmount = paymentAnchored ? args.paymentAmount : args.assetAmount;
	if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(rawAmount)) return null;
	const normalizedAmount = rawAmount.startsWith('.')
		? `0${rawAmount}`
		: rawAmount.endsWith('.')
			? rawAmount.slice(0, -1)
			: rawAmount;
	const numericAmount = Number(normalizedAmount);
	if (!Number.isFinite(numericAmount) || numericAmount <= 0) return null;
	const decimals = paymentAnchored ? args.paymentDecimals : args.assetDecimals;
	if ((normalizedAmount.split('.')[1]?.length ?? 0) > decimals) return null;

	try {
		return {
			amount: parseUnits(normalizedAmount, decimals),
			inputMode: paymentAnchored ? (args.orderSide === 'Buy' ? 'spend' : 'receive') : 'amount'
		};
	} catch {
		return null;
	}
}

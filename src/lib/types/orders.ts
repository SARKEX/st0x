import type { ProcessedQuote } from '$lib/utils/orderbook';
import type { SgTrade } from '@rainlanguage/raindex';

// Type for unified order display across dashboard and trade pages
export type DisplayOrder = {
	type: 'limit' | 'dca' | 'custom' | 'market';
	orderHash: string;
	timestamp: number;
	side: 'Buy' | 'Sell';
	quote?: ProcessedQuote;
	trade?: SgTrade;
	txHash?: string;
	tokenSymbol: string;
	tokenAddress: string;
	inputTokenSymbol: string;
	outputTokenSymbol: string;
	inputAmount?: string;
	outputAmount?: string;
	price?: number;
	filled?: number;
	filledSymbol?: string;
	isActive?: boolean;
	isFilled?: boolean;
};

/**
 * Test utility functions for creating mock data objects
 */

import type { Network } from '$lib/config/network';
import type { CategorizedToken } from '$lib/config/network';
import type { TakeOrdersParams, TokenInfo } from '$lib/types/transactions';
import type { OrderV4 } from '@rainlanguage/orderbook';

/**
 * Creates a mock Network object for testing
 */
export function createMockNetwork(overrides?: Partial<Network>): Network {
	return {
		id: 8453,
		chainId: 8453,
		name: 'Base',
		shortName: 'base',
		nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 },
		rpcUrls: ['https://base-mainnet.g.alchemy.com/v2/y3BXawVv5uuP_g8BaDlKbKoTBGHo9zD9'],
		blockExplorers: [{ name: 'BaseScan', url: 'https://basescan.org' }],
		contracts: {
			orderbook: {
				address: '0x1234567890123456789012345678901234567890',
				deployBlock: 0
			}
		},
		defaultPaymentToken: {
			address: '0xPaymentToken',
			symbol: 'USDC',
			decimals: 6,
			name: 'USD Coin'
		},
		...overrides
	} as Network;
}

/**
 * Creates a mock CategorizedToken for testing
 */
export function createMockToken(overrides?: Partial<CategorizedToken>): CategorizedToken {
	return {
		address: '0xMockToken',
		symbol: 'MOCK',
		decimals: 18,
		name: 'Mock Token',
		category: 'other' as const,
		...overrides
	} as CategorizedToken;
}

/**
 * Creates a mock TokenInfo object for testing
 */
export function createMockTokenInfo(overrides?: Partial<TokenInfo>): TokenInfo {
	return {
		address: '0xMockToken',
		symbol: 'MOCK',
		decimals: 18,
		...overrides
	};
}

/**
 * Creates a mock TakeOrdersParams object for testing
 */
export function createMockTakeOrdersParams(
	overrides?: Partial<TakeOrdersParams>
): TakeOrdersParams {
	return {
		orderData: {
			owner: '0xOwner',
			validInputs: [{ token: '0xInput', decimals: 18, vaultId: '0x01' }],
			validOutputs: [{ token: '0xOutput', decimals: 18, vaultId: '0x02' }]
		} as unknown as OrderV4,
		ioIndexes: { input: 0, output: 0 },
		takerWantsToken: createMockTokenInfo({ address: '0xInput', symbol: 'INPUT' }),
		takerPaysToken: createMockTokenInfo({ address: '0xOutput', symbol: 'OUTPUT' }),
		requestedTakerWantsAmount: 1000000000000000000n,
		simulation: {
			inputAmountFilled: 1000000000000000000n,
			outputAmountGiven: 1000000n,
			inputDecimals: 18,
			outputDecimals: 6,
			ioRatio: 1.0,
			fills: []
		},
		...overrides
	};
}

/**
 * Creates a mock Resource object (for cache store testing)
 */
export function createMockResource<T>(data: T) {
	return {
		data,
		loading: false,
		error: null,
		lastFetch: Date.now(),
		stale: false
	};
}

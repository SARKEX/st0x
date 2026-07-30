import { describe, expect, it } from 'vitest';
import { normalizeApiTokensForNetwork } from '../../../src/lib/queries/tokens';
import type { ApiToken } from '../../../src/lib/api/st0xApi';

function apiToken(overrides: Partial<ApiToken>): ApiToken {
	return {
		address: '0x0000000000000000000000000000000000000001',
		symbol: 'wtTEST',
		decimals: 18,
		name: 'Wrapped Test',
		network: { chainId: 8453 },
		extensions: { category: 'ST0x' },
		...overrides
	} as ApiToken;
}

describe('normalizeApiTokensForNetwork', () => {
	it('uses API tokens as the returned token universe for a network', () => {
		const tokens = normalizeApiTokensForNetwork(
			[
				apiToken({
					address: '0x1111111111111111111111111111111111111111',
					symbol: 'wtNEW',
					name: 'Wrapped New Asset',
					'logo-uri': 'https://st0x.io/images/NEW.png',
					extensions: {
						category: 'ST0x',
						unwrappedAddress: '0x2222222222222222222222222222222222222222',
						tradingViewSymbol: 'NASDAQ:NEW',
						tradingViewMarket: 'america'
					}
				}),
				apiToken({
					address: '0x3333333333333333333333333333333333333333',
					symbol: 'wtOTHER',
					network: { chainId: 9999 }
				})
			],
			8453
		);

		expect(tokens).toHaveLength(1);
		expect(tokens[0]).toMatchObject({
			address: '0x1111111111111111111111111111111111111111',
			symbol: 'wtNEW',
			name: 'Wrapped New Asset',
			logoUrl: 'https://st0x.io/images/NEW.png',
			category: 'ST0x',
			unwrappedAddress: '0x2222222222222222222222222222222222222222',
			tradingViewSymbol: 'NASDAQ:NEW',
			tradingViewMarket: 'america'
		});
	});

	it('uses server-provided metadata without merging static token config', () => {
		const tokens = normalizeApiTokensForNetwork(
			[
				apiToken({
					address: '0x5cda0e1ca4ce2af96315f7f8963c85399c172204',
					symbol: 'wtCOIN',
					name: 'Wrapped Coinbase Global Inc ST0x',
					'logo-uri': 'https://st0x.io/images/COIN-from-api.png',
					extensions: {
						category: 'ST0x',
						unwrappedAddress: '0x626757e6f50675d17fcad312e82f989ae7a23d38'
					}
				})
			],
			8453
		);

		expect(tokens).toHaveLength(1);
		expect(tokens[0].symbol).toBe('wtCOIN');
		expect(tokens[0].logoUrl).toBe('https://st0x.io/images/COIN-from-api.png');
		expect(tokens[0].legacyAddress).toBeUndefined();
	});

	it('deduplicates API tokens by address', () => {
		const tokens = normalizeApiTokensForNetwork(
			[
				apiToken({ address: '0x1111111111111111111111111111111111111111', symbol: 'wtONE' }),
				apiToken({ address: '0x1111111111111111111111111111111111111111', symbol: 'wtTWO' })
			],
			8453
		);

		expect(tokens).toHaveLength(1);
		expect(tokens[0].symbol).toBe('wtONE');
	});

	it('keeps uncategorized API tokens as crypto tokens', () => {
		const tokens = normalizeApiTokensForNetwork(
			[
				apiToken({
					address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
					symbol: 'USDC',
					name: 'USD Coin',
					decimals: 6,
					extensions: {}
				})
			],
			8453
		);

		expect(tokens).toHaveLength(1);
		expect(tokens[0]).toMatchObject({
			symbol: 'USDC',
			category: 'CRYPTO',
			decimals: 6
		});
	});
});

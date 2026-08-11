import { afterEach, describe, expect, it } from 'vitest';
import {
	buildNetworkCatalog,
	getNetworkByChainId,
	getNetworkById,
	getNetworkByName,
	networks,
	replaceNetworkCatalog,
	type Network
} from '$lib/config/networks';
import {
	getAllTokensByNetwork,
	getDefaultPaymentTokenForNetwork,
	getTokenByAnyAddress,
	replaceTokenCatalog,
	type CategorizedToken
} from '$lib/config/tokens';

const SETTINGS = `
version: 6
networks:
  alpha:
    rpcs:
      - https://alpha.example/rpc
      - https://alpha-fallback.example/rpc
    chain-id: 111
    currency: ETH
  beta:
    rpcs:
      - https://beta.example/rpc
    chain-id: 222
    currency: BETA
subgraphs:
  alpha: https://alpha.example/orders
  sft-alpha: https://alpha.example/sft
  beta: https://beta.example/orders
  sft-beta: https://beta.example/sft
metaboards:
  alpha: https://alpha.example/meta
  beta: https://beta.example/meta
raindexes:
  alpha:
    address: 0x0000000000000000000000000000000000000111
    network: alpha
    subgraph: alpha
    deployment-block: 1
  beta:
    address: 0x0000000000000000000000000000000000000222
    network: beta
    subgraph: beta
    deployment-block: 2
`;

function token(
	chainId: number,
	address: string,
	symbol: string,
	category: 'ST0x' | 'CRYPTO'
): CategorizedToken {
	return {
		chainId,
		address,
		symbol,
		decimals: category === 'CRYPTO' ? 6 : 18,
		name: symbol,
		category,
		paymentToken: category === 'CRYPTO'
	};
}

const TOKENS = [
	token(111, '0x0000000000000000000000000000000000000001', 'wtONE', 'ST0x'),
	token(111, '0x0000000000000000000000000000000000000011', 'USDC', 'CRYPTO'),
	token(222, '0x0000000000000000000000000000000000000001', 'wtTWO', 'ST0x'),
	token(222, '0x0000000000000000000000000000000000000022', 'USDB', 'CRYPTO')
];

describe('registry-backed network catalog', () => {
	afterEach(() => {
		replaceTokenCatalog([]);
		replaceNetworkCatalog([]);
	});

	it('uses the Raindex SDK settings model to build every configured network', async () => {
		replaceTokenCatalog(TOKENS);
		const catalog = await buildNetworkCatalog(SETTINGS, TOKENS);
		replaceNetworkCatalog(catalog);

		expect(networks.map((network) => network.chainId)).toEqual([111, 222]);
		expect(getNetworkById(111)?.rpcUrl).toBe('https://alpha.example/rpc');
		expect(getNetworkByChainId(222)?.defaultPaymentToken.symbol).toBe('USDB');
		expect(getNetworkByName('beta')?.trustedOrderbooks).toEqual([
			'0x0000000000000000000000000000000000000222'
		]);
		expect(catalog[0]?.fallbackRpcUrls).toEqual(['https://alpha-fallback.example/rpc']);
	});

	it('keeps same-address tokens isolated by chain', () => {
		replaceTokenCatalog(TOKENS);
		expect(getTokenByAnyAddress(TOKENS[0].address)).toBeNull();
		expect(getTokenByAnyAddress(TOKENS[0].address, 111)?.symbol).toBe('wtONE');
		expect(getTokenByAnyAddress(TOKENS[0].address, 222)?.symbol).toBe('wtTWO');
		expect(getAllTokensByNetwork(222).map((item) => item.symbol)).toEqual(['wtTWO', 'USDB']);
		expect(getDefaultPaymentTokenForNetwork(111)?.symbol).toBe('USDC');
	});

	it('rejects a registry chain without a REST payment token', async () => {
		await expect(
			buildNetworkCatalog(
				SETTINGS,
				TOKENS.filter((item) => item.chainId === 111)
			)
		).rejects.toThrow('no payment token for chain 222');
	});
});

/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect } from 'vitest';
import { replaceTokenCatalog } from '$lib/config/tokens';
import { TEST_ST0X_TOKENS } from '../fixtures/st0xTokenCatalog';
import {
	getNetworkById,
	getNetworkByChainId,
	getNetworkByName,
	getDefaultPaymentTokenForNetwork,
	getAllTokens,
	getTokensByNetwork,
	getCryptoTokensByNetwork,
	getAllTokensByNetwork,
	networks,
	DEFAULT_PAYMENT_TOKENS,
	TOKENS,
	CRYPTO_TOKENS
} from '$lib/config/network';

replaceTokenCatalog(TEST_ST0X_TOKENS);

describe('network', () => {
	describe('getNetworkById', () => {
		it('should find network by id', () => {
			const network = getNetworkById(8453);
			expect(network).toBeDefined();
			expect(network?.id).toBe(8453);
			expect(network?.name).toBe('base');
		});

		it.each([[9999], [-1], [0]])('should return undefined for invalid network id: %s', (id) => {
			expect(getNetworkById(id)).toBeUndefined();
		});
	});

	describe('getNetworkByChainId', () => {
		it('should find network by chainId', () => {
			const network = getNetworkByChainId(8453);
			expect(network).toBeDefined();
			expect(network?.chainId).toBe(8453);
		});

		it.each([[9999], [-1]])('should return undefined for invalid chainId: %s', (chainId) => {
			expect(getNetworkByChainId(chainId)).toBeUndefined();
		});
	});

	describe('getNetworkByName', () => {
		it('should find network by name', () => {
			const network = getNetworkByName('base');
			expect(network).toBeDefined();
			expect(network?.name).toBe('base');
			expect(network?.displayName).toBe('Base Mainnet');
		});

		it.each([
			['Base'], // case-sensitive
			['unknown'],
			['']
		])('should return undefined for invalid name: %s', (name) => {
			expect(getNetworkByName(name)).toBeUndefined();
		});
	});

	describe('getDefaultPaymentTokenForNetwork', () => {
		it('should get payment token for Base', () => {
			const token = getDefaultPaymentTokenForNetwork(8453);
			expect(token).toBeDefined();
			expect(token?.symbol).toBe('USDC');
			expect(token?.decimals).toBe(6);
			expect(token?.chainId).toBe(8453);
		});

		it('should return undefined for network without configured payment token', () => {
			expect(getDefaultPaymentTokenForNetwork(9999)).toBeUndefined();
		});

		it('should have valid token properties', () => {
			const token = getDefaultPaymentTokenForNetwork(8453);
			expect(token?.address).toBeDefined();
			expect(token?.name).toBeDefined();
			expect(token?.priceFeedId).toBeDefined();
		});
	});

	describe('getAllTokens', () => {
		it('should return all tokens from TOKENS array', () => {
			const tokens = getAllTokens();
			expect(tokens).toEqual(TOKENS);
		});

		it('should include ST0x tokens', () => {
			const tokens = getAllTokens();
			const st0xTokens = tokens.filter((t) => t.category === 'ST0x');
			expect(st0xTokens.length).toBeGreaterThan(0);
		});

		it('should not include CRYPTO tokens from CRYPTO_TOKENS', () => {
			const allTokens = getAllTokens();
			const cryptoTokensSet = new Set(CRYPTO_TOKENS.map((t) => t.address.toLowerCase()));
			const hasCrypto = allTokens.some((t) => cryptoTokensSet.has(t.address.toLowerCase()));
			expect(hasCrypto).toBe(false);
		});
	});

	describe('getTokensByNetwork', () => {
		it('should get tokens for Base network', () => {
			const tokens = getTokensByNetwork(8453);
			expect(tokens.length).toBeGreaterThan(0);
			expect(tokens.every((t) => t.chainId === 8453)).toBe(true);
		});

		it('should include wtIAU for Base', () => {
			const tokens = getTokensByNetwork(8453);
			const wtIAU = tokens.find((t) => t.symbol === 'wtIAU');
			expect(wtIAU).toBeDefined();
		});

		it('should return empty array for unknown network', () => {
			expect(getTokensByNetwork(9999)).toEqual([]);
		});
	});

	describe('getCryptoTokensByNetwork', () => {
		it.each([
			[8453], // Base
			[42161] // Arbitrum
		])('should get crypto tokens for network %s', (chainId) => {
			const tokens = getCryptoTokensByNetwork(chainId);
			expect(tokens.length).toBeGreaterThan(0);
			expect(tokens.every((t) => t.chainId === chainId)).toBe(true);
		});

		it('should include USDC for both Base and Arbitrum', () => {
			const baseTokens = getCryptoTokensByNetwork(8453);
			const arbTokens = getCryptoTokensByNetwork(42161);

			const baseUsdc = baseTokens.find((t) => t.symbol === 'USDC');
			const arbUsdc = arbTokens.find((t) => t.symbol === 'USDC');

			expect(baseUsdc).toBeDefined();
			expect(arbUsdc).toBeDefined();
		});

		it('should return empty array for unknown network', () => {
			expect(getCryptoTokensByNetwork(9999)).toEqual([]);
		});
	});

	describe('getAllTokensByNetwork', () => {
		it('should combine regular and crypto tokens for Base', () => {
			const allTokens = getAllTokensByNetwork(8453);
			const regularTokens = getTokensByNetwork(8453);
			const cryptoTokens = getCryptoTokensByNetwork(8453);

			// Verify that all tokens are actually present in the combined result
			regularTokens.forEach((token) => {
				expect(allTokens).toContainEqual(token);
			});
			cryptoTokens.forEach((token) => {
				expect(allTokens).toContainEqual(token);
			});
		});

		it('should include both ST0x and CRYPTO tokens', () => {
			const allTokens = getAllTokensByNetwork(8453);
			const hasST0x = allTokens.some((t) => t.category === 'ST0x');
			const hasCrypto = allTokens.some((t) => t.category === 'CRYPTO');

			expect(hasST0x).toBe(true);
			expect(hasCrypto).toBe(true);
		});

		it('should not have duplicate tokens by address', () => {
			const allTokens = getAllTokensByNetwork(8453);
			const addresses = allTokens.map((t) => t.address.toLowerCase());
			const uniqueAddresses = new Set(addresses);

			expect(addresses.length).toBe(uniqueAddresses.size);
		});

		it('should return empty array for unknown network', () => {
			expect(getAllTokensByNetwork(9999)).toEqual([]);
		});
	});

	describe('token properties validation', () => {
		it('should have all required properties for ST0x tokens', () => {
			const tokens = TOKENS.filter((t) => t.category === 'ST0x');
			tokens.forEach((token) => {
				expect(token.address).toBeDefined();
				expect(token.symbol).toBeDefined();
				expect(token.decimals).toBeDefined();
				expect(token.chainId).toBeDefined();
				expect(token.priceFeedId).toBeDefined();
				expect(token.category).toBe('ST0x');
			});
		});

		it('should have valid addresses (starting with 0x)', () => {
			const allTokens = [...TOKENS, ...CRYPTO_TOKENS];
			allTokens.forEach((token) => {
				expect(token.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
			});
		});

		it('should have valid decimal values', () => {
			const allTokens = [...TOKENS, ...CRYPTO_TOKENS];
			allTokens.forEach((token) => {
				expect(token.decimals).toBeGreaterThanOrEqual(0);
				expect(token.decimals).toBeLessThanOrEqual(30);
			});
		});

		it('should have valid price feed IDs', () => {
			const allTokens = [...TOKENS, ...CRYPTO_TOKENS];
			allTokens
				.filter((token) => token.priceFeedId !== '')
				.forEach((token) => {
					expect(token.priceFeedId).toMatch(/^0x[a-fA-F0-9]{64}$/);
				});
		});
	});

	describe('network properties validation', () => {
		it('should have all required properties', () => {
			networks.forEach((network) => {
				expect(network.id).toBeDefined();
				expect(network.chainId).toBeDefined();
				expect(network.name).toBeDefined();
				expect(network.displayName).toBeDefined();
				expect(network.rpcUrl).toBeDefined();
				expect(network.blockExplorer).toBeDefined();
				expect(network.subgraph_url).toBeDefined();
				expect(network.orderbook_subgraph_url).toBeDefined();
			});
		});

		it('should have matching id and chainId for Base', () => {
			const network = networks.find((n) => n.name === 'base');
			expect(network).toBeDefined();
			expect(network?.id).toBe(network?.chainId);
		});

		it('should have valid URLs', () => {
			networks.forEach((network) => {
				expect(network.rpcUrl).toMatch(/^https?:\/\//);
				expect(network.blockExplorer).toMatch(/^https?:\/\//);
				expect(network.subgraph_url).toMatch(/^https?:\/\//);
			});
		});
	});

	describe('payment token configuration', () => {
		it('should have default payment token for Base', () => {
			expect(DEFAULT_PAYMENT_TOKENS[8453]).toBeDefined();
			expect(DEFAULT_PAYMENT_TOKENS[8453].symbol).toBe('USDC');
		});

		it('should match network default payment token', () => {
			const network = getNetworkById(8453);
			const token = getDefaultPaymentTokenForNetwork(8453);
			expect(network?.defaultPaymentToken).toEqual(token);
		});
	});
});

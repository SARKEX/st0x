import { describe, it, expect } from 'vitest';
import {
	getNetworkById,
	getNetworkByChainId,
	getNetworkByName,
	getUsdcTokenForNetwork,
	getTokensByCategory,
	getAllTokens,
	getTokensByNetwork,
	getCryptoTokensByNetwork,
	getAllTokensByNetwork,
	networks,
	USDC_TOKENS,
	TOKENS,
	CRYPTO_TOKENS
} from './network';

describe('network', () => {
	describe('getNetworkById', () => {
		it('should find network by id', () => {
			const network = getNetworkById(8453);
			expect(network).toBeDefined();
			expect(network?.id).toBe(8453);
			expect(network?.name).toBe('base');
		});

		it('should return undefined for unknown network id', () => {
			const network = getNetworkById(9999);
			expect(network).toBeUndefined();
		});

		it('should handle negative ids', () => {
			const network = getNetworkById(-1);
			expect(network).toBeUndefined();
		});

		it('should handle zero', () => {
			const network = getNetworkById(0);
			expect(network).toBeUndefined();
		});
	});

	describe('getNetworkByChainId', () => {
		it('should find network by chainId', () => {
			const network = getNetworkByChainId(8453);
			expect(network).toBeDefined();
			expect(network?.chainId).toBe(8453);
		});

		it('should return undefined for unknown chainId', () => {
			const network = getNetworkByChainId(9999);
			expect(network).toBeUndefined();
		});

		it('should handle negative chainIds', () => {
			const network = getNetworkByChainId(-1);
			expect(network).toBeUndefined();
		});
	});

	describe('getNetworkByName', () => {
		it('should find network by name', () => {
			const network = getNetworkByName('base');
			expect(network).toBeDefined();
			expect(network?.name).toBe('base');
			expect(network?.displayName).toBe('Base Mainnet');
		});

		it('should be case-sensitive', () => {
			const network = getNetworkByName('Base');
			expect(network).toBeUndefined();
		});

		it('should return undefined for unknown name', () => {
			const network = getNetworkByName('unknown');
			expect(network).toBeUndefined();
		});

		it('should handle empty string', () => {
			const network = getNetworkByName('');
			expect(network).toBeUndefined();
		});
	});

	describe('getUsdcTokenForNetwork', () => {
		it('should get USDC token for Base', () => {
			const token = getUsdcTokenForNetwork(8453);
			expect(token).toBeDefined();
			expect(token?.symbol).toBe('USDC');
			expect(token?.decimals).toBe(6);
			expect(token?.chainId).toBe(8453);
		});

		it('should return undefined for network without USDC', () => {
			const token = getUsdcTokenForNetwork(9999);
			expect(token).toBeUndefined();
		});

		it('should have valid token properties', () => {
			const token = getUsdcTokenForNetwork(8453);
			expect(token?.address).toBeDefined();
			expect(token?.name).toBeDefined();
			expect(token?.priceFeedId).toBeDefined();
		});
	});

	describe('getTokensByCategory', () => {
		it('should get all ST0x tokens', () => {
			const tokens = getTokensByCategory('ST0x');
			expect(tokens.length).toBeGreaterThan(0);
			expect(tokens.every((t) => t.category === 'ST0x')).toBe(true);
		});

		it('should get all ETFs tokens', () => {
			const tokens = getTokensByCategory('ETFs');
			// ETFs category may be empty in current config
			expect(Array.isArray(tokens)).toBe(true);
			expect(tokens.every((t) => t.category === 'ETFs')).toBe(true);
		});

		it('should not find CRYPTO tokens in TOKENS array (they are in separate CRYPTO_TOKENS)', () => {
			const tokens = getTokensByCategory('CRYPTO');
			// CRYPTO tokens are in separate CRYPTO_TOKENS array, not TOKENS
			expect(tokens.length).toBe(0);
		});

		it('should return empty array for unknown category', () => {
			const tokens = getTokensByCategory('UNKNOWN' as any);
			expect(tokens).toEqual([]);
		});

		it('should not include duplicate tokens', () => {
			const tokens = getTokensByCategory('ST0x');
			const addresses = tokens.map((t) => t.address.toLowerCase());
			const uniqueAddresses = new Set(addresses);
			// If there are duplicates, length would be > uniqueAddresses.size
		expect(addresses.length).toBe(uniqueAddresses.size);
		});
	});

	describe('getAllTokens', () => {
		it('should return all tokens from TOKENS array', () => {
			const tokens = getAllTokens();
			expect(tokens).toEqual(TOKENS);
			expect(tokens.length).toBeGreaterThan(0);
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
			// TOKENS doesn't include CRYPTO_TOKENS, they're separate
			expect(hasCrypto).toBe(false);
		});
	});

	describe('getTokensByNetwork', () => {
		it('should get tokens for Base network', () => {
			const tokens = getTokensByNetwork(8453);
			expect(tokens.length).toBeGreaterThan(0);
			expect(tokens.every((t) => t.chainId === 8453)).toBe(true);
		});

		it('should return empty array for unknown network', () => {
			const tokens = getTokensByNetwork(9999);
			expect(tokens).toEqual([]);
		});

		it('should include tSTOX for Base', () => {
			const tokens = getTokensByNetwork(8453);
			const tSTOX = tokens.find((t) => t.symbol === 'tSTOX');
			expect(tSTOX).toBeDefined();
		});
	});

	describe('getCryptoTokensByNetwork', () => {
		it('should get crypto tokens for Base', () => {
			const tokens = getCryptoTokensByNetwork(8453);
			expect(tokens.length).toBeGreaterThan(0);
			expect(tokens.every((t) => t.chainId === 8453)).toBe(true);
		});

		it('should get crypto tokens for Arbitrum', () => {
			const tokens = getCryptoTokensByNetwork(42161);
			expect(tokens.length).toBeGreaterThan(0);
			expect(tokens.every((t) => t.chainId === 42161)).toBe(true);
		});

		it('should include USDC for both networks', () => {
			const baseTokens = getCryptoTokensByNetwork(8453);
			const arbTokens = getCryptoTokensByNetwork(42161);

			const baseUsdc = baseTokens.find((t) => t.symbol === 'USDC');
			const arbUsdc = arbTokens.find((t) => t.symbol === 'USDC');

			expect(baseUsdc).toBeDefined();
			expect(arbUsdc).toBeDefined();
		});

		it('should return empty array for unknown network', () => {
			const tokens = getCryptoTokensByNetwork(9999);
			expect(tokens).toEqual([]);
		});
	});

	describe('getAllTokensByNetwork', () => {
		it('should combine regular and crypto tokens for Base', () => {
			const allTokens = getAllTokensByNetwork(8453);
			const regularTokens = getTokensByNetwork(8453);
			const cryptoTokens = getCryptoTokensByNetwork(8453);

			expect(allTokens.length).toBe(regularTokens.length + cryptoTokens.length);
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
			const allTokens = getAllTokensByNetwork(9999);
			expect(allTokens).toEqual([]);
		});
	});

	describe('token properties validation', () => {
		it('should have all required properties for ST0x tokens', () => {
			const tokens = getTokensByCategory('ST0x');
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
			allTokens.forEach((token) => {
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

	describe('USDC_TOKENS configuration', () => {
		it('should have USDC token for Base', () => {
			expect(USDC_TOKENS[8453]).toBeDefined();
			expect(USDC_TOKENS[8453].symbol).toBe('USDC');
		});

		it('should match network USDC token', () => {
			const network = getNetworkById(8453);
			const token = getUsdcTokenForNetwork(8453);
			expect(network?.usdcToken).toEqual(token);
		});
	});
});

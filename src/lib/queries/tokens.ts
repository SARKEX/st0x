import { browser } from '$app/environment';
import { createQuery } from '@tanstack/svelte-query';
import { apiGetTokens, type ApiToken } from '$lib/api/st0xApi';
import { isRateLimitError } from '$lib/clients/http';
import {
	CRYPTO_TOKENS,
	TOKENS,
	replaceTokenCatalog,
	type CategorizedToken,
	type TokenCategory
} from '$lib/config/tokens';

type ApiTokenExtensions = {
	category?: unknown;
	unwrappedAddress?: unknown;
	legacyAddress?: unknown;
	legacySymbol?: unknown;
	previousSymbols?: unknown;
	receiptAddress?: unknown;
	priceFeedId?: unknown;
	fallbackPrice?: unknown;
	paymentToken?: unknown;
	migrationOrderHash?: unknown;
	tradingViewSymbol?: unknown;
	tradingViewMarket?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | undefined {
	return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
	if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) return undefined;
	return value;
}

function getApiChainId(token: ApiToken): number | null {
	const network = asRecord(token.network);
	const chainId = network?.chainId ?? network?.networkId;
	return typeof chainId === 'number' && Number.isFinite(chainId) ? chainId : null;
}

function getApiExtensions(token: ApiToken): ApiTokenExtensions {
	return asRecord(token.extensions) ?? {};
}

function getApiCategory(token: ApiToken): TokenCategory | null {
	const category = asString(getApiExtensions(token).category);
	if (category === 'ST0x' || category === 'CRYPTO') return category;
	return 'CRYPTO';
}

function normalizeApiToken(token: ApiToken): CategorizedToken | null {
	const chainId = getApiChainId(token);
	const network = asRecord(token.network);
	const category = getApiCategory(token);
	if (
		!chainId ||
		!token.address ||
		!token.symbol ||
		typeof token.decimals !== 'number' ||
		!category
	) {
		return null;
	}

	const extensions = getApiExtensions(token);

	return {
		chainId,
		network: {
			chainId,
			key: asString(network?.key),
			label: asString(network?.label),
			networkId: asNumber(network?.networkId),
			currency: asString(network?.currency)
		},
		address: token.address,
		symbol: token.symbol,
		decimals: token.decimals,
		name: token.name ?? token.label ?? token.symbol,
		logoUrl: asString(token['logo-uri']),
		priceFeedId: asString(extensions.priceFeedId) ?? '',
		fallbackPrice: asNumber(extensions.fallbackPrice),
		paymentToken: extensions.paymentToken === true,
		migrationOrderHash: asString(extensions.migrationOrderHash),
		category,
		tradingViewSymbol: asString(extensions.tradingViewSymbol),
		tradingViewMarket: asString(extensions.tradingViewMarket),
		unwrappedAddress: asString(extensions.unwrappedAddress),
		legacyAddress: asString(extensions.legacyAddress),
		legacySymbol: asString(extensions.legacySymbol),
		previousSymbols: asStringArray(extensions.previousSymbols),
		receiptAddress: asString(extensions.receiptAddress),
		isin: asString(token.isin) ?? asString(asRecord(token.extensions)?.isin),
		limitOrders: []
	};
}

export function normalizeApiTokensForNetwork(
	apiTokens: ApiToken[],
	chainId: number
): CategorizedToken[] {
	return normalizeApiTokens(apiTokens).filter((token) => token.chainId === chainId);
}

export function normalizeApiTokens(apiTokens: ApiToken[]): CategorizedToken[] {
	const seen = new Set<string>();
	const result: CategorizedToken[] = [];

	for (const apiToken of apiTokens) {
		const normalized = normalizeApiToken(apiToken);
		if (!normalized) continue;

		const addressKey = `${normalized.chainId}:${normalized.address.toLowerCase()}`;
		if (seen.has(addressKey)) continue;
		seen.add(addressKey);
		result.push(normalized);
	}

	return result;
}

export function getTokenAddressVariants(token: CategorizedToken): string[] {
	return [
		token.address,
		...(token.unwrappedAddress ? [token.unwrappedAddress] : []),
		...(token.legacyAddress ? [token.legacyAddress] : [])
	].map((address) => address.toLowerCase());
}

export function findApiTokenByAnyAddress(
	tokens: CategorizedToken[],
	address: string | null | undefined
): CategorizedToken | null {
	const normalized = address?.toLowerCase();
	if (!normalized) return null;

	return tokens.find((token) => getTokenAddressVariants(token).includes(normalized)) ?? null;
}

export function createApiTokensQuery(chainId: number | null | undefined) {
	return createQuery<CategorizedToken[]>({
		queryKey: ['st0xApiTokens', chainId],
		enabled: Boolean(browser && chainId),
		// The supported-token list is effectively static config; it does not need to be
		// re-fetched on every mount/focus. Aggressive refetch here (staleTime:0 +
		// refetchOnMount:'always' + refetchOnWindowFocus) fired /v2/tokens from ~9 mount
		// sites and contributed to the upstream rate-limit storm.
		staleTime: 5 * 60_000, // 5 minutes
		retry: (failureCount, error) => !isRateLimitError(error) && failureCount < 2,
		refetchOnWindowFocus: false,
		queryFn: async () => {
			if (!chainId) return [];
			const catalog = normalizeApiTokens(await apiGetTokens(chainId));
			const otherNetworks = [...TOKENS, ...CRYPTO_TOKENS].filter(
				(token) => token.chainId !== chainId
			);
			replaceTokenCatalog([...otherNetworks, ...catalog]);
			return catalog;
		}
	});
}

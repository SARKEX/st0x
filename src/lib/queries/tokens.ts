import { browser } from '$app/environment';
import { createQuery } from '@tanstack/svelte-query';
import { apiGetTokens, type ApiToken } from '$lib/api/st0xApi';
import { isRateLimitError } from '$lib/clients/http';
import type { CategorizedToken, TokenCategory } from '$lib/config/tokens';

type ApiTokenExtensions = {
	category?: unknown;
	unwrappedAddress?: unknown;
	legacyAddress?: unknown;
	legacySymbol?: unknown;
	tradingViewSymbol?: unknown;
	tradingViewMarket?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | undefined {
	return typeof value === 'string' && value.length > 0 ? value : undefined;
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
		address: token.address,
		symbol: token.symbol,
		decimals: token.decimals,
		name: token.name ?? token.label ?? token.symbol,
		logoUrl: asString(token['logo-uri']),
		category,
		tradingViewSymbol: asString(extensions.tradingViewSymbol),
		tradingViewMarket: asString(extensions.tradingViewMarket),
		unwrappedAddress: asString(extensions.unwrappedAddress),
		legacyAddress: asString(extensions.legacyAddress),
		legacySymbol: asString(extensions.legacySymbol),
		limitOrders: []
	};
}

export function normalizeApiTokensForNetwork(
	apiTokens: ApiToken[],
	chainId: number
): CategorizedToken[] {
	const seen = new Set<string>();
	const result: CategorizedToken[] = [];

	for (const apiToken of apiTokens) {
		const normalized = normalizeApiToken(apiToken);
		if (!normalized || normalized.chainId !== chainId) continue;

		const addressKey = normalized.address.toLowerCase();
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
		// refetchOnMount:'always' + refetchOnWindowFocus) fired /v1/tokens from ~9 mount
		// sites and contributed to the upstream rate-limit storm.
		staleTime: 5 * 60_000, // 5 minutes
		retry: (failureCount, error) => !isRateLimitError(error) && failureCount < 2,
		refetchOnWindowFocus: false,
		queryFn: async () => normalizeApiTokensForNetwork(await apiGetTokens(), chainId as number)
	});
}

import { redirect } from '@sveltejs/kit';
import type { ApiToken } from '$lib/api/st0xApi';
import { findApiTokenByAnyAddress, normalizeApiTokensForNetwork } from '$lib/queries/tokens';
import { getTokenByAnyAddress } from '$lib/config/tokens';
import { buildTradeDescription, buildTradeTitle, getTradeSeoMetadata } from '$lib/seo/trade';
import { initSt0xBotProtection } from '$lib/client/botId';

export const ssr = false;
export const prerender = false;

export async function load({ params, fetch }) {
	const tokenId = params.id;
	const staticToken = getTokenByAnyAddress(tokenId);
	if (staticToken && staticToken.address.toLowerCase() !== tokenId.toLowerCase()) {
		throw redirect(301, `/trade/${staticToken.address}`);
	}
	if (staticToken) {
		return {
			title: buildTradeTitle(staticToken.name),
			description: buildTradeDescription(staticToken.name)
		};
	}

	const fallbackMetadata = getTradeSeoMetadata(`/trade/${tokenId}`);

	// This client-only load can run before the root layout component is created
	// on a cold deep-link, so initialise protection before its proxy request.
	initSt0xBotProtection();
	const response = await fetch('/api/st0x/v1/tokens');
	if (!response.ok) {
		return {
			title: fallbackMetadata?.title,
			description: fallbackMetadata?.description
		};
	}

	const tokens = normalizeApiTokensForNetwork((await response.json()) as ApiToken[], 8453);
	const token = findApiTokenByAnyAddress(tokens, tokenId);
	if (token && token.address.toLowerCase() !== tokenId.toLowerCase()) {
		throw redirect(301, `/trade/${token.address}`);
	}

	const displayName = token?.name ?? token?.symbol ?? 'Tokenized Assets';
	return {
		title: buildTradeTitle(displayName),
		description: buildTradeDescription(displayName)
	};
}

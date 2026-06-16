import { redirect } from '@sveltejs/kit';
import type { ApiToken } from '$lib/api/st0xApi';
import { findApiTokenByAnyAddress, normalizeApiTokensForNetwork } from '$lib/queries/tokens';

export const ssr = false;
export const prerender = false;

export async function load({ params, fetch }) {
	const tokenId = params.id;

	const response = await fetch('/api/st0x/v1/tokens');
	if (!response.ok) {
		return {};
	}

	const tokens = normalizeApiTokensForNetwork((await response.json()) as ApiToken[], 8453);
	const token = findApiTokenByAnyAddress(tokens, tokenId);
	if (token && token.address.toLowerCase() !== tokenId.toLowerCase()) {
		throw redirect(301, `/trade/${token.address}`);
	}

	return {};
}

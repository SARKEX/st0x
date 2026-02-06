import { redirect } from '@sveltejs/kit';
import { getTokenByAnyAddress, isWrappedTokenAddress } from '$lib/config/tokens';

export const ssr = false;
export const prerender = false;

export function load({ params }) {
	const tokenId = params.id;

	// If not a wrapped token, try to redirect to the correct wrapped token
	if (!isWrappedTokenAddress(tokenId)) {
		const token = getTokenByAnyAddress(tokenId);
		if (token) {
			// Redirect legacy/unwrapped URLs to the wrapped token URL
			throw redirect(301, `/trade/${token.address}`);
		}
	}

	return {};
}

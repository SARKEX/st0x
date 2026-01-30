import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { validateCsrfToken, getCsrfTokenFromRequest } from '$lib/server/csrf';
import { generateJwt } from '@coinbase/cdp-sdk/auth';

const CDP_API_KEY = env.CDP_API_KEY;
const CDP_API_SECRET = env.CDP_API_SECRET;

async function generateCdpJwt(
	requestPath: string,
	requestMethod: string = 'POST'
): Promise<string> {
	if (!CDP_API_KEY || !CDP_API_SECRET) {
		throw new Error('CDP API credentials not configured');
	}

	let processedKey = CDP_API_SECRET;
	if (processedKey.includes('\\n')) {
		processedKey = processedKey.replace(/\\n/g, '\n');
	}

	return await generateJwt({
		apiKeyId: CDP_API_KEY,
		apiKeySecret: processedKey,
		requestMethod,
		requestHost: 'api.developer.coinbase.com',
		requestPath,
		expiresIn: 120
	});
}

/**
 * POST /api/coinbase/sell-quote
 *
 * Gets a sell quote from Coinbase and returns the one-click-sell offramp URL.
 * Requires CSRF token and authenticated wallet.
 */
export const POST: RequestHandler = async ({ request, cookies, url }) => {
	if (!CDP_API_KEY || !CDP_API_SECRET) {
		console.error('[Coinbase] CDP API credentials not configured');
		return json({ success: false, error: 'Coinbase integration not configured' }, { status: 500 });
	}

	// CSRF protection
	const csrfToken = getCsrfTokenFromRequest(request);
	if (!csrfToken || !validateCsrfToken(csrfToken)) {
		return json({ success: false, error: 'Invalid or missing CSRF token' }, { status: 403 });
	}

	try {
		const body = await request.json();
		const { walletAddress, sellAmount, sellCurrency, sellNetwork, cashoutCurrency, paymentMethod, country, subdivision } = body;

		if (!walletAddress) {
			return json({ success: false, error: 'Wallet address required' }, { status: 400 });
		}

		if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
			return json({ success: false, error: 'Invalid wallet address format' }, { status: 400 });
		}

		// Verify wallet matches authenticated user
		const authenticatedWallet = cookies.get('wallet-address');
		if (!authenticatedWallet) {
			return json({ success: false, error: 'Authentication required' }, { status: 401 });
		}

		if (authenticatedWallet.toLowerCase() !== walletAddress.toLowerCase()) {
			return json({ success: false, error: 'Wallet address mismatch' }, { status: 403 });
		}

		// Build redirect URL back to the app
		const origin = url.origin;
		const redirectUrl = `${origin}/`;

		const apiPath = '/onramp/v1/sell/quote';
		const jwtToken = await generateCdpJwt(apiPath);

		const sellRequest = {
			sell_currency: sellCurrency || 'USDC',
			sell_amount: sellAmount || '5',
			sell_network: sellNetwork || 'base',
			cashout_currency: cashoutCurrency || 'USD',
			payment_method: paymentMethod || 'ACH_BANK_ACCOUNT',
			country: country || 'US',
			subdivision: subdivision || undefined,
			source_address: walletAddress,
			redirect_url: redirectUrl,
			partner_user_id: walletAddress.substring(0, 49)
		};

		const response = await fetch(`https://api.developer.coinbase.com${apiPath}`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Accept': 'application/json',
				'Authorization': `Bearer ${jwtToken}`
			},
			body: JSON.stringify(sellRequest)
		});

		const responseText = await response.text();

		if (!response.ok) {
			console.error('[Coinbase] Sell quote API error:', response.status, responseText);
			return json(
				{ success: false, error: 'Failed to get sell quote' },
				{ status: response.status }
			);
		}

		const data = JSON.parse(responseText);

		return json({
			success: true,
			offrampUrl: data.offramp_url,
			quoteId: data.quote_id,
			sellAmount: data.sell_amount,
			cashoutAmount: data.cashout_amount,
			exchangeRate: data.exchange_rate
		});
	} catch (error) {
		console.error('[Coinbase] Error getting sell quote:', error);
		return json({ success: false, error: 'Failed to get sell quote' }, { status: 500 });
	}
};

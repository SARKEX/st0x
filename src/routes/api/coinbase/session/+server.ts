import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { validateCsrfToken, getCsrfTokenFromRequest } from '$lib/server/csrf';
import { generateJwt } from '@coinbase/cdp-sdk/auth';

const CDP_API_KEY = env.CDP_API_KEY;
const CDP_API_SECRET = env.CDP_API_SECRET;

/**
 * Generate a JWT for authenticating with the Coinbase CDP API.
 */
async function generateCdpJwt(
	requestPath: string = '/onramp/v1/token',
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
 * POST /api/coinbase/session
 *
 * Generates a Coinbase Onramp/Offramp session token.
 * Requires CSRF token and authenticated wallet.
 */
export const POST: RequestHandler = async ({ request, cookies }) => {
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
		const { walletAddress } = body;

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
			console.warn('[Coinbase] Wallet mismatch attempt', {
				requested: walletAddress.toLowerCase(),
				authenticated: authenticatedWallet.toLowerCase()
			});
			return json({ success: false, error: 'Wallet address mismatch' }, { status: 403 });
		}

		// Extract client IP for Coinbase API
		const forwarded = request.headers.get('x-vercel-forwarded-for') ||
			request.headers.get('x-real-ip') ||
			request.headers.get('x-forwarded-for');
		let clientIp = forwarded?.split(',')[0]?.trim() || null;

		// Replace private IPs with RFC 5737 test IP
		const isPrivateIp = !clientIp ||
			clientIp === '127.0.0.1' || clientIp === 'localhost' || clientIp === '::1' ||
			clientIp.startsWith('10.') || clientIp.startsWith('192.168.') ||
			/^172\.(1[6-9]|2\d|3[01])\./.test(clientIp);

		if (isPrivateIp) clientIp = '192.0.2.1';

		// Generate JWT for CDP API
		const jwtToken = await generateCdpJwt();

		// Request session token from Coinbase
		const response = await fetch('https://api.developer.coinbase.com/onramp/v1/token', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Accept': 'application/json',
				'Authorization': `Bearer ${jwtToken}`
			},
			body: JSON.stringify({
				addresses: [{ address: walletAddress, blockchains: ['base'] }],
				assets: ['USDC'],
				clientIp
			})
		});

		const responseText = await response.text();

		if (!response.ok) {
			console.error('[Coinbase] Session token API error:', response.status, responseText);
			return json(
				{ success: false, error: 'Failed to generate session token' },
				{ status: response.status }
			);
		}

		const data = JSON.parse(responseText);

		return json({
			success: true,
			token: data.token,
			channelId: data.channelId || data.channel_id
		});
	} catch (error) {
		console.error('[Coinbase] Error generating session token:', error);
		return json({ success: false, error: 'Failed to generate session token' }, { status: 500 });
	}
};

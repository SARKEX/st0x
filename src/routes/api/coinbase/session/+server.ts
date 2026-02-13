import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import crypto from 'crypto';
import { env } from '$env/dynamic/private';
import { validateCsrfToken, getCsrfTokenFromRequest } from '$lib/server/csrf';
import { applyTieredRateLimit } from '$lib/server/rateLimit';

const COINBASE_API_HOST = 'api.developer.coinbase.com';
const COINBASE_TOKEN_PATH = '/onramp/v1/token';
const COINBASE_TOKEN_API = `https://${COINBASE_API_HOST}${COINBASE_TOKEN_PATH}`;

/**
 * Generate a JWT for Coinbase CDP API authentication using Ed25519
 * Uses Node.js built-in crypto — no external dependencies needed
 */
function generateCdpJwt(apiKeyId: string, apiKeySecret: string): string {
	let privateKey: crypto.KeyObject;

	if (apiKeySecret.includes('-----BEGIN')) {
		// PEM format — normalize escaped newlines from env vars
		privateKey = crypto.createPrivateKey({
			key: apiKeySecret.replace(/\\n/g, '\n'),
			format: 'pem'
		});
	} else {
		// Raw Ed25519 seed (base64-encoded, 32 bytes) — wrap in PKCS#8 DER
		const seed = Buffer.from(apiKeySecret, 'base64');
		// Ed25519 PKCS#8 prefix: 16 bytes of ASN.1 header for a 32-byte Ed25519 key
		const pkcs8Prefix = Buffer.from('302e020100300506032b657004220420', 'hex');
		privateKey = crypto.createPrivateKey({
			key: Buffer.concat([pkcs8Prefix, seed]),
			format: 'der',
			type: 'pkcs8'
		});
	}

	const header = {
		alg: 'EdDSA',
		kid: apiKeyId,
		nonce: crypto.randomBytes(16).toString('hex'),
		typ: 'JWT'
	};

	const now = Math.floor(Date.now() / 1000);
	const payload = {
		sub: apiKeyId,
		iss: 'cdp',
		aud: ['cdp_service'],
		nbf: now,
		exp: now + 120,
		uris: [`POST ${COINBASE_API_HOST}${COINBASE_TOKEN_PATH}`]
	};

	const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
	const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
	const signingInput = `${headerB64}.${payloadB64}`;

	const signature = crypto.sign(null, Buffer.from(signingInput), privateKey);
	const signatureB64 = signature.toString('base64url');

	return `${signingInput}.${signatureB64}`;
}

export const POST: RequestHandler = async ({ request, cookies, url }) => {
	const CDP_API_KEY_ID = env.CDP_API_KEY_ID;
	const CDP_API_KEY_SECRET = env.CDP_API_KEY_SECRET;

	if (!CDP_API_KEY_ID || !CDP_API_KEY_SECRET) {
		console.error('[Coinbase] CDP API keys not configured');
		return json(
			{ success: false, error: 'Coinbase integration not configured' },
			{ status: 500 }
		);
	}

	// CSRF protection
	const csrfToken = getCsrfTokenFromRequest(request);
	if (!csrfToken || !validateCsrfToken(csrfToken)) {
		return json({ success: false, error: 'Invalid or missing CSRF token' }, { status: 403 });
	}

	try {
		const body = await request.json();
		const { walletAddress, mode } = body;

		if (!walletAddress) {
			return json({ success: false, error: 'Wallet address required' }, { status: 400 });
		}

		// Validate address format
		if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
			return json({ success: false, error: 'Invalid wallet address format' }, { status: 400 });
		}

		// Validate mode
		if (mode && mode !== 'onramp' && mode !== 'offramp') {
			return json({ success: false, error: 'Invalid mode' }, { status: 400 });
		}

		// Security: Verify the requested wallet matches the authenticated user's wallet
		const authenticatedWallet = cookies.get('wallet-address');
		if (!authenticatedWallet) {
			return json({ success: false, error: 'Authentication required' }, { status: 401 });
		}

		const normalizedRequestedWallet = walletAddress.toLowerCase();
		const normalizedAuthenticatedWallet = authenticatedWallet.toLowerCase();

		if (normalizedAuthenticatedWallet !== normalizedRequestedWallet) {
			console.warn('[Coinbase] Wallet mismatch attempt', {
				requested: normalizedRequestedWallet,
				authenticated: normalizedAuthenticatedWallet
			});
			return json({ success: false, error: 'Wallet address mismatch' }, { status: 403 });
		}

		// Apply tiered rate limiting
		const rateLimitResponse = await applyTieredRateLimit(
			request,
			'coinbase',
			'coinbase-session',
			normalizedAuthenticatedWallet
		);
		if (rateLimitResponse) return rateLimitResponse;

		// Generate JWT for Coinbase API
		const jwt = generateCdpJwt(CDP_API_KEY_ID, CDP_API_KEY_SECRET);

		// Request session token from Coinbase
		const tokenResponse = await fetch(COINBASE_TOKEN_API, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${jwt}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				addresses: [
					{
						address: normalizedRequestedWallet,
						blockchains: ['base']
					}
				],
				assets: ['USDC']
			})
		});

		if (!tokenResponse.ok) {
			const errorText = await tokenResponse.text();
			console.error('[Coinbase] Token API error:', tokenResponse.status, errorText);
			return json(
				{ success: false, error: 'Failed to create Coinbase session' },
				{ status: 502 }
			);
		}

		const tokenData = await tokenResponse.json();

		return json({
			success: true,
			token: tokenData.token,
			redirectUrl: `${url.origin}/dashboard`
		});
	} catch (error) {
		console.error('[Coinbase] Error generating session:', error);
		return json({ success: false, error: 'Failed to create session' }, { status: 500 });
	}
};

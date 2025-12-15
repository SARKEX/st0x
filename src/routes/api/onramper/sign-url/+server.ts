import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import crypto from 'crypto';
import { env } from '$env/dynamic/private';

const ONRAMPER_SECRET_KEY = env.ONRAMPER_SECRET_KEY;

/**
 * Generate HMAC-SHA256 signature for Onramper URL
 */
function generateSignature(secretKey: string, data: string): string {
	const hmac = crypto.createHmac('sha256', secretKey);
	hmac.update(data);
	return hmac.digest('hex');
}

/**
 * Build the content string to sign
 * Only sensitive parameters need to be signed: wallets, walletAddressTags, networkWallets
 * Keys must be sorted alphabetically
 */
function buildSignContent(params: { networkWallets?: string; wallets?: string }): string {
	const parts: string[] = [];

	// Sort keys alphabetically
	const sortedKeys = Object.keys(params).sort() as (keyof typeof params)[];

	for (const key of sortedKeys) {
		const value = params[key];
		if (value) {
			// Use unencoded values for signing
			parts.push(`${key}=${value}`);
		}
	}

	return parts.join('&');
}

export const POST: RequestHandler = async ({ request }) => {
	// Check if secret key is configured
	if (!ONRAMPER_SECRET_KEY) {
		console.error('[Onramper] ONRAMPER_SECRET_KEY not configured');
		return json(
			{ success: false, error: 'Onramper signing not configured' },
			{ status: 500 }
		);
	}

	try {
		const body = await request.json();
		const { walletAddress } = body;

		if (!walletAddress) {
			return json(
				{ success: false, error: 'Wallet address required' },
				{ status: 400 }
			);
		}

		// Validate address format
		if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
			return json(
				{ success: false, error: 'Invalid wallet address format' },
				{ status: 400 }
			);
		}

		// Build the networkWallets value (must be lowercase network ID)
		const networkWallets = `base:${walletAddress}`;

		// Build the content to sign (only sensitive params, alphabetically sorted)
		const signContent = buildSignContent({ networkWallets });

		// Generate the signature
		const signature = generateSignature(ONRAMPER_SECRET_KEY, signContent);

		return json({
			success: true,
			signature,
			networkWallets
		});
	} catch (error) {
		console.error('[Onramper] Error generating signature:', error);
		return json(
			{ success: false, error: 'Failed to generate signature' },
			{ status: 500 }
		);
	}
};

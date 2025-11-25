import { createClient } from '@vercel/kv';
import { env } from '$env/dynamic/private';

function getKvClient() {
	const url = env.KV_REST_API_URL;
	const token = env.KV_REST_API_TOKEN;

	if (!url || !token) {
		console.warn('Vercel KV not configured. Using mock storage for development.');
		return null;
	}

	return createClient({
		url,
		token
	});
}

export const kv = getKvClient();

// Key prefixes for organization
export const KV_KEYS = {
	accessCode: (code: string) => `access_codes:${code.toUpperCase()}`,
	wallet: (address: string) => `wallets:${address.toLowerCase()}`,
	codeWallets: (code: string) => `code_wallets:${code.toUpperCase()}`,
	allCodes: () => 'access_codes:__all__'
} as const;

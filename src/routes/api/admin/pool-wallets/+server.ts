import type { RequestHandler } from './$types';
import { walletListGet, walletListPost } from '$lib/server/adminWalletList';
import { KV_KEYS } from '$lib/server/kv';

const config = {
	kvKey: KV_KEYS.poolWallets(),
	label: 'pool wallets',
	rateLimitPrefix: 'admin-pool-wallets'
};

export const GET: RequestHandler = ({ request, cookies }) =>
	walletListGet(request, cookies, config);
export const POST: RequestHandler = ({ request, cookies }) =>
	walletListPost(request, cookies, config);

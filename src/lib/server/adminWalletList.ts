import { json } from '@sveltejs/kit';
import { requireAdmin, type CookieStoreLike } from '$lib/server/adminAuth';
import { getKv, kvGet, kvSet } from '$lib/server/kv';

interface WalletListConfig {
	kvKey: string;
	label: string;
	rateLimitPrefix: string;
}

export async function walletListGet(
	request: Request,
	cookies: CookieStoreLike,
	config: WalletListConfig
): Promise<Response> {
	const guardResponse = await requireAdmin(request, cookies, `${config.rateLimitPrefix}-list`);
	if (guardResponse) return guardResponse;

	const kv = await getKv();
	if (!kv) {
		return json({ wallets: [], kvConfigured: false });
	}

	const wallets = (await kvGet<string[]>(config.kvKey)) || [];
	return json({ wallets, kvConfigured: true });
}

export async function walletListPost(
	request: Request,
	cookies: CookieStoreLike,
	config: WalletListConfig
): Promise<Response> {
	const guardResponse = await requireAdmin(request, cookies, `${config.rateLimitPrefix}-update`);
	if (guardResponse) return guardResponse;

	const kv = await getKv();
	if (!kv) {
		return json(
			{ error: `KV store not configured. Cannot modify ${config.label} in local dev.` },
			{ status: 503 }
		);
	}

	try {
		const { action, address } = await request.json();

		if (!address || typeof address !== 'string') {
			return json({ error: 'Wallet address required' }, { status: 400 });
		}

		const normalizedAddress = address.toLowerCase();

		if (!/^0x[a-f0-9]{40}$/i.test(normalizedAddress)) {
			return json({ error: 'Invalid Ethereum address' }, { status: 400 });
		}

		const wallets = (await kvGet<string[]>(config.kvKey)) || [];

		if (action === 'add') {
			if (wallets.includes(normalizedAddress)) {
				return json({ error: `Address already in ${config.label} list` }, { status: 400 });
			}
			wallets.push(normalizedAddress);
		} else if (action === 'remove') {
			const index = wallets.indexOf(normalizedAddress);
			if (index === -1) {
				return json({ error: `Address not found in ${config.label} list` }, { status: 404 });
			}
			wallets.splice(index, 1);
		} else {
			return json({ error: 'Invalid action. Use "add" or "remove"' }, { status: 400 });
		}

		await kvSet(config.kvKey, wallets);
		return json({ success: true, wallets });
	} catch {
		return json({ error: 'Invalid request body' }, { status: 400 });
	}
}

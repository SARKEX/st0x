import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAdminAuthenticated } from '$lib/server/adminAuth';
import { getKv, kvGet, kvSet, KV_KEYS } from '$lib/server/kv';
import { rateLimiters, applyRateLimit } from '$lib/server/rateLimit';

// GET - List all excluded wallets
export const GET: RequestHandler = async ({ cookies, request }) => {
	const rateLimitResponse = await applyRateLimit(
		request,
		rateLimiters.admin,
		'admin-excluded-wallets-list'
	);
	if (rateLimitResponse) return rateLimitResponse;

	if (!isAdminAuthenticated(cookies)) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	// Return empty list if KV not configured (local dev)
	const kv = await getKv();
	if (!kv) {
		return json({ wallets: [], kvConfigured: false });
	}

	const wallets = (await kvGet<string[]>(KV_KEYS.excludedWallets())) || [];

	return json({ wallets, kvConfigured: true });
};

// POST - Add or remove excluded wallet
export const POST: RequestHandler = async ({ request, cookies }) => {
	const rateLimitResponse = await applyRateLimit(
		request,
		rateLimiters.admin,
		'admin-excluded-wallets-update'
	);
	if (rateLimitResponse) return rateLimitResponse;

	if (!isAdminAuthenticated(cookies)) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const kv = await getKv();
	if (!kv) {
		return json(
			{ error: 'KV store not configured. Cannot modify excluded wallets in local dev.' },
			{ status: 503 }
		);
	}

	try {
		const { action, address } = await request.json();

		if (!address || typeof address !== 'string') {
			return json({ error: 'Wallet address required' }, { status: 400 });
		}

		// Normalize address to lowercase
		const normalizedAddress = address.toLowerCase();

		// Validate Ethereum address format
		if (!/^0x[a-f0-9]{40}$/i.test(normalizedAddress)) {
			return json({ error: 'Invalid Ethereum address' }, { status: 400 });
		}

		// Get current list
		const wallets = (await kvGet<string[]>(KV_KEYS.excludedWallets())) || [];

		if (action === 'add') {
			if (wallets.includes(normalizedAddress)) {
				return json({ error: 'Address already in excluded list' }, { status: 400 });
			}
			wallets.push(normalizedAddress);
		} else if (action === 'remove') {
			const index = wallets.indexOf(normalizedAddress);
			if (index === -1) {
				return json({ error: 'Address not found in excluded list' }, { status: 404 });
			}
			wallets.splice(index, 1);
		} else {
			return json({ error: 'Invalid action. Use "add" or "remove"' }, { status: 400 });
		}

		// Save updated list
		await kvSet(KV_KEYS.excludedWallets(), wallets);

		return json({ success: true, wallets });
	} catch {
		return json({ error: 'Invalid request body' }, { status: 400 });
	}
};

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

export interface WalletListPostOutcome {
	response: Response;
	action?: 'add' | 'remove';
	address?: string;
	success: boolean;
	errorMessage?: string;
}

/**
 * Mutate a KV-backed wallet list (add/remove) with full validation and admin
 * guard. Returns both the HTTP response AND structured outcome metadata so the
 * caller (the per-endpoint +server.ts) can emit audit-log events with the
 * correct success/failure shape.
 *
 * Behavior preservation: status codes and response bodies match the prior
 * inline implementation exactly.
 */
export async function walletListPost(
	request: Request,
	cookies: CookieStoreLike,
	config: WalletListConfig
): Promise<WalletListPostOutcome> {
	const guardResponse = await requireAdmin(request, cookies, `${config.rateLimitPrefix}-update`);
	if (guardResponse) {
		return { response: guardResponse, success: false, errorMessage: 'admin guard rejected' };
	}

	const kv = await getKv();
	if (!kv) {
		return {
			response: json(
				{ error: `KV store not configured. Cannot modify ${config.label} in local dev.` },
				{ status: 503 }
			),
			success: false,
			errorMessage: 'kv not configured'
		};
	}

	let parsedAction: 'add' | 'remove' | undefined;
	let parsedAddress: string | undefined;

	try {
		const { action, address } = await request.json();

		if (!address || typeof address !== 'string') {
			return {
				response: json({ error: 'Wallet address required' }, { status: 400 }),
				success: false,
				errorMessage: 'missing address'
			};
		}

		const normalizedAddress = address.toLowerCase();
		parsedAddress = normalizedAddress;

		if (!/^0x[a-f0-9]{40}$/i.test(normalizedAddress)) {
			return {
				response: json({ error: 'Invalid Ethereum address' }, { status: 400 }),
				address: normalizedAddress,
				success: false,
				errorMessage: 'invalid address'
			};
		}

		const wallets = (await kvGet<string[]>(config.kvKey)) || [];

		if (action === 'add') {
			parsedAction = 'add';
			if (wallets.includes(normalizedAddress)) {
				return {
					response: json(
						{ error: `Address already in ${config.label} list` },
						{ status: 400 }
					),
					action: 'add',
					address: normalizedAddress,
					success: false,
					errorMessage: 'duplicate'
				};
			}
			wallets.push(normalizedAddress);
		} else if (action === 'remove') {
			parsedAction = 'remove';
			const index = wallets.indexOf(normalizedAddress);
			if (index === -1) {
				return {
					response: json(
						{ error: `Address not found in ${config.label} list` },
						{ status: 404 }
					),
					action: 'remove',
					address: normalizedAddress,
					success: false,
					errorMessage: 'not found'
				};
			}
			wallets.splice(index, 1);
		} else {
			return {
				response: json({ error: 'Invalid action. Use "add" or "remove"' }, { status: 400 }),
				address: normalizedAddress,
				success: false,
				errorMessage: 'invalid action'
			};
		}

		await kvSet(config.kvKey, wallets);
		return {
			response: json({ success: true, wallets }),
			action: parsedAction,
			address: normalizedAddress,
			success: true
		};
	} catch (err) {
		return {
			response: json({ error: 'Invalid request body' }, { status: 400 }),
			action: parsedAction,
			address: parsedAddress,
			success: false,
			errorMessage: err instanceof Error ? err.message : String(err)
		};
	}
}

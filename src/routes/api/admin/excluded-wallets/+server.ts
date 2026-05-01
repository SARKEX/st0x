import type { RequestHandler } from './$types';
import { walletListGet, walletListPost } from '$lib/server/adminWalletList';
import { KV_KEYS } from '$lib/server/kv';
import { createAuditLogger } from '$lib/server/auditLog';

const config = {
	kvKey: KV_KEYS.excludedWallets(),
	label: 'excluded wallets',
	rateLimitPrefix: 'admin-excluded-wallets'
};

export const GET: RequestHandler = ({ request, cookies }) =>
	walletListGet(request, cookies, config);

export const POST: RequestHandler = async ({ request, cookies }) => {
	const audit = createAuditLogger(request);
	const outcome = await walletListPost(request, cookies, config);

	// Only emit when we have a recognised add/remove action (skip emission for
	// pre-action rejections like missing address / invalid action).
	if (outcome.action) {
		const eventType =
			outcome.action === 'add' ? 'EXCLUDED_WALLET_ADDED' : 'EXCLUDED_WALLET_REMOVED';
		const details = { walletAddress: outcome.address, label: config.label };
		try {
			if (outcome.success) {
				await audit.logSuccess(eventType, details, { adminUser: 'admin' });
			} else {
				await audit.logFailure(eventType, details, outcome.errorMessage ?? 'unknown error', {
					adminUser: 'admin'
				});
			}
		} catch (auditErr) {
			console.error('[excluded-wallets] Audit-log emission failed:', auditErr);
		}
	}

	return outcome.response;
};

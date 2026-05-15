import type { RequestHandler } from './$types';
import { walletListGet, walletListPost } from '$lib/server/adminWalletList';
import { KV_KEYS } from '$lib/server/kv';
import { createAuditLogger } from '$lib/server/auditLog';

const config = {
	kvKey: KV_KEYS.teamWallets(),
	label: 'team wallets',
	rateLimitPrefix: 'admin-team-wallets'
};

export const GET: RequestHandler = ({ request, cookies }) =>
	walletListGet(request, cookies, config);

export const POST: RequestHandler = async ({ request, cookies }) => {
	const audit = createAuditLogger(request);
	const outcome = await walletListPost(request, cookies, config);

	if (outcome.action) {
		const eventType = outcome.action === 'add' ? 'TEAM_WALLET_ADDED' : 'TEAM_WALLET_REMOVED';
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
			console.error('[team-wallets] Audit-log emission failed:', auditErr);
		}
	}

	return outcome.response;
};

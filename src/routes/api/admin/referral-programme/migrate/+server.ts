import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAdminAuthenticated } from '$lib/server/adminAuth';
import { createReferralProfileForMigration } from '$lib/server/referrals';
import { createAuditLogger } from '$lib/server/auditLog';
import { rateLimiters, applyRateLimit } from '$lib/server/rateLimit';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const rateLimitResponse = await applyRateLimit(
		request,
		rateLimiters.admin,
		'admin-referral-migrate'
	);
	if (rateLimitResponse) return rateLimitResponse;

	if (!isAdminAuthenticated(cookies)) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const audit = createAuditLogger(request);

	try {
		const { walletAddress, referralCode, nickname, telegramHandle, migrateFromAccessCode } =
			await request.json();

		if (!walletAddress || !referralCode || !nickname || !telegramHandle) {
			return json(
				{
					success: false,
					error: 'Missing required fields: walletAddress, referralCode, nickname, telegramHandle'
				},
				{ status: 400 }
			);
		}

		const result = await createReferralProfileForMigration(
			walletAddress,
			referralCode,
			nickname,
			telegramHandle,
			migrateFromAccessCode
		);

		if (!result.success) {
			await audit.logFailure(
				'REFERRAL_MIGRATION_FAILED',
				{ walletAddress, referralCode, nickname, migrateFromAccessCode },
				result.error || 'Unknown error'
			);
			return json({ success: false, error: result.error }, { status: 400 });
		}

		await audit.logSuccess('REFERRAL_MIGRATION', {
			walletAddress,
			referralCode,
			nickname,
			migrateFromAccessCode,
			profile: result.profile,
			migratedWallets: result.migratedWallets
		});

		return json({
			success: true,
			profile: result.profile,
			migratedWallets: result.migratedWallets
		});
	} catch (error) {
		console.error('[Referral Migration API] Error:', error);
		return json(
			{ success: false, error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
};

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { processRegistration } from '$lib/server/accessCodes';
import { rateLimiters, applyRateLimit } from '$lib/server/rateLimit';
import { createAuditLogger } from '$lib/server/auditLog';
import { cacheDelete } from '$lib/server/cache';

export const POST: RequestHandler = async ({ request }) => {
	// Rate limiting - uses STRICT mode (fail-closed with in-memory fallback)
	// This prevents registration abuse even if Redis is unavailable
	const rateLimitResponse = await applyRateLimit(request, rateLimiters.authStrict, 'register');
	if (rateLimitResponse) return rateLimitResponse;

	const audit = createAuditLogger(request);

	try {
		const { address, code, signature, message } = await request.json();

		// Validate required fields
		if (!address || typeof address !== 'string') {
			return json({ error: 'Wallet address required' }, { status: 400 });
		}

		if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
			return json({ error: 'Invalid address format' }, { status: 400 });
		}

		if (!code || typeof code !== 'string') {
			return json({ error: 'Access code required' }, { status: 400 });
		}

		if (!signature || typeof signature !== 'string') {
			return json({ error: 'Signature required' }, { status: 400 });
		}

		if (!message || typeof message !== 'string') {
			return json({ error: 'Message required' }, { status: 400 });
		}

		const result = await processRegistration(address, code, signature as `0x${string}`, message);

		if (result.success) {
			// Invalidate the access check cache for this wallet
			await cacheDelete(`cache:access:check:${address.toLowerCase()}`);

			// Audit log successful registration
			await audit.logSuccess(
				'WALLET_REGISTRATION',
				{ code: code.toUpperCase() },
				{ walletAddress: address }
			);

			return json({
				success: true,
				registeredAt: result.wallet?.registeredAt
			});
		}

		// Audit log failed registration
		await audit.logFailure(
			'WALLET_REGISTRATION',
			{ code: code.toUpperCase() },
			result.error || 'Unknown error',
			{ walletAddress: address }
		);

		return json({ success: false, error: result.error }, { status: 400 });
	} catch {
		return json({ error: 'Invalid request body' }, { status: 400 });
	}
};

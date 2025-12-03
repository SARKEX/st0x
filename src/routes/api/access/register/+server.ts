import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { processRegistration } from '$lib/server/accessCodes';

export const POST: RequestHandler = async ({ request }) => {
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
			return json({
				success: true,
				registeredAt: result.wallet?.registeredAt
			});
		}

		return json({ success: false, error: result.error }, { status: 400 });
	} catch {
		return json({ error: 'Invalid request body' }, { status: 400 });
	}
};

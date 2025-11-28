import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isWalletRegistered, getWalletInfo } from '$lib/server/accessCodes';

export const GET: RequestHandler = async ({ url }) => {
	const address = url.searchParams.get('address');

	if (!address) {
		return json({ error: 'Address parameter required' }, { status: 400 });
	}

	// Basic address validation
	if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
		return json({ error: 'Invalid address format' }, { status: 400 });
	}

	const registered = await isWalletRegistered(address);

	if (registered) {
		const walletInfo = await getWalletInfo(address);
		return json({
			registered: true,
			registeredAt: walletInfo?.registeredAt
		});
	}

	return json({ registered: false });
};

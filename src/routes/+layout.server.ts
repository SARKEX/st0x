import { getServerApplicationCatalog } from '$lib/server/applicationCatalog';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async () => {
	try {
		return { ...(await getServerApplicationCatalog()), catalogUnavailable: false };
	} catch (error) {
		console.error('[layout] Application catalog unavailable:', error);
		return { tokenCatalog: [], networkCatalog: [], catalogUnavailable: true };
	}
};

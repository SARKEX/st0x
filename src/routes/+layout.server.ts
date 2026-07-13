import type { LayoutServerLoad } from './$types';
import { getServerTokenCatalog } from '$lib/server/tokenCatalog';

export const load: LayoutServerLoad = async () => ({
	tokenCatalog: await getServerTokenCatalog()
});

import type { LayoutServerLoad } from './$types';
import { getServerApplicationCatalog } from '$lib/server/applicationCatalog';

export const load: LayoutServerLoad = async () => getServerApplicationCatalog();

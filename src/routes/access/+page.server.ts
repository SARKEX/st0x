import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
	// Preserve query parameters when redirecting to home
	const queryString = url.search;
	throw redirect(302, `/${queryString}`);
};

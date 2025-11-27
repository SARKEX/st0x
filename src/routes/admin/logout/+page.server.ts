import { redirect } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ cookies }) => {
		// Clear the httpOnly auth cookies server-side
		cookies.delete('auth-session', { path: '/' });
		cookies.delete('auth-timestamp', { path: '/' });

		throw redirect(303, '/admin/login');
	}
};

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async () => {
	// Server-side logout is mostly a no-op since we use client-side token storage
	// The client will clear its local storage
	// If we add server-side sessions in the future, clear them here

	return json({ success: true });
};

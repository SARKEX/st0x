import type { HandleClientError } from '@sveltejs/kit';

export const handleError: HandleClientError = ({ error }) => {
	const message = error instanceof Error ? error.message : String(error);

	// When a new deployment invalidates old chunk hashes, dynamic imports fail.
	// Reload the page once so the browser fetches fresh HTML with correct chunk URLs.
	if (
		message.includes('Importing a module script failed') ||
		message.includes('Failed to fetch dynamically imported module') ||
		message.includes('error loading dynamically imported module')
	) {
		const reloadKey = '__st0x_chunk_reload';
		if (!sessionStorage.getItem(reloadKey)) {
			sessionStorage.setItem(reloadKey, '1');
			window.location.reload();
			return;
		}
		// Already reloaded once this session — clear flag and surface the error
		sessionStorage.removeItem(reloadKey);
	}

	return {
		message: 'An unexpected error occurred'
	};
};

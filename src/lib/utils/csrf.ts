/**
 * Client-side CSRF token management
 */

let cachedToken: string | null = null;
let tokenFetchPromise: Promise<string> | null = null;

/**
 * Fetch a fresh CSRF token from the server
 * Caches the token to avoid unnecessary requests
 */
export async function getCsrfToken(): Promise<string> {
	// Return cached token if available
	if (cachedToken) {
		return cachedToken;
	}

	// If a fetch is already in progress, wait for it
	if (tokenFetchPromise) {
		return tokenFetchPromise;
	}

	// Fetch a new token
	tokenFetchPromise = (async () => {
		try {
			const response = await fetch('/api/auth/csrf');
			if (!response.ok) {
				throw new Error('Failed to fetch CSRF token');
			}
			const data = await response.json();
			cachedToken = data.token;
			return data.token;
		} finally {
			tokenFetchPromise = null;
		}
	})();

	return tokenFetchPromise;
}

/**
 * Clear the cached CSRF token
 * Call this after a request fails with a CSRF error to get a fresh token
 */
export function clearCsrfToken(): void {
	cachedToken = null;
}

/**
 * Make a fetch request with CSRF protection
 * Automatically includes the CSRF token in the X-CSRF-Token header
 */
export async function fetchWithCsrf(url: string, options: RequestInit = {}): Promise<Response> {
	const token = await getCsrfToken();

	const headers = new Headers(options.headers);
	headers.set('X-CSRF-Token', token);

	const response = await fetch(url, {
		...options,
		headers
	});

	// If we get a 403, clear the token so we fetch a new one next time
	if (response.status === 403) {
		clearCsrfToken();
	}

	return response;
}

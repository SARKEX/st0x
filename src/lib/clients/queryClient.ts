/**
 * Shared TanStack Query client instance.
 * Used by QueryClientProvider in layout and by query modules for cache invalidation.
 */

import { QueryClient } from '@tanstack/svelte-query';

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: Infinity
		}
	}
});

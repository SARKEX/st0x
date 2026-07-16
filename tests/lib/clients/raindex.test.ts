import { describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { createRaindexClient } from '$lib/clients/raindex';

describe('Raindex client configuration', () => {
	it('initializes with the current SDK schema', async () => {
		const client = await createRaindexClient();

		expect(client).toBeDefined();
		client.free();
	});
});

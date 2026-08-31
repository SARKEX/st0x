// Shared test scaffolding for tests/hooks/*.test.ts (Plan 04-04 / TEST-01).
//
// Underscore-prefixed filename keeps Vitest's auto-discovery from picking this up
// as a test file. Per RESEARCH Pitfall 5: the public surface returns SvelteKit's
// real `RequestEvent` type — DO NOT use `as any` in the test files. The single
// `as unknown as RequestEvent` escape lives here and ONLY here, because the
// real `RequestEvent` shape is wider than what hooks-layer tests need to drive.

import type { RequestEvent, Cookies } from '@sveltejs/kit';
import { vi } from 'vitest';

export interface MockRequestEventOptions {
	method?: string;
	url?: string;
	pathname?: string;
	headers?: Record<string, string>;
	cookies?: Record<string, string>;
	body?: BodyInit | null;
}

export function createMockRequestEvent(opts: MockRequestEventOptions = {}): RequestEvent {
	const method = opts.method ?? 'GET';
	const fullUrl = opts.url ?? `http://localhost${opts.pathname ?? '/'}`;
	const url = new URL(fullUrl);
	const headers = new Headers(opts.headers ?? {});
	const cookieJar = new Map<string, string>(Object.entries(opts.cookies ?? {}));

	const cookies = {
		get: (name: string) => cookieJar.get(name) ?? undefined,
		getAll: () => Array.from(cookieJar.entries()).map(([name, value]) => ({ name, value })),
		set: (name: string, value: string) => {
			cookieJar.set(name, value);
		},
		delete: (name: string) => {
			cookieJar.delete(name);
		},
		serialize: vi.fn(() => '')
	} as unknown as Cookies;

	const request = new Request(fullUrl, {
		method,
		headers,
		body: method === 'GET' || method === 'HEAD' ? null : opts.body ?? null
	});

	return {
		cookies,
		fetch: globalThis.fetch,
		getClientAddress: () => '127.0.0.1',
		locals: {} as App.Locals,
		params: {},
		platform: undefined,
		request,
		route: { id: null },
		setHeaders: vi.fn(),
		url,
		isDataRequest: false,
		isSubRequest: false
	} as unknown as RequestEvent;
}

// Mirror of the KV stub pattern used in src/lib/server/walletSession.test.ts.
// Returns a minimal { get, set, del } shape backed by an in-memory Map so tests
// can pre-seed session records and assert on read/write call counts.
export function createMockKv() {
	const store = new Map<string, string>();
	return {
		get: vi.fn(async (key: string) => store.get(key) ?? null),
		set: vi.fn(async (key: string, value: string, _opts?: { PX?: number; EX?: number }) => {
			store.set(key, value);
		}),
		del: vi.fn(async (key: string) => {
			store.delete(key);
		}),
		_store: store
	};
}

// Match the WalletSessionRecord shape from src/lib/server/walletSession.ts —
// { walletAddress, issuedAt, lastSeenAt }. The sessionId is generated here for
// convenience; tests typically pass it via the `session` cookie.
export function createMockSession({ walletAddress }: { walletAddress: string }) {
	const now = Date.now();
	// 64-hex sessionId (matches the shape regex in hooks.server.ts:290).
	const sessionId = walletAddress.toLowerCase().replace(/^0x/, '').padEnd(64, '0').slice(0, 64);
	return {
		sessionId,
		record: {
			walletAddress: walletAddress.toLowerCase(),
			issuedAt: now,
			lastSeenAt: now
		}
	};
}

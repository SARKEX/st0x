import { initBotId } from 'botid/client/core';
import { dev } from '$app/environment';

let initialized = false;

/**
 * Protect the anonymous browser-facing st0x proxy with Vercel BotID.
 *
 * This must run from the root layout instance, after SvelteKit has installed
 * its own fetch wrapper. Initialising from hooks.client.ts is not safe on the
 * project's SvelteKit version because the two wrappers can race at startup.
 */
export function initSt0xBotProtection(): void {
	// Vite's dev server does not apply vercel.json rewrites. BotID's server SDK
	// already treats local development as human, so do not request challenge
	// assets that only exist behind Vercel routing.
	if (dev || initialized) return;

	initBotId({
		protect: [
			{ path: '/api/st0x/*', method: 'GET' },
			{ path: '/api/st0x/*', method: 'POST' }
		]
	});
	initialized = true;
}

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dev } from '$app/environment';
import { rateLimiters, applyRateLimit } from '$lib/server/rateLimit';
import { verifyWalletSignature } from '$lib/server/accessCodes';
import { verifySessionLoginChallenge } from '$lib/server/signatureChallenge';
import { createSession } from '$lib/server/walletSession';

// SEC-03 / Plan 03-08a: verify the user's signature over the 'session_login'
// nonce → mint an HttpOnly + Secure + SameSite=Strict 'session' cookie bound
// to the verified wallet address. verifyWalletSignature consumes the REL-02
// fallback chain (Plan 03-07) — single Alchemy hiccup no longer breaks
// the entire login surface.
//
// Cookie attributes per RESEARCH Pitfall 8 (path: '/' required in SvelteKit 2;
// maxAge in SECONDS not ms).
export const POST: RequestHandler = async ({ request, cookies }) => {
	const rateLimitResponse = await applyRateLimit(request, rateLimiters.authStrict, 'session-login');
	if (rateLimitResponse) return rateLimitResponse;

	try {
		const { address, nonce, signature } = await request.json();

		if (!address || typeof address !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
			return json({ error: 'Invalid wallet address' }, { status: 400 });
		}
		if (!nonce || typeof nonce !== 'string') {
			return json({ error: 'Challenge nonce required' }, { status: 400 });
		}
		if (!signature || typeof signature !== 'string') {
			return json({ error: 'Signature required' }, { status: 400 });
		}

		const challenge = await verifySessionLoginChallenge(address, nonce);
		if (!challenge.valid || !challenge.message) {
			return json(
				{ success: false, error: challenge.error || 'Invalid challenge' },
				{ status: 400 }
			);
		}

		const valid = await verifyWalletSignature(
			address,
			challenge.message,
			signature as `0x${string}`
		);
		if (!valid) {
			return json({ success: false, error: 'Signature verification failed' }, { status: 401 });
		}

		const { sessionId, expiresAt } = await createSession(address);

		cookies.set('session', sessionId, {
			httpOnly: true,
			secure: !dev,
			sameSite: 'strict',
			path: '/', // RESEARCH Pitfall 8 — REQUIRED in SvelteKit 2
			maxAge: 30 * 24 * 60 * 60 // seconds (NOT ms — RESEARCH Pitfall 8)
		});

		return json({ success: true, walletAddress: address.toLowerCase(), expiresAt });
	} catch {
		return json({ error: 'Invalid request body' }, { status: 400 });
	}
};

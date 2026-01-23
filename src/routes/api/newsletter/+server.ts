import { json } from '@sveltejs/kit';
import { MAILERLITE_SUBSCRIBE_ENDPOINT } from '$lib/config/constants';
import type { RequestHandler } from './$types';
import { rateLimiters, applyRateLimit } from '$lib/server/rateLimit';

interface MailerLiteResponse {
	readonly success?: boolean;
	readonly message?: string;
	readonly errors?: {
		readonly fields?: {
			readonly email?: string[];
		};
	};
}

export const POST: RequestHandler = async ({ request, fetch }) => {
	// Rate limiting
	const rateLimitResponse = await applyRateLimit(request, rateLimiters.newsletter, 'newsletter');
	if (rateLimitResponse) return rateLimitResponse;

	let body: unknown;

	try {
		body = await request.json();
	} catch {
		return json({ success: false, error: 'Invalid request payload.' }, { status: 400 });
	}

	if (typeof body !== 'object' || body === null) {
		return json({ success: false, error: 'Invalid request payload.' }, { status: 400 });
	}

	const payload = body as Record<string, unknown>;
	const email = typeof payload.email === 'string' ? payload.email.trim() : '';
	const recaptchaToken =
		typeof payload.recaptchaToken === 'string' ? payload.recaptchaToken.trim() : '';

	if (!email) {
		return json({ success: false, error: 'Email is required.' }, { status: 400 });
	}

	if (!recaptchaToken) {
		return json(
			{ success: false, error: 'Please complete the CAPTCHA verification.' },
			{ status: 400 }
		);
	}

	const params = new URLSearchParams();
	params.set('fields[email]', email);
	params.set('g-recaptcha-response', recaptchaToken);
	params.set('ml-submit', '1');
	params.set('anticsrf', 'true');

	let mlResponse: Response;

	try {
		mlResponse = await fetch(MAILERLITE_SUBSCRIBE_ENDPOINT, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				Accept: 'application/json'
			},
			body: params.toString()
		});
	} catch {
		return json(
			{ success: false, error: 'Unable to reach subscription service.' },
			{ status: 502 }
		);
	}

	let result: MailerLiteResponse | null = null;

	try {
		result = (await mlResponse.json()) as MailerLiteResponse;
	} catch {
		return json(
			{ success: false, error: 'Invalid response from subscription service.' },
			{ status: 502 }
		);
	}

	if (!result?.success) {
		const emailErrors = result?.errors?.fields?.email;
		const message =
			Array.isArray(emailErrors) && emailErrors.length
				? emailErrors[0]
				: result?.message ?? 'Subscription failed. Please try again.';

		return json({ success: false, error: message }, { status: 400 });
	}

	return json({ success: true });
};

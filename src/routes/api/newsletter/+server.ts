import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Add your Mailchimp configuration here
const MAILCHIMP_API_KEY = process.env.MAILCHIMP_API_KEY || '';
const MAILCHIMP_LIST_ID = process.env.MAILCHIMP_LIST_ID || '';
const MAILCHIMP_SERVER_PREFIX = process.env.MAILCHIMP_SERVER_PREFIX || 'us1';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { email } = await request.json();

		// Validate email
		if (!email || !email.includes('@')) {
			return json({ success: false, error: 'Invalid email address' }, { status: 400 });
		}

		// If Mailchimp credentials are not configured, just log and return success
		// This allows the app to work in development without Mailchimp
		if (!MAILCHIMP_API_KEY || !MAILCHIMP_LIST_ID) {
			console.log('Newsletter signup (Mailchimp not configured):', email);
			return json({ success: true, message: 'Thank you for subscribing!' });
		}

		// Mailchimp API endpoint
		const url = `https://${MAILCHIMP_SERVER_PREFIX}.api.mailchimp.com/3.0/lists/${MAILCHIMP_LIST_ID}/members`;

		// Add subscriber to Mailchimp
		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Authorization': `apikey ${MAILCHIMP_API_KEY}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				email_address: email,
				status: 'subscribed',
				tags: ['website-signup']
			})
		});

		const data = await response.json();

		if (!response.ok) {
			// Handle specific Mailchimp errors
			if (data.title === 'Member Exists') {
				return json({ 
					success: false, 
					error: 'You are already subscribed to our newsletter' 
				}, { status: 400 });
			}
			
			console.error('Mailchimp error:', data);
			return json({ 
				success: false, 
				error: 'Failed to subscribe. Please try again later.' 
			}, { status: 500 });
		}

		return json({ 
			success: true, 
			message: 'Thank you for subscribing!' 
		});

	} catch (error) {
		console.error('Newsletter signup error:', error);
		return json({ 
			success: false, 
			error: 'An error occurred. Please try again later.' 
		}, { status: 500 });
	}
};
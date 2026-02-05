import posthog from 'posthog-js';
import { browser } from '$app/environment';
import { get } from 'svelte/store';
import { walletAddress, authMethod } from '$lib/stores/authStore';
import { dynamicSession } from '$lib/stores/dynamicStore';
import { currentNetwork } from '$lib/stores';

let initialized = false;
let previousWalletAddress: string | null = null;
let previousAuthMethod: string | null = null;
let walletUnsubscribe: (() => void) | null = null;

/**
 * Initialize PostHog analytics
 * Should be called after cookie consent is given
 */
export function initAnalytics(apiKey: string): void {
	if (!browser || initialized || !apiKey) return;

	posthog.init(apiKey, {
		// Use reverse proxy to bypass ad blockers
		// Requests go to /ingest/* which are proxied to PostHog via hooks.server.ts
		api_host: '/ingest',
		// ui_host is needed for toolbar and feature flag UI to link correctly
		ui_host: 'https://us.posthog.com',
		capture_pageview: false, // Manual tracking via trackPageView() to avoid duplicates
		capture_pageleave: true,
		persistence: 'localStorage+cookie',
		autocapture: false, // We'll do manual tracking for more control
		session_recording: {
			maskAllInputs: true,
			maskInputOptions: {
				password: true
			}
		}
	});

	initialized = true;

	// Set up wallet address tracking subscription
	setupWalletTracking();
}

/**
 * Subscribe to wallet address changes for user identification
 */
function setupWalletTracking(): void {
	// Clean up existing subscription if any
	if (walletUnsubscribe) {
		walletUnsubscribe();
	}

	walletUnsubscribe = walletAddress.subscribe((address) => {
		if (address && address !== previousWalletAddress) {
			// User connected
			const method = get(authMethod);
			const session = get(dynamicSession);
			const network = get(currentNetwork);

			// Store current auth method for disconnect tracking
			previousAuthMethod = method;

			// Identify user by wallet address (normalized to lowercase)
			posthog.identify(address.toLowerCase(), {
				auth_method: method,
				wallet_type: session?.walletType,
				network: network?.displayName,
				chain_id: network?.chainId
			});

			// Track connection event (without email domain for privacy)
			track('wallet_connected', {
				method,
				wallet_type: session?.walletType
			});

			previousWalletAddress = address;
		} else if (!address && previousWalletAddress) {
			// User disconnected - use stored auth method (current may already be reset)
			track('wallet_disconnected', {
				previous_method: previousAuthMethod
			});

			posthog.reset();
			previousWalletAddress = null;
			previousAuthMethod = null;
		}
	});
}

/**
 * Track an event with automatic context enrichment
 */
export function track(eventName: string, properties?: Record<string, unknown>): void {
	if (!browser || !initialized) return;

	const network = get(currentNetwork);
	const address = get(walletAddress);
	const method = get(authMethod);

	// Enrich with common properties
	const enrichedProps = {
		...properties,
		wallet_address: address?.toLowerCase(),
		auth_method: method,
		network: network?.displayName,
		chain_id: network?.chainId
	};

	posthog.capture(eventName, enrichedProps);
}

/**
 * Track a page view with additional properties
 */
export function trackPageView(pageName: string, properties?: Record<string, unknown>): void {
	track('page_viewed', {
		page: pageName,
		...properties
	});
}

/**
 * Check if analytics is initialized
 */
export function isAnalyticsInitialized(): boolean {
	return initialized;
}

/**
 * Start session recording (if not already started)
 */
export function startSessionRecording(): void {
	if (!browser || !initialized) return;
	posthog.startSessionRecording();
}

/**
 * Stop session recording
 */
export function stopSessionRecording(): void {
	if (!browser || !initialized) return;
	posthog.stopSessionRecording();
}

/**
 * Register super properties that will be sent with every event
 */
export function registerSuperProperties(properties: Record<string, unknown>): void {
	if (!browser || !initialized) return;
	posthog.register(properties);
}

/**
 * Opt out of tracking
 */
export function optOut(): void {
	if (!browser || !initialized) return;
	posthog.opt_out_capturing();
}

/**
 * Opt in to tracking
 */
export function optIn(): void {
	if (!browser || !initialized) return;
	posthog.opt_in_capturing();
}

// Export the posthog instance for direct access when needed
export { posthog };

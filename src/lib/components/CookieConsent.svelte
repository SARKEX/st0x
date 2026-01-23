<script lang="ts">
	import { onMount } from 'svelte';
	import * as CookieConsent from 'vanilla-cookieconsent';
	import 'vanilla-cookieconsent/dist/cookieconsent.css';

	export let onAnalyticsAccepted: (() => void) | undefined = undefined;

	onMount(() => {
		CookieConsent.run({
			guiOptions: {
				consentModal: {
					layout: 'box inline',
					position: 'bottom right'
				},
				preferencesModal: {
					layout: 'box'
				}
			},
			categories: {
				necessary: {
					enabled: true,
					readOnly: true
				},
				analytics: {
					enabled: false,
					readOnly: false,
					autoClear: {
						cookies: []
					}
				}
			},
			language: {
				default: 'en',
				translations: {
					en: {
						consentModal: {
							title: 'Cookie Settings',
							description:
								'We use essential cookies for site functionality (authentication, rate limiting) and optional analytics to improve our service. <a href="/privacy-policy" class="cc-link">Privacy Policy</a>',
							acceptAllBtn: 'Accept all',
							acceptNecessaryBtn: 'Reject analytics',
							showPreferencesBtn: 'Manage preferences'
						},
						preferencesModal: {
							title: 'Cookie Preferences',
							acceptAllBtn: 'Accept all',
							acceptNecessaryBtn: 'Reject all',
							savePreferencesBtn: 'Save preferences',
							sections: [
								{
									title: 'Essential Cookies',
									description:
										'These cookies are required for basic site functionality and cannot be disabled.',
									linkedCategory: 'necessary'
								},
								{
									title: 'Analytics',
									description:
										'We use Vercel Analytics to collect anonymized usage statistics. This helps us understand how visitors use our site and improve the experience. No personal data is shared with third parties.',
									linkedCategory: 'analytics'
								},
								{
									title: 'More information',
									description:
										'For questions about our cookie policy, please <a href="mailto:toby@st0x.io" class="cc-link">contact us</a>.'
								}
							]
						}
					}
				}
			},
			onConsent: () => {
				if (CookieConsent.acceptedCategory('analytics') && onAnalyticsAccepted) {
					onAnalyticsAccepted();
				}
			},
			onChange: () => {
				if (CookieConsent.acceptedCategory('analytics') && onAnalyticsAccepted) {
					onAnalyticsAccepted();
				}
			}
		});

		// If analytics was previously accepted, trigger callback
		if (CookieConsent.acceptedCategory('analytics') && onAnalyticsAccepted) {
			onAnalyticsAccepted();
		}
	});
</script>

<style>
	:global(:root) {
		--cc-bg: #1f2937;
		--cc-primary-color: #f3f4f6;
		--cc-secondary-color: #9ca3af;
		--cc-btn-primary-bg: #3b82f6;
		--cc-btn-primary-color: #fff;
		--cc-btn-primary-hover-bg: #2563eb;
		--cc-btn-secondary-bg: #374151;
		--cc-btn-secondary-color: #f3f4f6;
		--cc-btn-secondary-hover-bg: #4b5563;
		--cc-separator-border-color: #374151;
		--cc-cookie-category-block-bg: #374151;
		--cc-cookie-category-block-border: #4b5563;
		--cc-overlay-bg: rgba(0, 0, 0, 0.65);
		--cc-toggle-on-bg: #3b82f6;
		--cc-toggle-readonly-bg: #4b5563;
	}

	/* Scale down the entire consent modal to 2/3 size */
	:global(#cc-main .cm-wrapper) {
		transform: scale(0.67);
		transform-origin: bottom right;
	}

	:global(.cc-link) {
		color: #60a5fa;
	}

	:global(.cc-link:hover) {
		color: #93c5fd;
	}
</style>

<script lang="ts">
	import '../app.css';
	import { QueryClientProvider } from '@tanstack/svelte-query';
	import { queryClient } from '$lib/clients/queryClient';
	import { env as publicEnv } from '$env/dynamic/public';
	import { defaultConfig } from 'svelte-wagmi';
	import { base } from '@wagmi/core/chains';
	import { injected, walletConnect } from '@wagmi/connectors';
	import { onMount } from 'svelte';
	import { injectAnalytics } from '@vercel/analytics/sveltekit';
	import { injectSpeedInsights } from '@vercel/speed-insights/sveltekit';

	// Dynamic integration
	import DynamicSvelteWrapper from '$lib/dynamic/DynamicSvelteWrapper.svelte';
	import AuthModal from '$lib/components/AuthModal.svelte';
	import SendFundsModal from '$lib/components/SendFundsModal.svelte';
	import DepositModal from '$lib/components/DepositModal.svelte';
	import CoinbaseOfframpModal from '$lib/components/CoinbaseOfframpModal.svelte';
	import CookieConsent from '$lib/components/CookieConsent.svelte';

	// Auth store for wallet address tracking
	import { walletAddress } from '$lib/stores/authStore';

	let analyticsInjected = false;

	function enableAnalytics() {
		if (!analyticsInjected) {
			injectAnalytics();
			injectSpeedInsights();
			analyticsInjected = true;
		}
	}

	const initWallet = async () => {
		const projectId = publicEnv?.PUBLIC_WALLETCONNECT_ID || '';
		const connectorsList = [injected()];
		if (projectId && projectId.trim().length > 0) {
			// @ts-expect-error - walletConnect connector type mismatch with wagmi
			connectorsList.push(walletConnect({ projectId }));
		}

		const cfgOptions = {
			autoConnect: true,
			appName: 'st0x-liquidity',
			chains: [base] as [typeof base],
			connectors: connectorsList,
			walletConnectProjectId: projectId || 'dummy-project-id'
		};

		const erckit = defaultConfig(cfgOptions);
		await erckit.init();
	};

	// Set wallet-address cookie for server-side rate limiting
	// This allows the server to use wallet-based rate limits instead of IP-based
	function setWalletCookie(address: string | null) {
		if (typeof document === 'undefined') return;

		// Add Secure flag in production (HTTPS only)
		const isSecure = window.location.protocol === 'https:';
		const secureFlag = isSecure ? '; Secure' : '';

		if (address) {
			// Set cookie with 7-day expiry, SameSite=Strict for security
			const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toUTCString();
			document.cookie = `wallet-address=${address.toLowerCase()}; path=/; expires=${expires}; SameSite=Strict${secureFlag}`;
		} else {
			// Clear cookie by setting expired date
			document.cookie = `wallet-address=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict${secureFlag}`;
		}
	}

	onMount(() => {
		initWallet();

		// Subscribe to wallet address changes and sync to cookie
		const unsubscribe = walletAddress.subscribe((address) => {
			setWalletCookie(address);
		});

		return () => {
			unsubscribe();
			document.body.style.overflow = '';
		};
	});
</script>

<QueryClientProvider client={queryClient}>
	<!-- Dynamic SDK wrapper (invisible, handles auth state) -->
	<DynamicSvelteWrapper />

	<!-- Global modals -->
	<AuthModal />
	<SendFundsModal />
	<DepositModal />
	<CoinbaseOfframpModal />

	<!-- Cookie consent banner -->
	<CookieConsent onAnalyticsAccepted={enableAnalytics} />

	<slot />
</QueryClientProvider>

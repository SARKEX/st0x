<script lang="ts">
	import '../app.css';
	import { QueryClientProvider } from '@tanstack/svelte-query';
	import { queryClient } from '$lib/clients/queryClient';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { env as publicEnv } from '$env/dynamic/public';
	import { removeInjectedTradeSeoHead, syncTradeRobotsMeta } from '$lib/seo/trade';
	import { replaceTokenCatalog, type CategorizedToken } from '$lib/config/tokens';
	import type { Network } from '$lib/config/networks';
	import { hydrateNetworkCatalog } from '$lib/stores';

	export let data: {
		tokenCatalog?: CategorizedToken[];
		networkCatalog?: Network[];
		catalogUnavailable?: boolean;
	};

	function hydrateCatalogs(tokens: CategorizedToken[], networkCatalog: Network[]): void {
		replaceTokenCatalog(tokens);
		hydrateNetworkCatalog(networkCatalog);
		for (const chainId of new Set(tokens.map((token) => token.chainId))) {
			queryClient.setQueryData(
				['st0xApiTokens', chainId],
				tokens.filter((token) => token.chainId === chainId)
			);
		}
	}

	$: hydrateCatalogs(data.tokenCatalog ?? [], data.networkCatalog ?? []);

	// Site-wide SEO defaults. Pages override the title via their own <svelte:head>
	// (Svelte keeps the last <title>), or by returning `title`/`description` from a
	// load function. Without these, crawlers fall back to scraping visible body text
	// (e.g. the footer risk warning).
	const SITE_URL = 'https://www.st0x.io';
	const DEFAULT_TITLE = 'ST0x — Trade & Earn on DeFi-Native Tokenized Assets';
	const DEFAULT_DESCRIPTION =
		'ST0x brings real-world assets on-chain as DeFi-first tokens. Trade tokenized stocks, ETFs & commodities 24/7, then earn yield with fully composable, on-chain assets.';
	const OG_IMAGE = `${SITE_URL}/og-image.png`;

	$: metaTitle = ($page.data?.title as string | undefined) ?? DEFAULT_TITLE;
	$: metaDescription = ($page.data?.description as string | undefined) ?? DEFAULT_DESCRIPTION;
	$: canonicalUrl = `${SITE_URL}${$page.url.pathname}`;
	$: if (browser) syncTradeRobotsMeta(document, $page.url.pathname);

	// Site-wide structured data: Organization (brand/logo/social knowledge-panel
	// signals) + WebSite (enables the sitelinks search box). Emitted once from the
	// root layout so every page carries it.
	const siteJsonLd = JSON.stringify({
		'@context': 'https://schema.org',
		'@graph': [
			{
				'@type': 'Organization',
				'@id': `${SITE_URL}/#organization`,
				name: 'ST0x',
				url: SITE_URL,
				logo: `${SITE_URL}/logo.svg`,
				description: DEFAULT_DESCRIPTION,
				sameAs: ['https://x.com/st0x_io']
			},
			{
				'@type': 'WebSite',
				'@id': `${SITE_URL}/#website`,
				url: SITE_URL,
				name: 'ST0x',
				publisher: { '@id': `${SITE_URL}/#organization` }
			}
		]
	});
	import { onMount } from 'svelte';
	import { injectAnalytics } from '@vercel/analytics/sveltekit';
	import { injectSpeedInsights } from '@vercel/speed-insights/sveltekit';

	// PostHog analytics
	import { initAnalytics } from '$lib/services/analytics';

	type DynamicSvelteWrapperComponent =
		typeof import('$lib/dynamic/DynamicSvelteWrapper.svelte').default;
	type AuthModalComponent = typeof import('$lib/components/AuthModal.svelte').default;
	type SendFundsModalComponent = typeof import('$lib/components/SendFundsModal.svelte').default;
	type DepositModalComponent = typeof import('$lib/components/DepositModal.svelte').default;
	type CookieConsentComponent = typeof import('$lib/components/CookieConsent.svelte').default;

	let DynamicSvelteWrapper: DynamicSvelteWrapperComponent | null = null;
	let AuthModal: AuthModalComponent | null = null;
	let SendFundsModal: SendFundsModalComponent | null = null;
	let DepositModal: DepositModalComponent | null = null;
	let CookieConsent: CookieConsentComponent | null = null;
	let analyticsInjected = false;

	async function loadRootComponents() {
		const [dynamicSvelteWrapper, authModal, sendFundsModal, depositModal, cookieConsent] =
			await Promise.all([
				import('$lib/dynamic/DynamicSvelteWrapper.svelte'),
				import('$lib/components/AuthModal.svelte'),
				import('$lib/components/SendFundsModal.svelte'),
				import('$lib/components/DepositModal.svelte'),
				import('$lib/components/CookieConsent.svelte')
			]);

		DynamicSvelteWrapper = dynamicSvelteWrapper.default;
		AuthModal = authModal.default;
		SendFundsModal = sendFundsModal.default;
		DepositModal = depositModal.default;
		CookieConsent = cookieConsent.default;
	}

	function enableAnalytics() {
		if (!analyticsInjected) {
			injectAnalytics();
			injectSpeedInsights();

			// Initialize PostHog analytics
			const posthogKey = publicEnv?.PUBLIC_POSTHOG_KEY;
			if (posthogKey) {
				initAnalytics(posthogKey);
			}

			analyticsInjected = true;
		}
	}

	const initWallet = async () => {
		// Build wagmi from every network and ordered RPC list in the active registry.
		const [
			{ wagmiConfig, web3Modal, wagmiLoaded, configuredConnectors, init },
			{ injected, walletConnect },
			{ createConfig, reconnect },
			{ createWeb3Modal },
			{ createClientRpcTransport },
			{ defineChain }
		] = await Promise.all([
			import('svelte-wagmi'),
			import('@wagmi/connectors'),
			import('@wagmi/core'),
			import('@web3modal/wagmi'),
			import('$lib/config/clientRpc'),
			import('viem')
		]);

		const projectId = publicEnv?.PUBLIC_WALLETCONNECT_ID || '';
		const connectorsList = [injected()];
		if (projectId && projectId.trim().length > 0) {
			// @ts-expect-error - walletConnect connector type mismatch with wagmi
			connectorsList.push(walletConnect({ projectId }));
		}

		configuredConnectors.set(connectorsList);

		const configuredNetworks = data.networkCatalog ?? [];
		if (configuredNetworks.length === 0) {
			console.error('[wallet] The application catalog contains no wallet networks');
			return;
		}
		const chains = configuredNetworks.map((network) =>
			defineChain({
				id: network.chainId,
				name: network.displayName,
				nativeCurrency: {
					name: network.currencySymbol,
					symbol: network.currencySymbol,
					decimals: 18
				},
				rpcUrls: {
					default: { http: [network.rpcUrl, ...network.fallbackRpcUrls] }
				},
				blockExplorers: {
					default: { name: 'Blockscan', url: network.blockExplorer }
				}
			})
		);
		const transports = Object.fromEntries(
			configuredNetworks.map((network) => [
				network.chainId,
				createClientRpcTransport([network.rpcUrl, ...network.fallbackRpcUrls])
			])
		);

		const config = createConfig({
			chains: chains as [(typeof chains)[number], ...typeof chains],
			connectors: connectorsList,
			transports
		});

		wagmiConfig.set(config);
		reconnect(config);

		web3Modal.set(
			createWeb3Modal({
				wagmiConfig: config,
				projectId: projectId || 'dummy-project-id',
				enableAnalytics: true,
				enableOnramp: true
			})
		);
		wagmiLoaded.set(true);
		await init();
	};

	// SEC-03 (Plan 03-08b atomic flip): the 'wallet-address' cookie is a
	// NON-AUTHORITATIVE personalization hint. It is NEVER read by the server as
	// proof of authentication — authentication is established exclusively by the
	// server-issued HttpOnly 'session' cookie minted at /api/auth/session POST
	// after wallet signature verification (Plan 03-08a). Do NOT use this cookie
	// to grant any permission server-side. It remains here only because the
	// client-side code still inspects it for UI personalization (e.g. nav state).
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
		// Client-only trade routes receive server-injected social tags for crawlers.
		// Once Svelte owns the document head, remove those temporary duplicates.
		removeInjectedTradeSeoHead(document);
		document.title = metaTitle;

		let unsubscribe: (() => void) | undefined;

		void initWallet();
		void loadRootComponents();

		// Subscribe to wallet address changes and sync to cookie
		void import('$lib/stores/authStore').then(({ walletAddress }) => {
			unsubscribe = walletAddress.subscribe((address) => {
				setWalletCookie(address);
			});
		});

		return () => {
			unsubscribe?.();
			document.body.style.overflow = '';
		};
	});
</script>

<svelte:head>
	<title>{metaTitle}</title>
	<meta name="description" content={metaDescription} />
	<link rel="canonical" href={canonicalUrl} />

	<!-- Open Graph -->
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="ST0x" />
	<meta property="og:url" content={canonicalUrl} />
	<meta property="og:title" content={metaTitle} />
	<meta property="og:description" content={metaDescription} />
	<meta property="og:image" content={OG_IMAGE} />

	<!-- Twitter -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:site" content="@st0x_io" />
	<meta name="twitter:title" content={metaTitle} />
	<meta name="twitter:description" content={metaDescription} />
	<meta name="twitter:image" content={OG_IMAGE} />

	<!-- Structured data (Organization + WebSite) -->
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- static JSON-LD serialized from a local const; no user input -->
	{@html `<script type="application/ld+json">${siteJsonLd}</` + 'script>'}
</svelte:head>

<QueryClientProvider client={queryClient}>
	{#if data.catalogUnavailable}
		<div
			class="border-b border-yellow-500/30 bg-yellow-500/10 px-4 py-2 text-center text-sm text-yellow-200"
			role="alert"
		>
			Network data is temporarily unavailable. Trading and wallet actions are disabled.
		</div>
	{/if}
	<!-- Dynamic SDK wrapper (invisible, handles auth state) -->
	{#if DynamicSvelteWrapper}
		<svelte:component this={DynamicSvelteWrapper} />
	{/if}

	<!-- Global modals -->
	{#if AuthModal}
		<svelte:component this={AuthModal} />
	{/if}
	{#if SendFundsModal}
		<svelte:component this={SendFundsModal} />
	{/if}
	{#if DepositModal}
		<svelte:component this={DepositModal} />
	{/if}

	<!-- Cookie consent banner -->
	{#if CookieConsent}
		<svelte:component this={CookieConsent} onAnalyticsAccepted={enableAnalytics} />
	{/if}

	<slot />
</QueryClientProvider>

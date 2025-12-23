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
	import WalletCreationFallback from '$lib/components/WalletCreationFallback.svelte';

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

	onMount(() => {
		initWallet();
		injectAnalytics();
		injectSpeedInsights();
		return () => {
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
	<WalletCreationFallback />

	<slot />
</QueryClientProvider>

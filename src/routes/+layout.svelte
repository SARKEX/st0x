<script lang="ts">
	import '../app.css';
	import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
	import { env as publicEnv } from '$env/dynamic/public';
	import { defaultConfig } from 'svelte-wagmi';
	import { arbitrum, base } from '@wagmi/core/chains';
	import { injected, walletConnect } from '@wagmi/connectors';
	import { onMount } from 'svelte';

	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: Infinity
			}
		}
	});

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
			chains: [arbitrum, base] as [typeof arbitrum, typeof base],
			connectors: connectorsList,
			walletConnectProjectId: projectId || 'dummy-project-id'
		};

		const erckit = defaultConfig(cfgOptions);
		await erckit.init();
	};

	onMount(() => {
		initWallet();
		return () => {
			document.body.style.overflow = '';
		};
	});
</script>

<QueryClientProvider client={queryClient}>
	<slot />
</QueryClientProvider>

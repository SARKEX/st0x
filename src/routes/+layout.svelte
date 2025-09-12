<script lang="ts">
	import '../app.css';
	import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
	import { env as publicEnv } from '$env/dynamic/public';
	import { onMount } from 'svelte';

	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: Infinity
			}
		}
	});

	const initWallet = async () => {
		// Dynamically import wallet libs on client to avoid SSR loading viem/wagmi
		const projectId = publicEnv?.PUBLIC_WALLETCONNECT_ID || '';
		const [{ defaultConfig }, { arbitrum, base }, connectors] = await Promise.all([
			import('svelte-wagmi'),
			import('@wagmi/core/chains'),
			import('@wagmi/connectors')
		]);

		const injected = connectors.injected;
		const walletConnect = connectors.walletConnect as unknown as (
			args: { projectId: string }
		) => unknown;

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

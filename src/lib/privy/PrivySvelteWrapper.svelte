<script lang="ts">
	import { browser } from '$app/environment';
	import { env } from '$env/dynamic/public';
	import { used } from 'svelte-preprocess-react';
	import { PrivyReactProvider, type PrivyEventData } from './PrivyReactProvider';
	import {
		privySession,
		privyLoading,
		privyError,
		privyReady,
		showAuthModal,
		privyTriggerLogin,
		privyTriggerLogout,
		privyTriggerExportWallet,
		privyTriggerConnectWallet,
		privyTriggerSendTransaction,
		type PrivySession
	} from '$lib/stores/privyStore';
	import { setPrivyWalletProvider } from '$lib/services/walletService';

	// Prevent TypeScript warning about unused import (used via react: prefix)
	used(PrivyReactProvider);

	// Get app ID
	$: appId = browser ? env.PUBLIC_PRIVY_APP_ID : '';

	// Handle wallet provider from React
	function handleWalletProviderReady(
		provider: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } | null
	) {
		setPrivyWalletProvider(provider);
	}

	// Handle events from React
	function handlePrivyEvent(event: PrivyEventData) {
		switch (event.type) {
			case 'ready':
				privyReady.set(true);
				privyLoading.set(false);
				break;

			case 'authenticated':
				if (event.payload) {
					const session: PrivySession = {
						userId: event.payload.userId || '',
						walletAddress: event.payload.walletAddress || '',
						email: event.payload.email,
						smartWalletAddress: event.payload.smartWalletAddress,
						eoaAddress: event.payload.eoaAddress,
						walletType: event.payload.walletType
					};
					privySession.set(session);
					showAuthModal.set(false);
					privyError.set(null);
				}
				privyLoading.set(false);
				break;

			case 'logout':
				privySession.set(null);
				privyLoading.set(false);
				break;

			case 'wallet':
				if (event.payload?.walletAddress) {
					privySession.update((s) =>
						s ? { ...s, walletAddress: event.payload!.walletAddress! } : null
					);
				}
				break;

			case 'error':
				privyError.set(event.payload?.error || 'Unknown error');
				privyLoading.set(false);
				break;
		}
	}
</script>

{#if browser && appId}
	<!-- Privy React Provider using svelte-preprocess-react -->
	<react:PrivyReactProvider
		{appId}
		onEvent={handlePrivyEvent}
		onWalletProviderReady={handleWalletProviderReady}
		triggerLogin={$privyTriggerLogin}
		triggerLogout={$privyTriggerLogout}
		triggerExportWallet={$privyTriggerExportWallet}
		triggerConnectWallet={$privyTriggerConnectWallet}
		triggerSendTransaction={$privyTriggerSendTransaction}
	/>
{:else if browser && !appId}
	<!-- No Privy app ID configured -->
	{(() => {
		console.warn('[privy] No PUBLIC_PRIVY_APP_ID configured');
		privyLoading.set(false);
		return '';
	})()}
{/if}

<style>
	/* The React component renders Privy modals via portals to body, no visible content here */
</style>

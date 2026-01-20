<script lang="ts">
	import { browser } from '$app/environment';
	import { env } from '$env/dynamic/public';
	import { used } from 'svelte-preprocess-react';
	import { DynamicReactProvider, type DynamicEventData } from './DynamicReactProvider';
	import {
		dynamicSession,
		dynamicLoading,
		dynamicError,
		dynamicReady,
		showAuthModal,
		dynamicTriggerLogin,
		dynamicTriggerLogout,
		dynamicTriggerExportWallet,
		dynamicTriggerSendTransaction,
		dynamicAccessToken,
		dynamicSigner,
		type DynamicSession,
		type DynamicSigner
	} from '$lib/stores/dynamicStore';
	import { setDynamicWalletProvider } from '$lib/services/walletService';

	// Prevent TypeScript warning about unused import (used via react: prefix)
	used(DynamicReactProvider);

	// Get environment ID
	$: environmentId = browser ? env.PUBLIC_DYNAMIC_ENVIRONMENT_ID : '';

	// Handle wallet provider from React
	function handleWalletProviderReady(
		provider: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } | null
	) {
		setDynamicWalletProvider(provider);
	}

	// Handle Dynamic signer from React (for EIP-7702 authorization signing)
	function handleSignerReady(signer: DynamicSigner | null) {
		dynamicSigner.set(signer);
		if (signer) {
			console.log('[dynamic] Dynamic signer set in store for EIP-7702 authorization signing');
		} else {
			console.log('[dynamic] Dynamic signer cleared from store');
		}
	}

	// Handle events from React
	function handleDynamicEvent(event: DynamicEventData) {
		switch (event.type) {
			case 'ready':
				dynamicReady.set(true);
				dynamicLoading.set(false);
				break;

			case 'authenticated':
				if (event.payload) {
					const session: DynamicSession = {
						userId: event.payload.userId || '',
						walletAddress: event.payload.walletAddress || '',
						email: event.payload.email,
						walletType: event.payload.walletType
					};
					dynamicSession.set(session);
					showAuthModal.set(false);
					dynamicError.set(null);
				}
				dynamicLoading.set(false);
				break;

			case 'logout':
				dynamicSession.set(null);
				dynamicLoading.set(false);
				break;

			case 'wallet':
				if (event.payload?.walletAddress) {
					dynamicSession.update((s) =>
						s ? { ...s, walletAddress: event.payload!.walletAddress! } : null
					);
				}
				break;

			case 'error':
				dynamicError.set(event.payload?.error || 'Unknown error');
				dynamicLoading.set(false);
				break;

			case 'token_refreshed':
				if (event.payload?.accessToken) {
					dynamicAccessToken.set(event.payload.accessToken);
				}
				break;
		}
	}
</script>

{#if browser && environmentId}
	<!-- Dynamic React Provider using svelte-preprocess-react -->
	<react:DynamicReactProvider
		{environmentId}
		onEvent={handleDynamicEvent}
		onWalletProviderReady={handleWalletProviderReady}
		onSignerReady={handleSignerReady}
		triggerLogin={$dynamicTriggerLogin}
		triggerLogout={$dynamicTriggerLogout}
		triggerExportWallet={$dynamicTriggerExportWallet}
		triggerSendTransaction={$dynamicTriggerSendTransaction}
	/>
{:else if browser && !environmentId}
	<!-- No Dynamic environment ID configured -->
	{(() => {
		console.warn('[dynamic] No PUBLIC_DYNAMIC_ENVIRONMENT_ID configured');
		dynamicLoading.set(false);
		return '';
	})()}
{/if}

<style>
	/* The React component renders Dynamic modals via portals to body, no visible content here */
</style>

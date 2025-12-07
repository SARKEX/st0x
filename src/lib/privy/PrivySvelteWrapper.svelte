<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { env } from '$env/dynamic/public';
	import {
		privySession,
		privyLoading,
		privyError,
		privyReady,
		showAuthModal,
		privyTriggerLogin,
		privyTriggerLogout,
		privyTriggerExportWallet,
		privyTriggerSendTransaction,
		type PrivySession
	} from '$lib/stores/privyStore';

	let container: HTMLDivElement;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let reactRoot: any = null;
	let mounted = false;

	// Subscribe to trigger stores
	let triggerLogin = false;
	let triggerLogout = false;
	let triggerExportWallet = false;
	let triggerSendTx: { to: string; value: string; data?: string } | null = null;

	const unsubLogin = privyTriggerLogin.subscribe((v) => {
		triggerLogin = v;
		if (v && mounted) updateReactProps();
	});
	const unsubLogout = privyTriggerLogout.subscribe((v) => {
		triggerLogout = v;
		if (v && mounted) updateReactProps();
	});
	const unsubExport = privyTriggerExportWallet.subscribe((v) => {
		triggerExportWallet = v;
		if (v && mounted) updateReactProps();
	});
	const unsubSend = privyTriggerSendTransaction.subscribe((v) => {
		triggerSendTx = v;
		if (v && mounted) updateReactProps();
	});

	// Handle events from React
	function handlePrivyEvent(event: {
		type: string;
		payload?: {
			userId?: string;
			walletAddress?: string;
			email?: string;
			isAuthenticated?: boolean;
			error?: string;
		};
	}) {
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
						email: event.payload.email
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
				// Wallet update
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

	async function mountReact() {
		if (!browser || !container) return;

		const appId = env.PUBLIC_PRIVY_APP_ID;
		if (!appId) {
			console.warn('[privy] No PUBLIC_PRIVY_APP_ID configured');
			privyLoading.set(false);
			return;
		}

		try {
			// Dynamically import React and the Privy component
			const [React, ReactDOM, { PrivyReactProvider }] = await Promise.all([
				import('react'),
				import('react-dom/client'),
				import('./PrivyReactProvider')
			]);

			// Create React root
			reactRoot = ReactDOM.createRoot(container);

			// Render the Privy provider
			reactRoot.render(
				React.createElement(PrivyReactProvider, {
					appId,
					onEvent: handlePrivyEvent,
					triggerLogin,
					triggerLogout,
					triggerExportWallet,
					triggerSendTransaction: triggerSendTx
				})
			);

			mounted = true;
		} catch (error) {
			console.error('[privy] Failed to mount React:', error);
			privyError.set('Failed to initialize Privy');
			privyLoading.set(false);
		}
	}

	async function updateReactProps() {
		if (!reactRoot || !container || !browser) return;

		const appId = env.PUBLIC_PRIVY_APP_ID;
		if (!appId) return;

		try {
			const [React, { PrivyReactProvider }] = await Promise.all([
				import('react'),
				import('./PrivyReactProvider')
			]);

			reactRoot.render(
				React.createElement(PrivyReactProvider, {
					appId,
					onEvent: handlePrivyEvent,
					triggerLogin,
					triggerLogout,
					triggerExportWallet,
					triggerSendTransaction: triggerSendTx
				})
			);
		} catch (error) {
			console.error('[privy] Failed to update React props:', error);
		}
	}

	onMount(() => {
		mountReact();
	});

	onDestroy(() => {
		unsubLogin();
		unsubLogout();
		unsubExport();
		unsubSend();

		if (reactRoot) {
			reactRoot.unmount();
			reactRoot = null;
		}
		mounted = false;
	});
</script>

<!-- Hidden container for React - Privy renders its own modals -->
<div bind:this={container} class="privy-react-container" aria-hidden="true"></div>

<style>
	.privy-react-container {
		/* Privy modals are portaled to body, this container is just for the provider */
		position: fixed;
		width: 0;
		height: 0;
		overflow: hidden;
		pointer-events: none;
	}
</style>

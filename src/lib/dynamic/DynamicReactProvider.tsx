import React, { useEffect, useCallback, useRef } from 'react';
import { DynamicContextProvider, useDynamicContext, useUserWallets } from '@dynamic-labs/sdk-react-core';
import { EthereumWalletConnectors } from '@dynamic-labs/ethereum';

// Event types for Svelte-React communication
export interface DynamicEventData {
	type:
		| 'ready'
		| 'authenticated'
		| 'logout'
		| 'wallet'
		| 'error'
		| 'token_refreshed';
	payload?: {
		userId?: string;
		walletAddress?: string;
		email?: string;
		isAuthenticated?: boolean;
		error?: string;
		// Wallet info
		walletType?: 'embedded' | 'external';
		// Access token for server-side verification
		accessToken?: string;
	};
}

interface DynamicBridgeProps {
	environmentId: string;
	onEvent: (event: DynamicEventData) => void;
	onWalletProviderReady?: (
		provider: {
			request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
		} | null
	) => void;
	triggerLogin?: boolean;
	triggerLogout?: boolean;
	triggerExportWallet?: boolean;
	triggerSendTransaction?: {
		to: string;
		value: string;
		data?: string;
	} | null;
}

// Token refresh interval (refresh every 50 minutes to be safe before 1 hour expiry)
const TOKEN_REFRESH_INTERVAL = 50 * 60 * 1000;

// Inner component that uses Dynamic hooks
function DynamicBridge({
	onEvent,
	onWalletProviderReady,
	triggerLogin,
	triggerLogout,
	triggerExportWallet,
	triggerSendTransaction
}: Omit<DynamicBridgeProps, 'environmentId'>) {
	const {
		sdkHasLoaded,
		user,
		primaryWallet,
		handleLogOut,
		setShowAuthFlow,
		authToken
	} = useDynamicContext();

	const userWallets = useUserWallets();

	// Find embedded wallet
	const embeddedWallet = userWallets.find((wallet) => wallet.connector?.isEmbeddedWallet);

	// Get the active wallet (embedded preferred, then primary)
	const activeWallet = embeddedWallet || primaryWallet;

	// Refs to prevent multiple triggers
	const isExportingRef = useRef(false);
	const wasAuthenticatedRef = useRef(false);
	const hasEmittedReadyRef = useRef(false);
	const lastEmittedWalletRef = useRef<string | null>(null);

	// Use refs for callbacks to avoid infinite loops from dependency changes
	const onEventRef = useRef(onEvent);
	const onWalletProviderReadyRef = useRef(onWalletProviderReady);

	// Keep refs up to date
	useEffect(() => {
		onEventRef.current = onEvent;
	}, [onEvent]);

	useEffect(() => {
		onWalletProviderReadyRef.current = onWalletProviderReady;
	}, [onWalletProviderReady]);

	// Notify when ready (only once)
	useEffect(() => {
		if (sdkHasLoaded && !hasEmittedReadyRef.current) {
			hasEmittedReadyRef.current = true;
			onEventRef.current({ type: 'ready' });
		}
	}, [sdkHasLoaded]);

	// Notify authentication state changes
	useEffect(() => {
		if (!sdkHasLoaded) return;

		const isAuthenticated = !!user;

		if (isAuthenticated && user && activeWallet) {
			// Track that user became authenticated
			wasAuthenticatedRef.current = true;

			// Get email from user object
			const email = user.email;

			// Determine wallet type
			const walletType: 'embedded' | 'external' = embeddedWallet ? 'embedded' : 'external';

			onEventRef.current({
				type: 'authenticated',
				payload: {
					userId: user.userId,
					walletAddress: activeWallet.address,
					email,
					isAuthenticated: true,
					walletType
				}
			});
		} else if (!isAuthenticated && wasAuthenticatedRef.current) {
			// Only emit logout if user was previously authenticated (actual logout, not initial load)
			wasAuthenticatedRef.current = false;
			onEventRef.current({
				type: 'logout',
				payload: { isAuthenticated: false }
			});
		}
	}, [sdkHasLoaded, user, activeWallet?.address, embeddedWallet]);

	// Notify wallet changes (only when address actually changes)
	useEffect(() => {
		if (activeWallet?.address && activeWallet.address !== lastEmittedWalletRef.current) {
			lastEmittedWalletRef.current = activeWallet.address;
			onEventRef.current({
				type: 'wallet',
				payload: { walletAddress: activeWallet.address }
			});
		}
	}, [activeWallet?.address]);

	// Expose wallet provider to Svelte when available
	useEffect(() => {
		if (activeWallet && onWalletProviderReadyRef.current) {
			// Create an EIP-1193 compatible provider wrapper using the wallet directly
			const provider = {
				request: async (args: { method: string; params?: unknown[] }) => {
					// For signing messages, use the wallet's signMessage method directly
					if (args.method === 'personal_sign' && args.params) {
						const [message] = args.params as [string, string];
						// Dynamic's wallet has a signMessage method
						return activeWallet.signMessage(message);
					}

					// For transactions and other methods, get the wallet client
					const walletClient = await activeWallet.connector?.getWalletClient();

					if (args.method === 'eth_sendTransaction' && args.params?.[0]) {
						if (!walletClient) {
							throw new Error('Wallet client not available for transaction');
						}
						const tx = args.params[0] as { to: string; value?: string; data?: string };
						return walletClient.sendTransaction({
							to: tx.to as `0x${string}`,
							value: tx.value ? BigInt(tx.value) : undefined,
							data: tx.data as `0x${string}` | undefined
						});
					}

					if (args.method === 'wallet_switchEthereumChain') {
						// Dynamic handles chain switching internally
						return null;
					}

					// For other methods, try the wallet client's transport
					if (walletClient) {
						return (walletClient.transport as { request?: (args: unknown) => Promise<unknown> })?.request?.(args);
					}

					throw new Error(`Method ${args.method} not supported`);
				}
			};
			onWalletProviderReadyRef.current?.(provider);
		} else if (!activeWallet && onWalletProviderReadyRef.current) {
			// Clear provider when wallet is not available
			onWalletProviderReadyRef.current(null);
		}
	}, [activeWallet]);

	// Handle login trigger
	useEffect(() => {
		if (triggerLogin && sdkHasLoaded && !user) {
			setShowAuthFlow(true);
		}
	}, [triggerLogin, sdkHasLoaded, user, setShowAuthFlow]);

	// Token refresh - periodically refresh access token
	useEffect(() => {
		if (!sdkHasLoaded || !user) return;

		// Emit initial token
		if (authToken) {
			onEventRef.current({
				type: 'token_refreshed',
				payload: { accessToken: authToken }
			});
		}

		// Set up periodic refresh check
		const intervalId = setInterval(() => {
			if (authToken) {
				onEventRef.current({
					type: 'token_refreshed',
					payload: { accessToken: authToken }
				});
			}
		}, TOKEN_REFRESH_INTERVAL);

		return () => clearInterval(intervalId);
	}, [sdkHasLoaded, user, authToken]);

	// Handle logout trigger
	useEffect(() => {
		if (triggerLogout && sdkHasLoaded && user) {
			handleLogOut();
		}
	}, [triggerLogout, sdkHasLoaded, user, handleLogOut]);

	// Handle export wallet trigger (Dynamic may not support this directly)
	useEffect(() => {
		if (triggerExportWallet && sdkHasLoaded && user && !isExportingRef.current) {
			if (!embeddedWallet) {
				console.warn(
					'[dynamic] Export wallet triggered but no embedded wallet found.'
				);
				onEventRef.current({
					type: 'error',
					payload: {
						error:
							'No embedded wallet available to export. This feature is only available for email/social login users with embedded wallets.'
					}
				});
				return;
			}
			// Dynamic's export wallet feature - may need dashboard configuration
			isExportingRef.current = true;
			// Note: Dynamic's embedded wallet export is handled through their UI
			// This might need to be triggered differently based on Dynamic's API
			console.log('[dynamic] Wallet export requested - check Dynamic dashboard for export options');
			isExportingRef.current = false;
		}
	}, [triggerExportWallet, sdkHasLoaded, user, embeddedWallet]);

	// Handle send transaction trigger
	useEffect(() => {
		if (triggerSendTransaction && activeWallet) {
			(async () => {
				try {
					const walletClient = await activeWallet.connector?.getWalletClient();
					if (!walletClient) {
						throw new Error('Wallet client not available');
					}

					const txHash = await walletClient.sendTransaction({
						to: triggerSendTransaction.to as `0x${string}`,
						value: triggerSendTransaction.value ? BigInt(triggerSendTransaction.value) : undefined,
						data: (triggerSendTransaction.data || '0x') as `0x${string}`
					});

					onEventRef.current({
						type: 'wallet',
						payload: { walletAddress: activeWallet.address }
					});
					console.log('[dynamic] Transaction sent:', txHash);
				} catch (error) {
					onEventRef.current({
						type: 'error',
						payload: { error: (error as Error).message }
					});
				}
			})();
		}
	}, [triggerSendTransaction, activeWallet]);

	// This component doesn't render anything visible
	return null;
}

// Main provider component
export function DynamicReactProvider(props: DynamicBridgeProps) {
	const { environmentId, ...bridgeProps } = props;

	const stableOnEvent = useCallback(
		(event: DynamicEventData) => {
			props.onEvent(event);
		},
		[props.onEvent]
	);

	if (!environmentId) {
		console.warn('[dynamic] No environment ID provided');
		return null;
	}

	return (
		<DynamicContextProvider
			settings={{
				environmentId,
				walletConnectors: [EthereumWalletConnectors]
			}}
		>
			<DynamicBridge {...bridgeProps} onEvent={stableOnEvent} />
		</DynamicContextProvider>
	);
}

export default DynamicReactProvider;

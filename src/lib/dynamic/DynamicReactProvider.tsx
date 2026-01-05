import React, { useEffect, useCallback, useRef } from 'react';
import {
	DynamicContextProvider,
	useDynamicContext,
	useUserWallets,
	getAuthToken,
	useEmbeddedReveal
} from '@dynamic-labs/sdk-react-core';
import { EthereumWalletConnectors, isEthereumWallet } from '@dynamic-labs/ethereum';

// Static logo URL for Dynamic branding - served from /static/logo.svg
export const ST0X_LOGO_URL = '/logo.svg';

// Event types for Svelte-React communication
export interface DynamicEventData {
	type: 'ready' | 'authenticated' | 'logout' | 'wallet' | 'error' | 'token_refreshed';
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
	const { sdkHasLoaded, user, primaryWallet, handleLogOut, setShowAuthFlow } = useDynamicContext();

	const userWallets = useUserWallets();
	const { initExportProcess } = useEmbeddedReveal();

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
			// Verify it's an Ethereum wallet
			if (!isEthereumWallet(activeWallet)) {
				console.warn('[dynamic] Active wallet is not an Ethereum wallet');
				onWalletProviderReadyRef.current(null);
				return;
			}

			// Base chain ID
			const BASE_CHAIN_ID = '8453';

			// Cache wallet and public clients for reuse (reset on each activeWallet change)
			let cachedWalletClient: Awaited<ReturnType<typeof activeWallet.getWalletClient>> | null =
				null;
			let cachedPublicClient: Awaited<ReturnType<typeof activeWallet.getPublicClient>> | null =
				null;
			let lastWalletClientAttempt = 0;

			const getClients = async () => {
				// Check if we have a valid auth token before attempting wallet operations
				const authToken = getAuthToken();
				if (!authToken) {
					console.warn('[dynamic] No auth token available for wallet operations');
					throw new Error('Authentication required. Please log in again.');
				}

				// Only retry wallet client if we don't have one or if it's been more than 5 seconds since last attempt
				const now = Date.now();
				if (
					!cachedWalletClient &&
					(now - lastWalletClientAttempt > 5000 || lastWalletClientAttempt === 0)
				) {
					lastWalletClientAttempt = now;
					try {
						console.log(
							'[dynamic] Getting wallet client for chain',
							BASE_CHAIN_ID,
							'auth token present:',
							!!authToken
						);
						cachedWalletClient = await activeWallet.getWalletClient(BASE_CHAIN_ID);
						console.log('[dynamic] Got wallet client:', cachedWalletClient ? 'success' : 'null');
					} catch (error) {
						console.error('[dynamic] Error getting wallet client:', error);
						// Clear the cached client so we can retry
						cachedWalletClient = null;
						throw error;
					}
				}
				if (!cachedPublicClient) {
					try {
						cachedPublicClient = await activeWallet.getPublicClient();
					} catch (error) {
						console.error('[dynamic] Error getting public client:', error);
						// Don't throw - public client is optional for transactions
					}
				}
				return { walletClient: cachedWalletClient, publicClient: cachedPublicClient };
			};

			// Create an EIP-1193 compatible provider wrapper using the wallet directly
			const provider = {
				request: async (args: { method: string; params?: unknown[] }) => {
					// For signing messages, use the wallet's signMessage method directly
					if (args.method === 'personal_sign' && args.params) {
						// Check auth token before signing
						const authToken = getAuthToken();
						if (!authToken) {
							console.warn('[dynamic] No auth token available for message signing');
							throw new Error('Authentication required. Please log in again.');
						}
						const [message] = args.params as [string, string];
						console.log('[dynamic] Signing message with embedded wallet');
						try {
							const result = await activeWallet.signMessage(message);
							console.log('[dynamic] Message signed successfully');
							return result;
						} catch (signError) {
							console.error('[dynamic] Error signing message:', signError);
							throw signError;
						}
					}

					// Handle chain switching - Dynamic manages this internally
					if (args.method === 'wallet_switchEthereumChain') {
						return null;
					}

					// For transactions, use the wallet client
					if (args.method === 'eth_sendTransaction' && args.params?.[0]) {
						console.log('[dynamic] Handling eth_sendTransaction');
						const { walletClient } = await getClients();
						if (!walletClient) {
							console.error('[dynamic] Wallet client is null after getClients()');
							throw new Error('Wallet client not available for transaction');
						}
						const tx = args.params[0] as {
							to: string;
							value?: string;
							data?: string;
							gas?: string;
						};
						console.log('[dynamic] Sending transaction to:', tx.to, 'gas:', tx.gas);
						try {
							const result = await walletClient.sendTransaction({
								to: tx.to as `0x${string}`,
								value: tx.value ? BigInt(tx.value) : undefined,
								data: tx.data as `0x${string}` | undefined,
								gas: tx.gas ? BigInt(tx.gas) : undefined
							});
							console.log('[dynamic] Transaction sent successfully:', result);
							return result;
						} catch (txError) {
							console.error('[dynamic] Transaction failed:', txError);
							throw txError;
						}
					}

					// For read methods, try the public client first (better RPC support)
					const readMethods = [
						'eth_chainId',
						'eth_blockNumber',
						'eth_getBalance',
						'eth_getTransactionCount',
						'eth_call',
						'eth_estimateGas',
						'eth_gasPrice',
						'eth_getTransactionReceipt'
					];
					if (readMethods.includes(args.method)) {
						try {
							const { publicClient } = await getClients();
							if (publicClient?.transport) {
								return await (
									publicClient.transport as { request?: (args: unknown) => Promise<unknown> }
								)?.request?.(args);
							}
						} catch {
							// Fall through to return null
						}
					}

					// For unsupported methods, return null silently
					// This prevents noisy errors for methods Dynamic doesn't support
					return null;
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

		// Helper to emit token
		const emitToken = async () => {
			const token = getAuthToken();
			if (token) {
				onEventRef.current({
					type: 'token_refreshed',
					payload: { accessToken: token }
				});
			}
		};

		// Emit initial token
		emitToken();

		// Set up periodic refresh check
		const intervalId = setInterval(emitToken, TOKEN_REFRESH_INTERVAL);

		return () => clearInterval(intervalId);
	}, [sdkHasLoaded, user]);

	// Handle logout trigger
	useEffect(() => {
		if (triggerLogout && sdkHasLoaded && user) {
			handleLogOut();
		}
	}, [triggerLogout, sdkHasLoaded, user, handleLogOut]);

	// Handle export wallet trigger using Dynamic's useEmbeddedReveal hook
	useEffect(() => {
		if (triggerExportWallet && sdkHasLoaded && user && !isExportingRef.current) {
			if (!embeddedWallet) {
				console.warn('[dynamic] Export wallet triggered but no embedded wallet found.');
				onEventRef.current({
					type: 'error',
					payload: {
						error:
							'No embedded wallet available to export. This feature is only available for email/social login users with embedded wallets.'
					}
				});
				return;
			}

			isExportingRef.current = true;

			// Use Dynamic's initExportProcess to open the export UI
			initExportProcess()
				.then(() => {
					console.log('[dynamic] Wallet export process completed');
				})
				.catch((error) => {
					console.error('[dynamic] Wallet export failed:', error);
					onEventRef.current({
						type: 'error',
						payload: { error: (error as Error).message || 'Failed to export wallet' }
					});
				})
				.finally(() => {
					isExportingRef.current = false;
				});
		}
	}, [triggerExportWallet, sdkHasLoaded, user, embeddedWallet, initExportProcess]);

	// Handle send transaction trigger
	useEffect(() => {
		if (triggerSendTransaction && activeWallet && isEthereumWallet(activeWallet)) {
			(async () => {
				try {
					// Get wallet client for Base chain
					const walletClient = await activeWallet.getWalletClient('8453');
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
				walletConnectors: [EthereumWalletConnectors],
				// Log level for debugging (can be set to 'DEBUG' for troubleshooting)
				logLevel: 'WARN'
			}}
		>
			<DynamicBridge {...bridgeProps} onEvent={stableOnEvent} />
		</DynamicContextProvider>
	);
}

export default DynamicReactProvider;

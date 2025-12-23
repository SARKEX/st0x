import React, { useEffect, useRef, useCallback } from 'react';
import {
	DynamicContextProvider,
	useDynamicContext,
	useUserWallets,
	useEmbeddedReveal,
	getAuthToken
} from '@dynamic-labs/sdk-react-core';
import { EthereumWalletConnectors } from '@dynamic-labs/ethereum';

// Event types for Svelte-React communication
export interface DynamicEventData {
	type:
		| 'ready'
		| 'authenticated'
		| 'logout'
		| 'wallet'
		| 'error'
		| 'token_refreshed'
		| 'needs_wallet_creation';
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
}

// Token refresh interval (refresh every 50 minutes to be safe before 1 hour expiry)
const TOKEN_REFRESH_INTERVAL = 50 * 60 * 1000;

// Inner component that uses Dynamic hooks
function DynamicBridge({
	onEvent,
	onWalletProviderReady,
	triggerLogin,
	triggerLogout,
	triggerExportWallet
}: Omit<DynamicBridgeProps, 'environmentId'>) {
	const {
		sdkHasLoaded,
		user,
		primaryWallet,
		setShowAuthFlow,
		handleLogOut
	} = useDynamicContext();

	const userWallets = useUserWallets();
	const { initExportProcess } = useEmbeddedReveal();

	// Get embedded wallet if available
	const embeddedWallet = userWallets.find((w) => w.connector?.isEmbeddedWallet);

	// Get external wallet if available
	const externalWallet = userWallets.find((w) => !w.connector?.isEmbeddedWallet);

	// Refs to prevent multiple triggers
	const isExportingRef = useRef(false);
	const hasCheckedWalletRef = useRef(false);
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

		if (user && primaryWallet) {
			// Track that user became authenticated
			wasAuthenticatedRef.current = true;

			// Get email from user object
			const email = user.email;

			// Determine wallet type and address
			const walletAddress = primaryWallet.address;
			const walletType = embeddedWallet ? 'embedded' : 'external';

			onEventRef.current({
				type: 'authenticated',
				payload: {
					userId: user.userId,
					walletAddress,
					email,
					isAuthenticated: true,
					walletType
				}
			});
		} else if (!user && wasAuthenticatedRef.current) {
			// Only emit logout if user was previously authenticated (actual logout, not initial load)
			wasAuthenticatedRef.current = false;
			onEventRef.current({
				type: 'logout',
				payload: { isAuthenticated: false }
			});
		}
	}, [sdkHasLoaded, user, primaryWallet, embeddedWallet]);

	// Notify wallet changes (only when address actually changes)
	useEffect(() => {
		const walletAddress = primaryWallet?.address;
		if (walletAddress && walletAddress !== lastEmittedWalletRef.current) {
			lastEmittedWalletRef.current = walletAddress;
			onEventRef.current({
				type: 'wallet',
				payload: { walletAddress }
			});
		}
	}, [primaryWallet?.address]);

	// Expose wallet provider to Svelte when available
	useEffect(() => {
		if (primaryWallet && onWalletProviderReadyRef.current) {
			// Get the wallet client from Dynamic
			const connector = primaryWallet.connector;
			if (connector) {
				connector
					.getWalletClient()
					.then((walletClient: unknown) => {
						// Create a provider-like interface
						const provider = {
							request: async (args: { method: string; params?: unknown[] }) => {
								const client = walletClient as {
									request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
								};
								return client.request(args);
							}
						};
						onWalletProviderReadyRef.current?.(provider);
					})
					.catch((err: Error) => {
						console.error('[dynamic] Failed to get wallet client:', err);
						onWalletProviderReadyRef.current?.(null);
					});
			}
		} else if (!primaryWallet && onWalletProviderReadyRef.current) {
			// Clear provider when wallet is not available
			onWalletProviderReadyRef.current(null);
		}
	}, [primaryWallet]);

	// Handle login trigger
	useEffect(() => {
		if (triggerLogin && sdkHasLoaded && !user) {
			setShowAuthFlow(true);
		}
	}, [triggerLogin, sdkHasLoaded, user, setShowAuthFlow]);

	// Detect users who are authenticated but don't have a wallet (needs fallback creation)
	useEffect(() => {
		// Reset the check flag on logout
		if (!user) {
			hasCheckedWalletRef.current = false;
			return;
		}

		// Only check once per authentication session
		if (hasCheckedWalletRef.current) return;

		// If user already has a wallet, mark as checked
		if (primaryWallet) {
			hasCheckedWalletRef.current = true;
			return;
		}

		// Delay check to allow wallets to load from Dynamic
		const timeoutId = setTimeout(() => {
			if (sdkHasLoaded && user && !primaryWallet) {
				hasCheckedWalletRef.current = true;
				// User is authenticated but has no wallet - notify Svelte
				onEventRef.current({
					type: 'needs_wallet_creation',
					payload: {
						userId: user.userId,
						isAuthenticated: true
					}
				});
			} else if (primaryWallet) {
				hasCheckedWalletRef.current = true;
			}
		}, 2500);

		return () => clearTimeout(timeoutId);
	}, [sdkHasLoaded, user, primaryWallet]);

	// Token refresh - periodically refresh access token before it expires
	useEffect(() => {
		if (!sdkHasLoaded || !user) return;

		// Initial token fetch
		const fetchToken = async () => {
			try {
				const token = getAuthToken();
				if (token) {
					onEventRef.current({
						type: 'token_refreshed',
						payload: { accessToken: token }
					});
				}
			} catch (error) {
				console.error('[dynamic] Token refresh error:', error);
			}
		};

		// Fetch immediately on mount/auth change
		fetchToken();

		// Set up periodic refresh
		const intervalId = setInterval(fetchToken, TOKEN_REFRESH_INTERVAL);

		return () => clearInterval(intervalId);
	}, [sdkHasLoaded, user]);

	// Handle logout trigger
	useEffect(() => {
		if (triggerLogout && sdkHasLoaded && user) {
			handleLogOut();
		}
	}, [triggerLogout, sdkHasLoaded, user, handleLogOut]);

	// Handle export wallet trigger
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
							'No embedded wallet available to export. This feature is only available for email/social login users.'
					}
				});
				return;
			}
			// Set flag to prevent re-triggering
			isExportingRef.current = true;
			(async () => {
				try {
					await initExportProcess();
				} catch (error) {
					console.error('[dynamic] Export wallet error:', error);
					onEventRef.current({
						type: 'error',
						payload: { error: (error as Error).message || 'Failed to export wallet' }
					});
				} finally {
					isExportingRef.current = false;
				}
			})();
		}
	}, [triggerExportWallet, sdkHasLoaded, user, embeddedWallet, initExportProcess]);

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
				eventsCallbacks: {
					onAuthFlowClose: () => {
						// Auth flow was closed (user cancelled or completed)
					},
					onAuthFlowOpen: () => {
						// Auth flow opened
					},
					onAuthSuccess: () => {
						// Authentication successful
					},
					onLogout: () => {
						// User logged out
					}
				}
			}}
		>
			<DynamicBridge {...bridgeProps} onEvent={stableOnEvent} />
		</DynamicContextProvider>
	);
}

export default DynamicReactProvider;

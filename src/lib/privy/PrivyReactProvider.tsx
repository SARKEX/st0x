import React, { useEffect, useCallback, useRef } from 'react';
import { PrivyProvider, usePrivy, useWallets } from '@privy-io/react-auth';
import { base } from 'viem/chains';

// Event types for Svelte-React communication
export interface PrivyEventData {
	type: 'ready' | 'authenticated' | 'logout' | 'wallet' | 'error' | 'token_refreshed' | 'needs_wallet_creation';
	payload?: {
		userId?: string;
		walletAddress?: string;
		email?: string;
		isAuthenticated?: boolean;
		error?: string;
		// Smart wallet info
		smartWalletAddress?: string;
		eoaAddress?: string;
		walletType?: 'embedded' | 'smart' | 'eoa';
		// Access token for server-side verification
		accessToken?: string;
	};
}

interface PrivyBridgeProps {
	appId: string;
	onEvent: (event: PrivyEventData) => void;
	onWalletProviderReady?: (
		provider: {
			request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
		} | null
	) => void;
	triggerLogin?: boolean;
	triggerLogout?: boolean;
	triggerExportWallet?: boolean;
	triggerConnectWallet?: boolean; // For EOA -> Smart wallet flow
	triggerCreateWallet?: boolean; // Fallback wallet creation
	triggerSendTransaction?: {
		to: string;
		value: string;
		data?: string;
	} | null;
}

// Token refresh interval (refresh every 50 minutes to be safe before 1 hour expiry)
const TOKEN_REFRESH_INTERVAL = 50 * 60 * 1000;

// Inner component that uses Privy hooks
function PrivyBridge({
	onEvent,
	onWalletProviderReady,
	triggerLogin,
	triggerLogout,
	triggerExportWallet,
	triggerConnectWallet,
	triggerCreateWallet,
	triggerSendTransaction
}: Omit<PrivyBridgeProps, 'appId'>) {
	const { ready, authenticated, user, login, logout, exportWallet, connectWallet, createWallet, getAccessToken } = usePrivy();

	const { wallets } = useWallets();

	// Get embedded wallet (created by Privy for email/social login)
	const embeddedWallet = wallets.find((w) => w.walletClientType === 'privy');

	// Get smart wallet if available
	const smartWallet = wallets.find((w) => w.walletClientType === 'privy_smart_wallet');

	// Get connected external wallet (MetaMask, Rabby, etc.)
	const externalWallet = wallets.find(
		(w) => w.walletClientType !== 'privy' && w.walletClientType !== 'privy_smart_wallet'
	);

	// Refs to prevent multiple triggers
	const isExportingRef = useRef(false);
	const hasCheckedWalletRef = useRef(false);

	// Notify when ready
	useEffect(() => {
		if (ready) {
			onEvent({ type: 'ready' });
		}
	}, [ready, onEvent]);

	// Notify authentication state changes
	useEffect(() => {
		if (!ready) return;

		if (authenticated && user) {
			const email = user.email?.address;

			// Determine wallet type and addresses
			let walletAddress: string | undefined;
			let walletType: 'embedded' | 'smart' | 'eoa' | undefined;
			let smartWalletAddress: string | undefined;
			let eoaAddress: string | undefined;

			if (smartWallet) {
				// User connected with external wallet and has smart wallet
				walletType = 'smart';
				walletAddress = smartWallet.address;
				smartWalletAddress = smartWallet.address;
				eoaAddress = externalWallet?.address;
			} else if (embeddedWallet) {
				// User logged in with email/social - has embedded wallet
				walletType = 'embedded';
				walletAddress = embeddedWallet.address;
			} else if (externalWallet) {
				// User connected with external wallet but no smart wallet created yet
				walletType = 'eoa';
				walletAddress = externalWallet.address;
				eoaAddress = externalWallet.address;
			} else {
				walletAddress = user.wallet?.address;
			}

			onEvent({
				type: 'authenticated',
				payload: {
					userId: user.id,
					walletAddress,
					email,
					isAuthenticated: true,
					walletType,
					smartWalletAddress,
					eoaAddress
				}
			});
		} else if (!authenticated) {
			onEvent({
				type: 'logout',
				payload: { isAuthenticated: false }
			});
		}
	}, [
		ready,
		authenticated,
		user,
		embeddedWallet?.address,
		smartWallet?.address,
		externalWallet?.address,
		onEvent
	]);

	// Notify wallet changes
	useEffect(() => {
		if (embeddedWallet?.address) {
			onEvent({
				type: 'wallet',
				payload: { walletAddress: embeddedWallet.address }
			});
		}
	}, [embeddedWallet?.address, onEvent]);

	// Expose wallet provider to Svelte when available
	useEffect(() => {
		if (embeddedWallet && onWalletProviderReady) {
			// Get the Ethereum provider from the embedded wallet
			embeddedWallet
				.getEthereumProvider()
				.then((provider) => {
					onWalletProviderReady(provider);
				})
				.catch((err) => {
					console.error('[privy] Failed to get wallet provider:', err);
					onWalletProviderReady(null);
				});
		} else if (!embeddedWallet && onWalletProviderReady) {
			// Clear provider when wallet is not available
			onWalletProviderReady(null);
		}
	}, [embeddedWallet, onWalletProviderReady]);

	// Handle login trigger (email/social)
	useEffect(() => {
		if (triggerLogin && ready && !authenticated) {
			login();
		}
	}, [triggerLogin, ready, authenticated, login]);

	// Handle connect wallet trigger (EOA -> Smart wallet)
	useEffect(() => {
		if (triggerConnectWallet && ready && !authenticated) {
			connectWallet();
		}
	}, [triggerConnectWallet, ready, authenticated, connectWallet]);

	// Handle fallback wallet creation trigger
	// This is used when a user is authenticated but doesn't have an embedded wallet
	// (e.g., they closed the app before wallet creation finished)
	useEffect(() => {
		if (triggerCreateWallet && ready && authenticated && !embeddedWallet) {
			(async () => {
				try {
					await createWallet();
				} catch (error) {
					console.error('[privy] Fallback wallet creation error:', error);
					onEvent({
						type: 'error',
						payload: { error: (error as Error).message || 'Failed to create wallet' }
					});
				}
			})();
		}
	}, [triggerCreateWallet, ready, authenticated, embeddedWallet, createWallet, onEvent]);

	// Detect users who are authenticated but don't have a wallet (needs fallback creation)
	// Use a delay to allow wallets array to populate after authentication
	useEffect(() => {
		// Reset the check flag on logout
		if (!authenticated) {
			hasCheckedWalletRef.current = false;
			return;
		}

		// Only check once per authentication session
		if (hasCheckedWalletRef.current) return;

		// If user already has a wallet, mark as checked and don't show modal
		if (embeddedWallet || externalWallet || smartWallet) {
			hasCheckedWalletRef.current = true;
			return;
		}

		// Delay check to allow wallets to load from Privy
		const timeoutId = setTimeout(() => {
			if (ready && authenticated && user && !embeddedWallet && !externalWallet && !smartWallet) {
				hasCheckedWalletRef.current = true;
				// User is authenticated but has no wallet - notify Svelte to show fallback UI
				onEvent({
					type: 'needs_wallet_creation',
					payload: {
						userId: user.id,
						isAuthenticated: true
					}
				});
			}
		}, 1500); // Wait 1.5 seconds for wallets to load

		return () => clearTimeout(timeoutId);
	}, [ready, authenticated, user, embeddedWallet, externalWallet, smartWallet, onEvent]);

	// Token refresh - periodically refresh access token before it expires
	useEffect(() => {
		if (!ready || !authenticated) return;

		// Initial token fetch
		const fetchToken = async () => {
			try {
				const token = await getAccessToken();
				if (token) {
					onEvent({
						type: 'token_refreshed',
						payload: { accessToken: token }
					});
				}
			} catch (error) {
				console.error('[privy] Token refresh error:', error);
			}
		};

		// Fetch immediately on mount/auth change
		fetchToken();

		// Set up periodic refresh
		const intervalId = setInterval(fetchToken, TOKEN_REFRESH_INTERVAL);

		return () => clearInterval(intervalId);
	}, [ready, authenticated, getAccessToken, onEvent]);

	// Handle logout trigger
	useEffect(() => {
		if (triggerLogout && ready && authenticated) {
			logout();
		}
	}, [triggerLogout, ready, authenticated, logout]);

	// Handle export wallet trigger
	useEffect(() => {
		if (triggerExportWallet && ready && authenticated && !isExportingRef.current) {
			if (!embeddedWallet) {
				console.warn(
					'[privy] Export wallet triggered but no embedded wallet found. Available wallets:',
					wallets.map((w) => w.walletClientType)
				);
				onEvent({
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
					await exportWallet();
				} catch (error) {
					console.error('[privy] Export wallet error:', error);
					onEvent({
						type: 'error',
						payload: { error: (error as Error).message || 'Failed to export wallet' }
					});
				} finally {
					// Reset flag after export completes or fails
					isExportingRef.current = false;
				}
			})();
		}
	}, [triggerExportWallet, ready, authenticated]);

	// Handle send transaction trigger
	useEffect(() => {
		if (triggerSendTransaction && embeddedWallet) {
			(async () => {
				try {
					const provider = await embeddedWallet.getEthereumProvider();
					const txHash = await provider.request({
						method: 'eth_sendTransaction',
						params: [
							{
								from: embeddedWallet.address,
								to: triggerSendTransaction.to,
								value: triggerSendTransaction.value,
								data: triggerSendTransaction.data || '0x'
							}
						]
					});
					onEvent({
						type: 'wallet',
						payload: { walletAddress: embeddedWallet.address }
					});
					console.log('[privy] Transaction sent:', txHash);
				} catch (error) {
					onEvent({
						type: 'error',
						payload: { error: (error as Error).message }
					});
				}
			})();
		}
	}, [triggerSendTransaction, embeddedWallet, onEvent]);

	// This component doesn't render anything visible
	return null;
}

// Main provider component
export function PrivyReactProvider(props: PrivyBridgeProps) {
	const { appId, ...bridgeProps } = props;

	const stableOnEvent = useCallback(
		(event: PrivyEventData) => {
			props.onEvent(event);
		},
		[props.onEvent]
	);

	if (!appId) {
		console.warn('[privy] No app ID provided');
		return null;
	}

	return (
		<PrivyProvider
			appId={appId}
			config={{
				// Email and Google login via Privy
				loginMethods: ['email', 'google'],
				appearance: {
					theme: 'dark',
					accentColor: '#6366f1',
					logo: '/images/logo-privy.png'
				},
				embeddedWallets: {
					createOnLogin: 'users-without-wallets',
					showWalletUIs: true
				},
				// Enable smart wallets - users who connect EOA get a smart contract account
				externalWallets: {
					coinbaseWallet: {
						connectionOptions: 'smartWalletOnly'
					}
				},
				defaultChain: base,
				supportedChains: [base]
			}}
		>
			<PrivyBridge {...bridgeProps} onEvent={stableOnEvent} />
		</PrivyProvider>
	);
}

export default PrivyReactProvider;

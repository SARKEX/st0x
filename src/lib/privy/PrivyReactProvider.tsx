import React, { useEffect, useCallback } from 'react';
import { PrivyProvider, usePrivy, useWallets, useLoginWithOAuth, useConnectWallet } from '@privy-io/react-auth';
import { base } from 'viem/chains';

// Event types for Svelte-React communication
export interface PrivyEventData {
	type: 'ready' | 'authenticated' | 'logout' | 'wallet' | 'error';
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
	};
}

interface PrivyBridgeProps {
	appId: string;
	onEvent: (event: PrivyEventData) => void;
	triggerLogin?: boolean;
	triggerLogout?: boolean;
	triggerExportWallet?: boolean;
	triggerConnectWallet?: boolean; // For EOA -> Smart wallet flow
	triggerSendTransaction?: {
		to: string;
		value: string;
		data?: string;
	} | null;
}

// Inner component that uses Privy hooks
function PrivyBridge({
	onEvent,
	triggerLogin,
	triggerLogout,
	triggerExportWallet,
	triggerConnectWallet,
	triggerSendTransaction
}: Omit<PrivyBridgeProps, 'appId'>) {
	const {
		ready,
		authenticated,
		user,
		login,
		logout,
		exportWallet,
		connectWallet
	} = usePrivy();

	const { wallets } = useWallets();

	// Get embedded wallet (created by Privy for email/social login)
	const embeddedWallet = wallets.find((w) => w.walletClientType === 'privy');

	// Get smart wallet if available
	const smartWallet = wallets.find((w) => w.walletClientType === 'privy_smart_wallet');

	// Get connected external wallet (MetaMask, Rabby, etc.)
	const externalWallet = wallets.find((w) =>
		w.walletClientType !== 'privy' &&
		w.walletClientType !== 'privy_smart_wallet'
	);

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
	}, [ready, authenticated, user, embeddedWallet?.address, smartWallet?.address, externalWallet?.address, onEvent]);

	// Notify wallet changes
	useEffect(() => {
		if (embeddedWallet?.address) {
			onEvent({
				type: 'wallet',
				payload: { walletAddress: embeddedWallet.address }
			});
		}
	}, [embeddedWallet?.address, onEvent]);

	// Handle login trigger (email/social)
	useEffect(() => {
		if (triggerLogin && ready && !authenticated) {
			login();
		}
	}, [triggerLogin, ready, authenticated, login]);

	// Handle connect wallet trigger (EOA -> Smart wallet)
	useEffect(() => {
		if (triggerConnectWallet && ready && !authenticated) {
			// Use connectWallet to trigger wallet connection flow
			connectWallet();
		}
	}, [triggerConnectWallet, ready, authenticated, connectWallet]);

	// Handle logout trigger
	useEffect(() => {
		if (triggerLogout && ready && authenticated) {
			logout();
		}
	}, [triggerLogout, ready, authenticated, logout]);

	// Handle export wallet trigger
	useEffect(() => {
		if (triggerExportWallet && ready && authenticated && embeddedWallet) {
			exportWallet();
		}
	}, [triggerExportWallet, ready, authenticated, embeddedWallet, exportWallet]);

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
				// Enable wallet login alongside email/social for EOA -> Smart wallet flow
				loginMethods: ['email', 'google', 'twitter', 'discord', 'wallet'],
				appearance: {
					theme: 'dark',
					accentColor: '#6366f1',
					logo: '/images/logo-sidebar.svg'
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

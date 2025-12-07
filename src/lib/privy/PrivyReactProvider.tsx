import React, { useEffect, useCallback } from 'react';
import { PrivyProvider, usePrivy, useWallets } from '@privy-io/react-auth';
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
	};
}

interface PrivyBridgeProps {
	appId: string;
	onEvent: (event: PrivyEventData) => void;
	triggerLogin?: boolean;
	triggerLogout?: boolean;
	triggerExportWallet?: boolean;
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
	triggerSendTransaction
}: Omit<PrivyBridgeProps, 'appId'>) {
	const {
		ready,
		authenticated,
		user,
		login,
		logout,
		exportWallet
	} = usePrivy();

	const { wallets } = useWallets();

	// Get embedded wallet
	const embeddedWallet = wallets.find((w) => w.walletClientType === 'privy');

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
			const walletAddress = embeddedWallet?.address || user.wallet?.address;

			onEvent({
				type: 'authenticated',
				payload: {
					userId: user.id,
					walletAddress,
					email,
					isAuthenticated: true
				}
			});
		} else if (!authenticated) {
			onEvent({
				type: 'logout',
				payload: { isAuthenticated: false }
			});
		}
	}, [ready, authenticated, user, embeddedWallet?.address, onEvent]);

	// Notify wallet changes
	useEffect(() => {
		if (embeddedWallet?.address) {
			onEvent({
				type: 'wallet',
				payload: { walletAddress: embeddedWallet.address }
			});
		}
	}, [embeddedWallet?.address, onEvent]);

	// Handle login trigger
	useEffect(() => {
		if (triggerLogin && ready && !authenticated) {
			login();
		}
	}, [triggerLogin, ready, authenticated, login]);

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
				loginMethods: ['email', 'google', 'twitter', 'discord'],
				appearance: {
					theme: 'dark',
					accentColor: '#6366f1',
					logo: '/images/logo-sidebar.svg'
				},
				embeddedWallets: {
					createOnLogin: 'users-without-wallets',
					showWalletUIs: true
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

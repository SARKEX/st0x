import React, { useEffect, useCallback, useRef } from 'react';
import {
	DynamicContextProvider,
	useDynamicContext,
	useUserWallets,
	getAuthToken,
	useEmbeddedReveal
} from '@dynamic-labs/sdk-react-core';
import { EthereumWalletConnectors, isEthereumWallet } from '@dynamic-labs/ethereum';
import type { Address } from 'viem';

// Static logo URL for Dynamic branding - served from /static/logo.svg
export const ST0X_LOGO_URL = '/logo.svg';

/** Convert BigInts -> strings recursively (Dynamic WaaS typed-data compat) */
const convertBigIntsToString = (obj: any): any => {
	if (obj == null) return obj;
	if (typeof obj === 'bigint') return obj.toString();
	if (Array.isArray(obj)) return obj.map(convertBigIntsToString);
	if (typeof obj === 'object') {
		const out: any = {};
		for (const k of Object.keys(obj)) out[k] = convertBigIntsToString(obj[k]);
		return out;
	}
	return obj;
};

/** Avoid infinite "Awaiting confirmation" hangs */
const withTimeout = async <T,>(p: Promise<T>, ms = 30000): Promise<T> => {
	let t: any;
	const timeout = new Promise<T>((_, rej) => {
		t = setTimeout(() => rej(new Error(`Timed out after ${ms}ms`)), ms);
	});
	try {
		return await Promise.race([p, timeout]);
	} finally {
		clearTimeout(t);
	}
};

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

// Export DynamicSigner type for use in Svelte
export type { DynamicSigner };

interface DynamicSigner {
	signMessage: (args: { message: string }) => Promise<string>;
	signTransaction: (tx: unknown) => Promise<string>;
	signTypedData: (args: {
		domain: Record<string, unknown>;
		types: Record<string, Array<{ name: string; type: string }>>;
		primaryType: string;
		message: Record<string, unknown>;
	}) => Promise<string>;
	signAuthorization: (args: {
		contractAddress: string;
		chainId: number;
		nonce?: number;
	}) => Promise<{
		r: `0x${string}`;
		s: `0x${string}`;
		v?: bigint;
		yParity?: number;
	}>;
}

interface DynamicBridgeProps {
	environmentId: string;
	onEvent: (event: DynamicEventData) => void;
	onWalletProviderReady?: (
		provider: {
			request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
		} | null
	) => void;
	onSignerReady?: (signer: DynamicSigner | null) => void;
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
	onSignerReady,
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

	console.log('embeddedWallet : ', embeddedWallet);
	console.log('primaryWallet : ', primaryWallet);

	// Prefer a WaaS-capable wallet instance
	const candidateWallet = embeddedWallet || primaryWallet;
	const activeWallet = candidateWallet;

	// Refs to prevent multiple triggers
	const isExportingRef = useRef(false);
	const wasAuthenticatedRef = useRef(false);
	const hasEmittedReadyRef = useRef(false);
	const lastEmittedWalletRef = useRef<string | null>(null);

	// Use refs for callbacks to avoid infinite loops from dependency changes
	const onEventRef = useRef(onEvent);
	const onWalletProviderReadyRef = useRef(onWalletProviderReady);
	const onSignerReadyRef = useRef(onSignerReady);

	// Keep refs up to date
	useEffect(() => {
		onEventRef.current = onEvent;
	}, [onEvent]);

	useEffect(() => {
		onWalletProviderReadyRef.current = onWalletProviderReady;
	}, [onWalletProviderReady]);

	useEffect(() => {
		onSignerReadyRef.current = onSignerReady;
	}, [onSignerReady]);

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
			wasAuthenticatedRef.current = true;

			const email = user.email;
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
			wasAuthenticatedRef.current = false;
			onEventRef.current({
				type: 'logout',
				payload: { isAuthenticated: false }
			});
		}
	}, [sdkHasLoaded, user, activeWallet?.address, embeddedWallet]);

	// Notify wallet changes
	useEffect(() => {
		if (activeWallet?.address && activeWallet.address !== lastEmittedWalletRef.current) {
			lastEmittedWalletRef.current = activeWallet.address;
			onEventRef.current({
				type: 'wallet',
				payload: { walletAddress: activeWallet.address }
			});
		}
	}, [activeWallet?.address]);

	/**
	 * Build and expose a hardened signer wrapper for:
	 * - EIP-712 permits (signTypedData)
	 * - EIP-7702 authorizations (signAuthorization)
	 */
	useEffect(() => {
		if (!activeWallet || !isEthereumWallet(activeWallet)) {
			onSignerReadyRef.current?.(null);
			return;
		}
		if (!onSignerReadyRef.current) {
			console.warn('[dynamic] onSignerReady callback not available');
			return;
		}

		const setupSigner = async () => {
			try {
				if (!activeWallet.connector) {
					console.warn('[dynamic] No connector available on wallet');
					onSignerReadyRef.current?.(null);
					return;
				}

				// WaaS connector shape
				const connector = activeWallet.connector as {
					setActiveAccount?: (address: Address) => void;
					getSigner?: () => Promise<{
						signMessage?: (args: { message: string }) => Promise<string>;
						signTransaction?: (tx: unknown) => Promise<string>;
						signTypedData?: (args: {
							domain: Record<string, unknown>;
							types: Record<string, Array<{ name: string; type: string }>>;
							primaryType: string;
							message: Record<string, unknown>;
						}) => Promise<string>;
						signAuthorization?: (args: {
							contractAddress: string;
							chainId: number;
							nonce?: number;
						}) => Promise<{
							r: `0x${string}`;
							s: `0x${string}`;
							v?: bigint;
							yParity?: number;
						}>;
					}>;
				};

				if (!connector?.setActiveAccount || !connector?.getSigner) {
					console.warn('[dynamic] Wallet connector does not support WaaS signer');
					onSignerReadyRef.current?.(null);
					return;
				}

				const address = activeWallet.address as Address;

				console.log('[dynamic] Calling setActiveAccount', address);
				connector.setActiveAccount(address);

				const dynamicSigner = await connector.getSigner();
				console.log('[dynamic] Got Dynamic signer:', {
					hasSignMessage: !!dynamicSigner?.signMessage,
					hasSignTransaction: !!dynamicSigner?.signTransaction,
					hasSignTypedData: !!dynamicSigner?.signTypedData,
					hasSignAuthorization: !!dynamicSigner?.signAuthorization
				});

				if (!dynamicSigner?.signAuthorization) {
					console.warn('[dynamic] Dynamic signer missing signAuthorization');
					onSignerReadyRef.current?.(null);
					return;
				}

				const signer: DynamicSigner = {
					async signMessage({ message }) {
						console.log('[dynamic] signMessage called');
						if (!dynamicSigner.signMessage) throw new Error('signMessage not available');
						return await dynamicSigner.signMessage({ message });
					},

					async signTransaction(tx) {
						console.log('[dynamic] ⚡ signTransaction called (should prompt)');
						if (!dynamicSigner.signTransaction) throw new Error('signTransaction not available');
						return await dynamicSigner.signTransaction(tx);
					},

					async signTypedData(args) {
						console.log('[dynamic] ⚡ signTypedData called (should prompt)', {
							primaryType: args.primaryType,
							typesKeys: Object.keys(args.types || {})
						});

						if (!dynamicSigner.signTypedData) throw new Error('signTypedData not available');

						// 1) Strip EIP712Domain if present
						const { _EIP712Domain, ...typesWithoutDomain } = (args.types || {}) as any;

						// 2) BigInt normalize
						const domain = convertBigIntsToString(args.domain || {});
						const message = convertBigIntsToString(args.message || {});

						// 3) Normalize chainId (number is safest for WaaS)
						if ((domain as any)?.chainId != null) {
							(domain as any).chainId = Number((domain as any).chainId);
						}

						const payload = {
							domain,
							types: typesWithoutDomain,
							primaryType: args.primaryType,
							message
						};

						// Helpful debug when stuck
						console.log('[dynamic] TypedData payload', payload);

						return await withTimeout(dynamicSigner.signTypedData(payload), 30000);
					},

					async signAuthorization(args) {
						console.log('[dynamic] ⚡ signAuthorization called (should prompt)', args);
						if (!dynamicSigner.signAuthorization)
							throw new Error('signAuthorization not available');
						return await dynamicSigner.signAuthorization(args);
					}
				};

				onSignerReadyRef.current?.(signer);
				console.log('[dynamic] Signer exposed to Svelte');
			} catch (e) {
				console.error('[dynamic] Failed to setup signer:', e);
				onSignerReadyRef.current?.(null);
			}
		};

		setupSigner().catch((e) => {
			console.error('[dynamic] Unhandled setupSigner error:', e);
			onSignerReadyRef.current?.(null);
		});
	}, [activeWallet]);

	/**
	 * Expose an EIP-1193 provider wrapper.
	 * IMPORTANT: route eth_signTypedData_v4 through Dynamic signer (NOT walletClient.signTypedData)
	 */
	useEffect(() => {
		if (!activeWallet || !onWalletProviderReadyRef.current) {
			onWalletProviderReadyRef.current?.(null);
			return;
		}

		if (!isEthereumWallet(activeWallet)) {
			console.warn('[dynamic] Active wallet is not an Ethereum wallet');
			onWalletProviderReadyRef.current(null);
			return;
		}

		const BASE_CHAIN_ID = '8453';

		let cachedWalletClient: Awaited<ReturnType<typeof activeWallet.getWalletClient>> | null = null;
		let cachedPublicClient: Awaited<ReturnType<typeof activeWallet.getPublicClient>> | null = null;
		let lastWalletClientAttempt = 0;

		const getClients = async () => {
			const authToken = getAuthToken();
			if (!authToken) throw new Error('Authentication required. Please log in again.');

			const now = Date.now();
			if (
				!cachedWalletClient &&
				(now - lastWalletClientAttempt > 5000 || lastWalletClientAttempt === 0)
			) {
				lastWalletClientAttempt = now;
				cachedWalletClient = await activeWallet.getWalletClient(BASE_CHAIN_ID);
			}
			if (!cachedPublicClient) {
				try {
					cachedPublicClient = await activeWallet.getPublicClient();
				} catch {
					// optional
				}
			}

			return { walletClient: cachedWalletClient, publicClient: cachedPublicClient };
		};

		const provider = {
			request: async (args: { method: string; params?: unknown[] }) => {
				// personal_sign
				if (args.method === 'personal_sign' && args.params) {
					const authToken = getAuthToken();
					if (!authToken) throw new Error('Authentication required. Please log in again.');

					const [message] = args.params as [string, string];
					return await activeWallet.signMessage(message);
				}

				// Dynamic manages switching internally
				if (args.method === 'wallet_switchEthereumChain') return null;

				// eth_sendTransaction
				if (args.method === 'eth_sendTransaction' && args.params?.[0]) {
					const { walletClient } = await getClients();
					if (!walletClient) throw new Error('Wallet client not available for transaction');

					const tx = args.params[0] as { to: string; value?: string; data?: string; gas?: string };

					return await walletClient.sendTransaction({
						to: tx.to as `0x${string}`,
						value: tx.value ? BigInt(tx.value) : undefined,
						data: tx.data as `0x${string}` | undefined,
						gas: tx.gas ? BigInt(tx.gas) : undefined
					});
				}

				/**
				 * eth_signTypedData_v4
				 * Route via Dynamic WaaS signer (this fixes permit hangs)
				 */
				if (args.method === 'eth_signTypedData_v4' && args.params?.[1]) {
					console.log('[dynamic] Handling eth_signTypedData_v4 via Dynamic signer');

					if (!activeWallet.connector) throw new Error('No connector available on wallet');

					const connector = activeWallet.connector as {
						setActiveAccount?: (address: Address) => void;
						getSigner?: () => Promise<any>;
					};
					if (!connector?.setActiveAccount || !connector?.getSigner) {
						throw new Error('Not a WaaS wallet (no signer)');
					}

					// Ensure correct active account
					connector.setActiveAccount(activeWallet.address as Address);
					const dyn = await connector.getSigner();
					if (!dyn?.signTypedData) throw new Error('Dynamic signer missing signTypedData');

					const typedDataRaw = args.params[1] as any;
					const typedData =
						typeof typedDataRaw === 'string' ? JSON.parse(typedDataRaw) : typedDataRaw;

					const { _EIP712Domain, ...typesWithoutDomain } = (typedData.types || {}) as any;
					const domain = convertBigIntsToString(typedData.domain || {});
					const message = convertBigIntsToString(typedData.message || {});
					if (domain?.chainId != null) {
						domain.chainId = Number(domain.chainId);
					}

					const payload = {
						domain,
						types: typesWithoutDomain,
						primaryType: typedData.primaryType,
						message
					};

					console.log('[dynamic] TypedData_v4 payload', payload);
					return await withTimeout(dyn.signTypedData(payload), 30000);
				}

				// Read methods -> public client transport if available
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
						if (publicClient?.transport?.request) {
							return await publicClient.transport.request(args);
						}
					} catch {
						// ignore
					}
				}

				return null;
			}
		};

		onWalletProviderReadyRef.current(provider);

		return () => {
			onWalletProviderReadyRef.current?.(null);
		};
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

		const emitToken = async () => {
			const token = getAuthToken();
			if (token) {
				onEventRef.current({
					type: 'token_refreshed',
					payload: { accessToken: token }
				});
			}
		};

		emitToken();
		const intervalId = setInterval(emitToken, TOKEN_REFRESH_INTERVAL);
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

			initExportProcess()
				.catch((error) => {
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
					const walletClient = await activeWallet.getWalletClient('8453');
					if (!walletClient) throw new Error('Wallet client not available');

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

	const stableOnSignerReady = useCallback(
		(signer: DynamicSigner | null) => {
			props.onSignerReady?.(signer);
		},
		[props.onSignerReady]
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
				logLevel: 'WARN'
			}}
		>
			<DynamicBridge {...bridgeProps} onEvent={stableOnEvent} onSignerReady={stableOnSignerReady} />
		</DynamicContextProvider>
	);
}

export default DynamicReactProvider;

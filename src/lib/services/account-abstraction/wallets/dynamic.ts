/**
 * Dynamic Wallet Integration for Rhinestone
 *
 * Integrates Dynamic embedded wallets with Rhinestone smart accounts.
 * Follows the pattern from: https://docs.rhinestone.dev/smart-wallet/core/signers/dynamic
 *
 * Key flow:
 * 1. Get wallet client from Dynamic via the provider
 * 2. Use walletClientToAccount() to create a viem Account
 * 3. Pass this account to Rhinestone SDK as an ECDSA owner
 *
 * For EIP-7702 mode:
 * - Set accountType: '7702' when creating the Rhinestone account
 * - This upgrades the user's EOA to act as a smart account
 * - Preserves their existing address while adding smart account features
 */

import type {
	Address,
	Hex,
	WalletClient,
	Account,
	SignableMessage,
	TypedDataDefinition
} from 'viem';
import { createPublicClient, createWalletClient, custom } from 'viem';
import { toAccount } from 'viem/accounts';
import { get } from 'svelte/store';
import { type SupportedNetworkId, SUPPORTED_NETWORKS, CHAIN_CONFIG, AAError, AAErrorCode } from '../types';
import { dynamicSession, dynamicSigner, type DynamicSigner } from '$lib/stores/dynamicStore';
import { getDynamicWalletProvider } from '$lib/services/walletService';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if Dynamic wallet is available and ready
 */
export function isDynamicWalletReady(): boolean {
	const session = get(dynamicSession);
	const provider = getDynamicWalletProvider();
	return session !== null && provider !== null;
}

/**
 * Get the wallet address from Dynamic session
 */
export function getDynamicWalletAddress(): Address | null {
	const session = get(dynamicSession);
	return (session?.walletAddress as Address) ?? null;
}

/**
 * Check if using Dynamic embedded wallet (supports EIP-7702)
 */
export function isDynamicEmbeddedWallet(): boolean {
	const session = get(dynamicSession);
	return session?.walletType === 'embedded';
}

/**
 * Create a viem WalletClient from the Dynamic provider
 *
 * @param chainId - The network to create the client for
 * @returns WalletClient or null if Dynamic is not available
 */
export async function createDynamicWalletClient(
	chainId: SupportedNetworkId
): Promise<WalletClient | null> {
	const session = get(dynamicSession);
	const provider = getDynamicWalletProvider();

	if (!provider || !session?.walletAddress) {
		return null;
	}

	return createWalletClient({
		account: session.walletAddress as Address,
		chain: CHAIN_CONFIG[chainId],
		transport: custom(provider)
	});
}

/**
 * Result type for getDynamicAccountForRhinestone
 * Returns both the account and wallet client for flexible usage
 */
export interface DynamicAccountResult {
	account: Account;
	walletClient: WalletClient;
}

/**
 * Helper function to convert BigInt values to strings for Dynamic signer
 * Dynamic signer expects string values, not BigInt
 */
function convertBigIntsToString(obj: unknown): unknown {
	if (obj === null || obj === undefined) {
		return obj;
	}
	if (typeof obj === 'bigint') {
		return obj.toString();
	}
	if (Array.isArray(obj)) {
		return obj.map(convertBigIntsToString);
	}
	if (typeof obj === 'object') {
		const result: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(obj)) {
			result[key] = convertBigIntsToString(value);
		}
		return result;
	}
	return obj;
}

/**
 * Wait for the Dynamic signer to be available (with timeout)
 *
 * @param timeoutMs - Maximum time to wait in milliseconds (default: 5000ms)
 * @returns The signer if available, or null if timeout
 */
async function waitForDynamicSigner(timeoutMs: number = 5000): Promise<DynamicSigner | null> {
	const startTime = Date.now();

	while (Date.now() - startTime < timeoutMs) {
		const signer = get(dynamicSigner);
		if (signer) {
			console.log('[Dynamic Wallet] Signer available after', Date.now() - startTime, 'ms');
			return signer;
		}
		// Wait 100ms before checking again
		await new Promise((resolve) => setTimeout(resolve, 100));
	}

	console.warn('[Dynamic Wallet] Signer not available after', timeoutMs, 'ms timeout');
	return null;
}

/**
 * Create a viem Account from the Dynamic wallet for use with Rhinestone SDK
 *
 * This uses a custom viem account created with toAccount() that wraps the Dynamic signer.
 * This approach is required for proper EIP-7702 authorization signing.
 *
 * Key flow:
 * 1. Get the Dynamic signer from the store (set by React component)
 * 2. Wait for signer if not immediately available (up to 5 seconds)
 * 3. Create a custom viem Account using toAccount() with the signer's methods
 * 4. Pass this account to Rhinestone SDK as an ECDSA owner
 *
 * For EIP-7702 authorization signing:
 * - The signer's signAuthorization method is used directly
 * - This works around viem's limitation with JSON-RPC accounts
 *
 * @param chainId - Optional chain ID (defaults to Base)
 * @param returnWalletClient - If true, returns both account and wallet client
 * @param waitForSigner - If true, wait for signer to be available (default: true)
 * @returns Account object (or DynamicAccountResult if returnWalletClient is true)
 *
 * @example
 * ```ts
 * const account = await getDynamicAccountForRhinestone();
 * const rhinestoneAccount = await sdk.createAccount({
 *   owners: { type: 'ecdsa', accounts: [account] },
 *   accountType: '7702' // For EIP-7702 mode
 * });
 * ```
 *
 * @example
 * ```ts
 * // Get both account and wallet client for authorization signing
 * const { account, walletClient } = await getDynamicAccountForRhinestone(chainId, true);
 * ```
 */
export async function getDynamicAccountForRhinestone(
	chainId: SupportedNetworkId = SUPPORTED_NETWORKS.BASE,
	returnWalletClient: boolean = false,
	waitForSigner: boolean = true
): Promise<Account | DynamicAccountResult | null> {
	const session = get(dynamicSession);
	let signer = get(dynamicSigner);

	if (!session?.walletAddress) {
		throw new AAError('Dynamic wallet not available', AAErrorCode.WALLET_NOT_CONNECTED);
	}

	// --- helpers local to this function (safe drop-in) ---
	const withTimeout = async <T>(p: Promise<T>, ms = 30_000): Promise<T> => {
		let t: ReturnType<typeof setTimeout> | undefined;
		const timeout = new Promise<T>((_, rej) => {
			t = setTimeout(() => rej(new Error(`signTypedData timed out after ${ms}ms`)), ms);
		});
		try {
			return await Promise.race([p, timeout]);
		} finally {
			if (t) clearTimeout(t);
		}
	};

	const normalizeTypedDataForDynamic = (typedDataAny: unknown) => {
		const typedData = typedDataAny as {
			types?: Record<string, unknown>;
			domain?: Record<string, unknown>;
			message?: Record<string, unknown>;
			primaryType?: string;
		};
		// 1) Remove EIP712Domain if present (common Dynamic/WaaS edge case)
		const typesRecord = (typedData?.types || {}) as Record<string, unknown>;
		const { EIP712Domain: _, ...typesWithoutDomain } = typesRecord;

		// 2) Convert bigint -> string deeply in domain/message
		const domain = convertBigIntsToString(typedData?.domain || {}) as Record<string, unknown>;
		const message = convertBigIntsToString(typedData?.message || {}) as Record<string, unknown>;

		// 3) Normalize chainId (Dynamic often wants number/string, not bigint)
		if (domain.chainId != null) {
			try {
				domain.chainId = Number(domain.chainId);
			} catch {
				// ignore, keep as-is
			}
		}

		return {
			domain,
			types: typesWithoutDomain,
			primaryType: (typedData?.primaryType ?? '') as string,
			message
		};
	};

	// Wait for signer if not immediately available
	if (!signer && waitForSigner) {
		console.log('[Dynamic Wallet] Signer not immediately available, waiting...');
		signer = await waitForDynamicSigner(10_000);
	}

	if (!signer && waitForSigner) {
		console.warn(
			'[Dynamic Wallet] Signer still not available after waiting. React component may need to refresh signer.'
		);
	}

	// Prefer signer-based account (best for EIP-7702 + typed data)
	if (signer) {
		try {
			const address = session.walletAddress as Address;

			const account = toAccount({
				address,

				async signMessage({ message }: { message: SignableMessage }) {
					const messageStr =
						typeof message === 'string'
							? message
							: 'raw' in message
								? typeof message.raw === 'string'
									? message.raw
									: new TextDecoder().decode(message.raw)
								: String(message);

					return signer!.signMessage({ message: messageStr }) as Promise<Hex>;
				},

				async signTransaction(tx: unknown) {
					console.log('[Dynamic Wallet] ⚡ signTransaction called!', {
						txType: typeof tx,
						txKeys: tx && typeof tx === 'object' ? Object.keys(tx) : 'N/A'
					});

					if (!signer!.signTransaction) {
						throw new Error('signTransaction not available on Dynamic signer');
					}

					try {
						const result = await signer!.signTransaction(tx);
						return result as Hex;
					} catch (error) {
						const errorMsg = error instanceof Error ? error.message : String(error);
						if (
							errorMsg.toLowerCase().includes('reject') ||
							errorMsg.toLowerCase().includes('denied') ||
							errorMsg.toLowerCase().includes('user rejected')
						) {
							throw new AAError(
								'Transaction signing was rejected by user',
								AAErrorCode.AUTHORIZATION_REJECTED,
								{ originalError: error }
							);
						}
						throw error;
					}
				},

				async signTypedData<const T extends TypedDataDefinition | Record<string, unknown>>(
					typedData: T
				) {
					if (!signer!.signTypedData) {
						throw new Error('signTypedData not available on Dynamic signer');
					}

					const payload = normalizeTypedDataForDynamic(typedData);

					console.log('[Dynamic Wallet] signTypedData payload (normalized):', {
						primaryType: payload.primaryType,
						domain: payload.domain,
						typesKeys: Object.keys(payload.types || {})
					});

					try {
						const sig = await withTimeout(
							signer!.signTypedData(
								payload as {
									domain: Record<string, unknown>;
									types: Record<string, unknown>;
									primaryType: string;
									message: Record<string, unknown>;
								}
							),
							30_000
						);
						return sig as Hex;
					} catch (error) {
						console.error('[Dynamic Wallet] signTypedData failed:', error, { payload });
						throw error;
					}
				},

				async signAuthorization(authorization: {
					contractAddress?: Address;
					address?: Address;
					chainId: bigint | number;
					nonce?: bigint | number;
				}) {
					const contractAddress = authorization.contractAddress || authorization.address;
					if (!contractAddress) {
						throw new Error('No contract address provided for authorization');
					}

					// Get fresh signer (in case React re-initialized)
					let currentSigner = get(dynamicSigner);
					if (!currentSigner) currentSigner = await waitForDynamicSigner(5_000);

					if (!currentSigner) {
						throw new AAError(
							'Dynamic signer not available for authorization signing. Please reconnect wallet and try again.',
							AAErrorCode.WALLET_NOT_CONNECTED
						);
					}

					if (!currentSigner.signAuthorization) {
						throw new Error('signAuthorization not available on Dynamic signer');
					}

					try {
						const result = await currentSigner.signAuthorization({
							contractAddress: contractAddress as string,
							chainId: Number(authorization.chainId),
							nonce: authorization.nonce !== undefined ? Number(authorization.nonce) : undefined
						});

						return {
							chainId: Number(authorization.chainId),
							address: contractAddress as Address,
							nonce: authorization.nonce !== undefined ? Number(authorization.nonce) : 0,
							r: result.r,
							s: result.s,
							yParity: result.yParity ?? (result.v !== undefined ? (result.v === 0n ? 0 : 1) : 0)
						};
					} catch (error) {
						const errorMsg = error instanceof Error ? error.message : String(error);
						if (
							errorMsg.toLowerCase().includes('reject') ||
							errorMsg.toLowerCase().includes('denied') ||
							errorMsg.toLowerCase().includes('user rejected')
						) {
							throw new AAError(
								'Authorization signing was rejected by user',
								AAErrorCode.AUTHORIZATION_REJECTED,
								{ originalError: error }
							);
						}
						throw error;
					}
				}
			});

			const accountWithSignAuth = account as Account & {
				signAuthorization?: unknown;
			};
			console.log('[Dynamic Wallet] Created custom account using Dynamic signer:', {
				address: account.address,
				chainId,
				type: account.type,
				hasSignMessage: typeof account.signMessage === 'function',
				hasSignTransaction: typeof account.signTransaction === 'function',
				hasSignTypedData: typeof account.signTypedData === 'function',
				hasSignAuthorization: typeof accountWithSignAuth.signAuthorization === 'function'
			});

			// (Optional) keep your tests as-is; they’ll now use normalized typed data
			// Return both account and wallet client if requested
			if (returnWalletClient) {
				const walletClient = await createDynamicWalletClient(chainId);
				if (!walletClient) {
					throw new AAError(
						'Failed to create wallet client from Dynamic provider',
						AAErrorCode.WALLET_NOT_CONNECTED
					);
				}
				return { account, walletClient };
			}

			return account;
		} catch (error) {
			console.error('[Dynamic Wallet] Failed to create account with signer:', error);
			throw new AAError(
				`Failed to create Dynamic account: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				AAErrorCode.WALLET_NOT_CONNECTED,
				{ originalError: error }
			);
		}
	}

	// --- Fallback path unchanged (provider-based JSON-RPC) ---
	console.warn(
		'[Dynamic Wallet] No signer available after waiting, falling back to wallet client approach'
	);

	const provider = getDynamicWalletProvider();
	if (!provider) {
		throw new AAError(
			'Dynamic wallet provider not available. Please ensure the wallet is connected.',
			AAErrorCode.WALLET_NOT_CONNECTED
		);
	}

	try {
		const walletClient = await createDynamicWalletClient(chainId);
		if (!walletClient) {
			throw new AAError(
				'Failed to create wallet client from Dynamic provider',
				AAErrorCode.WALLET_NOT_CONNECTED
			);
		}

		const account = toAccount({
			address: session.walletAddress as Address,

			async signMessage({ message }: { message: SignableMessage }) {
				const messageStr =
					typeof message === 'string'
						? message
						: 'raw' in message
							? typeof message.raw === 'string'
								? message.raw
								: new TextDecoder().decode(message.raw)
							: String(message);

				return (await provider.request({
					method: 'personal_sign',
					params: [messageStr, session.walletAddress]
				})) as Hex;
			},

			async signTransaction() {
				throw new Error('Transaction signing requires Dynamic signer');
			},

			async signTypedData<const T extends TypedDataDefinition | Record<string, unknown>>(
				typedData: T
			) {
				// Also normalize here to avoid Dynamic JSON-RPC hanging on EIP712Domain/bigint
				const payload = normalizeTypedDataForDynamic(typedData);

				return (await provider.request({
					method: 'eth_signTypedData_v4',
					params: [session.walletAddress, JSON.stringify(payload)]
				})) as Hex;
			}
		});

		if (returnWalletClient) return { account, walletClient };
		return account;
	} catch (error) {
		console.error('[Dynamic Wallet] Failed to create account:', error);
		throw new AAError(
			`Failed to create Dynamic account: ${
				error instanceof Error ? error.message : 'Unknown error'
			}`,
			AAErrorCode.WALLET_NOT_CONNECTED,
			{ originalError: error }
		);
	}
}

/**
 * Create a public client for reading blockchain data
 */
export async function createDynamicPublicClient(chainId: SupportedNetworkId) {
	// Use createRpcTransport for automatic fallbacks and load balancing
	const { createRpcTransport } = await import('$lib/utils/rpc');
	return createPublicClient({
		chain: CHAIN_CONFIG[chainId],
		transport: createRpcTransport(chainId)
	});
}

/**
 * Check if EIP-7702 is supported for the current wallet
 *
 * EIP-7702 is available for:
 * - Dynamic embedded wallets (type: 'embedded')
 * - On networks that support EIP-7702 (post-Pectra upgrade)
 */
export function supportsEIP7702(): boolean {
	return isDynamicEmbeddedWallet();
}

/**
 * Sign a message with the Dynamic wallet
 */
export async function signMessage(message: string): Promise<Hex> {
	const provider = getDynamicWalletProvider();
	const session = get(dynamicSession);

	if (!provider || !session?.walletAddress) {
		throw new AAError('Dynamic wallet not available', AAErrorCode.WALLET_NOT_CONNECTED);
	}

	try {
		const signature = await provider.request({
			method: 'personal_sign',
			params: [message, session.walletAddress]
		});

		return signature as Hex;
	} catch (error) {
		throw new AAError(
			`Failed to sign message: ${error instanceof Error ? error.message : 'Unknown error'}`,
			AAErrorCode.WALLET_NOT_CONNECTED,
			{ originalError: error }
		);
	}
}

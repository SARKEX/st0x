	/**
	 * Unified wallet service that routes to Dynamic or wagmi based on auth method
	 */
	import { get } from 'svelte/store';
	import { wagmiConfig, signerAddress } from 'svelte-wagmi';
	import {
		sendTransaction as wagmiSendTransaction,
		signMessage as wagmiSignMessage,
		waitForTransactionReceipt as wagmiWaitForTransactionReceipt
	} from '@wagmi/core';
	import type { Account, Hash, Hex } from 'viem';
	import { authMethod } from '$lib/stores/authStore';
	import { dynamicWalletAddress } from '$lib/stores/dynamicStore';
	import { payFeesInStablecoin } from '$lib/stores';

	// Store for Dynamic wallet provider (set by React component)
	let dynamicWalletProvider: {
		request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
	} | null = null;

	/**
	 * Set the Dynamic wallet provider (called from React)
	 */
	export function setDynamicWalletProvider(
		provider: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } | null
	): void {
		dynamicWalletProvider = provider;
	}

	/**
	 * Get the current Dynamic wallet provider
	 */
	export function getDynamicWalletProvider(): typeof dynamicWalletProvider {
		return dynamicWalletProvider;
	}

	// Retry wrapper for RPC calls
	async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, delayMs = 1000): Promise<T> {
		let lastError: unknown;
		for (let attempt = 0; attempt < maxRetries; attempt++) {
			try {
				return await fn();
			} catch (error) {
				lastError = error;
				const errorMessage = String(error);
				if (
					errorMessage.includes('header not found') ||
					errorMessage.includes('block not found') ||
					(error as { code?: number })?.code === -32000
				) {
					if (attempt < maxRetries - 1) {
						await new Promise((resolve) => setTimeout(resolve, delayMs * Math.pow(2, attempt)));
						continue;
					}
				}
				throw error;
			}
		}
		throw lastError;
	}

	/** Chain ID to hex for wallet_switchEthereumChain */
	const CHAIN_ID_TO_HEX: Record<number, string> = {
		8453: '0x2105', // Base
		42161: '0xa4b1' // Arbitrum One
	};

	/**
	 * Send a transaction using the appropriate wallet.
	 * Gas estimation is delegated to the wallet itself.
	 * @param params.chainId - Optional. When set (e.g. 42161 for Arbitrum), send and pay gas on that chain. Defaults to Base (8453) for Dynamic + pay-in-USDC.
	 */
	export async function sendTransaction(params: {
		to: `0x${string}`;
		data?: Hex;
		value?: bigint;
		chainId?: number;
	  }): Promise<Hash> {
		const method = get(authMethod);
		const config = get(wagmiConfig);
	  
		if (method === 'dynamic') {
		  if (!dynamicWalletProvider) {
			throw new Error('Dynamic wallet provider not available');
		  }
	  
		  const fromAddress = get(dynamicWalletAddress);
		  if (!fromAddress) {
			throw new Error('Dynamic wallet address not available');
		  }
	  
		  const { SUPPORTED_NETWORKS } = await import('./account-abstraction/types');
		  const targetChainId = params.chainId ?? SUPPORTED_NETWORKS.BASE;
		  const chainIdHex = CHAIN_ID_TO_HEX[targetChainId] ?? `0x${targetChainId.toString(16)}`;
	  
		  const useStablecoinGas = get(payFeesInStablecoin);
		  if (useStablecoinGas) {
			const { isRhinestoneConfigured, getRhinestoneClient } = await import(
			  './account-abstraction/rhinestone/client'
			);
	  
			if (isRhinestoneConfigured()) {
			  const { getDynamicAccountForRhinestone } = await import(
				'./account-abstraction/wallets/dynamic'
			  );
	  
			  const walletAccount = await getDynamicAccountForRhinestone();
			  if (!walletAccount) {
				throw new Error('Failed to get wallet account for Rhinestone gas payment');
			  }
	  
			  const account: Account =
				'account' in (walletAccount as object)
				  ? (walletAccount as { account: Account }).account
				  : (walletAccount as Account);
	  
			  const rhinestoneClient = getRhinestoneClient();
	  
			  try {
				const result = await rhinestoneClient.executeSameChainTransaction(
				  {
					chainId: targetChainId as import('./account-abstraction/types').SupportedNetworkId,
					calls: [
					  {
						to: params.to,
						value: params.value ?? 0n,
						data: params.data ?? '0x'
					  }
					]
				  },
				  account,
				  'USDC'
				);
	  
				return result.txHash;
			  } catch (e) {
				const msg = (e as Error)?.message ?? String(e);
	  
				// Soft-success: Rhinestone executed but didn't give us txHash yet (common on Arbitrum)
				const isHashMissing =
				  msg.toLowerCase().includes('transaction hash was not returned') ||
				  msg.toLowerCase().includes('may have succeeded') ||
				  msg.toLowerCase().includes('intentid');
	  
				if (isHashMissing) {
				  // Preserve intentId in the thrown message so UI can show it / user can verify later
				  // Your modal already treats "may have succeeded" / "transaction hash was not returned" as soft-success.
				  throw new Error(
					`transaction hash was not returned (may have succeeded). ${msg}`
				  );
				}
	  
				// Any other error should behave like a real failure
				throw e instanceof Error ? e : new Error(msg);
			  }
			}
		  }
	  
		  // Switch wallet to target chain before sending
		  try {
			await dynamicWalletProvider!.request({
			  method: 'wallet_switchEthereumChain',
			  params: [{ chainId: chainIdHex }]
			});
		  } catch {
			// ignore
		  }
	  
		  const txParams: Record<string, string> = {
			from: fromAddress,
			to: params.to
		  };
	  
		  if (params.data && params.data !== '0x') {
			txParams.data = params.data;
		  }
	  
		  if (params.value && params.value > 0n) {
			txParams.value = `0x${params.value.toString(16)}`;
		  }
	  
		  try {
			const txHash = await withRetry(async () => {
			  const result = await dynamicWalletProvider!.request({
				method: 'eth_sendTransaction',
				params: [txParams]
			  });
			  return result as Hash;
			});
	  
			return txHash;
		  } catch (error) {
			console.error('[walletService] Dynamic transaction error:', error);
			const errorMessage = (error as Error)?.message || 'Transaction failed';
			throw new Error(errorMessage);
		  }
		} else if (method === 'wallet') {
		  if (!config) {
			throw new Error('Wagmi config not available');
		  }
	  
		  const hash = await withRetry(() =>
			wagmiSendTransaction(config, {
			  to: params.to,
			  data: params.data,
			  value: params.value
			})
		  );
	  
		  return hash;
		} else {
		  throw new Error('No wallet connected');
		}
	  }
	  

	/**
	 * Wait for a transaction receipt
	 */
	export async function waitForTransaction(hash: Hash): Promise<void> {
		const config = get(wagmiConfig);
		if (!config) {
			throw new Error('Wagmi config not available');
		}

		// Use wagmi for receipt - works for both Dynamic and wagmi transactions
		await withRetry(() => wagmiWaitForTransactionReceipt(config, { hash }));
	}

	/**
	 * Sign a message using the appropriate wallet
	 */
	export async function signMessage(message: string): Promise<`0x${string}`> {
		const method = get(authMethod);

		if (method === 'dynamic') {
			// Use Dynamic's embedded wallet
			if (!dynamicWalletProvider) {
				throw new Error('Dynamic wallet provider not available');
			}

			const walletAddress = get(dynamicWalletAddress);
			if (!walletAddress) {
				throw new Error('Dynamic wallet address not available');
			}

			const signature = await dynamicWalletProvider.request({
				method: 'personal_sign',
				params: [message, walletAddress]
			});

			return signature as `0x${string}`;
		} else if (method === 'wallet') {
			// Use wagmi
			const config = get(wagmiConfig);
			if (!config) {
				throw new Error('Wagmi config not available');
			}

			const signature = await wagmiSignMessage(config, { message });
			return signature;
		} else {
			throw new Error('No wallet connected');
		}
	}

	/**
	 * Get the current signer address (unified)
	 */
	export function getSignerAddress(): string | null {
		const method = get(authMethod);

		if (method === 'dynamic') {
			return get(dynamicWalletAddress);
		} else if (method === 'wallet') {
			return get(signerAddress) ?? null;
		}

		return null;
	}

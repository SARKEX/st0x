import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
	method: 'dynamic' as 'dynamic' | 'wallet' | 'none',
	dynamicAddress: '0x1111111111111111111111111111111111111111',
	wagmiConfig: { id: 'config' }
}));
const mocks = vi.hoisted(() => ({
	wagmiSendTransaction: vi.fn(),
	wagmiWaitForTransactionReceipt: vi.fn(),
	wagmiSignMessage: vi.fn()
}));

vi.mock('$lib/stores/authStore', () => ({
	authMethod: {
		subscribe: (run: (value: typeof state.method) => void) => (run(state.method), () => undefined)
	}
}));
vi.mock('$lib/stores/dynamicStore', () => ({
	dynamicWalletAddress: {
		subscribe: (run: (value: string) => void) => (run(state.dynamicAddress), () => undefined)
	}
}));
vi.mock('svelte-wagmi', () => ({
	wagmiConfig: {
		subscribe: (run: (value: typeof state.wagmiConfig) => void) => (
			run(state.wagmiConfig), () => undefined
		)
	},
	signerAddress: { subscribe: (run: (value: null) => void) => (run(null), () => undefined) }
}));
vi.mock('@wagmi/core', () => ({
	sendTransaction: mocks.wagmiSendTransaction,
	waitForTransactionReceipt: mocks.wagmiWaitForTransactionReceipt,
	signMessage: mocks.wagmiSignMessage
}));

import {
	sendTransaction,
	setDynamicWalletProvider,
	waitForTransaction
} from '$lib/services/walletService';

const HASH = `0x${'a'.repeat(64)}` as const;

describe('walletService chain binding', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		state.method = 'dynamic';
		mocks.wagmiSendTransaction.mockResolvedValue(HASH);
		mocks.wagmiWaitForTransactionReceipt.mockResolvedValue({ status: 'success' });
		setDynamicWalletProvider(null);
	});

	it('switches and verifies the requested Dynamic chain before submission', async () => {
		const request = vi.fn(async ({ method }: { method: string }) => {
			if (method === 'eth_chainId') return '0x2105';
			if (method === 'eth_sendTransaction') return HASH;
			return null;
		});
		setDynamicWalletProvider({ request });

		await expect(
			sendTransaction({
				to: '0x2222222222222222222222222222222222222222',
				chainId: 8453
			})
		).resolves.toBe(HASH);
		expect(request).toHaveBeenNthCalledWith(1, {
			method: 'wallet_switchEthereumChain',
			params: [{ chainId: '0x2105' }]
		});
		expect(request).toHaveBeenCalledWith({ method: 'eth_chainId' });
	});

	it('does not submit when Dynamic remains on a different chain', async () => {
		const request = vi.fn(async ({ method }: { method: string }) =>
			method === 'eth_chainId' ? '0xa' : null
		);
		setDynamicWalletProvider({ request });

		await expect(
			sendTransaction({
				to: '0x2222222222222222222222222222222222222222',
				chainId: 8453
			})
		).rejects.toThrow('Wallet did not switch to chain 8453');
		expect(request).not.toHaveBeenCalledWith(
			expect.objectContaining({ method: 'eth_sendTransaction' })
		);
	});

	it('pins wagmi submission and receipt polling to the caller chain', async () => {
		state.method = 'wallet';

		await sendTransaction({
			to: '0x2222222222222222222222222222222222222222',
			chainId: 10
		});
		await waitForTransaction(HASH, 10, { confirmations: 2 });

		expect(mocks.wagmiSendTransaction).toHaveBeenCalledWith(
			state.wagmiConfig,
			expect.objectContaining({ chainId: 10 })
		);
		expect(mocks.wagmiWaitForTransactionReceipt).toHaveBeenCalledWith(
			state.wagmiConfig,
			expect.objectContaining({ hash: HASH, chainId: 10, confirmations: 2 })
		);
	});
});

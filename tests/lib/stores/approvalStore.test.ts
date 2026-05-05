import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Address, Hex } from 'viem';
import type { Network } from '$lib/config/network';
import { TransactionStatus } from '$lib/stores/transactionShared';

// Mock @wagmi/core BEFORE importing the module under test so that
// readContract/sendTransaction/waitForTransactionReceipt resolve to spies.
// Use vi.hoisted because vi.mock factories are hoisted to the top of the file
// (above top-level `const` declarations) at test-runner setup time.
const { mockReadContract, mockSendTransaction, mockWaitForTransactionReceipt } = vi.hoisted(() => ({
	mockReadContract: vi.fn(),
	mockSendTransaction: vi.fn(),
	mockWaitForTransactionReceipt: vi.fn()
}));

vi.mock('@wagmi/core', () => ({
	readContract: mockReadContract,
	sendTransaction: mockSendTransaction,
	waitForTransactionReceipt: mockWaitForTransactionReceipt
}));

import {
	ensureAllowance,
	APPROVAL_TX_CONFIRMATIONS
} from '$lib/stores/approvalStore';

const TOKEN: Address = '0x000000000000000000000000000000000000aaaa';
const OWNER: Address = '0x000000000000000000000000000000000000bbbb';
const SPENDER: Address = '0x000000000000000000000000000000000000cccc';

const FAKE_NETWORK = {
	chainId: 8453,
	id: 'base'
} as unknown as Network;

describe('approvalStore', () => {
	beforeEach(() => {
		mockReadContract.mockReset();
		mockSendTransaction.mockReset();
		mockWaitForTransactionReceipt.mockReset();
	});

	describe('APPROVAL_TX_CONFIRMATIONS', () => {
		it('is set to 2 per CONVENTIONS.md "Confirmations & Transaction Hygiene"', () => {
			expect(APPROVAL_TX_CONFIRMATIONS).toBe(2);
		});
	});

	describe('ensureAllowance', () => {
		it('returns immediately without sending an approve tx when allowance >= amount', async () => {
			mockReadContract.mockResolvedValueOnce(1000n);
			const setStatus = vi.fn();

			await ensureAllowance({
				token: { address: TOKEN },
				owner: OWNER,
				spender: SPENDER,
				amount: 500n,
				network: FAKE_NETWORK,
				setStatus
			});

			expect(mockReadContract).toHaveBeenCalledTimes(1);
			expect(mockSendTransaction).not.toHaveBeenCalled();
			expect(mockWaitForTransactionReceipt).not.toHaveBeenCalled();
			// CHECKING_ALLOWANCE is set first; PENDING_APPROVAL is NOT set on the early-return path.
			expect(setStatus).toHaveBeenCalledWith(TransactionStatus.CHECKING_ALLOWANCE);
			expect(setStatus).not.toHaveBeenCalledWith(TransactionStatus.PENDING_APPROVAL);
		});

		it('sends approve tx + waits with APPROVAL_TX_CONFIRMATIONS confirmations when allowance < amount', async () => {
			mockReadContract.mockResolvedValueOnce(0n);
			const fakeHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as Hex;
			mockSendTransaction.mockResolvedValueOnce(fakeHash);
			mockWaitForTransactionReceipt.mockResolvedValueOnce({ status: 'success' });
			const setStatus = vi.fn();

			await ensureAllowance({
				token: { address: TOKEN },
				owner: OWNER,
				spender: SPENDER,
				amount: 1_000_000n,
				network: FAKE_NETWORK,
				setStatus
			});

			expect(mockReadContract).toHaveBeenCalledTimes(1);
			expect(mockSendTransaction).toHaveBeenCalledTimes(1);
			expect(mockWaitForTransactionReceipt).toHaveBeenCalledTimes(1);

			// CHECKING_ALLOWANCE first, then PENDING_APPROVAL once we know allowance is insufficient.
			expect(setStatus).toHaveBeenNthCalledWith(1, TransactionStatus.CHECKING_ALLOWANCE);
			expect(setStatus).toHaveBeenNthCalledWith(2, TransactionStatus.PENDING_APPROVAL);

			// Confirmations passed to waitForTransactionReceipt MUST be APPROVAL_TX_CONFIRMATIONS (= 2).
			const waitArgs = mockWaitForTransactionReceipt.mock.calls[0][1];
			expect(waitArgs.confirmations).toBe(APPROVAL_TX_CONFIRMATIONS);
			expect(waitArgs.hash).toBe(fakeHash);
			expect(waitArgs.chainId).toBe(FAKE_NETWORK.chainId);

			// sendTransaction MUST be called against the token address with chainId set.
			const sendArgs = mockSendTransaction.mock.calls[0][1];
			expect(sendArgs.to).toBe(TOKEN);
			expect(sendArgs.chainId).toBe(FAKE_NETWORK.chainId);
			// data should be a hex string (encoded approve(spender, amount) calldata).
			expect(typeof sendArgs.data).toBe('string');
			expect(sendArgs.data.startsWith('0x')).toBe(true);
		});

		it('reads allowance for (owner -> spender) tuple via erc20Abi.allowance', async () => {
			mockReadContract.mockResolvedValueOnce(999_999n);
			const setStatus = vi.fn();

			await ensureAllowance({
				token: { address: TOKEN },
				owner: OWNER,
				spender: SPENDER,
				amount: 1n,
				network: FAKE_NETWORK,
				setStatus
			});

			const callArgs = mockReadContract.mock.calls[0][1];
			expect(callArgs.address).toBe(TOKEN);
			expect(callArgs.functionName).toBe('allowance');
			expect(callArgs.args).toEqual([OWNER, SPENDER]);
			expect(callArgs.chainId).toBe(FAKE_NETWORK.chainId);
		});
	});
});

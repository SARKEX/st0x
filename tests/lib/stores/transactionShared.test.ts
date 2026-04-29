import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import {
	TransactionStatus,
	transactionStoreInternal,
	classifyError,
	validateOrderbookAddress,
	isOrderbookTrusted,
	extractTransactionError,
	type TransactionMetadata,
	type MarketOrderSummary,
	type RaindexLink,
	type MultiTxProgress,
	type AssetTokenInfo
} from '$lib/stores/transactionShared';
import { TransactionErrorMessage } from '$lib/types/errors';
import type { Network } from '$lib/config/network';

describe('transactionShared leaf module', () => {
	describe('TransactionStatus enum', () => {
		it('exposes the canonical 7 status values', () => {
			expect(TransactionStatus.IDLE).toBe('Idle');
			expect(TransactionStatus.CHECKING_ALLOWANCE).toBe('Checking your approved spend...');
			expect(TransactionStatus.PENDING_WALLET).toBe('Waiting for wallet confirmation...');
			expect(TransactionStatus.PENDING_APPROVAL).toBe('Approving spend...');
			expect(TransactionStatus.PENDING_MULTI_TX_ACKNOWLEDGMENT).toBe(
				'Multiple transactions required'
			);
			expect(TransactionStatus.SUCCESS).toBe('Success! Transaction confirmed');
			expect(TransactionStatus.ERROR).toBe('Something went wrong');
		});
	});

	describe('transactionStoreInternal writable', () => {
		it('starts in IDLE state with empty error/hash', () => {
			transactionStoreInternal.reset();
			const state = get(transactionStoreInternal);
			expect(state.status).toBe(TransactionStatus.IDLE);
			expect(state.error).toBe('');
			expect(state.hash).toBe('');
			expect(state.data).toBeNull();
		});

		it('reset() returns the store to IDLE', () => {
			transactionStoreInternal.set({
				status: TransactionStatus.ERROR,
				error: 'boom',
				hash: '0xdeadbeef',
				data: null,
				functionName: '',
				message: '',
				multiTxAcknowledged: false,
				onMultiTxAcknowledge: null
			});
			expect(get(transactionStoreInternal).status).toBe(TransactionStatus.ERROR);
			transactionStoreInternal.reset();
			expect(get(transactionStoreInternal).status).toBe(TransactionStatus.IDLE);
		});
	});

	describe('classifyError', () => {
		it('classifies user-rejection messages', () => {
			expect(classifyError(new Error('User rejected the request'))).toBe('user_rejected');
			expect(classifyError(new Error('User denied transaction'))).toBe('user_rejected');
		});

		it('classifies funds/allowance/network errors', () => {
			expect(classifyError(new Error('insufficient funds for gas'))).toBe('insufficient_funds');
			expect(classifyError(new Error('exceeds allowance'))).toBe('insufficient_allowance');
			expect(classifyError(new Error('network disconnected'))).toBe('network_error');
			expect(classifyError(new Error('header not found'))).toBe('rpc_error');
		});

		it('returns unknown for unclassified messages', () => {
			expect(classifyError(new Error('something weird'))).toBe('unknown');
			expect(classifyError(undefined)).toBe('unknown');
		});
	});

	describe('isOrderbookTrusted / validateOrderbookAddress', () => {
		const network = {
			trustedOrderbooks: ['0xAbC0000000000000000000000000000000000001']
		} as unknown as Network;

		it('isOrderbookTrusted is case-insensitive', () => {
			expect(
				isOrderbookTrusted('0xabc0000000000000000000000000000000000001', network)
			).toBe(true);
			expect(
				isOrderbookTrusted('0x0000000000000000000000000000000000000bad', network)
			).toBe(false);
		});

		it('validateOrderbookAddress throws on untrusted address', () => {
			expect(() =>
				validateOrderbookAddress('0x0000000000000000000000000000000000000bad', network)
			).toThrow(/Untrusted orderbook contract/);
		});

		it('validateOrderbookAddress is silent on trusted address', () => {
			expect(() =>
				validateOrderbookAddress('0xabc0000000000000000000000000000000000001', network)
			).not.toThrow();
		});
	});

	describe('extractTransactionError', () => {
		it('prefers cause.details over message', () => {
			const err = { cause: { details: 'cause details' }, message: 'top message' };
			expect(extractTransactionError(err)).toBe('cause details');
		});

		it('falls back to message when no cause', () => {
			expect(extractTransactionError(new Error('plain message'))).toBe('plain message');
		});

		it('returns the supplied fallback when error is empty', () => {
			expect(extractTransactionError({}, TransactionErrorMessage.GENERIC)).toBe(
				TransactionErrorMessage.GENERIC
			);
		});
	});

	describe('interface shapes (compile-time only)', () => {
		// These just verify the type imports resolve. If the interfaces
		// were not exported the file would fail to compile.
		it('compiles when assigning conforming literals', () => {
			const md: TransactionMetadata = {};
			const summary: MarketOrderSummary = {
				inputAmount: 0n,
				inputTokenDecimals: 18,
				inputTokenSymbol: 'X',
				inputTokenAddress: '0x0',
				outputAmount: 0n,
				outputTokenDecimals: 18,
				outputTokenSymbol: 'Y',
				outputTokenAddress: '0x0',
				requestedInputAmount: 0n,
				ioRatio: 0,
				actualSlippage: 0n,
				isPartialFill: false
			};
			const link: RaindexLink = { url: 'https://example.com', text: 'Manage' };
			const progress: MultiTxProgress = { currentBatch: 0, totalBatches: 1 };
			const tokenInfo: AssetTokenInfo = { address: '0x0', symbol: 'X', decimals: 18 };
			expect(md).toBeDefined();
			expect(summary.isPartialFill).toBe(false);
			expect(link.url).toContain('https://');
			expect(progress.totalBatches).toBe(1);
			expect(tokenInfo.symbol).toBe('X');
		});
	});
});

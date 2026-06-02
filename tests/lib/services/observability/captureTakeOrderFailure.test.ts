/**
 * Behavioural unit tests for OBS-03 (Plan 01-07) — captureTakeOrderFailure.
 *
 * Covers:
 *  - Sentry sink is invoked with `failure_reason` tag + transcript in `extra`
 *  - console.error sink emits the `[take-order failed]` tag + JSON-stringified payload
 *  - Both sinks are wrapped in try/catch (T-07-04 — never throws back to caller)
 *  - All five `TakeOrderFailureReason` labels used at failWith call sites are accepted
 *  - TakeOrderTranscript shape carries the D-08 fields
 *
 * The global `vi.mock('@sentry/sveltekit', ...)` from `vitest-setup.ts` provides no-op
 * stubs; we re-import Sentry here and spy on `captureException` to assert call args.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Sentry from '@sentry/sveltekit';
import {
	captureTakeOrderFailure,
	type TakeOrderTranscript,
	type TakeOrderFailureReason
} from '$lib/services/observability/captureTakeOrderFailure';
import { getCurrentTradeId } from '$lib/services/observability/tradeId';

// OBS-09 (Plan 02-02 Task 2): mock the tradeId module so tests can drive
// `getCurrentTradeId()` to return either a uuid string or null.
vi.mock('$lib/services/observability/tradeId', () => ({
	getCurrentTradeId: vi.fn(() => null)
}));

function makeTranscript(overrides: Partial<TakeOrderTranscript> = {}): TakeOrderTranscript {
	return {
		subgraphQuoteHash: '0x' + 'a'.repeat(64),
		fullQuotePayload: [],
		onChainStateRead: {
			orderHash: '0xorderhash',
			vaultBalance: null,
			IOIndex: { input: 0, output: 1 }
		},
		ratio: '0x1',
		slippageBps: 100,
		priceCap: '12.34',
		side: 'ask',
		takerAction: 'Buy',
		userAction: 'Buy',
		mode: 'buyUpTo',
		walletAddress: '0xabcdef0123456789abcdef0123456789abcdef01',
		request_id: null,
		timestamp: '2026-04-29T00:00:00.000Z',
		...overrides
	};
}

describe('captureTakeOrderFailure', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.restoreAllMocks();
	});

	it('invokes Sentry.captureException once with failure_reason tag + transcript in extra', () => {
		const captureSpy = vi.spyOn(Sentry, 'captureException');
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		const transcript = makeTranscript();
		const err = new Error('No external orders available');

		captureTakeOrderFailure(err, transcript, 'no_quotes_available');

		expect(captureSpy).toHaveBeenCalledTimes(1);
		const [capturedErr, opts] = captureSpy.mock.calls[0] as [unknown, { tags?: Record<string, string>; extra?: Record<string, unknown> }];
		expect(capturedErr).toBe(err);
		expect(opts?.tags).toMatchObject({
			failure_reason: 'no_quotes_available',
			side: 'ask'
		});
		// `extra` must include the entire transcript (fullQuotePayload + onChainStateRead)
		expect(opts?.extra).toBeDefined();
		expect(opts?.extra).toMatchObject({
			subgraphQuoteHash: transcript.subgraphQuoteHash,
			ratio: transcript.ratio,
			slippageBps: transcript.slippageBps,
			priceCap: transcript.priceCap,
			side: 'ask',
			takerAction: 'Buy',
			userAction: 'Buy',
			mode: 'buyUpTo',
			walletAddress: transcript.walletAddress,
			timestamp: transcript.timestamp
		});
		// errorMessage should also be added (per impl line 85)
		expect(opts?.extra).toHaveProperty('errorMessage', 'No external orders available');
		expect(opts?.extra).toHaveProperty('onChainStateRead');

		// console.error sink also fires
		expect(consoleSpy).toHaveBeenCalled();
	});

	it('emits a `[take-order failed]` console.error line with JSON-stringified payload', () => {
		vi.spyOn(Sentry, 'captureException').mockImplementation(() => 'evt-id');
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		const transcript = makeTranscript({ side: 'bid', takerAction: 'Sell', userAction: 'Sell' });
		captureTakeOrderFailure(new Error('boom'), transcript, 'caught_exception');

		// Find the `[take-order failed]` invocation (there should be exactly one such line)
		const matchingCall = consoleSpy.mock.calls.find(
			(call) => call[0] === '[take-order failed]'
		);
		expect(matchingCall, '[take-order failed] line was not emitted').toBeDefined();
		expect(matchingCall).toHaveLength(2);

		const [tag, payload] = matchingCall as [string, string];
		expect(tag).toBe('[take-order failed]');
		expect(typeof payload).toBe('string');

		// Payload must be parseable JSON containing {ts, reason, ...transcript, error}
		const parsed = JSON.parse(payload);
		expect(parsed.ts).toBe(transcript.timestamp);
		expect(parsed.reason).toBe('caught_exception');
		expect(parsed.error).toBe('boom');
		expect(parsed.side).toBe('bid');
		expect(parsed.subgraphQuoteHash).toBe(transcript.subgraphQuoteHash);
		expect(parsed.onChainStateRead).toEqual(transcript.onChainStateRead);
	});

	it('does not throw back to caller when Sentry.captureException throws (T-07-04)', () => {
		vi.spyOn(Sentry, 'captureException').mockImplementation(() => {
			throw new Error('Sentry SDK exploded');
		});
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		const transcript = makeTranscript();

		expect(() =>
			captureTakeOrderFailure(new Error('orig'), transcript, 'no_walk_fills')
		).not.toThrow();

		// The Sentry-failure log line is emitted via console.error
		const sentryFailureLine = consoleSpy.mock.calls.find(
			(call) => typeof call[0] === 'string' && call[0].includes('[captureTakeOrderFailure] Sentry sink failed')
		);
		expect(sentryFailureLine).toBeDefined();

		// AND the second sink (console.error JSON line) still fires
		const takeOrderFailedLine = consoleSpy.mock.calls.find(
			(call) => call[0] === '[take-order failed]'
		);
		expect(takeOrderFailedLine).toBeDefined();
	});

	it('does not throw back to caller when console.error throws on the second sink', () => {
		vi.spyOn(Sentry, 'captureException').mockImplementation(() => 'evt-id');

		// Make console.error throw exactly once on the `[take-order failed]` invocation,
		// then no-op on the recovery call inside the catch block.
		let firstCall = true;
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
			if (firstCall && args[0] === '[take-order failed]') {
				firstCall = false;
				throw new Error('console exploded');
			}
		});

		const transcript = makeTranscript();

		expect(() =>
			captureTakeOrderFailure(new Error('orig'), transcript, 'aggregated_failed')
		).not.toThrow();

		// The serialization-failure log line should still be emitted (recovery path)
		const recoveryLine = consoleSpy.mock.calls.find(
			(call) =>
				typeof call[0] === 'string' &&
				call[0].includes('[captureTakeOrderFailure] failed to serialize transcript')
		);
		expect(recoveryLine).toBeDefined();
	});

	it('accepts all five TakeOrderFailureReason labels used at failWith call sites', () => {
		// Per 01-07-SUMMARY.md table: the five labels enumerated by the union must all
		// type-check and round-trip into the Sentry tag.
		const reasons: TakeOrderFailureReason[] = [
			'no_quotes_available',
			'no_walk_fills',
			'unhydrated_fills',
			'aggregated_failed',
			'caught_exception'
		];
		const captureSpy = vi.spyOn(Sentry, 'captureException');
		vi.spyOn(console, 'error').mockImplementation(() => {});

		for (const reason of reasons) {
			captureTakeOrderFailure(new Error('x'), makeTranscript(), reason);
		}

		expect(captureSpy).toHaveBeenCalledTimes(reasons.length);
		const tagsSeen = captureSpy.mock.calls.map(
			([, opts]) => (opts as { tags: { failure_reason: string } }).tags.failure_reason
		);
		expect(tagsSeen).toEqual(reasons);
	});

	describe('trade_id correlation tag (OBS-09 / Plan 02-02 Task 2)', () => {
		it('Test 1: includes trade_id in tags when getCurrentTradeId returns a string', () => {
			const fakeTradeId = '550e8400-e29b-41d4-a716-446655440000';
			vi.mocked(getCurrentTradeId).mockReturnValue(fakeTradeId);
			const captureSpy = vi.spyOn(Sentry, 'captureException');
			vi.spyOn(console, 'error').mockImplementation(() => {});

			captureTakeOrderFailure(new Error('x'), makeTranscript(), 'no_quotes_available');

			expect(captureSpy).toHaveBeenCalledTimes(1);
			const [, opts] = captureSpy.mock.calls[0] as [
				unknown,
				{ tags: Record<string, string> }
			];
			expect(opts.tags.trade_id).toBe(fakeTradeId);
			// Existing tags still present + unchanged (Test 4 regression guard)
			expect(opts.tags.failure_reason).toBe('no_quotes_available');
			expect(opts.tags.side).toBe('ask');
		});

		it('Test 2: omits trade_id key from tags when getCurrentTradeId returns null', () => {
			vi.mocked(getCurrentTradeId).mockReturnValue(null);
			const captureSpy = vi.spyOn(Sentry, 'captureException');
			vi.spyOn(console, 'error').mockImplementation(() => {});

			captureTakeOrderFailure(new Error('x'), makeTranscript(), 'no_quotes_available');

			const [, opts] = captureSpy.mock.calls[0] as [
				unknown,
				{ tags: Record<string, string> }
			];
			// Critical: literally no `trade_id` key — assert via Object.keys, not `== null`,
			// per acceptance criteria. The conditional spread `...(tradeId ? {...} : {})`
			// must produce an object with no `trade_id` property at all.
			expect(Object.keys(opts.tags)).not.toContain('trade_id');
		});

		it('Test 4: failure_reason and side tags unchanged regardless of trade_id presence', () => {
			vi.mocked(getCurrentTradeId).mockReturnValue('550e8400-e29b-41d4-a716-446655440000');
			const captureSpy = vi.spyOn(Sentry, 'captureException');
			vi.spyOn(console, 'error').mockImplementation(() => {});

			captureTakeOrderFailure(
				new Error('x'),
				makeTranscript({ side: 'bid' }),
				'aggregated_failed'
			);

			const [, opts] = captureSpy.mock.calls[0] as [
				unknown,
				{ tags: Record<string, string> }
			];
			expect(opts.tags.failure_reason).toBe('aggregated_failed');
			expect(opts.tags.side).toBe('bid');
		});
	});

	it('TakeOrderTranscript carries the D-08 fields (compile-time + runtime shape)', () => {
		// Behavioural shape check — every D-08 field MUST round-trip into the Sentry
		// `extra` payload so a dev can replay from a single log entry.
		const captureSpy = vi.spyOn(Sentry, 'captureException');
		vi.spyOn(console, 'error').mockImplementation(() => {});

		const transcript: TakeOrderTranscript = {
			subgraphQuoteHash: '0x' + 'd'.repeat(64),
			fullQuotePayload: [],
			onChainStateRead: {
				orderHash: '0xthe-order-hash',
				vaultBalance: null, // Phase 1 limitation per D-08
				IOIndex: { input: 2, output: 5 }
			},
			ratio: '0xratio',
			slippageBps: 250,
			priceCap: '99.99',
			side: 'ask',
			takerAction: 'Buy',
			userAction: 'Buy',
			mode: 'buyUpTo',
			walletAddress: '0x' + 'f'.repeat(40),
			request_id: 'req-42',
			timestamp: '2026-04-29T12:34:56.000Z'
		};

		captureTakeOrderFailure(new Error('x'), transcript, 'no_quotes_available');

		const [, opts] = captureSpy.mock.calls[0] as [unknown, { extra: Record<string, unknown> }];
		// Every D-08 field listed in the gap MUST be present in extra
		const requiredFields: (keyof TakeOrderTranscript)[] = [
			'subgraphQuoteHash',
			'fullQuotePayload',
			'onChainStateRead',
			'ratio',
			'slippageBps',
			'priceCap',
			'side',
			'takerAction',
			'userAction',
			'mode',
			'walletAddress',
			'request_id',
			'timestamp'
		];
		for (const field of requiredFields) {
			expect(opts.extra, `missing transcript field: ${field}`).toHaveProperty(field);
		}
		// onChainStateRead nested fields per D-08
		const ocsr = opts.extra.onChainStateRead as TakeOrderTranscript['onChainStateRead'];
		expect(ocsr).toHaveProperty('orderHash');
		expect(ocsr).toHaveProperty('vaultBalance');
		expect(ocsr).toHaveProperty('IOIndex');
		expect(ocsr.IOIndex).toHaveProperty('input');
		expect(ocsr.IOIndex).toHaveProperty('output');
	});
});

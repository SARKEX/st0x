/**
 * Behavioural unit tests for OBS-09 Plan 02-01 Task 1 — tradeId lifecycle module.
 *
 * Covers (per 02-01-PLAN.md):
 *  - Test 1: mintTradeId() returns a UUIDv4-shaped string
 *  - Test 2: mintTradeId() calls Sentry.setTag('trade_id', id) exactly once
 *  - Test 3: getCurrentTradeId() returns most recent id; null after clearTradeId()
 *  - Test 4: Two consecutive mintTradeId() calls yield distinct ids (Pitfall 2 regression guard)
 *  - Test 5: When Sentry.setTag throws, mintTradeId() still returns id and does NOT throw back
 *  - Test 6: clearTradeId() calls Sentry.setTag('trade_id', undefined)
 *  - Test 7: TRADE_ID_HEADER exported as the literal 'X-Trade-Id'
 *
 * The global vi.mock('@sentry/sveltekit', ...) in vitest-setup.ts provides no-op stubs;
 * we re-import Sentry here and spy on setTag.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Sentry from '@sentry/sveltekit';
import {
	mintTradeId,
	getCurrentTradeId,
	clearTradeId,
	TRADE_ID_HEADER
} from '$lib/services/observability/tradeId';

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('tradeId', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		clearTradeId();
		vi.clearAllMocks();
	});

	it('Test 1: mintTradeId() returns a UUIDv4-shaped string', () => {
		const id = mintTradeId();
		expect(id).toMatch(UUID_V4_RE);
	});

	it('Test 2: mintTradeId() calls Sentry.setTag once with the returned id', () => {
		const setTagSpy = vi.spyOn(Sentry, 'setTag');
		const id = mintTradeId();
		expect(setTagSpy).toHaveBeenCalledTimes(1);
		expect(setTagSpy).toHaveBeenCalledWith('trade_id', id);
	});

	it('Test 3: getCurrentTradeId() returns most recent id; null after clearTradeId()', () => {
		const id = mintTradeId();
		expect(getCurrentTradeId()).toBe(id);
		clearTradeId();
		expect(getCurrentTradeId()).toBeNull();
	});

	it('Test 4: two consecutive mintTradeId() calls yield distinct ids (Pitfall 2)', () => {
		const a = mintTradeId();
		const b = mintTradeId();
		expect(a).not.toBe(b);
		expect(a).toMatch(UUID_V4_RE);
		expect(b).toMatch(UUID_V4_RE);
	});

	it('Test 5: when Sentry.setTag throws, mintTradeId() still returns id and does NOT throw back', () => {
		vi.spyOn(Sentry, 'setTag').mockImplementation(() => {
			throw new Error('Sentry setTag exploded');
		});
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		let id: string | undefined;
		expect(() => {
			id = mintTradeId();
		}).not.toThrow();
		expect(id).toMatch(UUID_V4_RE);
		expect(getCurrentTradeId()).toBe(id);

		const errorLine = consoleSpy.mock.calls.find(
			(call) => typeof call[0] === 'string' && call[0].includes('[tradeId] Sentry.setTag failed')
		);
		expect(errorLine).toBeDefined();
	});

	it('Test 6: clearTradeId() calls Sentry.setTag(\'trade_id\', undefined)', () => {
		mintTradeId();
		const setTagSpy = vi.spyOn(Sentry, 'setTag');
		clearTradeId();
		expect(setTagSpy).toHaveBeenCalledTimes(1);
		expect(setTagSpy).toHaveBeenCalledWith('trade_id', undefined);
	});

	it('Test 7: TRADE_ID_HEADER exported as literal \'X-Trade-Id\'', () => {
		expect(TRADE_ID_HEADER).toBe('X-Trade-Id');
	});
});

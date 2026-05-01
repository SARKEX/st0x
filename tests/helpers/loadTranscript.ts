import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TakeOrderTranscript } from '$lib/services/observability/captureTakeOrderFailure';

/**
 * Replay-fixture loader: reads tests/fixtures/marketOrder/<scenario>.json
 * and types the result against the in-source TakeOrderTranscript schema
 * (alias kept as TakeOrderFailureTranscript for plan-level naming consistency).
 *
 * Fixtures themselves are captured by the operator during Plan 04-08;
 * this helper is staged ahead of those captures intentionally.
 */
export type TakeOrderFailureTranscript = TakeOrderTranscript;

export function loadTranscript(scenario: string): TakeOrderFailureTranscript {
	const path = resolve('tests/fixtures/marketOrder', `${scenario}.json`);
	const raw = readFileSync(path, 'utf-8');
	return JSON.parse(raw) as TakeOrderFailureTranscript;
}

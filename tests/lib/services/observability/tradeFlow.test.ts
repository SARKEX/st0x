import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Sentry from '@sentry/sveltekit';
import {
	addTradeFlowBreadcrumb,
	captureTradeFlowError,
	inferWalletFailureStage,
	type TradeFlowContext
} from '$lib/services/observability/tradeFlow';
import { HttpError } from '$lib/clients/http';

vi.mock('$lib/services/observability/tradeId', () => ({
	getCurrentTradeId: vi.fn(() => 'trade-from-scope')
}));

const context: TradeFlowContext = {
	stage: 'calldata',
	operation: 'prepare_limit',
	orderType: 'limit',
	orderSide: 'buy',
	tradeId: 'trade-explicit',
	chainId: 8453,
	assetSymbol: 'wtSTOX',
	paymentSymbol: 'USDC'
};

describe('tradeFlow Sentry reporter', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.restoreAllMocks();
	});

	it('captures handled failures with the critical-flow correlation tags and context', () => {
		const captureSpy = vi.spyOn(Sentry, 'captureException');
		const error = new Error('calldata generation failed');

		captureTradeFlowError(error, context);

		expect(captureSpy).toHaveBeenCalledTimes(1);
		const [captured, options] = captureSpy.mock.calls[0] as [
			unknown,
			{
				level: string;
				tags: Record<string, string>;
				contexts: Record<string, Record<string, unknown>>;
			}
		];
		expect(captured).toBe(error);
		expect(options.level).toBe('error');
		expect(options.tags).toMatchObject({
			feature: 'trade_flow',
			trade_stage: 'calldata',
			trade_operation: 'prepare_limit',
			order_type: 'limit',
			order_side: 'buy',
			trade_id: 'trade-explicit',
			chain_id: '8453',
			error_code: 'SWAP_CALLDATA_FAILED'
		});
		expect(options.contexts.trade_flow).toMatchObject({
			asset_symbol: 'wtSTOX',
			payment_symbol: 'USDC',
			error_code: 'SWAP_CALLDATA_FAILED'
		});
	});

	it('attaches API error code and request id to Sentry tags and context', () => {
		const captureSpy = vi.spyOn(Sentry, 'captureException');
		const error = new HttpError({
			status: 502,
			code: 'ORDERS_QUERY_FAILED',
			requestId: 'request-42',
			publicMessage: 'Order source unavailable',
			retryAfter: null
		});

		captureTradeFlowError(error, { ...context, stage: 'quote' });

		const options = captureSpy.mock.calls[0][1] as {
			tags: Record<string, string>;
			contexts: Record<string, Record<string, unknown>>;
		};
		expect(options.tags).toMatchObject({
			error_code: 'ORDERS_QUERY_FAILED',
			request_id: 'request-42',
			error_class: 'rpc_error'
		});
		expect(options.contexts.trade_flow).toMatchObject({
			error_code: 'ORDERS_QUERY_FAILED',
			request_id: 'request-42'
		});
	});

	it('downgrades expected user rejection and balance failures to warning severity', () => {
		const captureSpy = vi.spyOn(Sentry, 'captureException');

		captureTradeFlowError(new Error('User rejected the request'), {
			...context,
			stage: 'signing'
		});
		captureTradeFlowError(new Error('Insufficient balance'), {
			...context,
			stage: 'approval'
		});

		expect(
			captureSpy.mock.calls.map((call) => (call[1] as { level?: string } | undefined)?.level)
		).toEqual(['warning', 'warning']);
	});

	it('keeps diagnostic error class independent from the support code', () => {
		const captureSpy = vi.spyOn(Sentry, 'captureException');

		captureTradeFlowError(new Error('Stale oracle price'), {
			...context,
			stage: 'quote',
			orderType: 'market'
		});
		captureTradeFlowError(new Error('RPC network failed'), {
			...context,
			stage: 'approval'
		});

		const calls = captureSpy.mock.calls.map((call) => call[1] as { tags: Record<string, string> });
		expect(calls[0].tags).toMatchObject({
			error_class: 'stale_oracle',
			error_code: 'SWAP_QUOTE_FAILED'
		});
		expect(calls[1].tags).toMatchObject({
			error_class: 'rpc_error',
			error_code: 'UPSTREAM_UNAVAILABLE'
		});
	});

	it('distinguishes signing rejection from submission failures', () => {
		expect(inferWalletFailureStage(new Error('User denied transaction'))).toBe('signing');
		expect(inferWalletFailureStage(new Error('RPC broadcast failed'))).toBe('submission');
	});

	it('adds stage breadcrumbs with the same correlation data', () => {
		const breadcrumbSpy = vi.spyOn(Sentry, 'addBreadcrumb');

		addTradeFlowBreadcrumb(context, 'started');

		expect(breadcrumbSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				category: 'trade.flow',
				message: 'calldata:prepare_limit:started',
				data: expect.objectContaining({ trade_id: 'trade-explicit', chain_id: 8453 })
			})
		);
	});

	it('never lets a Sentry SDK failure break the trade flow', () => {
		vi.spyOn(Sentry, 'captureException').mockImplementation(() => {
			throw new Error('SDK unavailable');
		});
		vi.spyOn(console, 'error').mockImplementation(() => {});

		expect(() => captureTradeFlowError(new Error('original'), context)).not.toThrow();
	});
});

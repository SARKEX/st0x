import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import TradeErrorPanel from '$lib/components/trade/TradeErrorPanel.svelte';
import { createTradeError } from '$lib/services/tradeError';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('TradeErrorPanel', () => {
	it('renders the human message, stable code, and optional request reference', () => {
		const error = createTradeError('ORDERS_QUERY_FAILED', {
			stage: 'quote',
			requestId: 'request-42'
		});

		render(TradeErrorPanel, { error });

		expect(screen.getByRole('alert')).toHaveAttribute('data-error-code', 'ORDERS_QUERY_FAILED');
		expect(screen.getByText('Market data unavailable')).toBeInTheDocument();
		expect(screen.getByTestId('trade-error-code')).toHaveTextContent('ORDERS_QUERY_FAILED');
		expect(screen.getByTestId('trade-error-request-id')).toHaveTextContent('request-42');
	});

	it('copies a support-ready code, request id, and stage', async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: { writeText }
		});
		const error = createTradeError('UPSTREAM_UNAVAILABLE', {
			stage: 'submission',
			requestId: 'request-99'
		});

		render(TradeErrorPanel, { error });
		await fireEvent.click(screen.getByRole('button', { name: 'Copy error details' }));

		expect(writeText).toHaveBeenCalledWith(
			'Error code: UPSTREAM_UNAVAILABLE\nRequest ID: request-99\nStage: submission'
		);
		await waitFor(() => expect(screen.getByText('Copied')).toBeInTheDocument());
	});
});

describe('QuickTrade support error wiring', () => {
	const componentSource = readFileSync(
		resolve(process.cwd(), 'src/lib/components/QuickTrade.svelte'),
		'utf-8'
	);

	it('clears a prior execution failure for every form-context mutation', () => {
		for (const handler of [
			'handleTopInput',
			'handleBottomInput',
			'handleSwapDirection',
			'handleUsdcPercentClick',
			'handleTokenPercentClick'
		]) {
			const body = componentSource.match(new RegExp(`function ${handler}\\([^]*?\\n\\t}`))?.[0];
			expect(body, handler).toContain('clearTradeError()');
		}
	});

	it('uses the current structured error to build failure analytics', () => {
		expect(componentSource.match(/\.\.\.toTradeFailureAnalytics\(userFacingError\)/g)).toHaveLength(
			2
		);
		expect(componentSource).not.toMatch(/^\s*error:\s*tradeError/m);
	});
});

describe('TransactionModal support error wiring', () => {
	const componentSource = readFileSync(
		resolve(process.cwd(), 'src/lib/components/TransactionModal.svelte'),
		'utf-8'
	);

	it('renders structured transaction errors through the shared support panel', () => {
		expect(componentSource).toContain(
			"import TradeErrorPanel from '$lib/components/trade/TradeErrorPanel.svelte'"
		);
		expect(componentSource).toContain('<TradeErrorPanel error={$transactionStore.tradeError} />');
	});
});

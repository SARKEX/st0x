/**
 * Swap calldata API client for st0x.
 * POST /v1/swap/calldata: returns approval tx(s) first; after user submits approval,
 * call again with same params to get the actual market order calldata.
 */

import { env } from '$env/dynamic/public';

const SWAP_CALLDATA_URL = 'https://api.st0x.io/v1/swap/calldata';

export interface SwapCalldataParams {
	/** Token address the taker is putting in (spending) */
	inputToken: string;
	/** Token address the taker is taking out (receiving) */
	outputToken: string;
	/** Amount of output token desired, human-readable (e.g. "1.501223" for USDC) */
	outputAmount: string;
	/** Maximum IO ratio = input/output, decimal string (e.g. "1.5") */
	maximumIoRatio: string;
	/** Taker (user) address */
	taker: string;
}

export interface SwapCalldataApproval {
	token: string;
	spender: string;
	amount: string;
	symbol?: string;
	approvalData: string;
}

export interface SwapCalldataResponse {
	to: string;
	data: string;
	value: string;
	estimatedInput?: string;
	approvals: SwapCalldataApproval[];
}

function getAuthHeader(): string | null {
	const auth = env.PUBLIC_ST0X_SWAP_QUOTE_AUTH;
	return typeof auth === 'string' && auth ? auth : null;
}

/**
 * Fetches swap calldata from the st0x API.
 * First call returns approvals to execute; after user submits approval tx(s),
 * call again with the same params to get the actual swap calldata.
 */
export async function fetchSwapCalldata(
	params: SwapCalldataParams
): Promise<SwapCalldataResponse | null> {
	const auth = getAuthHeader();
	const headers: Record<string, string> = {
		accept: 'application/json',
		'Content-Type': 'application/json'
	};
	if (auth) {
		headers['Authorization'] = `Basic ${auth}`;
	}
	const res = await fetch(SWAP_CALLDATA_URL, {
		method: 'POST',
		headers,
		body: JSON.stringify({
			inputToken: params.inputToken,
			outputToken: params.outputToken,
			outputAmount: params.outputAmount,
			maximumIoRatio: params.maximumIoRatio,
			taker: params.taker
		})
	});
	if (!res.ok) return null;
	return (await res.json()) as SwapCalldataResponse;
}

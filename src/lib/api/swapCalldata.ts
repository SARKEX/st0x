/**
 * Swap calldata API client for st0x.
 * Uses server proxy POST /api/proxy-swap-calldata (which calls api.st0x.io/v1/swap/calldata).
 * First call returns approvals; after user submits approval, call again with same params to get the actual calldata.
 */

const PROXY_SWAP_CALLDATA_URL = '/api/proxy-swap-calldata';

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

/**
 * Fetches swap calldata via the server proxy (auth is applied server-side).
 * First call returns approvals to execute; after user submits approval tx(s),
 * call again with the same params to get the actual swap calldata.
 */
export async function fetchSwapCalldata(
	params: SwapCalldataParams
): Promise<SwapCalldataResponse | null> {
	const res = await fetch(PROXY_SWAP_CALLDATA_URL, {
		method: 'POST',
		headers: {
			accept: 'application/json',
			'Content-Type': 'application/json'
		},
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

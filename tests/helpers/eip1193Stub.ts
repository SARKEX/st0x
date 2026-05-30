// EIP-1193 stub source string for Playwright's page.addInitScript(). Returns the
// stub as a string because addInitScript evaluates source in browser context — it
// cannot import TypeScript directly.
//
// Why a thin RPC proxy and not a full in-browser signer:
// - Anvil's pre-funded accounts are unlocked → `eth_sign`,
//   `eth_signTypedData_v4`, `eth_sendTransaction` all work via the anvil RPC
//   directly. This eliminates the need to bundle secp256k1 in the page-init script.
// - The stub is grep-able, debuggable, and trivially adjustable when a future
//   phase adds Dynamic Labs or EIP-1271 coverage.
//
// CSP requirement: hooks.server.ts adds `http://127.0.0.1:8545` to `connect-src`
// when `process.env.E2E === '1'` (gated by globalSetup) so the in-browser fetch
// to the anvil RPC isn't blocked.

export interface Eip1193StubOptions {
	address: `0x${string}`;
	chainId?: number;
	rpcUrl?: string;
}

export function eip1193StubSource(opts: Eip1193StubOptions): string {
	const chainId = opts.chainId ?? 8453;
	const rpcUrl = opts.rpcUrl ?? 'http://127.0.0.1:8545';
	// Returns IIFE-wrapped source. Playwright runs this BEFORE any +page.svelte
	// script executes, so svelte-wagmi's `injected` connector finds window.ethereum
	// on first read.
	return `(() => {
        const ADDRESS = '${opts.address}';
        const CHAIN_ID_HEX = '0x${chainId.toString(16)}';
        const RPC_URL = '${rpcUrl}';
        const listeners = new Map();
        async function rawRpc(method, params) {
            const r = await fetch(RPC_URL, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: params || [] })
            });
            const j = await r.json();
            if (j.error) throw new Error(j.error.message || 'rpc error');
            return j.result;
        }
        window.ethereum = {
            isMetaMask: false,
            isConnected: () => true,
            request: async ({ method, params }) => {
                switch (method) {
                    case 'eth_chainId': return CHAIN_ID_HEX;
                    case 'eth_accounts':
                    case 'eth_requestAccounts': return [ADDRESS];
                    case 'personal_sign':
                        // params: [message, address] for personal_sign; anvil exposes
                        // eth_sign on unlocked accounts (param order: [address, message]).
                        return rawRpc('eth_sign', [ADDRESS, params[0]]);
                    case 'eth_signTypedData_v4':
                        // params: [address, typedDataJSON]
                        return rawRpc('eth_signTypedData_v4', [ADDRESS, params[1]]);
                    case 'eth_sendTransaction':
                        return rawRpc('eth_sendTransaction', params);
                    default:
                        return rawRpc(method, params);
                }
            },
            on: (event, fn) => {
                if (!listeners.has(event)) listeners.set(event, new Set());
                listeners.get(event).add(fn);
            },
            removeListener: (event, fn) => {
                listeners.get(event)?.delete(fn);
            }
        };
        // Fire chainChanged once so svelte-wagmi's reactive store latches the chain.
        setTimeout(() => {
            const set = listeners.get('chainChanged');
            if (set) set.forEach((fn) => fn(CHAIN_ID_HEX));
        }, 0);
    })();`;
}

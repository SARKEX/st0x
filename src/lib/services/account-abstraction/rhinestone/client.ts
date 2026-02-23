/**
 * Rhinestone SDK Client
 *
 * Wrapper around the Rhinestone SDK for cross-chain transactions, swaps,
 * and gas sponsorship. Rhinestone provides unified chain abstraction.
 *
 * EIP-7702 Support:
 * Rhinestone's Warp infrastructure supports EIP-7702 Smart EOAs, allowing
 * existing EOA users to gain smart account capabilities without migration.
 * When accountType is '7702', the SDK uses the user's existing EOA address.
 *
 * Key SDK methods:
 * - sdk.createAccount() - Create a smart account with ECDSA owners
 * - account.sendTransaction() - Execute cross-chain transactions with tokenRequests
 * - account.waitForExecution() - Wait for transaction completion
 *
 * References:
 * - https://docs.rhinestone.dev/home/concepts/smart-eoas-eip-7702
 */

import { RhinestoneSDK } from '@rhinestone/sdk';
import type {
	IntentRoute,
	IntentCost,
	AccountAccessList
} from '@rhinestone/sdk/dist/src/orchestrator/types';
import { getOrchestrator } from '@rhinestone/sdk/dist/src/orchestrator';
import {
	createPublicClient,
	encodeFunctionData,
	erc20Abi,
	getAbiItem,
	parseAbiItem,
	parseUnits,
	toFunctionSelector,
	type Address,
	type Chain,
	type Hex,
	type Account,
	type SignedAuthorizationList,
	type WalletClient
} from 'viem';
import {
	type RhinestoneConfig,
	type CrossChainSwapParams,
	type CrossChainSwapQuote,
	type OmnichainTransactionParams,
	type SupportedNetworkId,
	type SponsorshipConfig,
	type PaymentToken,
	SUPPORTED_NETWORKS,
	CHAIN_CONFIG,
	AAError,
	AAErrorCode
} from '../types';
import { getGasOracle } from './gasOracle';
import { env } from '$env/dynamic/public';
import { isDynamicEmbeddedWallet } from '../wallets/dynamic';
import { getPaymentTokensForNetwork } from '../tokens';
import { type Policy, type Session } from '@rhinestone/sdk';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

import { createRpcTransport } from '$lib/utils/rpc';

/**
 * Get token address by symbol and chain. Uses account-abstraction tokens so USDC (and other fee assets) resolve on Base, Arbitrum, etc.
 */
function resolveTokenAddress(symbol: string, chainId: number): `0x${string}` | undefined {
	const tokens = getPaymentTokensForNetwork(chainId as SupportedNetworkId);
	if (!tokens?.length) return undefined;

	const s = symbol.toUpperCase();
	const token = tokens.find((t) => t.symbol?.toUpperCase() === s);
	return token?.address as `0x${string}` | undefined;
}

function safeStringify(value: unknown) {
	return JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2);
}

// Type for Rhinestone account transaction params
// Supports both same-chain (chain) and cross-chain (sourceChains/targetChain)
/** Per-chain token amounts the orchestrator can treat as available (e.g. owner EOA balance for fee). */
type AuxiliaryFundsInput = { [chainId: number]: Record<Address, bigint> };

type RhinestoneTransactionParams =
	| {
			// Same-chain transaction format
			chain: Chain;
			calls: Array<{ to: Address; value: bigint; data: Hex }>;
			tokenRequests?: Array<{ address: Address; amount: bigint }>;
			feeAsset?: string;
			sourceAssets?: { [chainId: number]: string[] };
			eip7702InitSignature?: Hex;
			signers?: unknown;
			/** EOA/owner token balances so orchestrator can quote (e.g. pay gas in USDC when smart account holds 0). */
			auxiliaryFunds?: AuxiliaryFundsInput;
	  }
	| {
			// Cross-chain transaction format
			sourceChain?: Chain;
			sourceChains?: Chain[];
			targetChain: Chain;
			calls: Array<{ to: Address; value: bigint; data: Hex }>;
			tokenRequests?: Array<{ address: Address; amount: bigint }>;
			feeAsset?: string;
			sourceAssets?: { [chainId: number]: string[] };
			eip7702InitSignature?: Hex;
			signers?: unknown;
			auxiliaryFunds?: AuxiliaryFundsInput;
	  };

// Type for Rhinestone account (matching SDK types)
interface TransactionResult {
	type: 'intent';
	id: bigint;
	sourceChains?: number[];
	targetChain: number;
}

interface TransactionStatus {
	fill: {
		hash: Hex | undefined;
		chainId: number;
	};
	claims: {
		hash: Hex | undefined;
		chainId: number;
	}[];
}

interface Portfolio {
	chains: Array<{
		chainId: number;
		tokens: Array<{
			address: string;
			symbol: string;
			balance: string;
			decimals: number;
		}>;
	}>;
}

// Prepared transaction type for the 3-step flow
interface PreparedTransaction {
	intentRoute: {
		intentOp: unknown;
	};
	transaction: RhinestoneTransactionParams;
}

// Signed transaction type
interface SignedTransaction {
	intentRoute: {
		intentOp: unknown;
	};
	originSignatures: Hex[];
	destinationSignature: Hex;
	transaction: RhinestoneTransactionParams;
}

interface SessionDetails {
	nonces: bigint[];
	hashesAndChainIds: Array<{ chainId: bigint; sessionDigest: Hex }>;
	data: unknown;
}

interface SessionEnableBundle {
	sessions: Session[];
	enableSignature: Hex;
	hashesAndChainIds: Array<{ chainId: bigint; sessionDigest: Hex }>;
	createdAt: number;
}

export type SessionConsentState = 'granted' | 'denied' | 'unset';

interface RhinestoneAccount {
	sendTransaction: (params: RhinestoneTransactionParams) => Promise<TransactionResult>;
	// 3-step transaction flow that properly handles eip7702InitSignature
	prepareTransaction: (params: RhinestoneTransactionParams) => Promise<PreparedTransaction>;
	getTransactionMessages: (preparedTx: PreparedTransaction) => {
		origin: unknown[];
		destination: unknown;
	};
	experimental_getSessionDetails: (sessions: Session[]) => Promise<SessionDetails>;
	experimental_signEnableSession: (sessionDetails: SessionDetails) => Promise<Hex>;
	experimental_isSessionEnabled: (session: Session) => Promise<boolean>;
	signTransaction: (preparedTx: PreparedTransaction) => Promise<SignedTransaction>;
	signAuthorizations: (preparedTx: PreparedTransaction) => Promise<SignedAuthorizationList>;
	submitTransaction: (
		signedTx: SignedTransaction,
		authorizations?: SignedAuthorizationList,
		dryRun?: boolean
	) => Promise<TransactionResult>;
	waitForExecution: (
		result: TransactionResult,
		acceptsPreconfirmations?: boolean
	) => Promise<TransactionStatus>;
	getAddress: () => Address;
	getPortfolio: (onTestnets?: boolean) => Promise<Portfolio>;
	signEip7702InitData: () => Promise<Hex>;
	isDeployed: (chain: Chain) => Promise<boolean>;
}

// =============================================================================
// Module-level utilities (shared across methods)
// =============================================================================

const DEBUG = import.meta.env.DEV;

function debugLog(message: string, ...args: unknown[]): void {
	if (DEBUG)
		console.log(
			`[Rhinestone Client] ${message}`,
			...args.map((a) => (typeof a === 'object' ? safeStringify(a) : a))
		);
}

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

const WETH_BY_CHAIN: Record<number, `0x${string}`> = {
	1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // Ethereum
	8453: '0x4200000000000000000000000000000000000006', // Base
	42161: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', // Arbitrum
	10: '0x4200000000000000000000000000000000000006' // Optimism
};
const EIP7702_DELEGATE_CONTRACT = '0x000000000032ddc454c3bdcba80484ad5a798705' as Address;
const SESSION_BUNDLE_TTL_MS = 24 * 60 * 60 * 1000;
const SESSION_CONSENT_STORAGE_KEY = 'rhinestone:sessions:consent:v1';
const ERC20_TRANSFER_SELECTOR = toFunctionSelector(
	getAbiItem({ abi: erc20Abi, name: 'transfer' })
) as Hex;
const ERC20_APPROVE_SELECTOR = toFunctionSelector(
	getAbiItem({ abi: erc20Abi, name: 'approve' })
) as Hex;
const ZERO_ADDRESS_REFERENCE = '0x0000000000000000000000000000000000000000' as Hex;

/** Audited Orderbook contract – session allowed for multicall(bytes[]) and takeOrders4 only */
const ORDERBOOK_ADDRESS = '0xe522cB4a5fCb2eb31a52Ff41a4653d85A4fd7C9D' as Address;

// Minimal ABI for session allowlist: only the two functions we need. Parsed so selectors are well-defined.
const orderbookMulticallItem = parseAbiItem(
	'function multicall(bytes[] calldata data) external returns (bytes[] memory results)'
);
const orderbookTakeOrders4Item = parseAbiItem(
	'function takeOrders4((bytes32,bytes32,bytes32,bool,((address,(address,address,bytes),(address,bytes32)[],(address,bytes32)[],bytes32),uint256,uint256,(address,bytes32[],bytes)[])[],bytes)) external returns (bytes32, bytes32)'
);

const MULTICALL_SELECTOR = toFunctionSelector(orderbookMulticallItem) as Hex;
const TAKE_ORDER_SELECTOR = toFunctionSelector(orderbookTakeOrders4Item) as Hex;
function isZeroAddr(v?: string): boolean {
	return (v ?? '').toLowerCase() === '0x0000000000000000000000000000000000000000';
}

function normalizeEthToWeth(
	token: { symbol?: string; address: string },
	chainId: number
): { symbol?: string; address: string } {
	const sym = (token.symbol ?? '').toUpperCase();
	if (sym === 'ETH' || sym === 'NATIVE' || isZeroAddr(token.address)) {
		const weth = WETH_BY_CHAIN[chainId];
		if (weth) return { ...token, symbol: 'WETH', address: weth };
	}
	return token;
}

async function pollForHash(
	account: RhinestoneAccount,
	txResult: TransactionResult,
	maxMs = 60_000,
	intervalMs = 2_500
): Promise<Hex | undefined> {
	const start = Date.now();
	while (Date.now() - start < maxMs) {
		const st = await account.waitForExecution(txResult);
		const hash = st?.fill?.hash ?? st?.claims?.find((c) => c?.hash)?.hash;
		if (hash && hash !== '0x') return hash;
		await sleep(intervalMs);
	}
	return undefined;
}

/** Account type with optional EIP-7702 signAuthorization support */
type WalletAccountWithSignAuth = Account & {
	signAuthorization?: (args: {
		contractAddress: Address;
		chainId: number;
		nonce?: number;
	}) => Promise<{
		r: Hex;
		s: Hex;
		v?: bigint;
		yParity?: number;
		nonce?: number;
	}>;
};

function isUserRejection(msg: string): boolean {
	const lower = msg.toLowerCase();
	return lower.includes('reject') || lower.includes('denied') || lower.includes('user rejected');
}

/** Collect full error message including cause chain (for matching wrapped errors) */
function getFullErrorMessage(error: unknown): string {
	const parts: string[] = [];
	let e: unknown = error;
	const seen = new Set<unknown>();
	while (e && !seen.has(e)) {
		seen.add(e);
		const msg = e instanceof Error ? e.message : String(e);
		if (msg) parts.push(msg);
		e = e instanceof Error ? e.cause : undefined;
	}
	return parts.join(' ');
}

/** True if the error is from session enable (signTypedData for MultiChainSession) failing - allows fallback to non-session flow */
function isSessionEnableError(error: unknown): boolean {
	const msg = getFullErrorMessage(error);
	const lower = msg.toLowerCase();
	return (
		lower.includes('signtypeddata timed out') ||
		lower.includes('signing typed data') ||
		lower.includes('error signing typed data') ||
		lower.includes('dynamicwaaswalletclient') ||
		lower.includes('signenablesession') ||
		lower.includes('sign enable session') ||
		lower.includes('getorcreatesessionenablebundle') ||
		lower.includes('iframemessagehandler')
	);
}

function isHexAddress(v: string): boolean {
	return /^0x[a-fA-F0-9]{40}$/.test(v);
}

/**
 * Resolve a fee asset (symbol or address) to a chain-specific address.
 * Returns undefined if the symbol can't be resolved.
 */
function resolveFeeAssetAddress(
	fa: string | undefined,
	chainId: number
): `0x${string}` | undefined {
	if (!fa) return undefined;
	if (isHexAddress(fa)) return fa as `0x${string}`;
	return resolveTokenAddress(fa, chainId);
}

/** Deduplicate strings by lowercase, preserving original casing of first occurrence */
function uniqLower(xs: Array<string | undefined>): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const x of xs) {
		if (!x) continue;
		const k = x.toLowerCase();
		if (seen.has(k)) continue;
		seen.add(k);
		out.push(x);
	}
	return out;
}

let rhinestoneInstance: RhinestoneClient | null = null;

/**
 * Rhinestone Client Wrapper
 *
 * Provides methods for:
 * - Cross-chain swaps (any token to any token)
 * - Omnichain transactions
 * - Gas sponsorship (native, deposit USDC on Base)
 * - Quote retrieval
 */

export type AccountType = '7702' | 'smart';
export class RhinestoneClient {
	private sdk: RhinestoneSDK;
	private config: RhinestoneConfig;
	// Store wallet client for authorization signing (needed for JSON-RPC accounts)
	private walletClientCache: Map<string, WalletClient> = new Map();
	// Cache EIP-7702 init signatures by account address (signature is valid across all chains)
	private eip7702InitSignatureCache: Map<Address, Hex> = new Map();
	// Cache Rhinestone accounts by walletAddress:accountType
	private _accountCache: Map<string, RhinestoneAccount> = new Map();

	// Sessions cache: wallet+sessionOwner+chains → enable bundle
	private sessionEnableCache: Map<string, SessionEnableBundle> = new Map();

	constructor(config: RhinestoneConfig) {
		this.config = config;

		// Build SDK configuration
		// Note: Rhinestone has native gas sponsorship - no external paymaster needed
		// Just set sponsored: true in transactions and deposit USDC to your sponsorship wallet
		const sdkConfig: { apiKey: string; provider?: { type: 'alchemy'; apiKey: string } } = {
			apiKey: config.apiKey
		};

		// Add Alchemy provider if configured (for better RPC performance)
		if (config.providerType === 'alchemy' && config.providerApiKey) {
			sdkConfig.provider = { type: 'alchemy', apiKey: config.providerApiKey };
		}

		this.sdk = new RhinestoneSDK(sdkConfig);
	}

	/**
	 * Create a Rhinestone account for a given wallet
	 *
	 * For EIP-7702 mode (accountType: '7702'):
	 * - Uses Rhinestone's Warp infrastructure to upgrade the EOA
	 * - Preserves the user's existing EOA address
	 * - Enables smart account features (batching, gas sponsorship)
	 *
	 * For standard mode (accountType: 'smart' or default):
	 * - Creates a new smart account contract
	 * - New address derived from owner
	 */
	async createAccount(
		walletAccount: Account,
		accountTypeOverride?: AccountType
	): Promise<RhinestoneAccount> {
		let accountType =
			(accountTypeOverride ?? (this.config.accountType as AccountType)) || 'smart';
		// If client was created with 7702 (e.g. before Dynamic session or env override) but current
		// wallet is Dynamic embedded/Waas, use smart so we don't require EIP-7702 init signing.
		if (
			accountTypeOverride === undefined &&
			accountType === '7702' &&
			this.isSessionWalletEligible() &&
			isDynamicEmbeddedWallet()
		) {
			accountType = 'smart';
			debugLog('createAccount: using smart account for Dynamic embedded/Waas wallet');
		}

		const cacheKey = `${walletAccount.address.toLowerCase()}:${accountType}`;
		const cached = this._accountCache.get(cacheKey);
		if (cached) return cached;

		try {
			debugLog('createAccount called', {
				walletAddress: walletAccount.address,
				accountType
			});

			// Base owners config (Rhinestone SDK createAccount options)
			type CreateAccountOptions = {
				owners: { type: 'ecdsa'; accounts: Account[] };
				accountType?: '7702' | 'smart';
				eoa?: Account;
				experimental_sessions?: { enabled: boolean };
			};
			const baseOptions: CreateAccountOptions = {
				owners: {
					type: 'ecdsa',
					accounts: [walletAccount]
				}
			};

			let createAccountOptions: CreateAccountOptions = baseOptions;

			if (accountType === '7702') {
				// 7702 path: EOA upgrade. This is where `eoa` belongs.
				createAccountOptions = {
					...baseOptions,
					accountType: '7702',
					eoa: walletAccount
				};
			} else {
				// SMART path: explicitly force smart if SDK supports it.
				// If SDK doesn't accept 'smart', remove this line and rely on default,
				// but DO NOT pass `eoa`.
				createAccountOptions = {
					...baseOptions,
					accountType: 'smart'
				};
			}

			if (this.sessionsEnabled()) {
				createAccountOptions.experimental_sessions = { enabled: true };
			}

			debugLog('Calling SDK createAccount with options:', {
				ownersType: createAccountOptions.owners?.type,
				accountType: createAccountOptions.accountType,
				hasEoa: Boolean(createAccountOptions.eoa)
			});

			const rhinestoneAccount = (await this.sdk.createAccount(
				createAccountOptions
			)) as unknown as RhinestoneAccount;

			debugLog('Account created successfully', {
				accountType,
				address: rhinestoneAccount.getAddress() ?? 'unknown'
			});

			this._accountCache.set(cacheKey, rhinestoneAccount);
			return rhinestoneAccount;
		} catch (error) {
			console.error('[Rhinestone Client] createAccount failed:', error);
			throw new AAError(
				`Failed to create Rhinestone account: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				AAErrorCode.RHINESTONE_ERROR,
				{ originalError: error, accountType }
			);
		}
	}

	/**
	 * Check if using EIP-7702 mode
	 */
	isEIP7702Mode(): boolean {
		return this.config.accountType === '7702';
	}

	/**
	 * Get or sign EIP-7702 init signature for an account
	 *
	 * The init signature is cached per account address since it's valid across all chains.
	 * This prevents users from having to sign the init signature multiple times.
	 *
	 * @param rhinestoneAccount - The Rhinestone account
	 * @param walletAddress - The wallet address (used as cache key)
	 * @returns The EIP-7702 init signature (cached or newly signed)
	 */
	private async getOrSignEip7702InitSignature(
		rhinestoneAccount: RhinestoneAccount,
		walletAddress: Address
	): Promise<Hex> {
		// Check cache first
		const cached = this.eip7702InitSignatureCache.get(walletAddress);
		if (cached && cached !== '0x') {
			debugLog('Using cached EIP-7702 init signature for account:', walletAddress);
			return cached;
		}

		// Not cached, sign it
		debugLog('Signing EIP-7702 init data (not cached)...', {
			accountAddress: walletAddress
		});

		try {
			const signature = await rhinestoneAccount.signEip7702InitData();
			if (!signature || signature === '0x') {
				throw new Error('signEip7702InitData returned empty signature');
			}

			// Cache the signature for future use
			this.eip7702InitSignatureCache.set(walletAddress, signature);
			debugLog('EIP-7702 init signature signed and cached for account:', walletAddress);

			return signature;
		} catch (signError) {
			const msg = signError instanceof Error ? signError.message : String(signError);
			const isDynamicTypedDataError =
				msg.includes('Error signing typed data') ||
				msg.includes('DynamicWaasWalletClient') ||
				msg.includes('signTypedData');

			if (isDynamicTypedDataError) {
				throw new AAError(
					'Your wallet does not support EIP-7702 initialization. Use a smart account instead by setting PUBLIC_RHINESTONE_ACCOUNT_TYPE=smart, or reconnect with an external wallet.',
					AAErrorCode.AUTHORIZATION_REJECTED,
					{ originalError: signError }
				);
			}
			throw new AAError(
				`Failed to sign EIP-7702 initialization: ${msg}. Please try again.`,
				AAErrorCode.AUTHORIZATION_REJECTED,
				{ originalError: signError }
			);
		}
	}

	private async canWalletSignAuthorizationOnChain(
		walletAccount: Account,
		chainId: number
	): Promise<boolean> {
		const wa = walletAccount as WalletAccountWithSignAuth;

		if (typeof wa.signAuthorization !== 'function') return false;

		try {
			// Probe call (won’t submit anything, just signs)
			await wa.signAuthorization({
				contractAddress: EIP7702_DELEGATE_CONTRACT,
				chainId,
				nonce: 0
			});
			return true;
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			// Dynamic MPC “method exists but not supported” case
			if (
				msg.toLowerCase().includes('not supported') ||
				msg.toLowerCase().includes('dynamic mpc')
			) {
				return false;
			}
			// Any other error: treat as not supported (safer)
			return false;
		}
	}

	private sessionsEnabled(): boolean {
		return this.isSessionFeatureAvailable() && this.getSessionConsent() === 'granted';
	}

	isSessionFeatureAvailable(): boolean {
		return env.PUBLIC_RHINESTONE_SESSIONS_ENABLED === 'true' && this.isSessionWalletEligible();
	}

	isSessionWalletEligible(): boolean {
		// Sessions are intentionally scoped to Dynamic embedded wallets for now.
		return isDynamicEmbeddedWallet();
	}

	getSessionConsent(): SessionConsentState {
		if (typeof window === 'undefined') return 'unset';
		const value = window.localStorage.getItem(SESSION_CONSENT_STORAGE_KEY);
		if (value === 'granted' || value === 'denied') return value;
		return 'unset';
	}

	setSessionConsent(consentGranted: boolean): void {
		if (typeof window === 'undefined') return;
		window.localStorage.setItem(SESSION_CONSENT_STORAGE_KEY, consentGranted ? 'granted' : 'denied');
		if (!consentGranted) {
			this.clearSessionCaches();
		}
	}

	// ⚠️ Minimal storage: localStorage.
	// For production you probably want encrypted storage / secure enclave.
	private getSessionOwnerAccount(walletAddress: Address): Account {
		const key = `rhinestone:sessionOwnerPk:${walletAddress.toLowerCase()}`;
		let pk = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;

		if (!pk) {
			pk = generatePrivateKey(); // "0x..." hex
			if (typeof window !== 'undefined') window.localStorage.setItem(key, pk);
		}

		return privateKeyToAccount(pk as Hex);
	}

	private sessionBundleCacheKey(
		walletAddress: Address,
		sessionOwner: Address,
		chainIds: number[]
	): string {
		const chains = [...chainIds].sort((a, b) => a - b).join(',');
		return `rhinestone:sessions:${walletAddress.toLowerCase()}:${sessionOwner.toLowerCase()}:${chains}`;
	}

	private getSessionSpendingLimits(chainId: number): Array<{ token: Address; amount: bigint }> {
		if (!this.isSupportedNetwork(chainId)) return [];

		const tokens = getPaymentTokensForNetwork(chainId as SupportedNetworkId);
		const limitMap = new Map<string, { token: Address; amount: bigint }>();

		for (const token of tokens) {
			if (token.isNative || isZeroAddr(token.address)) continue;

			const key = token.address.toLowerCase();
			if (limitMap.has(key)) continue;

			const amount =
				token.symbol === 'USDC' || token.symbol === 'USDT'
					? parseUnits('50000', token.decimals)
					: token.symbol === 'WETH'
						? parseUnits('25', token.decimals)
						: parseUnits('10000', token.decimals);

			limitMap.set(key, { token: token.address as Address, amount });
		}

		return Array.from(limitMap.values());
	}

	/**
	 * Build session actions limited to specific allowed (target, selector) pairs per Rhinestone docs.
	 * Each action allows one function (transfer or approve) on one token contract only.
	 * Policies (time-frame, universal-action, spending-limits) still apply per action.
	 */
	private buildSessionActions(
		chainId: number,
		validAfter: number,
		validUntil: number
	): NonNullable<Session['actions']> {
		// Calldata offsets for universal-action are measured from the encoded args (selector excluded).
		const basePolicies: Policy[] = [
			{
				type: 'time-frame',
				validAfter,
				validUntil
			},
			{
				type: 'universal-action',
				rules: [
					{
						condition: 'notEqual',
						calldataOffset: 0n,
						referenceValue: ZERO_ADDRESS_REFERENCE
					}
				]
			}
		];

		const limits = this.getSessionSpendingLimits(chainId);
		const actions: NonNullable<Session['actions']> = [];

		for (const { token } of limits) {
			const tokenPolicies: Policy[] = [...basePolicies];
			tokenPolicies.push({
				type: 'spending-limits',
				limits: limits.filter((l) => l.token.toLowerCase() === token.toLowerCase())
			});
			const policies = tokenPolicies as [Policy, ...Policy[]];

			// One action per (target, selector): only this token contract can be called with this selector.
			actions.push(
				{ target: token, selector: ERC20_TRANSFER_SELECTOR, policies },
				{ target: token, selector: ERC20_APPROVE_SELECTOR, policies: [...policies] as [Policy, ...Policy[]] }
			);
		}

		// Orderbook multicall: base policies only (no spending-limits for non-token target).
		// const multicallPolicies = basePolicies as [Policy, ...Policy[]];
		const orderbookPolicies: [Policy, ...Policy[]] = [{ type: 'time-frame', validAfter, validUntil }];

		actions.push(
			{
				target: ORDERBOOK_ADDRESS,
				selector: MULTICALL_SELECTOR,
				policies: orderbookPolicies
			},
			{
				target: ORDERBOOK_ADDRESS,
				selector: TAKE_ORDER_SELECTOR,
				policies: orderbookPolicies
			}
		);

		return actions;
	}

	private extractSelector(data: Hex): Hex | null {
		if (!data || data === '0x' || data.length < 10) return null;
		return data.slice(0, 10) as Hex;
	}

	/**
	 * Classify tx for session allowlist: all ERC20 allowlisted, all Orderbook multicall, mixed, or not allowed.
	 * Used for canUseSessionForTransaction and debug logging.
	 */
	private getSessionTxKind(
		tx: RhinestoneTransactionParams,
		chainId: number
	): 'erc20' | 'multicall' | 'takeOrder' | 'mixed' | null {
		const supportedTokenSet = new Set(
			this.getSessionSpendingLimits(chainId).map((limit) => limit.token.toLowerCase())
		);
		const orderbookLower = ORDERBOOK_ADDRESS.toLowerCase();
	
		let hasErc20 = false;
		let hasMulticall = false;
		let hasTakeOrder = false;
	
		for (const call of tx.calls) {
			const selector = this.extractSelector(call.data);
			if (!selector) return null;
	
			const toLower = call.to.toLowerCase();
	
			if (
				(selector === ERC20_TRANSFER_SELECTOR || selector === ERC20_APPROVE_SELECTOR) &&
				supportedTokenSet.has(toLower)
			) {
				hasErc20 = true;
				continue;
			}
	
			if (toLower === orderbookLower && selector === MULTICALL_SELECTOR) {
				hasMulticall = true;
				continue;
			}
	
			if (toLower === orderbookLower && selector === TAKE_ORDER_SELECTOR) {
				hasTakeOrder = true;
				continue;
			}
	
			return null; // unknown/unapproved call
		}
	
		// Reject mixing token actions with orderbook calls (safer; matches your existing policy)
		const hasOrderbook = hasMulticall || hasTakeOrder;
		if (hasErc20 && hasOrderbook) return 'mixed';
	
		if (hasErc20) return 'erc20';
		if (hasMulticall) return 'multicall';
		if (hasTakeOrder) return 'takeOrder';
		return null;
	}

	private canUseSessionForTransaction(tx: RhinestoneTransactionParams, chainId: number): boolean {
		const kind = this.getSessionTxKind(tx, chainId);
		return kind === 'erc20' || kind === 'multicall' || kind === 'takeOrder';
	}

	private async getOrCreateSessionEnableBundle(
		rhinestoneAccount: RhinestoneAccount,
		walletAddress: Address,
		chainIds: number[]
	): Promise<SessionEnableBundle> {
		if (!this.sessionsEnabled()) throw new Error('Sessions not enabled');

		const sessionOwner = this.getSessionOwnerAccount(walletAddress);
		const cacheKey = this.sessionBundleCacheKey(walletAddress, sessionOwner.address, chainIds);

		// 1) memory cache
		const mem = this.sessionEnableCache.get(cacheKey);
		if (mem) {
			if (
				this.isSessionBundleFresh(mem.createdAt) &&
				(await this.areSessionsEnabled(rhinestoneAccount, mem.sessions))
			) {
				return mem;
			}
			this.sessionEnableCache.delete(cacheKey);
		}

		// 2) localStorage cache
		if (typeof window !== 'undefined') {
			const raw = window.localStorage.getItem(cacheKey);
			if (raw) {
				try {
					const parsed = JSON.parse(raw) as {
						sessions: Array<{ chainId: number; validAfter: number; validUntil: number }>;
						enableSignature: Hex;
						hashesAndChainIds: Array<{ chainId: bigint | string | number; sessionDigest: Hex }>;
						createdAt: number;
					};
					if (!this.isSessionBundleFresh(parsed.createdAt)) {
						window.localStorage.removeItem(cacheKey);
						throw new Error('Session cache expired');
					}
					const restoredSessionOwner = this.getSessionOwnerAccount(walletAddress);
					const sessions: Session[] = parsed.sessions.map((s) => {
						if (typeof s.validAfter !== 'number' || typeof s.validUntil !== 'number') {
							throw new Error('Invalid session cache payload');
						}
						return {
							chain: CHAIN_CONFIG[s.chainId as SupportedNetworkId],
							owners: { type: 'ecdsa', accounts: [restoredSessionOwner] },
							actions: this.buildSessionActions(s.chainId, s.validAfter, s.validUntil)
						};
					});
					const hashesAndChainIds = parsed.hashesAndChainIds.map((h) => ({
						...h,
						chainId: BigInt(h.chainId)
					}));
					const bundle = {
						sessions,
						enableSignature: parsed.enableSignature,
						hashesAndChainIds,
						createdAt: parsed.createdAt
					};
					if (!(await this.areSessionsEnabled(rhinestoneAccount, sessions))) {
						window.localStorage.removeItem(cacheKey);
						throw new Error('Session cache not enabled on-chain');
					}
					this.sessionEnableCache.set(cacheKey, bundle);
					return bundle;
				} catch {
					// ignore broken cache
				}
			}
		}

		// 3) create sessions for requested chains (multi-chain enable-mode)
		const sessionValidAfter = Date.now();
		const sessionValidUntil = sessionValidAfter + 24 * 60 * 60 * 1000;
		const sessions: Session[] = chainIds.map((id) => ({
			chain: CHAIN_CONFIG[id as SupportedNetworkId],
			owners: { type: 'ecdsa', accounts: [sessionOwner] },
			actions: this.buildSessionActions(id, sessionValidAfter, sessionValidUntil)
		}));

		// Rhinestone “enable mode” flow (sign once)
		const sessionDetails = await rhinestoneAccount.experimental_getSessionDetails(sessions);
		const enableSignature = await rhinestoneAccount.experimental_signEnableSession(sessionDetails);

		const bundle = {
			sessions,
			enableSignature,
			hashesAndChainIds: sessionDetails.hashesAndChainIds,
			createdAt: sessionValidAfter
		};

		// persist
		if (typeof window !== 'undefined') {
			window.localStorage.setItem(
				cacheKey,
				JSON.stringify(
					{
						// store minimal serializable version
						sessions: sessions.map((s) => ({
							chainId: s.chain.id,
							validAfter: sessionValidAfter,
							validUntil: sessionValidUntil
						})),
						enableSignature,
						hashesAndChainIds: bundle.hashesAndChainIds,
						createdAt: bundle.createdAt
					},
					(_k, v) => (typeof v === 'bigint' ? v.toString() : v)
				)
			);
		}
		this.sessionEnableCache.set(cacheKey, bundle);

		return bundle;
	}

	private isSessionBundleFresh(createdAt: number): boolean {
		return Date.now() - createdAt <= SESSION_BUNDLE_TTL_MS;
	}

	private async areSessionsEnabled(
		rhinestoneAccount: RhinestoneAccount,
		sessions: Session[]
	): Promise<boolean> {
		for (const session of sessions) {
			const isEnabled = await rhinestoneAccount.experimental_isSessionEnabled(session);
			if (!isEnabled) return false;
		}
		return true;
	}

	private async maybeAttachSessionSigner(
		rhinestoneAccount: RhinestoneAccount,
		walletAddress: Address,
		chainIdOrChainIds: number | number[],
		tx: RhinestoneTransactionParams
	): Promise<RhinestoneTransactionParams> {
		if (!this.sessionsEnabled()) {
			debugLog('Sessions: not enabled', { chainIdOrChainIds });
			return tx;
		}
	
		const chainId = Array.isArray(chainIdOrChainIds)
			? chainIdOrChainIds[0] ?? ('chain' in tx ? tx.chain.id : tx.targetChain.id)
			: chainIdOrChainIds;
	
		const kind = this.getSessionTxKind(tx, chainId);
	
		// ✅ MUST gate: only attach signer for allowlisted tx kinds
		if (kind !== 'erc20' && kind !== 'multicall' && kind !== 'takeOrder') {
			debugLog('Sessions: tx not eligible for session signer', {
				chainId,
				kind,
				calls: tx.calls.map((c) => ({
					to: c.to,
					selector: this.extractSelector(c.data)
				}))
			});
	
			if (kind === 'mixed') {
				debugLog('Sessions: rejecting mixed ERC20 + orderbook calls; signer not attached', {
					chainId
				});
			}
	
			return tx;
		}
	
		// Optional helpful log for orderbook calls
		if ((kind === 'multicall' || kind === 'takeOrder') && tx.calls.length > 0) {
			debugLog('[Rhinestone Client] Sessions: enabling orderbook allowlist', {
				chainId,
				to: tx.calls[0].to,
				selector: this.extractSelector(tx.calls[0].data),
				kind
			});
		}

		// Dynamic embedded/Waas wallets fail to sign MultiChainSession (DynamicWaasWalletClient error).
		// Skip session enable so we never show the broken "Signature request" modal; tx proceeds with normal sign.
		if (isDynamicEmbeddedWallet()) {
			debugLog(
				'Sessions: skipping session enable for Dynamic embedded/Waas (MultiChainSession sign not supported)'
			);
			return tx;
		}
	
		// Build (or load) a single multi-chain session bundle and reuse it across transactions.
		const allSupportedChainIds = Object.values(SUPPORTED_NETWORKS) as number[];
		const { sessions, enableSignature, hashesAndChainIds } =
			await this.getOrCreateSessionEnableBundle(rhinestoneAccount, walletAddress, allSupportedChainIds);
	
		const sessionIndex = sessions.findIndex((s) => s.chain.id === chainId);
		if (sessionIndex < 0) throw new Error(`No session found for chain ${chainId}`);
	
		const session = sessions[sessionIndex];
		const isEnabled = await rhinestoneAccount.experimental_isSessionEnabled(session);
	
		const signers: {
			type: 'experimental_session';
			session: Session;
			verifyExecutions: true;
			enableData?: {
				userSignature: Hex;
				hashesAndChainIds: Array<{ chainId: bigint; sessionDigest: Hex }>;
				sessionToEnableIndex: number;
			};
		} = {
			type: 'experimental_session',
			session,
			verifyExecutions: true
		};
	
		if (!isEnabled) {
			signers.enableData = {
				userSignature: enableSignature,
				hashesAndChainIds,
				sessionToEnableIndex: sessionIndex
			};
		}
	
		return { ...tx, signers };
	}

	/**
	 * Check if account is deployed on a chain, and get EIP-7702 init signature if needed.
	 * Handles the SDK limitation where ExistingEip7702AccountsNotSupported is thrown.
	 */
	private async checkDeploymentAndGetInitSignature(
		rhinestoneAccount: RhinestoneAccount,
		walletAccount: Account,
		chain: Chain
	): Promise<{
		eip7702InitSignature: Hex | undefined;
		isDeployed: boolean;
		hadSdkLimitation: boolean;
	}> {
		const rhinestoneAddress = rhinestoneAccount.getAddress();
		const isEOA = rhinestoneAddress.toLowerCase() === walletAccount.address.toLowerCase();

		// Only 7702 (EOA-upgrade) accounts need init signature. Smart accounts use a different
		// address and must skip this path (SDK errors with "must have an EOA account" otherwise).
		if (!isEOA) {
			return { eip7702InitSignature: undefined, isDeployed: true, hadSdkLimitation: false };
		}
		if (this.config.accountType !== '7702') {
			return { eip7702InitSignature: undefined, isDeployed: true, hadSdkLimitation: false };
		}

		let isDeployed = false;
		let hadSdkLimitation = false;

		try {
			isDeployed = await rhinestoneAccount.isDeployed(chain);
			debugLog('Deployment status', { chainId: chain.id, chainName: chain.name, isDeployed });
		} catch (deployedError) {
			const errorMsg =
				deployedError instanceof Error ? deployedError.message : String(deployedError);
			if (
				errorMsg.includes('Existing EIP-7702 accounts') ||
				errorMsg.includes('ExistingEip7702AccountsNotSupported')
			) {
				console.warn(
					`[Rhinestone Client] SDK limitation on chain ${chain.id} - will still get init signature`
				);
				hadSdkLimitation = true;
			} else {
				throw deployedError;
			}
		}

		// SDK v1.2+ requires the init signature for all 7702 accounts,
		// even when already deployed on all chains.
		debugLog('Getting EIP-7702 init signature', {
			chainId: chain.id,
			isDeployed,
			hadSdkLimitation
		});
		const eip7702InitSignature = await this.getOrSignEip7702InitSignature(
			rhinestoneAccount,
			walletAccount.address
		);

		return { eip7702InitSignature, isDeployed, hadSdkLimitation };
	}

	private async getAuthorizationNonce(walletAddress: Address, chainId: number): Promise<number> {
		if (!this.isSupportedNetwork(chainId)) {
			throw new AAError(`Chain ${chainId} not supported`, AAErrorCode.UNSUPPORTED_NETWORK);
		}
		const publicClient = this.createPublicClient(chainId as SupportedNetworkId);
		return publicClient.getTransactionCount({ address: walletAddress });
	}

	/**
	 * Sign authorizations for EIP-7702 transactions.
	 * Handles JSON-RPC wallet limitations gracefully.
	 * Skips authorizations when the account in use is a smart account (address !== EOA), e.g. when
	 * the client was created with accountType '7702' but createAccount used 'smart' for Dynamic embedded.
	 */
	private async getSimpleAuthorizations(
		rhinestoneAccount: RhinestoneAccount,
		signedTx: SignedTransaction,
		walletAccount?: Account,
		chainId?: number
	): Promise<SignedAuthorizationList> {
		if (this.config.accountType !== '7702') return [];

		// Smart account (different address from EOA) does not use EIP-7702; skip signAuthorizations.
		if (
			walletAccount &&
			rhinestoneAccount.getAddress().toLowerCase() !== walletAccount.address.toLowerCase()
		) {
			debugLog('Skipping signAuthorizations: account is smart (not EOA/7702)');
			return [];
		}

		let authorizations: SignedAuthorizationList = [];
		let sdkSucceeded = false;

		try {
			authorizations = (await rhinestoneAccount.signAuthorizations(signedTx)) ?? [];
			sdkSucceeded = true;
			debugLog('Authorizations signed', {
				count: authorizations.length,
				chainIds: (authorizations as unknown as ReadonlyArray<{ chainId?: number }>).map(
					(a) => a.chainId
				)
			});
		} catch (authError) {
			const errorMsg = authError instanceof Error ? authError.message : String(authError);
			const isNonFatal =
				errorMsg.includes('JSON-RPC') ||
				errorMsg.includes('not supported') ||
				errorMsg.toLowerCase().includes('account type') ||
				errorMsg.toLowerCase().includes('undefined') ||
				errorMsg.includes('EIP-7702 initialization is required for EOA accounts');
			if (isNonFatal) {
				console.warn(
					'[Rhinestone Client] signAuthorizations not supported or not needed for this account.',
					errorMsg
				);
			} else {
				throw authError;
			}
		}

		// When we have no authorizations but have a chainId (e.g. same-chain Arbitrum with ERC20 gas),
		// the backend may still require an EIP-7702 delegate authorization for that chain. Try manual
		// signing so the intent can execute (SDK sometimes returns [] for same-chain).
		if (authorizations.length === 0 && walletAccount && chainId) {
			debugLog('No authorizations for chain; attempting manual EIP-7702 signing', {
				chainId,
				sdkSucceeded
			});
			try {
				const walletWithSignAuth = walletAccount as WalletAccountWithSignAuth;

				if (typeof walletWithSignAuth.signAuthorization === 'function') {
					const nonce = await this.getAuthorizationNonce(walletAccount.address as Address, chainId);
					debugLog('Wallet has signAuthorization, signing manually...');
					const auth = await walletWithSignAuth.signAuthorization({
						contractAddress: EIP7702_DELEGATE_CONTRACT,
						chainId,
						nonce
					});
					authorizations = [
						{
							chainId,
							address: EIP7702_DELEGATE_CONTRACT,
							nonce: auth.nonce ?? nonce,
							r: auth.r,
							s: auth.s,
							yParity: auth.yParity ?? 0
						}
					] as unknown as SignedAuthorizationList;
					debugLog('Manual authorization signed successfully', { chainId });
				} else {
					console.warn('[Rhinestone Client] Wallet does not have signAuthorization method');
				}
			} catch (manualError) {
				const msg = manualError instanceof Error ? manualError.message : String(manualError);
				if (isUserRejection(msg)) {
					throw new AAError(
						'Authorization signing was rejected by user',
						AAErrorCode.AUTHORIZATION_REJECTED,
						{ originalError: manualError, chainId }
					);
				}
				// Dynamic MPC wallets don't support manual signAuthorization; SDK handles it. Expected.
				if (msg.includes('Dynamic MPC') || msg.includes('Rhinestone SDK handles authorizations')) {
					debugLog('Skipping manual auth (wallet uses SDK-managed authorizations)', {
						chainId
					});
				} else {
					console.warn('[Rhinestone Client] Manual authorization signing failed:', msg);
				}
			}
		}

		return authorizations;
	}

	/**
	 * Get a quote for a cross-chain swap using Rhinestone Orchestrator
	 *
	 * Uses the Orchestrator's getIntentRoute endpoint to get real-time quotes
	 * from the solver network. The response includes:
	 * - intentCost: actual costs including fees
	 * - gasPrices: current gas prices per chain
	 * - tokenPrices: current token prices for conversion
	 */
	async getSwapQuote(
		params: CrossChainSwapParams,
		feeAsset?: string
	): Promise<CrossChainSwapQuote> {
		try {
			// Validate networks are supported
			if (!this.isSupportedNetwork(params.sourceChain)) {
				throw new AAError(
					`Source chain ${params.sourceChain} not supported`,
					AAErrorCode.UNSUPPORTED_NETWORK
				);
			}
			if (!this.isSupportedNetwork(params.targetChain)) {
				throw new AAError(
					`Target chain ${params.targetChain} not supported`,
					AAErrorCode.UNSUPPORTED_NETWORK
				);
			}

			const isSameChain = params.sourceChain === params.targetChain;

			const normalizedSourceToken = normalizeEthToWeth(
				{ symbol: params.sourceToken.symbol, address: params.sourceToken.address as string },
				Number(params.sourceChain)
			);
			const normalizedTargetToken = normalizeEthToWeth(
				{ symbol: params.targetToken.symbol, address: params.targetToken.address as string },
				Number(params.targetChain)
			);

			// Validate API key
			if (!this.config.apiKey) {
				throw new AAError('Rhinestone API key not configured', AAErrorCode.RHINESTONE_ERROR);
			}

			// Get orchestrator instance
			const orchestrator = getOrchestrator(this.config.apiKey);

			try {
				// tokenRequests describes what you want on the DESTINATION chain.
				// accountAccessList tells the orchestrator which source chain tokens are available to spend.
				const accountAccessList: AccountAccessList & {
					chainTokens: Record<number, `0x${string}`[]>;
				} = {
					chainTokens: {
						[params.sourceChain]: [normalizedSourceToken.address as `0x${string}`]
					}
				};

				// Validate amount is positive
				if (params.amount <= 0n) {
					throw new AAError('Amount must be greater than zero', AAErrorCode.SWAP_FAILED);
				}

				const targetTokenAddr = normalizedTargetToken.address as `0x${string}`;

				// Using 'EOA' account type is correct even for EIP-7702 because:
				// - EIP-7702 accounts use the EOA address
				// - The orchestrator treats them as EOAs for routing purposes
				// - The SDK handles the EIP-7702 upgrade internally
				const intentInput = {
					account: {
						address: params.recipient,
						accountType: 'EOA' as const,
						setupOps: []
					},
					destinationChainId: params.targetChain,
					destinationExecutions: [],
					tokenRequests: [
						{
							tokenAddress: targetTokenAddr,
							amount: params.amount
						}
					],
					accountAccessList,
					options: {
						topupCompact: false,
						...(feeAsset ? { feeAsset } : {})
					}
				};

				debugLog('Requesting quote from orchestrator:', {
					sourceChain: params.sourceChain,
					targetChain: params.targetChain,
					sourceToken: normalizedSourceToken.address,
					targetToken: normalizedTargetToken.address,
					amount: params.amount.toString(),
					feeAsset,
					accountAccessList
				});

				const route: IntentRoute = await orchestrator.getIntentRoute(intentInput);
				const intentCost: IntentCost = route.intentCost;

				// NOTE: naming here depends on orchestrator response shapes; keep your safe fallbacks.
				const tokenReceived = intentCost.tokensReceived?.[0];

				const amountSpent = tokenReceived?.amountSpent
					? BigInt(tokenReceived.amountSpent)
					: params.amount;

				const destinationAmount = tokenReceived?.destinationAmount
					? BigInt(tokenReceived.destinationAmount)
					: params.amount;

				const gasPrices = route.intentOp?.signedMetadata?.gasPrices || {};
				const sourceChainGasPrice = gasPrices[params.sourceChain.toString()]
					? BigInt(gasPrices[params.sourceChain.toString()])
					: 1_000_000_000n;

				const baseGasLimit = isSameChain ? 150000n : 500000n;
				const estimatedGasCostWei = baseGasLimit * sourceChainGasPrice;

				const tokenPrices = route.intentOp?.signedMetadata?.tokenPrices || {};
				const ethPrice = tokenPrices['ETH'] || 2500;
				const usdcDecimals = 6;

				const gasCostInEth = Number(estimatedGasCostWei) / 1e18;
				const gasCostInUSDC = BigInt(Math.ceil(gasCostInEth * ethPrice * 10 ** usdcDecimals));

				const priceImpactBps =
					amountSpent > 0n
						? Number(((amountSpent - destinationAmount) * 10000n) / amountSpent)
						: 10;

				const quote: CrossChainSwapQuote = {
					inputAmount: amountSpent,
					outputAmount: destinationAmount,
					estimatedGas: {
						gasLimit: baseGasLimit,
						maxFeePerGas: sourceChainGasPrice,
						maxPriorityFeePerGas: sourceChainGasPrice / 10n,
						estimatedGasCostWei,
						estimatedGasCostUSDC: gasCostInUSDC
					},
					route: {
						steps: [
							{
								type: isSameChain ? 'swap' : 'bridge',
								chainId: params.sourceChain,
								protocol: 'rhinestone-solver',
								// use normalized addresses for ETH->WETH
								tokenIn: normalizedSourceToken.address as `0x${string}`,
								tokenOut: normalizedTargetToken.address as `0x${string}`,
								amountIn: amountSpent,
								amountOut: destinationAmount
							}
						],
						totalSteps: 1,
						estimatedDuration: isSameChain ? 15 : 60
					},
					expiresAt: Date.now() + 60_000,
					priceImpactBps: Math.max(priceImpactBps, 0)
				};

				return quote;
			} catch (orchestratorError) {
				const errorMessage =
					orchestratorError instanceof Error
						? orchestratorError.message
						: String(orchestratorError);
				const errorStack = orchestratorError instanceof Error ? orchestratorError.stack : undefined;

				// Extract traceId if available in orchestrator error
				const errorObj = orchestratorError as Error & {
					traceId?: string;
					trace_id?: string;
					context?: { traceId?: string };
					response?: { traceId?: string; data?: { traceId?: string } };
				};
				const traceId =
					errorObj?.traceId ||
					errorObj?.trace_id ||
					errorObj?.context?.traceId ||
					errorObj?.response?.traceId ||
					errorObj?.response?.data?.traceId;

				console.error('[Rhinestone Client] Orchestrator quote failed, using gas oracle fallback:', {
					error: errorMessage,
					stack: errorStack,
					traceId,
					sourceChain: params.sourceChain,
					targetChain: params.targetChain,
					sourceToken: normalizedSourceToken.address,
					targetToken: normalizedTargetToken.address,
					amount: params.amount.toString(),
					feeAsset,
					fullError: orchestratorError // Log full error object for Rhinestone debugging
				});

				const gasOracle = getGasOracle();
				const operationType = isSameChain ? 'swap' : 'bridge';
				const gasLimit = gasOracle.getDefaultGasLimit(operationType);

				const gasPrices = await gasOracle.getGasPrice(params.sourceChain);
				const estimatedGasCostWei = gasLimit * gasPrices.maxFeePerGas;

				const defaultEthPrice = 2500;
				const estimatedGasCostUSDC = gasOracle.convertToUSDC(estimatedGasCostWei, defaultEthPrice);

				const quote: CrossChainSwapQuote = {
					inputAmount: params.amount,
					outputAmount: params.amount,
					estimatedGas: {
						gasLimit,
						maxFeePerGas: gasPrices.maxFeePerGas,
						maxPriorityFeePerGas: gasPrices.maxPriorityFeePerGas,
						estimatedGasCostWei,
						estimatedGasCostUSDC
					},
					route: {
						steps: [
							{
								type: isSameChain ? 'swap' : 'bridge',
								chainId: params.sourceChain,
								protocol: 'rhinestone-solver',
								tokenIn: normalizedSourceToken.address as `0x${string}`,
								tokenOut: normalizedTargetToken.address as `0x${string}`,
								amountIn: params.amount,
								amountOut: params.amount
							}
						],
						totalSteps: 1,
						estimatedDuration: isSameChain ? 15 : 60
					},
					expiresAt: Date.now() + 60_000,
					priceImpactBps: 10
				};

				return quote;
			}
		} catch (error) {
			if (error instanceof AAError) throw error;
			throw new AAError(
				`Failed to get swap quote: ${error instanceof Error ? error.message : 'Unknown error'}`,
				AAErrorCode.RHINESTONE_ERROR,
				{ originalError: error }
			);
		}
	}

	/**
	 * Execute a cross-chain swap using Rhinestone's solver network
	 *
	 * Flow:
	 * 1. Create a Rhinestone smart account linked to user's wallet
	 * 2. Build the transaction with tokenRequests (what tokens to pull from source chain)
	 * 3. Execute via sendTransaction which handles cross-chain coordination
	 * 4. Wait for execution completion
	 *
	 * @param params - Swap parameters
	 * @param walletAccount - User's wallet account for signing
	 * @param feeAsset - Optional asset for gas payment (e.g., 'USDC' for ERC20 gas)
	 */
	async executeCrossChainSwap(
		params: CrossChainSwapParams,
		walletAccount: Account,
		feeAsset?: string
	): Promise<{ txHash: Hex; intentId: string }> {
		// Quote wrapper with retries (important for ETH->Base)
		const getQuoteWithRetries = async (
			p: CrossChainSwapParams,
			effectiveFeeAsset: string | undefined
		) => {
			try {
				debugLog('Attempting quote with feeAsset:', effectiveFeeAsset);
				return await this.getSwapQuote(p, effectiveFeeAsset);
			} catch (e1) {
				const m1 = e1 instanceof Error ? e1.message : String(e1);
				console.warn('[Rhinestone Client] First quote attempt failed:', m1);

				try {
					debugLog('Retrying quote without feeAsset');
					return await this.getSwapQuote(p, undefined);
				} catch (e2) {
					const m2 = e2 instanceof Error ? e2.message : String(e2);
					const m1Str = m1;

					console.error('[Rhinestone Client] Both quote attempts failed:', {
						firstAttempt: m1Str,
						secondAttempt: m2,
						sourceChain: p.sourceChain,
						targetChain: p.targetChain,
						sourceToken: p.sourceToken.symbol,
						targetToken: p.targetToken.symbol,
						amount: p.amount.toString()
					});

					throw new AAError(
						`Could not retrieve a valid quote from any quoter. First attempt: ${m1Str}. Second attempt: ${m2}`,
						AAErrorCode.SWAP_FAILED,
						{ originalError: e2, firstError: e1 }
					);
				}
			}
		};

		try {
			if (!this.config.apiKey) {
				throw new AAError('Rhinestone API key not configured', AAErrorCode.RHINESTONE_ERROR);
			}

			const srcId = Number(params.sourceChain);
			const dstId = Number(params.targetChain);

			const sourceChain = CHAIN_CONFIG[params.sourceChain as SupportedNetworkId];
			const targetChain = CHAIN_CONFIG[params.targetChain as SupportedNetworkId];

			if (!sourceChain || !targetChain) {
				throw new AAError(
					`Unsupported cross-chain route: ${srcId} -> ${dstId}`,
					AAErrorCode.UNSUPPORTED_NETWORK
				);
			}

			// Ethereum mainnet doesn't support ERC20 fee payment
			const effectiveFeeAsset = srcId === 1 ? undefined : feeAsset;

			// ---- Normalize token addresses to the correct chain ----
			const srcTokenAddr =
				resolveTokenAddress(params.sourceToken.symbol ?? '', srcId) ??
				(params.sourceToken.address as `0x${string}`);

			const dstTokenAddr =
				resolveTokenAddress(params.targetToken.symbol ?? '', dstId) ??
				(params.targetToken.address as `0x${string}`);

			// Build normalized params
			let normalizedParams: CrossChainSwapParams = {
				...params,
				sourceToken: { ...params.sourceToken, address: srcTokenAddr },
				targetToken: { ...params.targetToken, address: dstTokenAddr }
			};

			// Normalize ETH -> WETH for quote + tokenRequests
			const normalizedSourceToken = normalizeEthToWeth(
				{
					symbol: normalizedParams.sourceToken.symbol,
					address: normalizedParams.sourceToken.address as string
				},
				srcId
			);
			const normalizedTargetToken = normalizeEthToWeth(
				{
					symbol: normalizedParams.targetToken.symbol,
					address: normalizedParams.targetToken.address as string
				},
				dstId
			);
			normalizedParams = {
				...normalizedParams,
				sourceToken: {
					...normalizedParams.sourceToken,
					symbol: normalizedSourceToken.symbol ?? normalizedParams.sourceToken.symbol,
					address: normalizedSourceToken.address as `0x${string}`
				},
				targetToken: {
					...normalizedParams.targetToken,
					symbol: normalizedTargetToken.symbol ?? normalizedParams.targetToken.symbol,
					address: normalizedTargetToken.address as `0x${string}`
				}
			};

			/**
			 * ✅ FIX: Strict fee-asset sourcing
			 *
			 * By default, feeAsset MUST be sourced from SOURCE CHAIN only.
			 * This prevents the orchestrator from "helpfully" using Base USDC
			 * just because it exists on Base, when the user chose Arbitrum as source.
			 *
			 * If you later want to allow "fee asset from target chain", add a param
			 * like params.feeAssetSourceChain and switch this logic.
			 */
			const feeAssetSourceChainId = srcId;

			// Fee asset addresses (chain-specific)
			const feeAssetSrcAddr = resolveFeeAssetAddress(effectiveFeeAsset, srcId);
			const feeAssetDstAddr = resolveFeeAssetAddress(effectiveFeeAsset, dstId);
			const feeAssetChosenAddr = resolveFeeAssetAddress(effectiveFeeAsset, feeAssetSourceChainId);

			debugLog('Cross-chain quote inputs', {
				sourceChain: srcId,
				targetChain: dstId,
				sourceToken: {
					symbol: normalizedParams.sourceToken.symbol,
					address: normalizedParams.sourceToken.address
				},
				targetToken: {
					symbol: normalizedParams.targetToken.symbol,
					address: normalizedParams.targetToken.address
				},
				feeAssetRequested: feeAsset,
				feeAssetEffective: effectiveFeeAsset,
				feeAssetSrcAddr,
				feeAssetDstAddr,
				feeAssetSourceChainId,
				feeAssetChosenAddr,
				amount: normalizedParams.amount?.toString?.()
			});

			// ---- Quote (must be compatible with ETH->Base) ----
			const quote = await getQuoteWithRetries(normalizedParams, effectiveFeeAsset);

			if (Date.now() > quote.expiresAt) {
				throw new AAError('Quote has expired', AAErrorCode.QUOTE_EXPIRED);
			}

			// ---- Create Rhinestone account ----
			const rhinestoneAccount = await this.createAccount(walletAccount);
			const rhinestoneAddress = rhinestoneAccount.getAddress();

			// ---- Check deployment on BOTH chains and get EIP-7702 init signature if needed ----
			const srcDeploy = await this.checkDeploymentAndGetInitSignature(
				rhinestoneAccount,
				walletAccount,
				sourceChain
			);
			const dstDeploy = await this.checkDeploymentAndGetInitSignature(
				rhinestoneAccount,
				walletAccount,
				targetChain
			);

			// Use whichever init signature was obtained (they're interchangeable — valid cross-chain)
			const eip7702InitSignature = srcDeploy.eip7702InitSignature ?? dstDeploy.eip7702InitSignature;

			// ---- Call on TARGET chain after solver completes swap/bridge ----
			const transferCall = {
				to: normalizedParams.targetToken.address as Address,
				value: 0n,
				data: encodeFunctionData({
					abi: erc20Abi,
					functionName: 'transfer',
					args: [normalizedParams.recipient, quote.outputAmount]
				})
			};

			/**
			 * ✅ FIX: sourceAssets must NOT include feeAsset on target chain unless you explicitly want that.
			 * Only list feeAsset on the chosen source chain, so orchestrator can't pick Base USDC.
			 *
			 * Also: for "sourceAssets on target chain", you typically only need to list tokens
			 * that may be used/spent on that chain. Listing the target token there can allow
			 * orchestrator to consider using pre-existing target-chain liquidity.
			 *
			 * So we keep targetChain bucket to JUST the target token, and we do NOT include feeAssetDstAddr.
			 */
			const sourceAssets: Record<number, string[]> = {
				[sourceChain.id]: uniqLower(
					[normalizedParams.sourceToken.address as string, feeAssetChosenAddr].filter(
						(addr): addr is string => addr !== undefined
					)
				)
				// [targetChain.id]: uniqLower(
				//   [normalizedParams.targetToken.address as string].filter(
				// 	(addr): addr is string => addr !== undefined
				//   )
				// )
			};

			// For cross-chain, authorization may be needed on both chains
			const chainsNeedingAuth: (typeof sourceChain)[] = [sourceChain];
			if (
				(!dstDeploy.isDeployed || dstDeploy.hadSdkLimitation) &&
				targetChain.id !== sourceChain.id
			) {
				chainsNeedingAuth.push(targetChain);
				debugLog('Including target chain in authorization coverage:', {
					targetChainId: targetChain.id,
					isDeployed: dstDeploy.isDeployed,
					hadSdkLimitation: dstDeploy.hadSdkLimitation
				});
			}

			const transactionParams: RhinestoneTransactionParams = {
				// Use sourceChain (singular) for standard cross-chain swaps
				sourceChain,
				targetChain,
				calls: [transferCall],

				/**
				 * ✅ FIX: tokenRequests should be quote.outputAmount, not input amount.
				 * Otherwise you can accidentally request the wrong amount on destination.
				 */
				tokenRequests: [
					{
						address: normalizedParams.targetToken.address as Address,
						amount: quote.outputAmount
					}
				],

				feeAsset: effectiveFeeAsset,
				sourceAssets,
				eip7702InitSignature
			};

			// Check user's source token balance before proceeding
			let sourceTokenBalance: bigint | undefined;
			try {
				const sourceClient = createPublicClient({
					chain: sourceChain,
					transport: createRpcTransport(sourceChain.id as SupportedNetworkId)
				});
				sourceTokenBalance = await sourceClient.readContract({
					address: normalizedParams.sourceToken.address as Address,
					abi: erc20Abi,
					functionName: 'balanceOf',
					args: [walletAccount.address]
				});
				debugLog('Source token balance check:', {
					token: normalizedParams.sourceToken.symbol,
					address: normalizedParams.sourceToken.address,
					balance: sourceTokenBalance.toString(),
					requiredAmount: normalizedParams.amount.toString(),
					hasSufficientBalance: sourceTokenBalance >= normalizedParams.amount
				});

				if (sourceTokenBalance < normalizedParams.amount) {
					console.warn(
						'[Rhinestone Client] INSUFFICIENT BALANCE: User does not have enough source tokens!',
						{
							balance: sourceTokenBalance.toString(),
							required: normalizedParams.amount.toString(),
							deficit: (normalizedParams.amount - sourceTokenBalance).toString()
						}
					);
				}
			} catch (balanceError) {
				console.warn('[Rhinestone Client] Could not check source token balance:', balanceError);
			}

			debugLog('Preparing cross-chain transaction...', {
				sourceChain: sourceChain.id,
				targetChain: targetChain.id,
				feeAssetRequested: feeAsset,
				feeAssetEffective: effectiveFeeAsset,
				feeAssetSrcAddr,
				feeAssetDstAddr,
				feeAssetSourceChainId,
				feeAssetChosenAddr,
				hasEip7702Init: Boolean(eip7702InitSignature),
				srcDeploy: {
					isDeployed: srcDeploy.isDeployed,
					hadSdkLimitation: srcDeploy.hadSdkLimitation
				},
				dstDeploy: {
					isDeployed: dstDeploy.isDeployed,
					hadSdkLimitation: dstDeploy.hadSdkLimitation
				},
				chainsNeedingAuth: chainsNeedingAuth.map((c) => ({ id: c.id, name: c.name })),
				sourceAssets,
				rhinestoneAddress,
				walletAddress: walletAccount.address,
				sourceTokenBalance: sourceTokenBalance?.toString(),
				transactionParams: {
					sourceChain: transactionParams.sourceChain?.id,
					targetChain: transactionParams.targetChain.id,
					callsCount: transactionParams.calls.length,
					tokenRequestsCount: transactionParams.tokenRequests?.length ?? 0,
					tokenRequests: transactionParams.tokenRequests?.map((t) => ({
						address: t.address,
						amount: t.amount.toString()
					})),
					feeAsset: transactionParams.feeAsset
				}
			});

			// prepareTransaction with retry logic - the orchestrator quoters can be flaky
			let preparedTx: PreparedTransaction;
			const MAX_PREPARE_RETRIES = 3;
			const PREPARE_RETRY_DELAY = 2000; // 2 seconds

			// Log full transaction params for debugging
			debugLog('Full transaction params for prepareTransaction:', {
				sourceChain: {
					id: transactionParams.sourceChain?.id,
					name: transactionParams.sourceChain?.name
				},
				targetChain: {
					id: transactionParams.targetChain?.id,
					name: transactionParams.targetChain?.name
				},
				calls: transactionParams.calls?.map((c) => ({
					to: c.to,
					value: String(c.value),
					dataLength: c.data?.length
				})),
				tokenRequests: transactionParams.tokenRequests?.map((t) => ({
					address: t.address,
					amount: String(t.amount)
				})),
				feeAsset: transactionParams.feeAsset,
				sourceAssets: transactionParams.sourceAssets,
				hasEip7702InitSignature: Boolean(transactionParams.eip7702InitSignature)
			});

			const txWithSigner = await this.maybeAttachSessionSigner(
				rhinestoneAccount,
				walletAccount.address as Address,
				sourceChain.id,
				transactionParams
			);

			for (let attempt = 1; attempt <= MAX_PREPARE_RETRIES; attempt++) {
				try {
					debugLog(`prepareTransaction attempt ${attempt}/${MAX_PREPARE_RETRIES}...`);
					preparedTx = await rhinestoneAccount.prepareTransaction(txWithSigner);
					debugLog('prepareTransaction succeeded');
					break; // Success, exit retry loop
				} catch (prepareError) {
					const errorMsg =
						prepareError instanceof Error ? prepareError.message : String(prepareError);
					const errorStack = prepareError instanceof Error ? prepareError.stack : undefined;

					console.error(`[Rhinestone Client] prepareTransaction attempt ${attempt} failed:`, {
						error: errorMsg,
						stack: errorStack,
						sourceChain: sourceChain.id,
						targetChain: targetChain.id,
						sourceToken: normalizedParams.sourceToken.address,
						targetToken: normalizedParams.targetToken.address,
						amount: normalizedParams.amount.toString(),
						rhinestoneAddress,
						walletAddress: walletAccount.address,
						accountType: this.config.accountType
					});

					// Check if this is a quoter error that might be transient
					const isQuoterError =
						errorMsg.toLowerCase().includes('quote') ||
						errorMsg.toLowerCase().includes('quoter') ||
						errorMsg.toLowerCase().includes('could not retrieve');

					// If we have more retries and it's a quoter error, wait and retry
					if (attempt < MAX_PREPARE_RETRIES && isQuoterError) {
						debugLog(`Quoter error detected, waiting ${PREPARE_RETRY_DELAY}ms before retry...`);
						await sleep(PREPARE_RETRY_DELAY);
						continue;
					}

					// No more retries or non-transient error - throw with helpful message
					const isQuoteError = errorMsg.includes('Could not retrieve a valid quote');

					if (isQuoteError) {
						throw new AAError(
							`The Rhinestone orchestrator could not find a valid route for this swap after ${attempt} attempts. ` +
								`This typically happens when:\n` +
								`1) The cross-chain route (${sourceChain.name} → ${targetChain.name}) is temporarily unavailable\n` +
								`2) The amount (${(Number(normalizedParams.amount) / 1e6).toFixed(
									2
								)} USDC) is below the minimum\n` +
								`3) Quoters are experiencing high load or maintenance\n\n` +
								`Please try again in a few minutes, or try with a larger amount.`,
							AAErrorCode.SWAP_FAILED,
							{
								originalError: prepareError,
								sourceChain: sourceChain.id,
								targetChain: targetChain.id,
								amount: normalizedParams.amount.toString(),
								attempts: attempt
							}
						);
					}

					// Generic error
					throw new AAError(
						`Failed to prepare cross-chain transaction: ${errorMsg}. ` +
							`This might be due to unsupported token pair, insufficient liquidity, or orchestrator configuration issue.`,
						AAErrorCode.SWAP_FAILED,
						{ originalError: prepareError }
					);
				}
			}

			if (!preparedTx!) {
				throw new AAError(
					'Failed to prepare transaction after all retries',
					AAErrorCode.SWAP_FAILED
				);
			}

			const signedTx = await rhinestoneAccount.signTransaction(preparedTx);

			// ---- Authorizations ----
			// For cross-chain transactions, we need authorizations for BOTH source and target chains
			const signAuths = async (): Promise<SignedAuthorizationList> => {
				if (this.config.accountType !== '7702') return [];

				const authsList: Array<{
					chainId: number;
					address: Address;
					nonce: number;
					r: Hex;
					s: Hex;
					yParity: number;
				}> = [];

				// Track if wallet explicitly requires SDK-managed auth (e.g. Dynamic MPC)
				let walletRequiresSdkAuth = false;

				let sdkSucceeded = false;
				try {
					const sdkAuths = (await rhinestoneAccount.signAuthorizations(signedTx)) ?? [];
					sdkSucceeded = true;

					const typedSdkAuths = sdkAuths as Array<{
						chainId?: number | string;
						address?: Address;
						nonce?: number;
						r?: Hex;
						s?: Hex;
						yParity?: number;
					}>;

					authsList.push(
						...typedSdkAuths.map((a) => ({
							chainId: Number(a.chainId ?? 0),
							address: a.address ?? ('0x' as Address),
							nonce: a.nonce ?? 0,
							r: a.r ?? ('0x' as Hex),
							s: a.s ?? ('0x' as Hex),
							yParity: a.yParity ?? 0
						}))
					);

					const authCount = sdkAuths?.length ?? 0;
					const authChainIds = typedSdkAuths.map((a) => a.chainId ?? 'unknown');
					debugLog('SDK signAuthorizations result:', {
						count: authCount,
						chainIds: authChainIds,
						expectedChains: chainsNeedingAuth.map((c) => c.id)
					});
				} catch (authError) {
					const msg = authError instanceof Error ? authError.message : String(authError);
					if (
						msg.includes('JSON-RPC') ||
						msg.toLowerCase().includes('not supported') ||
						msg.toLowerCase().includes('account type') ||
						msg.toLowerCase().includes('undefined')
					) {
						console.warn(
							'[Rhinestone Client] SDK signAuthorizations not supported; will sign manually.'
						);
					} else {
						throw authError;
					}
				}

				const gotChainIds = new Set(
					authsList.map((a) => Number(a.chainId)).filter((id) => !isNaN(id))
				);
				const missingChainIds = chainsNeedingAuth
					.map((c) => c.id)
					.filter((chainId) => !gotChainIds.has(chainId));

				if (missingChainIds.length > 0) {
					const walletAccountWithSignAuth = walletAccount as WalletAccountWithSignAuth;
					debugLog('Manually signing authorizations for missing chains:', {
						missingChainIds,
						sdkSucceeded,
						hasSignAuthorization: typeof walletAccountWithSignAuth.signAuthorization === 'function'
					});

					if (typeof walletAccountWithSignAuth.signAuthorization === 'function') {
						for (const chainId of missingChainIds) {
							try {
								const nonce = await this.getAuthorizationNonce(
									walletAccount.address as Address,
									chainId
								);
								debugLog('Signing authorization for chain:', chainId);
								const auth = await walletAccountWithSignAuth.signAuthorization({
									contractAddress: EIP7702_DELEGATE_CONTRACT,
									chainId,
									nonce
								});

								debugLog('Authorization signed for chain:', {
									chainId,
									hasR: Boolean(auth.r),
									hasS: Boolean(auth.s),
									yParity: auth.yParity
								});

								authsList.push({
									chainId,
									address: EIP7702_DELEGATE_CONTRACT,
									nonce: auth.nonce ?? nonce,
									r: auth.r,
									s: auth.s,
									yParity: auth.yParity ?? 0
								});
							} catch (signError) {
								const errorMsg = signError instanceof Error ? signError.message : String(signError);
								console.error('[Rhinestone Client] Failed to sign authorization for chain:', {
									chainId,
									error: errorMsg
								});

								if (isUserRejection(errorMsg)) {
									throw new AAError(
										'Authorization signing was rejected by user',
										AAErrorCode.AUTHORIZATION_REJECTED,
										{
											originalError: signError,
											chainId
										}
									);
								}

								// Dynamic MPC and similar wallets require the Rhinestone SDK to provide authorizations
								if (
									errorMsg.includes('Dynamic MPC') ||
									errorMsg.includes('Rhinestone SDK handles authorizations')
								) {
									walletRequiresSdkAuth = true;
								}

								console.warn(
									'[Rhinestone Client] Could not sign authorization for chain, continuing:',
									chainId
								);
							}
						}
					} else {
						console.warn(
							'[Rhinestone Client] Wallet does not support signAuthorization method. Missing chains:',
							missingChainIds
						);
					}
				}

				// Ensure we don't submit with incomplete authorizations (orchestrator will reject)
				// Exception: when SDK succeeded and returned [] or partial list, trust it - the account may
				// already be delegated on those chains (e.g. second swap after first succeeded on Arbitrum)
				const gotChainIdsFinal = new Set(
					authsList.map((a) => Number(a.chainId)).filter((id) => !isNaN(id))
				);
				const stillMissingChainIds = chainsNeedingAuth
					.map((c) => c.id)
					.filter((chainId) => !gotChainIdsFinal.has(chainId));

				if (stillMissingChainIds.length > 0 && !sdkSucceeded) {
					// Only enforce when we fell back to manual and still have gaps
					if (walletRequiresSdkAuth) {
						throw new AAError(
							'This cross-chain swap requires EIP-7702 authorizations. The Rhinestone SDK did not provide them, and your wallet (Dynamic MPC) does not support manual authorization signing. Please try again in a few minutes, or use a different wallet that supports EIP-7702 authorization signing.',
							AAErrorCode.SWAP_FAILED,
							{
								missingChains: stillMissingChainIds,
								chainsNeedingAuth: chainsNeedingAuth.map((c) => c.id)
							}
						);
					}
					throw new AAError(
						`EIP-7702 authorizations could not be obtained for chain(s): ${stillMissingChainIds.join(
							', '
						)}. The transaction cannot be submitted without them.`,
						AAErrorCode.SWAP_FAILED,
						{
							missingChains: stillMissingChainIds,
							chainsNeedingAuth: chainsNeedingAuth.map((c) => c.id)
						}
					);
				}

				debugLog('Final authorization list:', {
					count: authsList.length,
					chainIds: authsList.map((a) => a.chainId),
					expectedChains: chainsNeedingAuth.map((c) => c.id)
				});

				return authsList as unknown as SignedAuthorizationList;
			};

			const authorizations = await signAuths();

			const submit = async (auths: SignedAuthorizationList) => {
				debugLog('Submitting cross-chain transaction...');
				return rhinestoneAccount.submitTransaction(signedTx, auths);
			};

			let txResult: TransactionResult;
			try {
				txResult = await submit(authorizations);
				console.log(
					'[Rhinestone Client] Cross-chain transaction submitted, waiting for execution...',
					{
						intentId: txResult.id.toString(),
						targetChain: txResult.targetChain
					}
				);
			} catch (submitErr) {
				const msg = submitErr instanceof Error ? submitErr.message : String(submitErr);
				console.error('[Rhinestone Client] Failed to submit cross-chain transaction:', {
					error: msg,
					stack: submitErr instanceof Error ? submitErr.stack : undefined
				});

				// keep your existing submitErr handling exactly as-is
				throw submitErr;
			}

			const status = await rhinestoneAccount.waitForExecution(txResult);
			const directHash = status?.fill?.hash ?? status?.claims?.find((c) => c?.hash)?.hash;

			if (directHash && directHash !== '0x') {
				return { txHash: directHash, intentId: txResult.id.toString() };
			}

			const polledHash = await pollForHash(rhinestoneAccount, txResult, 60_000, 2_500);
			if (polledHash && polledHash !== '0x') {
				return { txHash: polledHash, intentId: txResult.id.toString() };
			}

			throw new AAError(
				`Cross-chain transaction completed but no hash returned (intentId: ${txResult.id.toString()}). Backend may not have attached the chain tx hash yet.`,
				AAErrorCode.TRANSACTION_FAILED,
				{ intentId: txResult.id.toString(), status }
			);
		} catch (error) {
			console.error('[Rhinestone Client] executeCrossChainSwap error:', error);

			// keep your existing error wrapping exactly as-is
			if (error instanceof AAError) throw error;

			const errorMessage = error instanceof Error ? error.message : String(error);
			throw new AAError(`Cross-chain swap failed: ${errorMessage}`, AAErrorCode.SWAP_FAILED, {
				originalError: error
			});
		}
	}

	/**
	 * Execute an omnichain transaction with arbitrary calls
	 *
	 * Use this when you need to execute specific contract calls on a target chain
	 * while sourcing funds from another chain.
	 *
	 * @param params - Transaction parameters
	 * @param walletAccount - User's wallet account for signing
	 * @param feeAsset - Optional asset for gas payment (e.g., 'USDC' for ERC20 gas)
	 */
	async executeOmnichainTransaction(
		params: OmnichainTransactionParams,
		walletAccount: Account,
		feeAsset?: string
	): Promise<{ txHash: Hex; intentId: string }> {
		try {
			debugLog('executeOmnichainTransaction called', {
				sourceChain: params.sourceChain,
				targetChain: params.targetChain,
				callsCount: params.calls.length,
				feeAsset,
				walletAddress: walletAccount.address
			});

			if (!this.config.apiKey) {
				throw new AAError('Rhinestone API key not configured', AAErrorCode.RHINESTONE_ERROR);
			}
			if (!this.isSupportedNetwork(params.sourceChain)) {
				throw new AAError(
					`Source chain ${params.sourceChain} not supported`,
					AAErrorCode.UNSUPPORTED_NETWORK
				);
			}
			if (!this.isSupportedNetwork(params.targetChain)) {
				throw new AAError(
					`Target chain ${params.targetChain} not supported`,
					AAErrorCode.UNSUPPORTED_NETWORK
				);
			}

			const rhinestoneAccount = await this.createAccount(walletAccount);
			const sourceChain = CHAIN_CONFIG[params.sourceChain as SupportedNetworkId];
			const targetChain = CHAIN_CONFIG[params.targetChain as SupportedNetworkId];

			const { eip7702InitSignature } = await this.checkDeploymentAndGetInitSignature(
				rhinestoneAccount,
				walletAccount,
				targetChain
			);

			const tokenRequests =
				params.tokenRequests?.map((req) => ({
					address: req.token as Address,
					amount: req.amount
				})) || [];

			const transactionParams: RhinestoneTransactionParams = {
				sourceChain,
				targetChain,
				calls: params.calls.map((call) => ({
					to: call.to as Address,
					value: call.value || 0n,
					data: call.data as Hex
				})),
				tokenRequests,
				feeAsset,
				eip7702InitSignature
			};

			const txWithSigner = await this.maybeAttachSessionSigner(
				rhinestoneAccount,
				walletAccount.address as Address,
				sourceChain.id,
				transactionParams
			);
			const preparedTx = await rhinestoneAccount.prepareTransaction(txWithSigner);
			const signedTx = await rhinestoneAccount.signTransaction(preparedTx);
			const authorizations = await this.getSimpleAuthorizations(
				rhinestoneAccount,
				signedTx,
				walletAccount,
				targetChain.id
			);

			debugLog('Submitting omnichain transaction...');
			const transactionResult = await rhinestoneAccount.submitTransaction(signedTx, authorizations);

			const status = await rhinestoneAccount.waitForExecution(transactionResult);
			const txHash = status.fill?.hash;
			if (!txHash) {
				throw new AAError(
					'Transaction completed but no hash returned',
					AAErrorCode.TRANSACTION_FAILED
				);
			}

			return { txHash, intentId: transactionResult.id.toString() };
		} catch (error) {
			if (error instanceof AAError) throw error;
			throw new AAError(
				`Omnichain transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
				AAErrorCode.TRANSACTION_FAILED,
				{ originalError: error }
			);
		}
	}

	/**
	 * Execute a same-chain token swap using Rhinestone's solver network
	 *
	 * This is for swapping tokens on the same chain (e.g., WETH → USDC on Base).
	 * Uses the 'chain' parameter format and tokenRequests to coordinate the swap.
	 *
	 * @param params - Swap parameters including source/target tokens
	 * @param walletAccount - User's wallet account for signing
	 * @param feeAsset - Optional asset for gas payment (e.g., 'USDC' for ERC20 gas)
	 */
	async executeSameChainSwap(
		params: {
			chainId: SupportedNetworkId;
			sourceToken: PaymentToken;
			targetToken: PaymentToken;
			amount: bigint;
			recipient: Address;
			slippageBps?: number;
		},
		walletAccount: Account,
		feeAsset?: string
	): Promise<{ txHash: Hex; intentId: string }> {
		try {
			debugLog('executeSameChainSwap called', {
				chainId: params.chainId,
				sourceToken: params.sourceToken.symbol,
				targetToken: params.targetToken.symbol,
				amount: params.amount.toString(),
				feeAsset,
				walletAddress: walletAccount.address
			});

			// Validate API key
			if (!this.config.apiKey) {
				throw new AAError('Rhinestone API key not configured', AAErrorCode.RHINESTONE_ERROR);
			}

			// Validate network
			if (!this.isSupportedNetwork(params.chainId)) {
				throw new AAError(`Chain ${params.chainId} not supported`, AAErrorCode.UNSUPPORTED_NETWORK);
			}

			// Get a quote first to ensure the orchestrator has token configuration/price data
			// This is REQUIRED because the orchestrator needs to know about both tokens
			// before it can prepare the swap transaction. The quote call populates the
			// orchestrator's internal cache with token configs and prices.
			debugLog('Getting quote to populate orchestrator token data...');
			const quote = await this.getSwapQuote({
				sourceChain: params.chainId,
				targetChain: params.chainId,
				sourceToken: params.sourceToken,
				targetToken: params.targetToken,
				amount: params.amount,
				recipient: params.recipient,
				slippageBps: params.slippageBps
			});
			debugLog('Quote obtained successfully, orchestrator has token data');

			// Check if quote has expired
			if (Date.now() > quote.expiresAt) {
				throw new AAError('Quote has expired, please try again', AAErrorCode.QUOTE_EXPIRED);
			}

			// Create Rhinestone account
			const rhinestoneAccount = await this.createAccount(walletAccount);

			// Get chain config
			const chain = CHAIN_CONFIG[params.chainId];

			// Check deployment and get EIP-7702 init signature if needed
			const { eip7702InitSignature } = await this.checkDeploymentAndGetInitSignature(
				rhinestoneAccount,
				walletAccount,
				chain
			);

			// Build the transfer call for the target token
			// The solver will handle the swap and then execute this transfer
			// Use the quote's outputAmount for the transfer amount
			const transferCall = {
				to: params.targetToken.address as Address,
				value: 0n,
				data: encodeFunctionData({
					abi: erc20Abi,
					functionName: 'transfer',
					args: [params.recipient, quote.outputAmount] // Use quote output amount
				})
			};

			// Build sourceAssets: token addresses the orchestrator can use for routing/pricing
			const sourceAssetsTokens = [params.sourceToken.address];
			if (params.targetToken.address.toLowerCase() !== params.sourceToken.address.toLowerCase()) {
				sourceAssetsTokens.push(params.targetToken.address);
			}

			const transactionParams: RhinestoneTransactionParams = {
				chain,
				calls: [transferCall],
				tokenRequests: [
					{
						address: params.sourceToken.address as Address,
						amount: params.amount
					}
				],
				sourceAssets: { [chain.id]: sourceAssetsTokens },
				feeAsset,
				eip7702InitSignature
			};

			debugLog('Preparing same-chain swap transaction...', {
				chainId: chain.id,
				sourceToken: params.sourceToken.address,
				sourceTokenSymbol: params.sourceToken.symbol,
				targetToken: params.targetToken.address,
				targetTokenSymbol: params.targetToken.symbol,
				amount: params.amount.toString(),
				feeAsset,
				sourceAssets: transactionParams.sourceAssets,
				hasEip7702Init: Boolean(eip7702InitSignature)
			});

			// ✅ Sessions signer injection (right before prepareTransaction). Fallback to non-session if enable fails.
			let txWithSigner: RhinestoneTransactionParams;
			try {
				txWithSigner = await this.maybeAttachSessionSigner(
					rhinestoneAccount,
					walletAccount.address as Address,
					chain.id,
					transactionParams
				);
			} catch (sessionErr) {
				if (isSessionEnableError(sessionErr)) {
					console.warn(
						'[Rhinestone Client] Session enable failed. Proceeding without 1-click session.',
						sessionErr instanceof Error ? sessionErr.message : sessionErr
					);
					txWithSigner = transactionParams;
				} else {
					throw sessionErr;
				}
			}

			// Use 3-step flow that properly handles eip7702InitSignature
			// (sendTransaction has a bug where it doesn't pass through the signature)
			const preparedTx = await rhinestoneAccount.prepareTransaction(txWithSigner);
			debugLog('Transaction prepared, signing...');

			const signedTx = await rhinestoneAccount.signTransaction(preparedTx);
			debugLog('Transaction signed, getting authorizations...');

			// Brief delay to let Dynamic wallet UI settle between signing requests
			await sleep(500);

			const authorizations = await this.getSimpleAuthorizations(
				rhinestoneAccount,
				signedTx,
				walletAccount,
				chain.id
			);

			debugLog('Submitting transaction...');
			const transactionResult = await rhinestoneAccount.submitTransaction(signedTx, authorizations);

			debugLog('Swap transaction submitted, waiting for execution...', {
				intentId: transactionResult.id.toString()
			});

			// Wait for execution
			const status = await rhinestoneAccount.waitForExecution(transactionResult);
			debugLog('Swap execution complete:', status);

			const txHash = status.fill?.hash;
			if (!txHash) {
				throw new AAError('Swap completed but no hash returned', AAErrorCode.TRANSACTION_FAILED);
			}

			return {
				txHash,
				intentId: transactionResult.id.toString()
			};
		} catch (error) {
			console.error('[Rhinestone Client] executeSameChainSwap failed:', error);

			// Check if it's an orchestrator error about missing token config
			const errorMessage = error instanceof Error ? error.message : String(error);
			if (
				errorMessage.includes('Missing arbitrary token config') ||
				errorMessage.includes('price for swapped token')
			) {
				// This error suggests the orchestrator doesn't have price/config data for one of the tokens
				// Try to provide more helpful error message
				throw new AAError(
					`Swap failed: The orchestrator doesn't have price or configuration data for one of the tokens in this swap. ` +
						`Source token: ${params.sourceToken.symbol} (${params.sourceToken.address}), ` +
						`Target token: ${params.targetToken.symbol} (${params.targetToken.address}). ` +
						`This might happen with less common tokens. Try using a more common token pair, or contact support.`,
					AAErrorCode.SWAP_FAILED,
					{
						originalError: error,
						sourceToken: params.sourceToken,
						targetToken: params.targetToken
					}
				);
			}

			if (error instanceof AAError) throw error;
			throw new AAError(`Same-chain swap failed: ${errorMessage}`, AAErrorCode.SWAP_FAILED, {
				originalError: error
			});
		}
	}

	/**
	 * Execute a same-chain transaction with optional ERC20 gas payment
	 *
	 * For same-chain transactions, we use the 'chain' parameter (not sourceChain/targetChain).
	 * This is the correct format per Rhinestone SDK types.
	 *
	 * @param params - Transaction parameters with chainId and calls
	 * @param walletAccount - User's wallet account for signing
	 * @param feeAsset - Optional asset for gas payment (e.g., 'USDC' for ERC20 gas)
	 */
	async executeSameChainTransaction(
		params: {
			chainId: SupportedNetworkId;
			calls: Array<{ to: string; value?: bigint; data?: string }>;
		},
		walletAccount: Account,
		feeAsset?: string
	): Promise<{ txHash: Hex; intentId: string }> {
		const chain = CHAIN_CONFIG[params.chainId];

		try {
			debugLog('executeSameChainTransaction called', {
				chainId: params.chainId,
				callsCount: params.calls.length,
				feeAsset,
				walletAddress: walletAccount.address
			});

			if (!this.config.apiKey) {
				throw new AAError('Rhinestone API key not configured', AAErrorCode.RHINESTONE_ERROR);
			}

			if (!this.isSupportedNetwork(params.chainId)) {
				throw new AAError(`Chain ${params.chainId} not supported`, AAErrorCode.UNSUPPORTED_NETWORK);
			}

			const rhinestoneAccount = await this.createAccount(walletAccount);

			// Check deployment and get EIP-7702 init signature if needed
			const { eip7702InitSignature } = await this.checkDeploymentAndGetInitSignature(
				rhinestoneAccount,
				walletAccount,
				chain
			);

			const feeAssetAddress = resolveFeeAssetAddress(feeAsset, chain.id);
			const sourceAssets = feeAssetAddress ? { [chain.id]: [feeAssetAddress] } : undefined;

			let transactionParams: RhinestoneTransactionParams = {
				chain,
				calls: params.calls.map((c) => ({
					to: c.to as Address,
					value: (c.value ?? 0n) as bigint,
					data: (c.data ?? '0x') as Hex
				})),
				feeAsset,
				sourceAssets,
				eip7702InitSignature
			};

			// Smart account has no ERC20 balance; orchestrator checks its balance and returns "Insufficient balance".
			// Pass the owner (EOA) fee-asset balance as auxiliaryFunds so the orchestrator can quote and route.
			if (feeAssetAddress) {
				try {
					const publicClient = this.createPublicClient(params.chainId);
					const eoaBalance = await publicClient.readContract({
						address: feeAssetAddress,
						abi: erc20Abi,
						functionName: 'balanceOf',
						args: [walletAccount.address]
					});
					if (eoaBalance > 0n) {
						(transactionParams as { auxiliaryFunds?: AuxiliaryFundsInput }).auxiliaryFunds = {
							[chain.id]: { [feeAssetAddress]: eoaBalance }
						};
						debugLog('Set auxiliaryFunds from EOA balance for fee asset', {
							chainId: chain.id,
							feeAssetAddress,
							eoaBalance: eoaBalance.toString()
						});
					}
				} catch (auxErr) {
					debugLog('Could not fetch EOA fee-asset balance for auxiliaryFunds', {
						feeAssetAddress,
						error: auxErr instanceof Error ? auxErr.message : auxErr
					});
				}
			}

			debugLog('Preparing same-chain transaction', {
				chainId: chain.id,
				callsCount: transactionParams.calls.length,
				feeAsset,
				feeAssetAddress,
				hasEip7702Init: Boolean(eip7702InitSignature),
				hasAuxiliaryFunds: Boolean(
					(transactionParams as { auxiliaryFunds?: AuxiliaryFundsInput }).auxiliaryFunds
				),
				walletAddress: walletAccount.address
			});

			const isInsufficientBalanceForToken = (err: unknown): boolean => {
				const m = err instanceof Error ? err.message : String(err);
				const lower = m.toLowerCase();
				return (
					lower.includes('insufficient balance') ||
					lower.includes('insufficient balance for token transfer') ||
					lower.includes('insufficientbalance')
				);
			};

			const runPrepareSignSubmit = async (
				txParams: RhinestoneTransactionParams
			): Promise<TransactionResult> => {
				let txWithSigner: RhinestoneTransactionParams;
				try {
					txWithSigner = await this.maybeAttachSessionSigner(
						rhinestoneAccount,
						walletAccount.address as Address,
						chain.id,
						txParams
					);
				} catch (sessionErr) {
					if (isSessionEnableError(sessionErr)) {
						console.warn(
							'[Rhinestone Client] Session enable failed. Proceeding without 1-click session.',
							sessionErr instanceof Error ? sessionErr.message : sessionErr
						);
						txWithSigner = txParams;
					} else {
						throw sessionErr;
					}
				}

				const preparedTx = await rhinestoneAccount.prepareTransaction(txWithSigner);
				const signedTx = await rhinestoneAccount.signTransaction(preparedTx);
				await sleep(500);
				const authorizations = await this.getSimpleAuthorizations(
					rhinestoneAccount,
					signedTx,
					walletAccount,
					chain.id
				);
				return rhinestoneAccount.submitTransaction(signedTx, authorizations);
			};

			let txResult: TransactionResult;
			try {
				txResult = await runPrepareSignSubmit(transactionParams);
			} catch (firstErr) {
				// Orchestrator may accept auxiliaryFunds at quote but at execution still debit from smart account (which has 0). Retry without feeAsset so gas is paid in native token.
				if (
					feeAsset &&
					isInsufficientBalanceForToken(firstErr) &&
					(transactionParams as { auxiliaryFunds?: AuxiliaryFundsInput }).auxiliaryFunds
				) {
					console.warn(
						'[Rhinestone Client] Submit failed (insufficient balance for token). Retrying without pay-in-stablecoin (native gas).',
						firstErr instanceof Error ? firstErr.message : firstErr
					);
					const noFeeParams: RhinestoneTransactionParams = {
						chain,
						calls: params.calls.map((c) => ({
							to: c.to as Address,
							value: (c.value ?? 0n) as bigint,
							data: (c.data ?? '0x') as Hex
						})),
						eip7702InitSignature
					};
					try {
						txResult = await runPrepareSignSubmit(noFeeParams);
					} catch (retryErr) {
						// Both attempts failed; throw a clear message.
						throw new AAError(
							`Pay fees in stablecoin (${feeAsset}) isn't supported for this wallet—the smart account has no ${feeAsset}. Uncheck "Pay fees in stablecoin" and use the network's native token for gas, or try again later.`,
							AAErrorCode.TRANSACTION_FAILED,
							{ originalError: retryErr, firstError: firstErr }
						);
					}
				} else {
					const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
					if (msg.includes('authorization list') && msg.includes('cover chain')) {
						const txWithSigner = await this.maybeAttachSessionSigner(
							rhinestoneAccount,
							walletAccount.address as Address,
							chain.id,
							transactionParams
						);
						const preparedTx = await rhinestoneAccount.prepareTransaction(txWithSigner);
						const signedTx = await rhinestoneAccount.signTransaction(preparedTx);
						await sleep(500);
						const authorizations = await this.getSimpleAuthorizations(
							rhinestoneAccount,
							signedTx,
							walletAccount,
							chain.id
						);
						txResult = await rhinestoneAccount.submitTransaction(signedTx, authorizations);
					} else {
						throw firstErr;
					}
				}
			}

			debugLog('Transaction submitted, waiting for execution...', {
				intentId: txResult.id.toString(),
				targetChain: txResult.targetChain
			});

			function extractHash(st: TransactionStatus | null | undefined): Hex | undefined {
				if (!st) return undefined;
				// Standard paths
				const fromFill = (st as TransactionStatus).fill?.hash;
				const fromClaims = (st as TransactionStatus).claims?.find((c) => c?.hash)?.hash;
				const h = fromFill ?? fromClaims;
				if (h && h !== '0x') return h;
				// SDK may return different shapes per chain (e.g. Arbitrum)
				const anySt = st as unknown as Record<string, unknown>;
				const alt = (anySt?.transactionHash ?? anySt?.hash ?? anySt?.txHash) as string | undefined;
				if (alt && typeof alt === 'string' && alt.startsWith('0x') && alt.length === 66)
					return alt as Hex;
				// fill or claims might be arrays
				const fillArr = anySt?.fill as Array<{ hash?: string }> | undefined;
				if (Array.isArray(fillArr) && fillArr[0]?.hash) return fillArr[0].hash as Hex;
				const claimsArr = anySt?.claims as Array<{ hash?: string }> | undefined;
				if (Array.isArray(claimsArr)) {
					const claimHash = claimsArr.find((c) => c?.hash && c.hash !== '0x')?.hash;
					if (claimHash) return claimHash as Hex;
				}
				return undefined;
			}

			let status: TransactionStatus | null | undefined =
				await rhinestoneAccount.waitForExecution(txResult);
			let directHash = extractHash(status);
			if (!directHash && status != null) {
				debugLog('Execution status keys (hash missing)', {
					keys: Object.keys(status as object),
					intentId: txResult.id.toString(),
					chainId: chain.id
				});
			}

			if (directHash) {
				return { txHash: directHash, intentId: txResult.id.toString() };
			}

			// Backend may attach the chain tx hash a few seconds later (e.g. on Arbitrum)
			console.warn(
				'[Rhinestone Client] No txHash in first execution status. Waiting 5s then re-checking...',
				{ intentId: txResult.id.toString(), chainId: chain.id }
			);
			await sleep(5000);
			status = await rhinestoneAccount.waitForExecution(txResult);
			directHash = extractHash(status);
			if (directHash) {
				return { txHash: directHash, intentId: txResult.id.toString() };
			}

			// Poll longer; use 75s for non-Base chains where backend can be slower to attach hash
			const pollMs = chain.id === 42161 ? 75_000 : 60_000;
			const polledHash = await pollForHash(rhinestoneAccount, txResult, pollMs, 2_500);
			if (polledHash && polledHash !== '0x') {
				return { txHash: polledHash, intentId: txResult.id.toString() };
			}

			const chainName =
				chain.id === 8453 ? 'Base' : chain.id === 42161 ? 'Arbitrum' : `chain ${chain.id}`;
			throw new AAError(
				`Transaction completed but the transaction hash was not returned yet. Your transfer may have succeeded—check your wallet or the ${chainName} block explorer. If it did not go through, try again in a few minutes. (intentId: ${txResult.id.toString()})`,
				AAErrorCode.TRANSACTION_FAILED,
				{
					intentId: txResult.id.toString(),
					chainId: chain.id,
					feeAsset,
					status
				}
			);
		} catch (error) {
			console.error('[Rhinestone Client] executeSameChainTransaction failed:', error);
			if (error instanceof AAError) throw error;

			const msg = error instanceof Error ? error.message : String(error);
			const isInsufficientBalance =
				msg.toLowerCase().includes('insufficient balance') ||
				msg.toLowerCase().includes('insufficientbalance');

			if (isInsufficientBalance && feeAsset) {
				throw new AAError(
					`Not enough ${feeAsset} to pay for gas. Your wallet (or smart account) needs ${feeAsset} on this network. Add ${feeAsset} and try again, or pay gas in the network’s native token instead.`,
					AAErrorCode.TRANSACTION_FAILED,
					{ originalError: error }
				);
			}

			throw new AAError(
				`Same-chain transaction failed: ${msg}`,
				AAErrorCode.TRANSACTION_FAILED,
				{ originalError: error }
			);
		}
	}

	/**
	 * Manually sign EIP-7702 authorization using Dynamic wallet client
	 *
	 * This is a workaround for JSON-RPC accounts that don't support viem's signAuthorization.
	 * We use the wallet client's signAuthorization method directly, which works with JSON-RPC accounts.
	 *
	 * @param walletAccount - The wallet account
	 * @param chain - The chain to authorize
	 * @param accountAddress - The account address (EOA address)
	 * @param preparedTx - The prepared transaction (to extract delegate contract address)
	 * @param walletClient - Optional wallet client (will be fetched if not provided)
	 * @returns Signed authorization list
	 */
	private async manualSignAuthorization(
		walletAccount: Account,
		chain: Chain,
		accountAddress: Address,
		preparedTx: PreparedTransaction,
		walletClient?: WalletClient
	): Promise<SignedAuthorizationList> {
		try {
			// Get wallet client if not provided
			if (!walletClient) {
				// Try to get from cache first
				const cacheKey = `${walletAccount.address}-${chain.id}`;
				walletClient = this.walletClientCache.get(cacheKey);

				if (!walletClient) {
					// Try to get the Dynamic wallet client
					const { createDynamicWalletClient } = await import('../wallets/dynamic');
					const fetchedWalletClient = await createDynamicWalletClient(
						chain.id as SupportedNetworkId
					);

					if (fetchedWalletClient) {
						walletClient = fetchedWalletClient;
						this.walletClientCache.set(cacheKey, walletClient);
					}
				}
			}

			if (!walletClient) {
				throw new Error('Failed to get Dynamic wallet client');
			}

			// Get the nonce for the account
			const publicClient = this.createPublicClient(chain.id as SupportedNetworkId);
			const nonce = await publicClient.getTransactionCount({ address: accountAddress });

			// Get delegate contract address from Rhinestone SDK
			// For EIP-7702, the delegate is the smart account implementation
			// We need to create a Rhinestone account to access this information
			let delegateContractAddress: Address | undefined;

			try {
				// Create a Rhinestone account to get the delegate address
				const tempRhinestoneAccount = await this.createAccount(walletAccount);

				// Try to get transaction messages which might contain delegate information
				const messages = tempRhinestoneAccount.getTransactionMessages(preparedTx);

				// The delegate address might be in the messages structure
				// For EIP-7702, it's typically in the authorization data
				if (messages && typeof messages === 'object') {
					// Log messages for debugging
					debugLog('Transaction messages:', safeStringify(messages));

					// Try to extract delegate address from messages
					// The structure varies, so we check multiple possible locations
					const messagesStr = safeStringify(messages);

					// Look for address-like patterns in the messages
					const addressPattern = /0x[a-fA-F0-9]{40}/g;
					const addresses = messagesStr.match(addressPattern);

					if (addresses && addresses.length > 0) {
						// The delegate address is likely one of these addresses
						// For EIP-7702, it should be the smart account implementation
						// We'll try the first non-account address we find
						for (const addr of addresses) {
							if (addr.toLowerCase() !== accountAddress.toLowerCase()) {
								delegateContractAddress = addr as Address;
								debugLog('Found potential delegate address:', delegateContractAddress);
								break;
							}
						}
					}
				}

				// If we still don't have it, try to get it from the SDK's account
				// The SDK might expose the implementation address
				const accountWithImpl = tempRhinestoneAccount as RhinestoneAccount & {
					implementation?: Address;
				};
				if (!delegateContractAddress && accountWithImpl.implementation) {
					delegateContractAddress = accountWithImpl.implementation;
					debugLog('Got delegate address from account implementation:', delegateContractAddress);
				}
			} catch (msgError) {
				console.warn('[Rhinestone Client] Could not extract delegate address:', msgError);
			}

			// Use wallet client's signAuthorization method
			// This works with JSON-RPC accounts because the wallet client handles the RPC call
			if (typeof walletClient.signAuthorization === 'function') {
				if (!delegateContractAddress) {
					// If we still don't have the delegate address, we need to throw an error
					// The delegate address is required for EIP-7702 authorization
					throw new Error(
						'Delegate contract address required for EIP-7702 authorization. ' +
							'Could not extract it from Rhinestone SDK. ' +
							'This might be a limitation of the SDK or the account type.'
					);
				}

				try {
					debugLog('Using wallet client signAuthorization with delegate:', delegateContractAddress);

					const authorization = await walletClient.signAuthorization({
						account: walletAccount,
						contractAddress: delegateContractAddress
					});

					debugLog('Authorization signed successfully:', {
						chainId: chain.id,
						delegate: delegateContractAddress,
						nonce: nonce.toString()
					});

					// Convert to SignedAuthorizationList format
					// Viem expects number for chainId and nonce, and requires yParity
					const signedAuth = {
						chainId: Number(chain.id),
						address: delegateContractAddress,
						nonce: Number(nonce),
						r: authorization.r,
						s: authorization.s,
						yParity:
							authorization.yParity ??
							(authorization.v !== undefined ? (authorization.v === 0n ? 0 : 1) : 0)
					};

					return [signedAuth] as unknown as SignedAuthorizationList;
				} catch (signError) {
					console.error('[Rhinestone Client] Wallet client signAuthorization failed:', signError);
					throw signError;
				}
			} else {
				throw new Error('Wallet client does not support signAuthorization method');
			}
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			throw new Error(`Failed to manually sign authorization: ${errorMsg}`);
		}
	}

	/**
	 * Check if a network is supported
	 */
	isSupportedNetwork(chainId: number): chainId is SupportedNetworkId {
		return Object.values(SUPPORTED_NETWORKS).includes(chainId as SupportedNetworkId);
	}

	/**
	 * Get chain configuration
	 */
	getChain(chainId: SupportedNetworkId): Chain {
		return CHAIN_CONFIG[chainId];
	}

	/**
	 * Create a public client for a specific chain
	 */
	createPublicClient(chainId: SupportedNetworkId) {
		return createPublicClient({
			chain: CHAIN_CONFIG[chainId],
			transport: createRpcTransport(chainId)
		});
	}

	/**
	 * Clear cached session/eip7702 data (memory + localStorage).
	 * When walletAddress is provided, only that wallet's cache entries are removed.
	 */
	clearSessionCaches(walletAddress?: Address): void {
		const normalizedAddress = walletAddress?.toLowerCase();

		for (const cachedAddress of this.eip7702InitSignatureCache.keys()) {
			if (!normalizedAddress || cachedAddress.toLowerCase() === normalizedAddress) {
				this.eip7702InitSignatureCache.delete(cachedAddress);
			}
		}

		for (const cacheKey of this.sessionEnableCache.keys()) {
			if (!normalizedAddress || cacheKey.startsWith(`rhinestone:sessions:${normalizedAddress}:`)) {
				this.sessionEnableCache.delete(cacheKey);
			}
		}

		if (typeof window === 'undefined') return;

		const keysToRemove: string[] = [];
		const sessionPrefix = normalizedAddress
			? `rhinestone:sessions:${normalizedAddress}:`
			: 'rhinestone:sessions:';
		const ownerPkKey = normalizedAddress
			? `rhinestone:sessionOwnerPk:${normalizedAddress}`
			: undefined;

		for (let i = 0; i < window.localStorage.length; i++) {
			const key = window.localStorage.key(i);
			if (!key) continue;

			if (key.startsWith(sessionPrefix) || (ownerPkKey && key === ownerPkKey)) {
				keysToRemove.push(key);
				continue;
			}

			if (!normalizedAddress && key.startsWith('rhinestone:sessionOwnerPk:')) {
				keysToRemove.push(key);
			}
		}

		for (const key of keysToRemove) {
			window.localStorage.removeItem(key);
		}
	}

	/**
	 * Get the underlying SDK instance for advanced usage
	 */
	getSDK(): RhinestoneSDK {
		return this.sdk;
	}

	/**
	 * Check if gas sponsorship is enabled
	 */
	isSponsorshipEnabled(): boolean {
		return this.config.sponsorship?.enabled ?? false;
	}

	/**
	 * Get sponsorship configuration
	 */
	getSponsorshipConfig(): SponsorshipConfig | undefined {
		return this.config.sponsorship;
	}
}

/**
 * Get or create the Rhinestone client singleton
 *
 * Account Type Selection:
 * - Default: Uses EIP-7702 mode for all wallets (preserves EOA address)
 * - Can be overridden with PUBLIC_RHINESTONE_ACCOUNT_TYPE env var ('7702' or 'smart')
 *
 * Gas Sponsorship (native to Rhinestone):
 * 1. Get your deposit wallet from Rhinestone Dashboard
 * 2. Deposit USDC on Base to that wallet
 * 3. Set PUBLIC_RHINESTONE_SPONSORSHIP_ENABLED=true
 * 4. Transactions will use your sponsorship balance
 */
export function getRhinestoneClient(): RhinestoneClient {
	if (!rhinestoneInstance) {
		const apiKey = env.PUBLIC_RHINESTONE_API_KEY;

		if (!apiKey) {
			console.warn('Rhinestone API key not configured. Cross-chain features will be limited.');
		}

		// Rhinestone native sponsorship - deposit USDC on Base to your sponsorship wallet
		const sponsorship: SponsorshipConfig | undefined =
			env.PUBLIC_RHINESTONE_SPONSORSHIP_ENABLED === 'true' ? { enabled: true } : undefined;

		/**
		 * ✅ Account type selection
		 *
		 * Key rule:
		 * - Dynamic embedded (MPC) currently cannot provide EIP-7702 authorization signing coverage
		 *   required for cross-chain when source chain isn't deployed.
		 * - So default Dynamic embedded -> "smart" (4337) to make cross-chain work.
		 * - External wallets -> "7702" to preserve EOA address when supported.
		 */
		let accountType: '7702' | 'smart';

		if (env.PUBLIC_RHINESTONE_ACCOUNT_TYPE) {
			// Explicit override always wins
			accountType = env.PUBLIC_RHINESTONE_ACCOUNT_TYPE as '7702' | 'smart';
		} else {
			const isEmbedded = isDynamicEmbeddedWallet();

			// ✅ IMPORTANT FIX:
			// Dynamic embedded wallets should default to "smart" until they can sign 7702 authorizations.
			accountType = isEmbedded ? 'smart' : '7702';

			debugLog('Auto-selected account type:', accountType, { isEmbedded });
		}

		rhinestoneInstance = new RhinestoneClient({
			apiKey: apiKey || '',
			providerType: env.PUBLIC_ALCHEMY_API_KEY ? 'alchemy' : 'public',
			providerApiKey: env.PUBLIC_ALCHEMY_API_KEY,
			sponsorship,
			accountType
		});
	}

	return rhinestoneInstance;
}

/**
 * Check if Rhinestone is properly configured
 */
export function isRhinestoneConfigured(): boolean {
	return Boolean(env.PUBLIC_RHINESTONE_API_KEY);
}

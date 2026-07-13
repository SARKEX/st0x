// ─────────────────────────────────────────────────────────────────────────
// Save & Earn (SGOV) — product config + static copy.
//
// SGOV_APY is the headline yield shown across the Save & Earn surfaces. It is a
// manually maintained constant (no live feed yet) — update it here when the
// displayed rate changes. wtSGOV is the auto-compounding wrapper users actually
// buy; tSGOV is the dividend-paying unwrapped share.
//
// The copy constants below are ported verbatim from the Save & Earn handoff
// dossier so the product narrative stays consistent across the home card, the
// /earn hub, and the deposit modal.
// ─────────────────────────────────────────────────────────────────────────
import { getTokenByAnyAddress } from '$lib/config/network';

export const SGOV_APY = 3;

// Canonical SGOV addresses on Base (mirror src/lib/config/tokens.ts → wtSGOV).
export const SGOV_WRAPPED_ADDRESS = '0x78c31580c97101694C70022c83D570150c11e935';
export const SGOV_UNWRAPPED_ADDRESS = '0xc941C1506B7555Ba8C506Fb6c9b9CC259902d612';

const SGOV_ADDRESSES = new Set<string>([
	SGOV_WRAPPED_ADDRESS.toLowerCase(),
	SGOV_UNWRAPPED_ADDRESS.toLowerCase()
]);

export function formatApy(decimals = 2): string {
	// Trim trailing zeros so a round rate renders as "3%" rather than "3.00%".
	return parseFloat(SGOV_APY.toFixed(decimals)).toString();
}

// True for any SGOV address variant (wrapped, unwrapped, or legacy). Falls back
// to the token registry so legacy addresses that resolve to the same config are
// still recognised.
export function isSgov(address: string | null | undefined): boolean {
	if (!address) return false;
	if (SGOV_ADDRESSES.has(address.toLowerCase())) return true;
	const token = getTokenByAnyAddress(address);
	return token?.symbol === 'wtSGOV' || token?.symbol === 'tSGOV';
}

// ── Static copy ────────────────────────────────────────────────────────────

export interface TreasuryRow {
	name: string;
	issuer: string;
	ok: boolean;
	access: string;
	highlight?: boolean;
}

// The moat: every meaningful tokenised Treasury requires KYC. Except SGOV.
export const TREASURY_COMPARE: TreasuryRow[] = [
	{
		name: 'SGOV',
		issuer: 'BlackRock / S01',
		ok: true,
		access: 'Any wallet · any DeFi protocol',
		highlight: true
	},
	{
		name: 'BUIDL',
		issuer: 'BlackRock',
		ok: false,
		access: '$5M min · US qualified purchasers · whitelist'
	},
	{ name: 'OUSG', issuer: 'Ondo', ok: false, access: 'Qualified purchasers · KYC via Ondo portal' },
	{ name: 'BENJI', issuer: 'Franklin Templeton', ok: false, access: 'KYC via Benji · gated' },
	{ name: 'USTB', issuer: 'Superstate', ok: false, access: 'Qualified purchasers · allowlist' },
	{
		name: 'USYC',
		issuer: 'Hashnote / Circle',
		ok: false,
		access: 'KYC + qualified investor screening'
	},
	{ name: 'USDY', issuer: 'Ondo', ok: false, access: 'Non-US persons only · KYC at onboarding' }
];

export type YieldMode = 'dividends' | 'compound';

export interface YieldToken {
	sym: string;
	token: 'tsgov' | 'wtsgov';
	tag: string;
	desc: string;
	best: string;
	mode: YieldMode;
	recommended?: boolean;
}

// Two tokens, one underlying — "choose your yield".
export const TWO_TOKEN: YieldToken[] = [
	{
		sym: 'tSGOV',
		token: 'tsgov',
		tag: 'Get paid',
		desc: 'Cash dividends paid to you in stablecoins, every month.',
		best: 'Reserves · treasuries · credit allocators',
		mode: 'dividends'
	},
	{
		sym: 'wtSGOV',
		token: 'wtsgov',
		tag: 'Auto-compound',
		recommended: true,
		desc: 'Dividends reinvest into the wrapper — each wtSGOV grows worth more tSGOV. Your balance just rises.',
		best: 'DeFi · set-and-forget saving',
		mode: 'compound'
	}
];

export type EarnIconName =
	| 'unlock'
	| 'bank'
	| 'bolt'
	| 'shield'
	| 'sprout'
	| 'check'
	| 'close'
	| 'info'
	| 'plus'
	| 'minus'
	| 'clock'
	| 'arrowRight'
	| 'arrowUpRight'
	| 'arrowDown'
	| 'chevronDown'
	| 'trendUp'
	| 'wallet'
	| 'blocks'
	| 'coins'
	| 'chart'
	| 'lock'
	| 'swap'
	| 'home';

export interface Pillar {
	icon: EarnIconName;
	title: string;
	body: string;
}

export const PILLARS: Pillar[] = [
	{
		icon: 'unlock',
		title: 'Permissionless — no KYC',
		body: 'The only tokenised Treasury you can hold in any wallet and use in any DeFi protocol. Every rival gates access behind KYC.'
	},
	{
		icon: 'bank',
		title: 'Redeemable Treasuries',
		body: "Backed 1:1 by SGOV — BlackRock's $85B T-bill ETF. Redeem to actual SGOV shares in under 10s, 24/7. Not an IOU."
	},
	{
		icon: 'bolt',
		title: 'Auto-compounding',
		body: 'Nothing to claim or stake. Treasury yield reinvests into wtSGOV automatically, so your balance grows on its own.'
	},
	{
		icon: 'shield',
		title: 'Backed 1:1, onchain',
		body: 'Every wtSGOV is backed 1:1 by SGOV with a right of redemption to the underlying shares — verifiable onchain, anytime.'
	}
];

export interface HowStep {
	n: number;
	t: string;
	d: string;
}

export const HOW_IT_WORKS: HowStep[] = [
	{
		n: 1,
		t: 'Deposit dollars',
		d: 'Swap USDC into wtSGOV in one tap, right inside st0x. No account, no KYC.'
	},
	{
		n: 2,
		t: 'Treasuries earn',
		d: "Your tokens are backed 1:1 by SGOV — BlackRock's short-dated US T-bill ETF, ~3% yield."
	},
	{
		n: 3,
		t: 'Yield compounds',
		d: 'Each month the Treasury yield is added to the wtSGOV wrapper — so every token is worth more than before. Your balance grows on its own.'
	},
	{
		n: 4,
		t: 'Redeem anytime',
		d: 'Unwrap, swap, or redeem to underlying SGOV shares in under 10s, 24/7. No lockup, no NAV window.'
	}
];

export interface FaqItem {
	q: string;
	a: string;
}

export const EARN_FAQ: FaqItem[] = [
	{
		q: 'How does the yield actually reach me?',
		a: 'The underlying Treasuries earn yield continuously, and each month it’s added to the wtSGOV wrapper — so your token steadily becomes worth more. Nothing to claim or stake. ~3% yield today.'
	},
	{
		q: 'Do I need to KYC?',
		a: 'No. SGOV is the only meaningful tokenised Treasury that’s fully permissionless — any wallet, any DeFi protocol. KYC applies only at primary issuance, never to you on the secondary market.'
	},
	{
		q: 'Is this a savings account?',
		a: 'No. You hold wtSGOV — a tokenised, auto-compounding claim on SGOV, a BlackRock US Treasury ETF — in your own wallet. Not a bank deposit and not FDIC-insured, but backed 1:1 by some of the safest assets in finance.'
	},
	{
		q: 'How do I get my dollars back?',
		a: 'Swap back to USDC on st0x, or redeem to the actual underlying SGOV shares — both in under 10 seconds, 24/7 via the S01 / Alpaca bridge. No lockup, no withdrawal queue.'
	}
];

// Monthly NAV steps for the wtSGOV accretion sparkline (compounding, monotonic
// up). Deterministic — no Math.random so SSR and client render identically.
export const SGOV_SERIES: number[] = (() => {
	const pts: number[] = [];
	let v = 100;
	for (let i = 0; i < 40; i++) {
		v += 0.0096 + Math.sin(i / 3) * 0.0014;
		pts.push(v);
	}
	return pts;
})();

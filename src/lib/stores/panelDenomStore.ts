// Trade panel display denomination. Lives in localStorage so the user's
// preference survives reloads and follows them across tokens.
//
//   'wrapped'   → show wtX symbols + native (wt-denominated) amounts everywhere.
//   'unwrapped' → show tX symbols + t-equivalent amounts; the form quietly
//                 converts at the order boundary so the on-chain trade is
//                 still in wt units (the wrapper is the orderbook primitive).
//
// Holdings on the dashboard use a sibling store with the same shape so the
// trade panel toggle and the dashboard toggle don't fight each other.
import { writable, type Writable } from 'svelte/store';

import type { Denomination } from '$lib/utils/wrapDenom';

const PANEL_DENOM_KEY = 'st0x.panel.denom';
const HOLDINGS_DENOM_KEY = 'st0x.holdings.denom';

function readPersisted(key: string): Denomination {
	if (typeof window === 'undefined') return 'wrapped';
	try {
		const raw = window.localStorage.getItem(key);
		return raw === 'unwrapped' ? 'unwrapped' : 'wrapped';
	} catch {
		return 'wrapped';
	}
}

function createDenomStore(key: string): Writable<Denomination> {
	const store = writable<Denomination>(readPersisted(key));
	store.subscribe((value) => {
		if (typeof window === 'undefined') return;
		try {
			window.localStorage.setItem(key, value);
		} catch {
			// Quotas / privacy mode — silently degrade to in-memory only.
		}
	});
	return store;
}

export const panelDenom = createDenomStore(PANEL_DENOM_KEY);
export const holdingsDenom = createDenomStore(HOLDINGS_DENOM_KEY);

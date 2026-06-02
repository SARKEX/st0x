// Module-scoped store for the wrap-explainer modal open state. Lives outside
// the trade [id]/+page.svelte component (which has 100+ reactive vars and
// hits Svelte 4's 6-word dirty-bit accounting). Keeping the state in a
// module store means the open/close flow is driven entirely by Svelte's
// subscription machinery — no per-component invalidation race regardless of
// how loaded the trade page's reactive graph is at the moment of the click.
import { writable } from 'svelte/store';

export const wrapExplainerOpen = writable(false);

export function openWrapExplainer(): void {
	wrapExplainerOpen.set(true);
}

export function closeWrapExplainer(): void {
	wrapExplainerOpen.set(false);
}

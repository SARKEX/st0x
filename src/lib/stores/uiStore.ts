import { derived, writable } from 'svelte/store';

// Whether the top-bar inline nav has collapsed (the header sets this from its
// width/offset breakpoint). When true, the bottom MobileTabBar is the primary
// navigation — it replaces the old hamburger dropdown. Default false so SSR /
// first paint on desktop never flashes the mobile bar.
export const navCollapsed = writable(false);

// Registry of open bottom-sheet modals, keyed by id. The MobileTabBar hides
// whenever any sheet is open so the sheet's action button never sits behind it.
const openSheets = writable<Set<string>>(new Set());

export function setSheetOpen(id: string, open: boolean): void {
	openSheets.update((sheets) => {
		const next = new Set(sheets);
		if (open) {
			next.add(id);
		} else {
			next.delete(id);
		}
		return next;
	});
}

export const anySheetOpen = derived(openSheets, ($openSheets) => $openSheets.size > 0);

import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'st0x-theme';

function readInitialTheme(): Theme {
	if (!browser) return 'dark';
	const attr = document.documentElement.getAttribute('data-theme');
	return attr === 'light' ? 'light' : 'dark';
}

export const theme = writable<Theme>(readInitialTheme());

export function setTheme(next: Theme): void {
	if (!browser) return;
	document.documentElement.setAttribute('data-theme', next);
	try {
		localStorage.setItem(STORAGE_KEY, next);
	} catch {
		/* localStorage unavailable — persistence is best-effort */
	}
	theme.set(next);
	// Let the ambient canvas re-read the theme's token colors.
	window.dispatchEvent(new CustomEvent('st0x-retint'));
}

export function toggleTheme(): void {
	const current =
		document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
	setTheme(current === 'light' ? 'dark' : 'light');
}

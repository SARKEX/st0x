import { browser } from '$app/environment';

const TUTORIAL_STORAGE_KEY = 'st0x_hide_tutorial';
const VAULT_TUTORIAL_STORAGE_KEY = 'st0x_hide_vault_tutorial';

export function isTutorialHidden(): boolean {
	if (!browser) return true; // Don't show tutorial during SSR
	const stored = localStorage.getItem(TUTORIAL_STORAGE_KEY);
	return stored === 'true';
}

export function hideTutorial(): void {
	if (!browser) return;
	localStorage.setItem(TUTORIAL_STORAGE_KEY, 'true');
}

export function resetTutorial(): void {
	if (!browser) return;
	localStorage.removeItem(TUTORIAL_STORAGE_KEY);
}

// Vault tutorial storage functions
export function isVaultTutorialHidden(): boolean {
	if (!browser) return true; // Don't show tutorial during SSR
	const stored = localStorage.getItem(VAULT_TUTORIAL_STORAGE_KEY);
	return stored === 'true';
}

export function hideVaultTutorial(): void {
	if (!browser) return;
	localStorage.setItem(VAULT_TUTORIAL_STORAGE_KEY, 'true');
}

export function resetVaultTutorial(): void {
	if (!browser) return;
	localStorage.removeItem(VAULT_TUTORIAL_STORAGE_KEY);
}

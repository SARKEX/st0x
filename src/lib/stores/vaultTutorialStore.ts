import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';
import {
	isVaultTutorialHidden,
	hideVaultTutorial as persistHideVaultTutorial
} from '$lib/utils/tutorialStorage';

export type VaultTutorialStep =
	| 'intro'
	| 'vault-deposit'
	| 'cancel-order'
	| 'receipts'
	| 'holdings'
	| 'dashboard'
	| 'complete';

export const VAULT_TUTORIAL_STEPS: VaultTutorialStep[] = [
	'intro',
	'vault-deposit',
	'cancel-order',
	'receipts',
	'holdings',
	'dashboard',
	'complete'
];

// Current vault tutorial step
export const vaultTutorialStep = writable<VaultTutorialStep>('intro');

// Whether vault tutorial is active (visible)
export const vaultTutorialActive = writable<boolean>(false);

// Whether to highlight the DEX activity section
export const vaultTutorialHighlightDex = writable<boolean>(false);

// Which tab to select in DEX activity (orders or holdings)
export const vaultTutorialDexTab = writable<'orders' | 'vaults' | null>(null);

// Start the vault tutorial (called when user first selects limit/dca)
export function startVaultTutorial(): void {
	if (!browser) return;
	if (isVaultTutorialHidden()) return; // Don't show if already completed

	vaultTutorialActive.set(true);
	vaultTutorialStep.set('intro');
}

// Advance to next step
export function nextVaultTutorialStep(): VaultTutorialStep {
	let nextStep: VaultTutorialStep = 'complete';
	vaultTutorialStep.update((current) => {
		const currentIndex = VAULT_TUTORIAL_STEPS.indexOf(current);
		if (currentIndex < VAULT_TUTORIAL_STEPS.length - 1) {
			nextStep = VAULT_TUTORIAL_STEPS[currentIndex + 1];
			return nextStep;
		}
		return 'complete';
	});
	return nextStep;
}

// Go to a specific step
export function goToVaultTutorialStep(step: VaultTutorialStep): void {
	vaultTutorialStep.set(step);
}

// Complete and hide the vault tutorial
export function completeVaultTutorial(): void {
	vaultTutorialActive.set(false);
	vaultTutorialStep.set('complete');
	vaultTutorialHighlightDex.set(false);
	vaultTutorialDexTab.set(null);
	persistHideVaultTutorial();
}

// Skip/dismiss the vault tutorial
export function skipVaultTutorial(): void {
	completeVaultTutorial();
}

// Derived store for step info
export const currentVaultStepInfo = derived(vaultTutorialStep, ($step) => {
	const index = VAULT_TUTORIAL_STEPS.indexOf($step);
	return {
		step: $step,
		index,
		total: VAULT_TUTORIAL_STEPS.length - 1, // Exclude 'complete'
		isFirst: index === 0,
		isLast: index === VAULT_TUTORIAL_STEPS.length - 2 // Last before 'complete'
	};
});

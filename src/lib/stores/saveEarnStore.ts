// Module-scoped store driving the Save & Earn (SGOV) deposit/withdraw modal.
// Kept outside any component so every entry point — home card, /earn CTAs,
// portfolio Savings card, idle-USDC nudges — opens the same modal through
// Svelte's subscription machinery.
import { writable } from 'svelte/store';

export type SaveEarnMode = 'deposit' | 'withdraw';

export const showSaveEarnModal = writable(false);
export const saveEarnMode = writable<SaveEarnMode>('deposit');
// Optional USDC amount to pre-fill the deposit field with (e.g. the user's idle
// USDC balance from a nudge). null = let the modal default to the max balance.
export const saveEarnPrefillUsdc = writable<number | null>(null);

export function openSaveEarn(
	options: { mode?: SaveEarnMode; prefillUsdc?: number | null } = {}
): void {
	saveEarnMode.set(options.mode ?? 'deposit');
	saveEarnPrefillUsdc.set(options.prefillUsdc ?? null);
	showSaveEarnModal.set(true);
}

export function closeSaveEarn(): void {
	showSaveEarnModal.set(false);
	saveEarnPrefillUsdc.set(null);
}

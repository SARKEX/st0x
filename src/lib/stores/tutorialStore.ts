import { writable, derived } from 'svelte/store';
import { hideTutorial as persistHideTutorial } from '$lib/utils/tutorialStorage';

export type TutorialStep =
	| 'welcome'
	| 'token-list'
	| 'navigate-trade'
	| 'buy-sell-panel'
	| 'tradingview'
	| 'dex-activity'
	| 'fundamentals'
	| 'complete';

export const TUTORIAL_STEPS: TutorialStep[] = [
	'welcome',
	'token-list',
	'navigate-trade',
	'buy-sell-panel',
	'tradingview',
	'dex-activity',
	'fundamentals',
	'complete'
];

// Current tutorial step
export const tutorialStep = writable<TutorialStep>('welcome');

// Whether tutorial is active (visible)
export const tutorialActive = writable<boolean>(false);

// Whether the trade panel should be open (for tutorial)
export const tutorialWantsTradePanel = writable<boolean>(false);

// Advance to next step
export function nextTutorialStep(): TutorialStep {
	let nextStep: TutorialStep = 'complete';
	tutorialStep.update((current) => {
		const currentIndex = TUTORIAL_STEPS.indexOf(current);
		if (currentIndex < TUTORIAL_STEPS.length - 1) {
			nextStep = TUTORIAL_STEPS[currentIndex + 1];
			return nextStep;
		}
		return 'complete';
	});
	return nextStep;
}

// Go to a specific step
export function goToTutorialStep(step: TutorialStep): void {
	tutorialStep.set(step);
}

// Complete and hide the tutorial
export function completeTutorial(): void {
	tutorialActive.set(false);
	tutorialStep.set('complete');
	persistHideTutorial();
}

// Skip/dismiss the tutorial
export function skipTutorial(): void {
	completeTutorial();
}

// Derived store for step info
export const currentStepInfo = derived(tutorialStep, ($step) => {
	const index = TUTORIAL_STEPS.indexOf($step);
	return {
		step: $step,
		index,
		total: TUTORIAL_STEPS.length - 1, // Exclude 'complete'
		isFirst: index === 0,
		isLast: index === TUTORIAL_STEPS.length - 2 // Last before 'complete'
	};
});

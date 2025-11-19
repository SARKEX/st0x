/**
 * Common Tailwind class combinations to reduce repetition
 */

// Grid layouts
export const gridStyles = {
	// Most common grid pattern in the app
	responsive2: 'grid grid-cols-1 gap-4 sm:grid-cols-2',
	responsive3: 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3',
	responsive4: 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4',
	// With tighter gaps
	responsive2Tight: 'grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4',
	responsive3Tight: 'grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3'
} as const;

// Text styles
export const textStyles = {
	label: 'text-xs text-gray-400',
	labelUppercase: 'text-xs font-medium uppercase tracking-wide text-gray-400',
	error: 'text-sm text-red-500',
	success: 'text-sm text-green-500',
	muted: 'text-sm text-gray-500',
	heading: 'text-lg font-semibold sm:text-xl',
	subheading: 'text-base font-medium sm:text-lg'
} as const;

// Container styles
export const containerStyles = {
	card: 'rounded-lg bg-gray-800/50 p-4',
	cardBordered: 'rounded-lg border border-white/10 bg-gray-800/50 p-4',
	section: 'bg-gray-800/50 backdrop-blur-sm rounded-2xl border border-white/10 p-4 sm:p-6',
	modal: 'rounded-xl border border-white/10 bg-gray-900/95 shadow-xl backdrop-blur-sm'
} as const;

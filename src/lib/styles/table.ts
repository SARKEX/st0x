/**
 * Shared table styling constants to maintain consistency across table components
 */

export const tableStyles = {
	/** Style for table header cells */
	headerCell: 'p-2 text-center text-xs font-medium uppercase tracking-wide text-gray-400 sm:p-3',

	/** Style for table body rows */
	row: 'border-b border-white/10 bg-gray-800/80 text-center text-gray-100 last:border-0',

	/** Style for table body cells */
	cell: 'p-2 text-xs text-gray-200 sm:p-3 sm:text-sm',

	/** Style for table container */
	container: 'rounded-lg bg-gray-800/80'
} as const;

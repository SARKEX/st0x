/**
 * US Eastern Time helpers
 * Handles EST (UTC-5) / EDT (UTC-4) conversion including DST transitions.
 * Shared between client-side and server-side market hours utilities.
 */

/**
 * Get Eastern timezone offset from UTC for a given date.
 * EST = UTC-5, EDT = UTC-4
 * DST starts 2nd Sunday in March at 2AM EST, ends 1st Sunday in November at 2AM EDT.
 */
export function getEasternOffset(date: Date): number {
	const year = date.getUTCFullYear();

	// Find 2nd Sunday in March at 2AM EST (7AM UTC)
	const march1 = new Date(Date.UTC(year, 2, 1));
	const marchFirstSunday = (7 - march1.getUTCDay()) % 7;
	const dstStart = new Date(Date.UTC(year, 2, marchFirstSunday + 8, 7, 0, 0));

	// Find 1st Sunday in November at 2AM EDT (6AM UTC)
	const nov1 = new Date(Date.UTC(year, 10, 1));
	const novFirstSunday = (7 - nov1.getUTCDay()) % 7 || 7;
	const dstEnd = new Date(Date.UTC(year, 10, novFirstSunday, 6, 0, 0));

	return date >= dstStart && date < dstEnd ? -4 : -5;
}

export interface EasternTimeParts {
	year: number;
	month: number; // 0-indexed
	day: number;
	hour: number;
	minute: number;
	dayOfWeek: number; // 0 = Sunday
	date: Date;
}

/**
 * Convert a Date to Eastern time components.
 */
export function toEasternTime(date: Date): EasternTimeParts {
	const offset = getEasternOffset(date);
	const easternDate = new Date(date.getTime() + offset * 60 * 60 * 1000);

	return {
		year: easternDate.getUTCFullYear(),
		month: easternDate.getUTCMonth(),
		day: easternDate.getUTCDate(),
		hour: easternDate.getUTCHours(),
		minute: easternDate.getUTCMinutes(),
		dayOfWeek: easternDate.getUTCDay(),
		date: easternDate
	};
}

/**
 * Convert Eastern time components to a Unix timestamp (seconds).
 */
export function fromEasternTime(
	year: number,
	month: number,
	day: number,
	hour: number,
	minute: number
): number {
	const utcDate = new Date(Date.UTC(year, month, day, hour, minute, 0));
	const offset = getEasternOffset(utcDate);
	return Math.floor(utcDate.getTime() / 1000) - offset * 60 * 60;
}

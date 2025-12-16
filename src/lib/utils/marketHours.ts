/**
 * Client-side US Market Hours Utility
 * Checks if current time is outside NYSE trading hours
 */

/**
 * Get Eastern timezone offset from UTC
 * EST = UTC-5, EDT = UTC-4
 */
function getEasternOffset(date: Date): number {
	const year = date.getUTCFullYear();

	// DST starts 2nd Sunday in March at 2AM EST
	const march1 = new Date(Date.UTC(year, 2, 1));
	const marchFirstSunday = (7 - march1.getUTCDay()) % 7;
	const dstStart = new Date(Date.UTC(year, 2, marchFirstSunday + 8, 7, 0, 0));

	// DST ends 1st Sunday in November at 2AM EDT
	const nov1 = new Date(Date.UTC(year, 10, 1));
	const novFirstSunday = (7 - nov1.getUTCDay()) % 7 || 7;
	const dstEnd = new Date(Date.UTC(year, 10, novFirstSunday, 6, 0, 0));

	return date >= dstStart && date < dstEnd ? -4 : -5;
}

/**
 * Convert Date to Eastern time components
 */
function toEasternTime(date: Date): {
	hour: number;
	minute: number;
	dayOfWeek: number; // 0 = Sunday
} {
	const offset = getEasternOffset(date);
	const easternDate = new Date(date.getTime() + offset * 60 * 60 * 1000);

	return {
		hour: easternDate.getUTCHours(),
		minute: easternDate.getUTCMinutes(),
		dayOfWeek: easternDate.getUTCDay()
	};
}

/**
 * Check if the current time is outside US stock market hours
 * Market hours: 9:30 AM - 4:00 PM ET, Monday-Friday
 *
 * Note: This is a simplified check that doesn't account for holidays.
 * For critical applications, use the server-side marketHours.ts which
 * includes NYSE holiday detection.
 *
 * @returns true if markets are currently closed
 */
export function isOutsideMarketHours(): boolean {
	const now = new Date();
	const et = toEasternTime(now);

	// Weekend check
	if (et.dayOfWeek === 0 || et.dayOfWeek === 6) {
		return true;
	}

	// Market hours: 9:30 AM - 4:00 PM ET
	const marketOpen = 9 * 60 + 30; // 9:30 AM in minutes
	const marketClose = 16 * 60; // 4:00 PM in minutes
	const currentMinutes = et.hour * 60 + et.minute;

	return currentMinutes < marketOpen || currentMinutes >= marketClose;
}

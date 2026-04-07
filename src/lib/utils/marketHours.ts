/**
 * Client-side US Market Hours Utility
 * Checks if current time is outside NYSE trading hours
 */

import { toEasternTime } from './easternTime';

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
	const et = toEasternTime(new Date());

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

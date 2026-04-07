// US Stock Market Hours Utility
// Handles market hours, holidays, early close days, and daylight savings
//
// Uses nyse-holidays package for holiday detection (includes Good Friday)
// Early close days are hand-rolled since no maintained library covers them

import { isHoliday } from 'nyse-holidays';
import { toEasternTime, fromEasternTime } from '$lib/utils/easternTime';

// Check if a day is an early close day (1 PM instead of 4 PM)
// Early close days per NYSE: https://www.nyse.com/markets/hours-calendars
// - Black Friday (day after Thanksgiving)
// - July 3rd (if it's a trading day)
// - December 24th (if it's a trading day)
function isEarlyCloseDay(year: number, month: number, day: number, dayOfWeek: number): boolean {
	// Black Friday (day after Thanksgiving = 4th Thursday of November + 1)
	if (month === 10) {
		// November (0-indexed)
		const nov1 = new Date(Date.UTC(year, 10, 1));
		const firstThursday = (4 - nov1.getUTCDay() + 7) % 7;
		const thanksgivingDay = 1 + firstThursday + 3 * 7; // 4th Thursday
		if (day === thanksgivingDay + 1) return true;
	}

	// July 3rd (if it's a trading day - not weekend)
	if (month === 6 && day === 3 && dayOfWeek !== 0 && dayOfWeek !== 6) {
		return true;
	}

	// December 24th (if it's a trading day - not weekend)
	if (month === 11 && day === 24 && dayOfWeek !== 0 && dayOfWeek !== 6) {
		return true;
	}

	return false;
}

// Get market close time for a trading day
function getMarketCloseHour(year: number, month: number, day: number, dayOfWeek: number): number {
	if (isEarlyCloseDay(year, month, day, dayOfWeek)) {
		return 13; // 1 PM
	}
	return 16; // 4 PM
}

// Check if timestamp falls within US market hours
function isWithinMarketHours(timestamp: number): boolean {
	const et = toEasternTime(new Date(timestamp * 1000));

	// Weekend check
	if (et.dayOfWeek === 0 || et.dayOfWeek === 6) return false;

	// Holiday check using nyse-holidays
	// Create a Date object for the Eastern date to check
	const easternDateForHoliday = new Date(et.year, et.month, et.day);
	if (isHoliday(easternDateForHoliday)) return false;

	// Market hours: 9:30 AM - 4:00 PM (or 1:00 PM on early close days)
	const marketOpen = 9 * 60 + 30; // 9:30 AM in minutes
	const closeHour = getMarketCloseHour(et.year, et.month, et.day, et.dayOfWeek);
	const marketClose = closeHour * 60; // 4:00 PM or 1:00 PM in minutes

	const currentMinutes = et.hour * 60 + et.minute;
	return currentMinutes >= marketOpen && currentMinutes < marketClose;
}

// Check if a specific date is a trading day (not weekend, not holiday)
function isTradingDay(year: number, month: number, day: number, dayOfWeek: number): boolean {
	// Weekend check
	if (dayOfWeek === 0 || dayOfWeek === 6) return false;

	// Holiday check using nyse-holidays
	const dateForHoliday = new Date(year, month, day);
	if (isHoliday(dateForHoliday)) return false;

	return true;
}

// Find the last trading day's market close timestamp
function getLastMarketClose(timestamp: number): number {
	const et = toEasternTime(new Date(timestamp * 1000));
	let { year, month, day, dayOfWeek } = et;
	const currentMinutes = et.hour * 60 + et.minute;

	// Check if we're on a trading day and past market close
	const closeHour = getMarketCloseHour(year, month, day, dayOfWeek);
	const marketClose = closeHour * 60;

	// If current day is a trading day and we're past market close, use today's close
	if (isTradingDay(year, month, day, dayOfWeek) && currentMinutes >= marketClose) {
		return fromEasternTime(year, month, day, closeHour, 0);
	}

	// Otherwise, go back to find the previous trading day
	let attempts = 0;
	while (attempts < 10) {
		// Go back one day
		const prevDate = new Date(Date.UTC(year, month, day - 1));
		year = prevDate.getUTCFullYear();
		month = prevDate.getUTCMonth();
		day = prevDate.getUTCDate();
		dayOfWeek = prevDate.getUTCDay();

		// Check if this is a trading day
		if (isTradingDay(year, month, day, dayOfWeek)) {
			const prevCloseHour = getMarketCloseHour(year, month, day, dayOfWeek);
			return fromEasternTime(year, month, day, prevCloseHour, 0);
		}

		attempts++;
	}

	// Fallback: return original timestamp if we can't find a trading day
	console.warn('[MarketHours] Could not find previous trading day, using original timestamp');
	return timestamp;
}

/**
 * Get the appropriate timestamp for fetching Pyth prices
 * If the block timestamp falls outside US market hours, returns the last market close timestamp
 * Otherwise returns the original timestamp
 */
export function getPriceTimestamp(blockTimestamp: number): number {
	if (isWithinMarketHours(blockTimestamp)) {
		return blockTimestamp;
	}

	const adjustedTimestamp = getLastMarketClose(blockTimestamp);
	const originalDate = new Date(blockTimestamp * 1000).toISOString();
	const adjustedDate = new Date(adjustedTimestamp * 1000).toISOString();
	console.log(
		`[MarketHours] Block timestamp ${originalDate} outside market hours, using last close: ${adjustedDate}`
	);

	return adjustedTimestamp;
}

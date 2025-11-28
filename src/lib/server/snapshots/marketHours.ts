// US Stock Market Hours Utility
// Handles market hours, holidays, early close days, and daylight savings
//
// Uses nyse-holidays package for holiday detection (includes Good Friday)
// Early close days are hand-rolled since no maintained library covers them

import { isHoliday } from 'nyse-holidays';

// US Eastern timezone offset from UTC
// EST = UTC-5, EDT = UTC-4
function getEasternOffset(date: Date): number {
	// DST starts 2nd Sunday in March, ends 1st Sunday in November
	const year = date.getUTCFullYear();

	// Find 2nd Sunday in March
	const march1 = new Date(Date.UTC(year, 2, 1)); // March 1
	const marchFirstSunday = (7 - march1.getUTCDay()) % 7;
	const dstStart = new Date(Date.UTC(year, 2, marchFirstSunday + 8, 7, 0, 0)); // 2nd Sunday at 2AM EST = 7AM UTC

	// Find 1st Sunday in November
	const nov1 = new Date(Date.UTC(year, 10, 1)); // November 1
	const novFirstSunday = (7 - nov1.getUTCDay()) % 7 || 7;
	const dstEnd = new Date(Date.UTC(year, 10, novFirstSunday, 6, 0, 0)); // 1st Sunday at 2AM EDT = 6AM UTC

	// If between DST start and end, use EDT (-4), otherwise EST (-5)
	if (date >= dstStart && date < dstEnd) {
		return -4;
	}
	return -5;
}

// Convert UTC timestamp to Eastern time components
function toEasternTime(timestamp: number): {
	year: number;
	month: number; // 0-indexed
	day: number;
	hour: number;
	minute: number;
	dayOfWeek: number; // 0 = Sunday
	date: Date; // The original Date object for use with nyse-holidays
} {
	const date = new Date(timestamp * 1000);
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

// Get Unix timestamp for a specific Eastern time
function fromEasternTime(
	year: number,
	month: number,
	day: number,
	hour: number,
	minute: number
): number {
	// Create a date in UTC that represents the Eastern time
	const utcDate = new Date(Date.UTC(year, month, day, hour, minute, 0));
	const offset = getEasternOffset(utcDate);
	// Subtract the offset to convert from Eastern to UTC
	const timestamp = Math.floor(utcDate.getTime() / 1000) - offset * 60 * 60;
	return timestamp;
}

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
	const et = toEasternTime(timestamp);

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
	const et = toEasternTime(timestamp);
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

// Time parsing utilities for Albert course times

import { DAY_MAP, DAY_ABBREVS } from "./constants.js";

/**
 * Parse a time string from Albert
 * Handles both formats:
 * - 24-hour: "09:30" or "14:00"
 * - 12-hour: "09:30 AM" or "2:00 PM"
 * @param {string} timeStr
 * @returns {{ hours: number, minutes: number } | null}
 */
export function parseTime(timeStr) {
	if (!timeStr || timeStr.toUpperCase().includes("TBA")) return null;

	// Try 12-hour format first: "09:30 AM"
	const match12 = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
	if (match12) {
		let hours = parseInt(match12[1], 10);
		const minutes = parseInt(match12[2], 10);
		const period = match12[3].toUpperCase();

		if (period === "PM" && hours !== 12) hours += 12;
		if (period === "AM" && hours === 12) hours = 0;

		return { hours, minutes };
	}

	// Try 24-hour format: "09:30" or "14:00"
	const match24 = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/);
	if (match24) {
		const hours = parseInt(match24[1], 10);
		const minutes = parseInt(match24[2], 10);
		return { hours, minutes };
	}

	return null;
}

/**
 * Parse a time range from Albert (e.g., "09:30 AM -\n10:45 AM" or "09:30 - 10:45")
 * @param {string} rangeStr
 * @returns {{ start: { hours: number, minutes: number }, end: { hours: number, minutes: number } } | null}
 */
export function parseTimeRange(rangeStr) {
	if (!rangeStr || rangeStr.toUpperCase().includes("TBA")) return null;

	// Normalize whitespace and line breaks
	const normalized = rangeStr.replace(/\s+/g, " ").trim();
	const parts = normalized.split(/\s*-\s*/);

	if (parts.length !== 2) return null;

	const start = parseTime(parts[0]);
	const end = parseTime(parts[1]);

	if (!start || !end) return null;

	return { start, end };
}

/**
 * Parse day abbreviations from Albert
 * New format uses 2-letter codes: "TuTh", "MoWe", "MoWeFr"
 * Old format: "TTh", "MW", "MWF"
 * @param {string} dayStr
 * @returns {string[]} Array of full day names (e.g., ["Tue", "Thu"])
 */
export function parseDays(dayStr) {
	if (!dayStr || dayStr.toUpperCase().includes("TBA")) return [];

	const days = [];
	let remaining = dayStr.trim();

	// New format: 2-letter codes (Mo, Tu, We, Th, Fr, Sa, Su)
	// Must check these first before falling back to old format
	const newFormatAbbrevs = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
	let usedNewFormat = false;

	for (const abbrev of newFormatAbbrevs) {
		if (remaining.includes(abbrev)) {
			usedNewFormat = true;
			while (remaining.includes(abbrev)) {
				remaining = remaining.replace(abbrev, "");
				days.push(DAY_MAP[abbrev]);
			}
		}
	}

	// If new format found days, return them
	if (usedNewFormat && days.length > 0) {
		const dayOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
		return days.sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));
	}

	// Fallback to old format: single-letter codes (M, T, W, Th, F, S, Su)
	// Order matters: check 'Th' before 'T', 'Su' before 'S'
	remaining = dayStr.trim();
	const oldDAY_MAP = {
		M: "Mon",
		T: "Tue",
		W: "Wed",
		Th: "Thu",
		F: "Fri",
		S: "Sat",
		Su: "Sun",
	};
	const orderedAbbrevs = ["Th", "Su", "M", "T", "W", "F", "S"];

	for (const abbrev of orderedAbbrevs) {
		while (remaining.includes(abbrev)) {
			remaining = remaining.replace(abbrev, "");
			days.push(oldDAY_MAP[abbrev]);
		}
	}

	// Sort by day order (Mon -> Sun)
	const dayOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
	return days.sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));
}

/**
 * Convert time object to minutes since midnight
 * @param {{ hours: number, minutes: number }} time
 * @returns {number}
 */
export function timeToMinutes(time) {
	return time.hours * 60 + time.minutes;
}

/**
 * Check if two time ranges overlap
 * @param {{ start: object, end: object }} range1
 * @param {{ start: object, end: object }} range2
 * @returns {boolean}
 */
export function doTimesOverlap(range1, range2) {
	if (!range1 || !range2) return false;

	const start1 = timeToMinutes(range1.start);
	const end1 = timeToMinutes(range1.end);
	const start2 = timeToMinutes(range2.start);
	const end2 = timeToMinutes(range2.end);

	return start1 < end2 && start2 < end1;
}

/**
 * Format time for display (e.g., "9:30 AM")
 * @param {{ hours: number, minutes: number }} time
 * @returns {string}
 */
export function formatTime(time) {
	const period = time.hours >= 12 ? "PM" : "AM";
	const hours = time.hours % 12 || 12;
	const minutes = time.minutes.toString().padStart(2, "0");
	return `${hours}:${minutes} ${period}`;
}

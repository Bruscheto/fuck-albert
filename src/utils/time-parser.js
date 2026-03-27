// Time parsing utilities for Albert course times

import { DAY_MAP } from "./constants.js";

const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function isValid24HourTime(hours, minutes) {
	return (
		Number.isInteger(hours) &&
		Number.isInteger(minutes) &&
		hours >= 0 &&
		hours <= 23 &&
		minutes >= 0 &&
		minutes <= 59
	);
}

function sortDays(days) {
	return days.sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
}

function parseDayCodes(input, mapping, orderedCodes) {
	const days = [];
	let remaining = input;

	while (remaining.length > 0) {
		let matchedCode = null;
		for (const code of orderedCodes) {
			if (remaining.startsWith(code)) {
				matchedCode = code;
				break;
			}
		}

		if (!matchedCode) {
			return { days: [], remaining };
		}

		days.push(mapping[matchedCode]);
		remaining = remaining.slice(matchedCode.length);
	}

	return { days, remaining: "" };
}

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
	const normalized = timeStr.trim();

	// Try 12-hour format first: "09:30 AM"
	const match12 = normalized.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
	if (match12) {
		let hours = parseInt(match12[1], 10);
		const minutes = parseInt(match12[2], 10);
		const period = match12[3].toUpperCase();

		if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) {
			return null;
		}

		if (period === "PM" && hours !== 12) hours += 12;
		if (period === "AM" && hours === 12) hours = 0;

		if (!isValid24HourTime(hours, minutes)) {
			return null;
		}

		return { hours, minutes };
	}

	// Try 24-hour format: "09:30" or "14:00"
	const match24 = normalized.match(/^(\d{1,2}):(\d{2})$/);
	if (match24) {
		const hours = parseInt(match24[1], 10);
		const minutes = parseInt(match24[2], 10);
		if (!isValid24HourTime(hours, minutes)) {
			return null;
		}
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

	const startMinutes = timeToMinutes(start);
	const endMinutes = timeToMinutes(end);
	if (endMinutes <= startMinutes) {
		return null;
	}

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
	const normalized = dayStr.replace(/\s+/g, "").trim();
	if (!normalized) return [];

	const newFormatAbbrevs = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
	const parsedNewFormat = parseDayCodes(normalized, DAY_MAP, newFormatAbbrevs);
	if (parsedNewFormat.days.length > 0 && parsedNewFormat.remaining.length === 0) {
		return sortDays(parsedNewFormat.days);
	}

	const oldDAY_MAP = {
		Th: "Thu",
		Su: "Sun",
		M: "Mon",
		T: "Tue",
		W: "Wed",
		F: "Fri",
		S: "Sat",
	};
	const orderedOldCodes = ["Th", "Su", "M", "T", "W", "F", "S"];
	const parsedOldFormat = parseDayCodes(normalized, oldDAY_MAP, orderedOldCodes);
	if (parsedOldFormat.days.length > 0 && parsedOldFormat.remaining.length === 0) {
		return sortDays(parsedOldFormat.days);
	}

	const fallbackDays = [];
	for (const abbrev of newFormatAbbrevs) {
		const regex = new RegExp(abbrev, "g");
		const count = (normalized.match(regex) || []).length;
		for (let i = 0; i < count; i += 1) {
			fallbackDays.push(DAY_MAP[abbrev]);
		}
	}

	if (fallbackDays.length > 0) {
		console.warn(
			`[Albert Enhancer] Parsed partial day string "${dayStr}"; continuing with recognized days only`
		);
		return sortDays(fallbackDays);
	}

	console.warn(`[Albert Enhancer] Unable to parse day string "${dayStr}"`);
	return [];
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

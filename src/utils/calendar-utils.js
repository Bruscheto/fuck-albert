// Calendar and schedule utilities

import { doTimesOverlap, timeToMinutes } from "./time-parser.js";

/**
 * Check if a course component conflicts with existing schedule
 * @param {object} component - Course component with days and timeRange
 * @param {object[]} schedule - Array of scheduled components
 * @returns {boolean}
 */
export function hasConflict(component, schedule) {
	if (!component.timeRange || component.days.length === 0) return false;

	return schedule.some((existing) => {
		// Check if any days overlap
		const daysOverlap = component.days.some((day) =>
			existing.days.includes(day)
		);
		if (!daysOverlap) return false;

		// Check time overlap
		return doTimesOverlap(component.timeRange, existing.timeRange);
	});
}

/**
 * Find all conflicts between a course and existing schedule
 * @param {object} course - Course object with components
 * @param {object[]} schedule - Array of scheduled components
 * @returns {object[]} Array of conflicting courses
 */
export function findConflicts(course, schedule) {
	const conflicts = [];

	for (const component of course.components) {
		for (const existing of schedule) {
			if (existing.courseId === course.id) continue;

			const daysOverlap = component.days.some((day) =>
				existing.days.includes(day)
			);

			if (
				daysOverlap &&
				doTimesOverlap(component.timeRange, existing.timeRange)
			) {
				conflicts.push({
					newCourse: course,
					newComponent: component,
					existingCourse: existing.courseId,
					existingComponent: existing,
				});
			}
		}
	}

	return conflicts;
}

/**
 * Build weekly grid data from scheduled components
 * @param {object[]} schedule - Flat array of scheduled components
 * @param {number} startHour - Day start hour (e.g., 7)
 * @param {number} endHour - Day end hour (e.g., 22)
 * @returns {object} Grid data by day
 */
export function buildWeeklyGrid(schedule, startHour = 7, endHour = 22) {
	const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
	const grid = {};

	for (const day of days) {
		grid[day] = [];
	}

	for (const component of schedule) {
		if (!component.timeRange) continue;

		for (const day of component.days) {
			if (!grid[day]) continue;

			grid[day].push({
				...component,
				startMinutes: timeToMinutes(component.timeRange.start),
				endMinutes: timeToMinutes(component.timeRange.end),
			});
		}
	}

	// Sort each day by start time
	for (const day of days) {
		grid[day].sort((a, b) => a.startMinutes - b.startMinutes);
	}

	return grid;
}

/**
 * Calculate total scheduled hours per week
 * @param {object[]} schedule
 * @returns {number} Hours per week
 */
export function calculateWeeklyHours(schedule) {
	let totalMinutes = 0;

	for (const component of schedule) {
		if (!component.timeRange) continue;

		const duration =
			timeToMinutes(component.timeRange.end) -
			timeToMinutes(component.timeRange.start);
		totalMinutes += duration * component.days.length;
	}

	return totalMinutes / 60;
}

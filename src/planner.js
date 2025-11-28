// Schedule planner and conflict detection

import { getCourses, getBuckets } from "./course-storage.js";
import {
	hasConflict,
	findConflicts,
	buildWeeklyGrid,
	calculateWeeklyHours,
} from "./utils/calendar-utils.js";
import { sortCoursesByPriority } from "./bucket-manager.js";

/**
 * Flatten courses into a schedule array of components
 * @param {object[]} courses
 * @returns {object[]}
 */
export function flattenToSchedule(courses) {
	const schedule = [];

	for (const course of courses) {
		for (const component of course.components) {
			schedule.push({
				...component,
				courseId: course.id,
				courseCode: course.courseCode,
				courseTitle: course.title,
				credits: course.credits,
				bucket: course.bucket,
			});
		}
	}

	return schedule;
}

/**
 * Auto-generate a conflict-free schedule using greedy algorithm
 * Priority order: bucket priority, then added order
 * @param {object[]} courses
 * @param {object[]} buckets
 * @returns {{ scheduled: object[], conflicts: object[], skipped: object[] }}
 */
export function generateOptimalSchedule(courses, buckets) {
	const sorted = sortCoursesByPriority(courses, buckets);
	const scheduled = [];
	const conflicts = [];
	const skipped = [];

	for (const course of sorted) {
		const components = course.components.filter((c) => !c.isTBA);

		// Check if any component conflicts with existing schedule
		let hasConflictFlag = false;
		const conflictDetails = [];

		for (const component of components) {
			const conflicting = findConflicts(
				{ ...course, components: [component] },
				flattenToSchedule(scheduled)
			);
			if (conflicting.length > 0) {
				hasConflictFlag = true;
				conflictDetails.push(...conflicting);
			}
		}

		if (hasConflictFlag) {
			conflicts.push({
				course,
				conflictsWith: conflictDetails,
			});
			skipped.push(course);
		} else {
			scheduled.push(course);
		}
	}

	return { scheduled, conflicts, skipped };
}

/**
 * Get a full analysis of the current course selection
 * @returns {Promise<object>}
 */
export async function analyzeSchedule() {
	const courses = await getCourses();
	const buckets = await getBuckets();

	const { scheduled, conflicts, skipped } = generateOptimalSchedule(
		courses,
		buckets
	);
	const schedule = flattenToSchedule(scheduled);
	const grid = buildWeeklyGrid(schedule);
	const weeklyHours = calculateWeeklyHours(schedule);
	const totalCredits = scheduled.reduce((sum, c) => sum + c.credits, 0);

	return {
		totalCourses: courses.length,
		scheduledCourses: scheduled.length,
		conflictingCourses: conflicts.length,
		skippedCourses: skipped.length,
		totalCredits,
		weeklyHours,
		grid,
		scheduled,
		conflicts,
		skipped,
		byBucket: groupByBucket(courses, buckets),
	};
}

/**
 * Group courses by bucket
 * @param {object[]} courses
 * @param {object[]} buckets
 * @returns {object}
 */
function groupByBucket(courses, buckets) {
	const groups = {};

	for (const bucket of buckets) {
		groups[bucket.id] = {
			bucket,
			courses: courses.filter((c) => c.bucket === bucket.id),
		};
	}

	// Add unsorted group
	groups["unsorted"] = {
		bucket: { id: null, name: "Unsorted", color: "#9ca3af" },
		courses: courses.filter((c) => !c.bucket),
	};

	return groups;
}

/**
 * Suggest alternative sections to resolve conflicts
 * @param {object} conflictingCourse
 * @param {object[]} allCourses - All available courses (including unselected)
 * @returns {object[]} Alternative course options
 */
export function suggestAlternatives(conflictingCourse, allCourses) {
	// Find other sections of the same course
	const alternatives = allCourses.filter(
		(c) =>
			c.courseCode === conflictingCourse.courseCode &&
			c.id !== conflictingCourse.id
	);

	return alternatives;
}

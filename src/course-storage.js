// Course storage using chrome.storage.local

import { STORAGE_KEYS, DEFAULT_BUCKETS } from "./utils/constants.js";

/**
 * Initialize storage with defaults
 */
export async function initializeStorage() {
	const result = await chrome.storage.local.get([
		STORAGE_KEYS.COURSES,
		STORAGE_KEYS.BUCKETS,
		STORAGE_KEYS.SETTINGS,
		STORAGE_KEYS.PLANNER_SELECTION,
	]);

	if (!result[STORAGE_KEYS.BUCKETS]) {
		await chrome.storage.local.set({
			[STORAGE_KEYS.BUCKETS]: DEFAULT_BUCKETS,
		});
	}

	if (!result[STORAGE_KEYS.COURSES]) {
		await chrome.storage.local.set({
			[STORAGE_KEYS.COURSES]: [],
		});
	}

	if (!result[STORAGE_KEYS.SETTINGS]) {
		await chrome.storage.local.set({
			[STORAGE_KEYS.SETTINGS]: {
				showWeekends: false,
				startHour: 7,
				endHour: 22,
			},
		});
	}

	if (!result[STORAGE_KEYS.PLANNER_SELECTION]) {
		await chrome.storage.local.set({
			[STORAGE_KEYS.PLANNER_SELECTION]: [],
		});
	}
}

// ============ Course Operations ============

/**
 * Get all stored courses
 * @returns {Promise<object[]>}
 */
export async function getCourses() {
	const result = await chrome.storage.local.get(STORAGE_KEYS.COURSES);
	return result[STORAGE_KEYS.COURSES] || [];
}

/**
 * Save a course (add or update)
 * @param {object} course
 */
export async function saveCourse(course) {
	const courses = await getCourses();
	const index = courses.findIndex((c) => c.id === course.id);

	if (index >= 0) {
		courses[index] = { ...courses[index], ...course };
	} else {
		courses.push(course);
	}

	await chrome.storage.local.set({ [STORAGE_KEYS.COURSES]: courses });
}

/**
 * Remove a course by ID
 * @param {string} courseId
 */
export async function removeCourse(courseId) {
	const courses = await getCourses();
	const filtered = courses.filter((c) => c.id !== courseId);
	await chrome.storage.local.set({ [STORAGE_KEYS.COURSES]: filtered });
}

/**
 * Assign a course to a bucket
 * @param {string} courseId
 * @param {string} bucketId
 */
export async function assignCourseToBucket(courseId, bucketId) {
	const courses = await getCourses();
	const course = courses.find((c) => c.id === courseId);

	if (course) {
		course.bucket = bucketId;
		course.updatedAt = Date.now();
		await chrome.storage.local.set({ [STORAGE_KEYS.COURSES]: courses });
	}
}

/**
 * Get courses by bucket
 * @param {string} bucketId
 * @returns {Promise<object[]>}
 */
export async function getCoursesByBucket(bucketId) {
	const courses = await getCourses();
	return courses.filter((c) => c.bucket === bucketId);
}

// ============ Bucket Operations ============

/**
 * Get all buckets
 * @returns {Promise<object[]>}
 */
export async function getBuckets() {
	const result = await chrome.storage.local.get(STORAGE_KEYS.BUCKETS);
	return result[STORAGE_KEYS.BUCKETS] || DEFAULT_BUCKETS;
}

/**
 * Create a new bucket
 * @param {object} bucket - { name, color, priority }
 */
export async function createBucket(bucket) {
	const buckets = await getBuckets();
	const id = `bucket-${Date.now()}`;
	buckets.push({ id, ...bucket });
	buckets.sort((a, b) => a.priority - b.priority);
	await chrome.storage.local.set({ [STORAGE_KEYS.BUCKETS]: buckets });
	return id;
}

/**
 * Update a bucket
 * @param {string} bucketId
 * @param {object} updates
 */
export async function updateBucket(bucketId, updates) {
	const buckets = await getBuckets();
	const bucket = buckets.find((b) => b.id === bucketId);
	if (bucket) {
		Object.assign(bucket, updates);
		await chrome.storage.local.set({ [STORAGE_KEYS.BUCKETS]: buckets });
	}
}

/**
 * Delete a bucket (moves courses to null bucket)
 * @param {string} bucketId
 */
export async function deleteBucket(bucketId) {
	// Remove bucket
	const buckets = await getBuckets();
	const filtered = buckets.filter((b) => b.id !== bucketId);
	await chrome.storage.local.set({ [STORAGE_KEYS.BUCKETS]: filtered });

	// Unassign courses from this bucket
	const courses = await getCourses();
	for (const course of courses) {
		if (course.bucket === bucketId) {
			course.bucket = null;
		}
	}
	await chrome.storage.local.set({ [STORAGE_KEYS.COURSES]: courses });
}

// ============ Planner Selection Operations ============

export async function getPlannerSelection() {
	const result = await chrome.storage.local.get(STORAGE_KEYS.PLANNER_SELECTION);
	return result[STORAGE_KEYS.PLANNER_SELECTION] || [];
}

export async function setPlannerSelection(courseIds) {
	await chrome.storage.local.set({
		[STORAGE_KEYS.PLANNER_SELECTION]: Array.from(new Set(courseIds)),
	});
}

export async function addCourseToPlannerSelection(courseId) {
	if (!courseId) return;
	const selection = await getPlannerSelection();
	if (selection.includes(courseId)) {
		return;
	}
	selection.push(courseId);
	await setPlannerSelection(selection);
}

export async function removeCourseFromPlannerSelection(courseId) {
	if (!courseId) return;
	const selection = await getPlannerSelection();
	const filtered = selection.filter((id) => id !== courseId);
	await setPlannerSelection(filtered);
}

// ============ Settings Operations ============

/**
 * Get settings
 * @returns {Promise<object>}
 */
export async function getSettings() {
	const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
	return result[STORAGE_KEYS.SETTINGS] || {};
}

/**
 * Update settings
 * @param {object} updates
 */
export async function updateSettings(updates) {
	const settings = await getSettings();
	Object.assign(settings, updates);
	await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings });
}

// ============ Sync / Import / Export ============

/**
 * Export all data for backup
 * @returns {Promise<object>}
 */
export async function exportData() {
	const result = await chrome.storage.local.get(null);
	return {
		version: 1,
		exportedAt: new Date().toISOString(),
		data: result,
	};
}

/**
 * Import data from backup
 * @param {object} backup
 */
export async function importData(backup) {
	if (backup.version !== 1) {
		throw new Error("Unsupported backup version");
	}
	await chrome.storage.local.clear();
	await chrome.storage.local.set(backup.data);
}

/**
 * Clear all data
 */
export async function clearAllData() {
	await chrome.storage.local.clear();
	await initializeStorage();
}

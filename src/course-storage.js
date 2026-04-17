// Course storage using chrome.storage.local

import { STORAGE_KEYS, DEFAULT_BUCKETS } from "./utils/constants.js";

const DEFAULT_SETTINGS = {
	showWeekends: false,
	startHour: 7,
	endHour: 22,
};

function isPlainObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assert(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

function validateTimeObject(time, context) {
	if (time === null) {
		return;
	}
	assert(isPlainObject(time), `${context} must be an object or null`);
	assert(Number.isInteger(time.hours), `${context}.hours must be an integer`);
	assert(
		Number.isInteger(time.minutes),
		`${context}.minutes must be an integer`,
	);
	assert(time.hours >= 0 && time.hours <= 23, `${context}.hours out of range`);
	assert(
		time.minutes >= 0 && time.minutes <= 59,
		`${context}.minutes out of range`,
	);
}

function validateTimeRange(timeRange, context) {
	if (timeRange === null) {
		return;
	}
	assert(isPlainObject(timeRange), `${context} must be an object or null`);
	validateTimeObject(timeRange.start, `${context}.start`);
	validateTimeObject(timeRange.end, `${context}.end`);
	if (timeRange.start && timeRange.end) {
		const startMinutes = timeRange.start.hours * 60 + timeRange.start.minutes;
		const endMinutes = timeRange.end.hours * 60 + timeRange.end.minutes;
		assert(endMinutes > startMinutes, `${context} end must be after start`);
	}
}

function validateComponent(component, context) {
	assert(isPlainObject(component), `${context} must be an object`);
	assert(
		typeof component.type === "string" && component.type.trim().length > 0,
		`${context}.type is required`,
	);
	assert(Array.isArray(component.days), `${context}.days must be an array`);
	for (const day of component.days) {
		assert(
			typeof day === "string" && day.trim().length > 0,
			`${context}.days must contain non-empty strings`,
		);
	}
	validateTimeRange(component.timeRange ?? null, `${context}.timeRange`);
}

function validateCourse(course) {
	assert(isPlainObject(course), "Course must be an object");
	assert(
		typeof course.id === "string" && course.id.trim(),
		"Course id is required",
	);
	assert(
		typeof course.courseCode === "string" && course.courseCode.trim(),
		"Course code is required",
	);
	assert(
		typeof course.section === "string" && course.section.trim(),
		"Course section is required",
	);
	assert(typeof course.title === "string", "Course title must be a string");
	assert(
		typeof course.credits === "number" && Number.isFinite(course.credits),
		"Course credits must be a valid number",
	);
	assert(
		Array.isArray(course.components),
		"Course components must be an array",
	);
	for (let index = 0; index < course.components.length; index += 1) {
		validateComponent(course.components[index], `Course component[${index}]`);
	}
	if (course.bucket !== null && course.bucket !== undefined) {
		assert(
			typeof course.bucket === "string" && course.bucket.trim().length > 0,
			"Course bucket must be null or a non-empty string",
		);
	}

	return course;
}

function validateBucket(bucket, context = "Bucket") {
	assert(isPlainObject(bucket), `${context} must be an object`);
	assert(
		typeof bucket.id === "string" && bucket.id.trim(),
		`${context} id is required`,
	);
	assert(
		typeof bucket.name === "string" && bucket.name.trim(),
		`${context} name is required`,
	);
	assert(
		typeof bucket.color === "string" && bucket.color.trim(),
		`${context} color is required`,
	);
	assert(
		typeof bucket.priority === "number" && Number.isFinite(bucket.priority),
		`${context} priority must be a valid number`,
	);

	return bucket;
}

function validatePlannerSelection(courseIds) {
	assert(Array.isArray(courseIds), "Planner selection must be an array");
	for (const id of courseIds) {
		assert(
			typeof id === "string" && id.trim().length > 0,
			"Planner selection entries must be non-empty strings",
		);
	}
	return Array.from(new Set(courseIds));
}

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
	const pending = {};

	if (!Array.isArray(result[STORAGE_KEYS.BUCKETS])) {
		pending[STORAGE_KEYS.BUCKETS] = DEFAULT_BUCKETS;
	}

	if (!Array.isArray(result[STORAGE_KEYS.COURSES])) {
		pending[STORAGE_KEYS.COURSES] = [];
	}

	if (!isPlainObject(result[STORAGE_KEYS.SETTINGS])) {
		pending[STORAGE_KEYS.SETTINGS] = { ...DEFAULT_SETTINGS };
	}

	if (!Array.isArray(result[STORAGE_KEYS.PLANNER_SELECTION])) {
		pending[STORAGE_KEYS.PLANNER_SELECTION] = [];
	}

	if (Object.keys(pending).length > 0) {
		await chrome.storage.local.set(pending);
	}
}

// ============ Course Operations ============

/**
 * Get all stored courses
 * @returns {Promise<object[]>}
 */
export async function getCourses() {
	const result = await chrome.storage.local.get(STORAGE_KEYS.COURSES);
	const courses = result[STORAGE_KEYS.COURSES];
	return Array.isArray(courses) ? courses : [];
}

/**
 * Save a course (add or update)
 * @param {object} course
 */
export async function saveCourse(course) {
	validateCourse(course);
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
	const buckets = result[STORAGE_KEYS.BUCKETS];
	return Array.isArray(buckets) ? buckets : DEFAULT_BUCKETS;
}

/**
 * Create a new bucket
 * @param {object} bucket - { name, color, priority }
 */
export async function createBucket(bucket) {
	assert(isPlainObject(bucket), "Bucket payload must be an object");
	assert(
		typeof bucket.name === "string" && bucket.name.trim(),
		"Bucket name is required",
	);
	assert(
		typeof bucket.color === "string" && bucket.color.trim(),
		"Bucket color is required",
	);
	assert(
		typeof bucket.priority === "number" && Number.isFinite(bucket.priority),
		"Bucket priority must be a valid number",
	);

	const buckets = await getBuckets();
	const id = `bucket-${Date.now()}`;
	const nextBucket = validateBucket({ id, ...bucket });
	buckets.push(nextBucket);
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
	assert(
		typeof bucketId === "string" && bucketId.trim(),
		"Bucket id is required",
	);
	assert(isPlainObject(updates), "Bucket updates must be an object");

	const buckets = await getBuckets();
	const bucket = buckets.find((b) => b.id === bucketId);
	if (bucket) {
		const nextBucket = validateBucket({ ...bucket, ...updates });
		Object.assign(bucket, nextBucket);
		await chrome.storage.local.set({ [STORAGE_KEYS.BUCKETS]: buckets });
	}
}

/**
 * Delete a bucket (moves courses to null bucket)
 * @param {string} bucketId
 */
export async function deleteBucket(bucketId) {
	assert(
		typeof bucketId === "string" && bucketId.trim(),
		"Bucket id is required",
	);

	const [buckets, courses] = await Promise.all([getBuckets(), getCourses()]);
	const filteredBuckets = buckets.filter((b) => b.id !== bucketId);
	const nextCourses = courses.map((course) =>
		course.bucket === bucketId ? { ...course, bucket: null } : course,
	);

	await chrome.storage.local.set({
		[STORAGE_KEYS.BUCKETS]: filteredBuckets,
		[STORAGE_KEYS.COURSES]: nextCourses,
	});
}

// ============ Planner Selection Operations ============

export async function getPlannerSelection() {
	const result = await chrome.storage.local.get(STORAGE_KEYS.PLANNER_SELECTION);
	const plannerSelection = result[STORAGE_KEYS.PLANNER_SELECTION];
	return Array.isArray(plannerSelection) ? plannerSelection : [];
}

export async function setPlannerSelection(courseIds) {
	const validated = validatePlannerSelection(courseIds);
	await chrome.storage.local.set({
		[STORAGE_KEYS.PLANNER_SELECTION]: validated,
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
	if (!isPlainObject(backup)) {
		throw new Error("Invalid backup format");
	}

	if (backup.version !== 1) {
		throw new Error("Unsupported backup version");
	}

	if (!isPlainObject(backup.data)) {
		throw new Error("Backup data payload must be an object");
	}

	const importedCourses = backup.data[STORAGE_KEYS.COURSES] || [];
	const importedBuckets = backup.data[STORAGE_KEYS.BUCKETS] || DEFAULT_BUCKETS;
	const importedSettings = backup.data[STORAGE_KEYS.SETTINGS] || {
		...DEFAULT_SETTINGS,
	};
	const importedPlannerSelection =
		backup.data[STORAGE_KEYS.PLANNER_SELECTION] || [];

	assert(Array.isArray(importedCourses), "Imported courses must be an array");
	for (let index = 0; index < importedCourses.length; index += 1) {
		validateCourse(importedCourses[index]);
	}

	assert(Array.isArray(importedBuckets), "Imported buckets must be an array");
	for (let index = 0; index < importedBuckets.length; index += 1) {
		validateBucket(importedBuckets[index], `Bucket[${index}]`);
	}

	assert(
		isPlainObject(importedSettings),
		"Imported settings must be an object",
	);
	const normalizedPlannerSelection = validatePlannerSelection(
		importedPlannerSelection,
	);

	await chrome.storage.local.clear();
	await chrome.storage.local.set({
		[STORAGE_KEYS.COURSES]: importedCourses,
		[STORAGE_KEYS.BUCKETS]: importedBuckets,
		[STORAGE_KEYS.SETTINGS]: importedSettings,
		[STORAGE_KEYS.PLANNER_SELECTION]: normalizedPlannerSelection,
	});
}

/**
 * Get all professor ratings
 * @returns {Promise<Object>} Map of professor name -> rating (number)
 */
export async function getProfessorRatings() {
	const result = await chrome.storage.local.get(
		STORAGE_KEYS.PROFESSOR_RATINGS,
	);
	return result[STORAGE_KEYS.PROFESSOR_RATINGS] || {};
}

/**
 * Set a single professor's rating
 * @param {string} name - Professor name
 * @param {number|null} rating - Rating value (null to remove)
 */
export async function setProfessorRating(name, rating) {
	const ratings = await getProfessorRatings();
	if (rating === null || rating === undefined || rating === "") {
		delete ratings[name];
	} else {
		ratings[name] = Number(rating);
	}
	await chrome.storage.local.set({
		[STORAGE_KEYS.PROFESSOR_RATINGS]: ratings,
	});
}

/**
 * Clear all data
 */
export async function clearAllData() {
	await chrome.storage.local.clear();
	await initializeStorage();
}

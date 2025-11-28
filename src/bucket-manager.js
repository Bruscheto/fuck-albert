// Bucket management and drag-drop handling

import {
	getBuckets,
	assignCourseToBucket,
	getCoursesByBucket,
} from "./course-storage.js";
import { formatTime } from "./utils/time-parser.js";

/**
 * Render bucket list in the popup
 * @param {HTMLElement} container
 * @param {object[]} buckets
 * @param {object[]} courses
 */
export function renderBuckets(container, buckets, courses) {
	container.innerHTML = "";

	for (const bucket of buckets) {
		const bucketCourses = courses.filter((c) => c.bucket === bucket.id);
		const bucketEl = createBucketElement(bucket, bucketCourses);
		container.appendChild(bucketEl);
	}

	// Add "Unsorted" bucket for courses without a bucket
	const unsortedCourses = courses.filter((c) => !c.bucket);
	if (unsortedCourses.length > 0) {
		const unsortedBucket = {
			id: null,
			name: "Unsorted",
			color: "#9ca3af",
			priority: 999,
		};
		const bucketEl = createBucketElement(unsortedBucket, unsortedCourses);
		container.appendChild(bucketEl);
	}
}

/**
 * Create a bucket element with its courses
 * @param {object} bucket
 * @param {object[]} courses
 * @returns {HTMLElement}
 */
function createBucketElement(bucket, courses) {
	const div = document.createElement("div");
	div.className = "bucket";
	div.dataset.bucketId = bucket.id || "unsorted";

	const header = document.createElement("div");
	header.className = "bucket-header";
	header.innerHTML = `
    <span class="bucket-color" style="background-color: ${bucket.color}"></span>
    <span class="bucket-name">${bucket.name}</span>
    <span class="bucket-count">(${courses.length})</span>
  `;
	div.appendChild(header);

	const list = document.createElement("div");
	list.className = "bucket-courses";

	// Enable drop zone
	list.addEventListener("dragenter", handleDragEnter);
	list.addEventListener("dragleave", handleDragLeave);
	list.addEventListener("dragover", handleDragOver);
	list.addEventListener("drop", (e) => handleDrop(e, bucket.id));

	for (const course of courses) {
		const courseEl = createCourseElement(course);
		list.appendChild(courseEl);
	}

	div.appendChild(list);
	return div;
}

/**
 * Create a draggable course element
 * @param {object} course
 * @returns {HTMLElement}
 */
function createCourseElement(course) {
	const div = document.createElement("div");
	div.className = "course-item";
	div.draggable = true;
	div.dataset.courseId = course.id;

	const lectureComponent = getLectureComponent(course);
	const hasRecitation = courseHasRecitation(course);
	const timeLabel = formatLectureTime(lectureComponent);
	const dayDots = renderDayDots(lectureComponent);
	const creditsLabel = Number.isFinite(course.credits)
		? course.credits
		: lectureComponent?.credits ?? "-";

	div.innerHTML = `
		<div class="course-card-header">
			<div class="course-code">${course.courseCode}</div>
			${
				hasRecitation
					? '<span class="course-badge course-badge-recitation">R</span>'
					: ""
			}
		</div>
		<div class="course-title" title="${course.title}">${course.title}</div>
		<div class="course-time">${timeLabel}</div>
		<div class="course-footer">
			<div class="course-day-dots">${dayDots}</div>
			<div class="course-credit-chip">${creditsLabel}</div>
		</div>
	`;

	div.addEventListener("dragstart", handleDragStart);
	div.addEventListener("dragend", handleDragEnd);

	return div;
}

const DAY_DOT_ORDER = [
	{ label: "M", day: "Mon" },
	{ label: "T", day: "Tue" },
	{ label: "W", day: "Wed" },
	{ label: "R", day: "Thu" },
];

function getLectureComponent(course) {
	return (
		course?.components?.find(
			(component) => component?.type?.toLowerCase() === "lecture"
		) ||
		course?.components?.[0] ||
		null
	);
}

function courseHasRecitation(course) {
	return Boolean(
		course?.components?.some(
			(component) => component?.type?.toLowerCase() === "recitation"
		)
	);
}

function formatLectureTime(component) {
	if (!component || !component.timeRange) {
		return "Time TBA";
	}

	const start = formatTime(component.timeRange.start);
	const end = formatTime(component.timeRange.end);
	return `${start} - ${end}`;
}

function renderDayDots(component) {
	const lectureDays = component?.days || [];
	return DAY_DOT_ORDER.map(({ label, day }) => {
		const isActive = lectureDays.includes(day);
		return `<span class="day-dot${isActive ? " active" : ""}">${label}</span>`;
	}).join("");
}

// ============ Drag and Drop Handlers ============

let draggedCourse = null;

function handleDragStart(e) {
	const courseEl = e.currentTarget;
	draggedCourse = courseEl.dataset.courseId;
	courseEl.classList.add("dragging");
	e.dataTransfer.effectAllowed = "move";
}

function handleDragEnd(e) {
	const courseEl = e.currentTarget;
	courseEl.classList.remove("dragging");
	draggedCourse = null;
}

function handleDragEnter(e) {
	e.preventDefault();
	e.currentTarget.classList.add("drag-over");
}

function handleDragOver(e) {
	e.preventDefault();
	e.dataTransfer.dropEffect = "move";
}

function handleDragLeave(e) {
	const nextTarget = e.relatedTarget;
	if (!nextTarget || !e.currentTarget.contains(nextTarget)) {
		e.currentTarget.classList.remove("drag-over");
	}
}

async function handleDrop(e, bucketId) {
	e.preventDefault();
	e.currentTarget.classList.remove("drag-over");

	if (draggedCourse) {
		await assignCourseToBucket(draggedCourse, bucketId);
		// Trigger UI refresh - emit custom event
		document.dispatchEvent(new CustomEvent("coursesUpdated"));
	}
}

// ============ Bucket Priority Sorting ============

/**
 * Get courses sorted by bucket priority
 * @param {object[]} courses
 * @param {object[]} buckets
 * @returns {object[]}
 */
export function sortCoursesByPriority(courses, buckets) {
	const bucketPriority = {};
	for (const bucket of buckets) {
		bucketPriority[bucket.id] = bucket.priority;
	}
	bucketPriority[null] = 999; // Unsorted goes last

	return [...courses].sort((a, b) => {
		const priorityA = bucketPriority[a.bucket] ?? 999;
		const priorityB = bucketPriority[b.bucket] ?? 999;
		return priorityA - priorityB;
	});
}

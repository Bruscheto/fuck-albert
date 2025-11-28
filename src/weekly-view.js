// Weekly view script for Albert Course Planner

import {
	getBuckets,
	getCourses,
	getPlannerSelection,
	addCourseToPlannerSelection,
	removeCourseFromPlannerSelection,
	createBucket,
	assignCourseToBucket,
	updateBucket,
	deleteBucket,
} from "./course-storage.js";
import { flattenToSchedule } from "./planner.js";
import { calculateWeeklyHours, findConflicts } from "./utils/calendar-utils.js";
import { formatTime, timeToMinutes } from "./utils/time-parser.js";
import { CALENDAR_CONFIG } from "./utils/constants.js";

// ============ Configuration ============

const START_HOUR = CALENDAR_CONFIG.START_HOUR;
const END_HOUR = CALENDAR_CONFIG.END_HOUR;
const HOUR_HEIGHT = 60;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

// ============ DOM Elements ============

const timeColumn = document.getElementById("time-column");
const calendarGrid = document.getElementById("calendar-grid");
const calendarEmptyState = document.getElementById("calendar-empty-state");
const sidebarPlanner = document.getElementById("sidebar-planner");
const totalCredits = document.getElementById("total-credits");
const sidebarBuckets = document.getElementById("sidebar-buckets");
const statCourses = document.getElementById("stat-courses");
const statHours = document.getElementById("stat-hours");
const btnAddBucket = document.getElementById("btn-add-bucket");
const btnDeleteBucket = document.getElementById("btn-delete-bucket");

// ============ State ============

let draggedCourseId = null;
let draggedSource = null;
let draggedFromBucketId = null;
const bucketCollapseState = new Map();
let deleteMode = false;
const bucketsPendingDeletion = new Set();
let activeRenameState = null;
let plannerSelectionSet = new Set();
let coursesById = new Map();

// ============ UI Helpers ============

function showToast(message, type = "info") {
	const container = document.getElementById("toast-container");
	const toast = document.createElement("div");
	toast.className = `toast toast-${type}`;
	toast.innerHTML = `
        <div class="toast-message">${message}</div>
    `;

	container.appendChild(toast);

	setTimeout(() => {
		toast.classList.add("is-hiding");
		toast.addEventListener("transitionend", () => {
			toast.remove();
		});
	}, 3000);
}

function showModal(title, content, buttons = []) {
	return new Promise((resolve) => {
		const overlay = document.getElementById("modal-overlay");
		const titleEl = document.getElementById("modal-title");
		const bodyEl = document.getElementById("modal-body");
		const footerEl = document.getElementById("modal-footer");
		const closeBtn = document.getElementById("modal-close");

		titleEl.textContent = title;
		bodyEl.innerHTML = "";
		if (typeof content === "string") {
			bodyEl.innerHTML = content;
		} else {
			bodyEl.appendChild(content);
		}

		footerEl.innerHTML = "";
		buttons.forEach((btn) => {
			const button = document.createElement("button");
			if (btn.danger) {
				button.className = "btn-danger-modal";
			} else {
				button.className = btn.primary ? "btn-primary" : "btn-secondary";
			}
			button.textContent = btn.label;
			button.addEventListener("click", () => {
				closeModal();
				resolve(btn.value);
			});
			footerEl.appendChild(button);
		});

		function closeModal() {
			overlay.classList.remove("is-open");
			resolve(null);
		}

		overlay.classList.add("is-open");

		closeBtn.onclick = closeModal;
		overlay.onclick = (e) => {
			if (e.target === overlay) closeModal();
		};
	});
}

// ============ Initialization ============

async function init() {
	generateTimeLabels();
	generateHourLines();
	await loadSchedule();
	setupEventListeners();
}

function generateTimeLabels() {
	timeColumn.innerHTML = "";
	for (let hour = START_HOUR; hour <= END_HOUR; hour++) {
		const label = document.createElement("div");
		label.className = "time-label";
		const period = hour >= 12 ? "PM" : "AM";
		const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
		label.textContent = `${displayHour} ${period}`;
		timeColumn.appendChild(label);
	}
}

function generateHourLines() {
	for (const day of DAYS) {
		const slotsContainer = document.getElementById(`slots-${day}`);
		if (!slotsContainer) continue;
		slotsContainer.innerHTML = "";
		const hours = END_HOUR - START_HOUR;
		for (let offset = 0; offset <= hours; offset++) {
			const line = document.createElement("div");
			line.className = "hour-line";
			line.style.top = `${offset * HOUR_HEIGHT}px`;
			slotsContainer.appendChild(line);
		}
	}
}

async function loadSchedule() {
	try {
		clearCourseBlocks();
		const [courses, buckets, plannerSelection] = await Promise.all([
			getCourses(),
			getBuckets(),
			getPlannerSelection(),
		]);

		coursesById = new Map(courses.map((course) => [course.id, course]));
		plannerSelectionSet = new Set(plannerSelection);
		const plannedCourses = courses.filter((course) =>
			plannerSelectionSet.has(course.id)
		);
		const plannedSchedule = flattenToSchedule(plannedCourses);

		updatePlannerStats(plannedCourses, plannedSchedule);
		const grouped = buildBucketGroups(courses, buckets);
		const bucketMap = buildBucketMap(buckets);
		renderPlanningTray(plannedCourses, bucketMap);
		renderBucketsSidebar(grouped, plannerSelectionSet);

		const { conflictCourseIds } = calculatePlannerConflicts(
			plannedCourses,
			plannedSchedule
		);
		renderCourseBlocks(plannedSchedule, buckets, {
			highlightConflicts: false,
			conflictCourseIds,
		});
		toggleCalendarEmptyState(plannedSchedule.length === 0);
	} catch (error) {
		console.error("[Albert Enhancer] Error loading schedule", error);
	}
}

// ============ Rendering ============

function renderBucketsSidebar(byBucket, plannedSet = new Set()) {
	sidebarBuckets.innerHTML = "";
	activeRenameState = null;

	for (const key of Object.keys(byBucket)) {
		const { bucket, courses } = byBucket[key];
		const bucketId = bucket.id ?? null;
		const collapseKey = bucketId ?? "unsorted";
		let isCollapsed = bucketCollapseState.get(collapseKey);
		if (isCollapsed === undefined) {
			isCollapsed = true;
			bucketCollapseState.set(collapseKey, true);
		}
		const isDeletable = Boolean(bucketId);
		const isSelectedForDelete =
			deleteMode && isDeletable && bucketsPendingDeletion.has(bucketId);

		const wrapper = document.createElement("div");
		wrapper.className = "bucket-wrapper";
		wrapper.dataset.bucketId = collapseKey;
		if (deleteMode && isDeletable) {
			wrapper.classList.add("is-delete-mode");
		}
		if (isSelectedForDelete) {
			wrapper.classList.add("is-selected-for-delete");
		}

		const header = document.createElement("div");
		header.className = "bucket-item";
		if (deleteMode && isDeletable) {
			header.classList.add("is-delete-mode");
		}
		if (isSelectedForDelete) {
			header.classList.add("is-selected-for-delete");
		}
		header.dataset.bucketId = collapseKey;
		const actionButtons = bucketId
			? `
				<button type="button" class="bucket-action-button bucket-rename-button" title="Rename bucket" aria-label="Rename bucket">✏️</button>
				<button type="button" class="bucket-action-button bucket-color-button" title="Change color" aria-label="Change bucket color">🎨</button>
			`
			: "";
		header.innerHTML = `
			${
				deleteMode && isDeletable
					? `<span class="bucket-delete-select ${
							isSelectedForDelete ? "is-selected" : ""
					  }">${isSelectedForDelete ? "✓" : ""}</span>`
					: ""
			}
			<div class="bucket-main">
				<span class="bucket-dot" style="background: ${bucket.color}"></span>
				<span class="bucket-label${bucketId ? " bucket-label-editable" : ""}">
					${bucket.name}
				</span>
			</div>
			<div class="bucket-meta">
				<span class="bucket-count">${courses.length}</span>
				${actionButtons}
				<svg class="bucket-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M6 9l6 6 6-6" />
				</svg>
			</div>
		`;

		const courseList = document.createElement("div");
		courseList.className = "bucket-course-list";
		courseList.dataset.bucketId = collapseKey;

		const courseListInner = document.createElement("div");
		courseListInner.className = "bucket-course-list-inner";

		if (isCollapsed) {
			courseList.classList.add("is-collapsed");
			header.classList.add("is-collapsed");
			wrapper.classList.add("is-collapsed");
		}

		// Attach drag handlers to wrapper
		wrapper.addEventListener("dragover", handleBucketWrapperDragOver);
		wrapper.addEventListener("dragleave", handleBucketWrapperDragLeave);
		wrapper.addEventListener("drop", handleBucketWrapperDrop);

		if (courses.length === 0) {
			const empty = document.createElement("div");
			empty.className = "bucket-course-empty";
			empty.textContent = "No courses";
			courseListInner.appendChild(empty);
		} else {
			for (const course of courses) {
				const entry = document.createElement("div");
				entry.className = "bucket-course-entry";
				entry.dataset.courseId = course.id;
				entry.dataset.bucketId = bucketId ?? "";
				const isPlanned = plannedSet.has(course.id);
				if (isPlanned) {
					entry.classList.add("is-planned");
				}

				const body = document.createElement("div");
				body.className = "course-entry-body";
				body.innerHTML = `
					<strong>${course.courseCode}</strong>
					<span>${course.title}</span>
				`;

				const footer = document.createElement("div");
				footer.className = "course-entry-footer";

				const addButton = document.createElement("button");
				addButton.type = "button";
				addButton.className = "course-inline-action add";
				if (isPlanned) {
					addButton.textContent = "✅ Added";
					addButton.disabled = true;
				} else {
					addButton.textContent = "＋ Add";
					addButton.addEventListener("click", (event) => {
						event.stopPropagation();
						handlePlannerAdd(course.id);
					});
				}

				const dragHandle = document.createElement("button");
				dragHandle.type = "button";
				dragHandle.className = "course-drag-handle";
				dragHandle.innerHTML = `
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="9" cy="12" r="1" />
						<circle cx="9" cy="5" r="1" />
						<circle cx="9" cy="19" r="1" />
						<circle cx="15" cy="12" r="1" />
						<circle cx="15" cy="5" r="1" />
						<circle cx="15" cy="19" r="1" />
					</svg>
				`;
				dragHandle.ariaLabel = "Drag course";
				dragHandle.draggable = true;
				dragHandle.dataset.courseId = course.id;
				dragHandle.dataset.bucketId = bucketId ?? "";
				dragHandle.title = "Drag to calendar or another bucket";
				dragHandle.addEventListener("dragstart", handleBucketCourseDragStart);
				dragHandle.addEventListener("dragend", handleBucketCourseDragEnd);

				footer.append(addButton, dragHandle);
				entry.append(body, footer);
				courseListInner.appendChild(entry);
			}
		}

		courseList.appendChild(courseListInner);

		header.addEventListener("click", (event) => {
			if (event.target.closest(".bucket-action-button")) {
				return;
			}

			if (deleteMode && isDeletable) {
				toggleBucketDeleteSelection(bucketId, header);
				return;
			}

			const nextCollapsed = !courseList.classList.contains("is-collapsed");
			courseList.classList.toggle("is-collapsed", nextCollapsed);
			header.classList.toggle("is-collapsed", nextCollapsed);
			wrapper.classList.toggle("is-collapsed", nextCollapsed);
			bucketCollapseState.set(collapseKey, nextCollapsed);
		});

		if (bucketId) {
			const label = header.querySelector(".bucket-label");
			label?.addEventListener("dblclick", (event) => {
				event.stopPropagation();
				if (deleteMode) return;
				startBucketRename(bucket, header);
			});

			const renameButton = header.querySelector(".bucket-rename-button");
			renameButton?.addEventListener("click", (event) => {
				event.stopPropagation();
				if (deleteMode) return;
				startBucketRename(bucket, header);
			});

			const colorButton = header.querySelector(".bucket-color-button");
			colorButton?.addEventListener("click", (event) => {
				event.stopPropagation();
				if (deleteMode) return;
				handleBucketRecolor(bucket);
			});
		}

		wrapper.appendChild(header);
		wrapper.appendChild(courseList);
		sidebarBuckets.appendChild(wrapper);
	}
}

function buildBucketGroups(courses, buckets) {
	const unsortedKey = "unsorted";
	const unsortedBucket = {
		id: null,
		name: "Unsorted",
		color: "#9ca3af",
		priority: -Infinity,
	};
	const groups = {
		[unsortedKey]: {
			bucket: unsortedBucket,
			courses: [],
		},
	};

	const orderedBuckets = [...buckets].sort(
		(a, b) => (a.priority ?? 0) - (b.priority ?? 0)
	);

	for (const bucket of orderedBuckets) {
		groups[bucket.id] = {
			bucket,
			courses: [],
		};
	}

	for (const course of courses) {
		const key = course.bucket ?? unsortedKey;
		if (groups[key]) {
			groups[key].courses.push(course);
		} else {
			groups[unsortedKey].courses.push(course);
		}
	}

	return groups;
}

function buildBucketMap(buckets) {
	const map = new Map();
	for (const bucket of buckets) {
		if (bucket?.id) {
			map.set(bucket.id, bucket);
		}
	}
	return map;
}

function renderPlanningTray(plannedCourses, bucketMap) {
	sidebarPlanner.innerHTML = "";
	if (plannedCourses.length === 0) {
		const empty = document.createElement("p");
		empty.className = "tray-empty";
		empty.textContent =
			"No courses added yet. Use the ＋ buttons or drag from buckets.";
		sidebarPlanner.appendChild(empty);
		return;
	}

	for (const course of plannedCourses) {
		const chip = document.createElement("div");
		chip.className = "planner-course-chip";
		chip.dataset.courseId = course.id;

		const details = document.createElement("div");
		details.className = "planner-course-details";
		const code = document.createElement("span");
		code.className = "planner-course-code";
		code.textContent = course.courseCode;
		const title = document.createElement("span");
		title.className = "planner-course-title";
		title.textContent = course.title || "Untitled";
		details.append(code, title);

		const actions = document.createElement("div");
		actions.className = "planner-course-actions";
		const bucketInfo = course.bucket ? bucketMap.get(course.bucket) : null;
		if (bucketInfo) {
			const tag = document.createElement("span");
			tag.className = "planner-bucket-tag";
			tag.textContent = bucketInfo.name;
			if (bucketInfo.color) {
				tag.style.backgroundColor = `${bucketInfo.color}22`;
				tag.style.color = bucketInfo.color;
			}
			actions.appendChild(tag);
		}

		const removeButton = document.createElement("button");
		removeButton.type = "button";
		removeButton.className = "course-inline-action remove";
		removeButton.textContent = "❌";
		removeButton.addEventListener("click", (event) => {
			event.stopPropagation();
			handlePlannerRemove(course.id);
		});
		actions.appendChild(removeButton);

		chip.append(details, actions);
		sidebarPlanner.appendChild(chip);
	}
}

function updatePlannerStats(plannedCourses, plannedSchedule) {
	const totalPlanned = plannedCourses.length;
	const totalCreditsValue = plannedCourses.reduce(
		(sum, course) => sum + (course.credits || 0),
		0
	);
	const weeklyHours = calculateWeeklyHours(plannedSchedule);
	totalCredits.textContent = `${totalCreditsValue} Credits`;
	statCourses.textContent = totalPlanned;
	statHours.textContent = weeklyHours.toFixed(1);
}

function calculatePlannerConflicts(plannedCourses, plannedSchedule) {
	const formatted = [];
	const conflictCourseIds = new Set();

	for (const course of plannedCourses) {
		const conflicts = findConflicts(course, plannedSchedule);
		if (!conflicts.length) {
			continue;
		}

		const conflictingIds = new Set();
		for (const conflict of conflicts) {
			conflictingIds.add(conflict.existingCourse);
			conflictCourseIds.add(conflict.existingCourse);
		}
		conflictCourseIds.add(course.id);

		const conflictsWith = Array.from(conflictingIds)
			.map((id) => coursesById.get(id))
			.filter(Boolean);
		if (!conflictsWith.length) {
			continue;
		}

		formatted.push({ course, conflictsWith });
	}

	return { conflicts: formatted, conflictCourseIds };
}

function renderCourseBlocks(schedule, buckets, options = {}) {
	const bucketColors = {};
	const { highlightConflicts = false, conflictCourseIds = new Set() } = options;
	for (const bucket of buckets) {
		bucketColors[bucket.id] = bucket.color;
	}

	for (const component of schedule) {
		if (!component.timeRange || component.days.length === 0) continue;

		const isConflictCourse =
			highlightConflicts && conflictCourseIds.has(component.courseId);

		for (const day of component.days) {
			const slotsContainer = document.getElementById(`slots-${day}`);
			if (!slotsContainer) continue;

			const block = createCourseBlock(component, bucketColors, {
				isConflict: isConflictCourse,
			});
			slotsContainer.appendChild(block);
		}
	}
}

function createCourseBlock(component, bucketColors, options = {}) {
	const { isConflict = false } = options;
	const block = document.createElement("div");
	block.className = "course-block";
	if (isConflict) {
		block.classList.add("conflict");
	}
	block.draggable = true;
	block.dataset.courseId = component.courseId;
	block.dataset.bucketId = component.bucket ?? "";
	block.addEventListener("dragstart", handleCourseDragStart);
	block.addEventListener("dragend", handleCourseDragEnd);

	const startMinutes = timeToMinutes(component.timeRange.start);
	const endMinutes = timeToMinutes(component.timeRange.end);
	const startOffset = startMinutes - START_HOUR * 60;
	const duration = endMinutes - startMinutes;

	block.style.top = `${(startOffset / 60) * HOUR_HEIGHT}px`;
	block.style.height = `${(duration / 60) * HOUR_HEIGHT}px`;

	const color = bucketColors[component.bucket] || "#57068c";
	if (!isConflict) {
		block.style.backgroundColor = color;
	} else {
		block.dataset.bucketColor = color;
	}

	const startStr = formatTime(component.timeRange.start);
	const endStr = formatTime(component.timeRange.end);
	block.innerHTML = `
    <div class="course-block-code">${component.courseCode}</div>
    <div class="course-block-type">${component.type}</div>
    <div class="course-block-time">${startStr} - ${endStr}</div>
  `;
	block.title =
		`${component.courseCode} - ${component.courseTitle}\n` +
		`${component.type}\n` +
		`${startStr} - ${endStr}\n` +
		`${component.room}\n` +
		`${component.instructor}`;

	return block;
}

// ============ Drag & Drop ============

function handleCourseDragStart(event) {
	const courseId = event.currentTarget?.dataset?.courseId;
	if (!courseId) return;
	draggedCourseId = courseId;
	draggedSource = "calendar";
	draggedFromBucketId = event.currentTarget?.dataset?.bucketId || null;
	event.dataTransfer?.setData("text/plain", courseId);
	event.dataTransfer.effectAllowed = "move";
	event.currentTarget.classList.add("dragging");
}

function handleCourseDragEnd(event) {
	event.currentTarget.classList.remove("dragging");
	resetDragPayload();
}

function handleBucketCourseDragStart(event) {
	const handle = event.currentTarget;
	const entry = handle.closest(".bucket-course-entry");
	const courseId = handle?.dataset?.courseId || entry?.dataset?.courseId;
	if (!courseId) return;
	draggedCourseId = courseId;
	draggedSource = "bucket";
	draggedFromBucketId =
		handle?.dataset?.bucketId || entry?.dataset?.bucketId || null;
	event.dataTransfer?.setData("text/plain", courseId);
	event.dataTransfer.effectAllowed = "copyMove";
	entry?.classList.add("is-dragging");
}

function handleBucketCourseDragEnd(event) {
	const entry = event.currentTarget.closest(".bucket-course-entry");
	entry?.classList.remove("is-dragging");
	resetDragPayload();
}

function handleBucketWrapperDragOver(event) {
	const wrapper = event.currentTarget;
	if (!wrapper || !draggedCourseId) return;

	const bucketKey = wrapper.dataset.bucketId;
	const bucketId = bucketKey === "unsorted" ? null : bucketKey;

	// Prevent dropping into source bucket
	const isValidTarget =
		draggedSource === "calendar" ||
		(draggedSource === "bucket" && draggedFromBucketId !== bucketId);

	if (!isValidTarget) return;

	event.preventDefault();
	event.dataTransfer.dropEffect = "move";
	wrapper.classList.add("is-drop-target");
}

function handleBucketWrapperDragLeave(event) {
	const wrapper = event.currentTarget;
	if (!wrapper) return;

	const nextTarget = event.relatedTarget;
	if (!nextTarget || !wrapper.contains(nextTarget)) {
		wrapper.classList.remove("is-drop-target");
	}
}

async function handleBucketWrapperDrop(event) {
	const wrapper = event.currentTarget;
	if (!wrapper) {
		resetDragPayload();
		return;
	}
	event.preventDefault();
	wrapper.classList.remove("is-drop-target");

	const bucketKey = wrapper.dataset.bucketId;
	const bucketId = bucketKey === "unsorted" ? null : bucketKey;

	await completeBucketDrop(bucketId);
}

async function completeBucketDrop(bucketId) {
	if (!draggedCourseId) {
		resetDragPayload();
		return;
	}

	if (draggedSource === "calendar") {
		if (bucketId !== draggedFromBucketId) {
			await assignCourseToBucket(draggedCourseId, bucketId || null);
		}
		await removeCourseFromPlannerSelection(draggedCourseId);
	} else if (draggedSource === "bucket" && bucketId !== draggedFromBucketId) {
		await assignCourseToBucket(draggedCourseId, bucketId || null);
	}

	resetDragPayload();
	await loadSchedule();
}

function handleCalendarDragEnter(event) {
	if (draggedSource !== "bucket") return;
	event.preventDefault();
	calendarGrid.classList.add("drag-over");
}

function handleCalendarDragOver(event) {
	if (draggedSource !== "bucket") return;
	event.preventDefault();
	event.dataTransfer.dropEffect = "move";
}

function handleCalendarDragLeave(event) {
	const nextTarget = event.relatedTarget;
	if (!nextTarget || !calendarGrid.contains(nextTarget)) {
		calendarGrid.classList.remove("drag-over");
	}
}

async function handleCalendarDrop(event) {
	event.preventDefault();
	calendarGrid?.classList.remove("drag-over");

	// Try to get course ID from global state or dataTransfer
	let courseId = draggedCourseId;
	if (!courseId) {
		courseId = event.dataTransfer.getData("text/plain");
	}

	if (!courseId) {
		resetDragPayload();
		return;
	}

	// If dragging from bucket or if we have a valid course ID that isn't in planner yet
	if (
		(draggedSource === "bucket" || courseId) &&
		!plannerSelectionSet.has(courseId)
	) {
		await addCourseToPlannerSelection(courseId);
		showToast("Course added to schedule", "success");
		await loadSchedule();
	} else if (plannerSelectionSet.has(courseId)) {
		showToast("Course is already in schedule", "info");
	}

	resetDragPayload();
}

function resetDragPayload() {
	const targets = document.querySelectorAll(".is-drop-target");
	targets.forEach((el) => el.classList.remove("is-drop-target"));
	calendarGrid?.classList.remove("drag-over");
	draggedCourseId = null;
	draggedSource = null;
	draggedFromBucketId = null;
}

// ============ Planner & Bucket Actions ============

async function handlePlannerAdd(courseId) {
	if (!courseId || plannerSelectionSet.has(courseId)) return;
	await addCourseToPlannerSelection(courseId);
	await loadSchedule();
}

async function handlePlannerRemove(courseId) {
	if (!courseId) return;
	await removeCourseFromPlannerSelection(courseId);
	await loadSchedule();
}

async function handleBucketCreate() {
	const content = document.createElement("div");
	content.className = "input-group";
	content.innerHTML = `
        <label class="input-label">Bucket Name</label>
        <input type="text" class="input-field" id="bucket-name-input" placeholder="e.g. Core Requirements" autofocus>
    `;

	// Focus input after modal opens
	setTimeout(() => {
		const input = document.getElementById("bucket-name-input");
		if (input) input.focus();
	}, 100);

	const result = await showModal("Create New Bucket", content, [
		{ label: "Cancel", value: null },
		{ label: "Create", value: "create", primary: true },
	]);

	if (result !== "create") return;

	const nameInput = document.getElementById("bucket-name-input");
	const trimmedName = nameInput.value.trim();

	if (!trimmedName) {
		showToast("Bucket name cannot be empty", "error");
		return;
	}

	const buckets = await getBuckets();
	const maxPriority = buckets.reduce(
		(max, bucket) => Math.max(max, bucket.priority ?? 0),
		0
	);

	// Default color
	const defaultColor = "#57068c";

	await createBucket({
		name: trimmedName,
		color: defaultColor,
		priority: maxPriority + 1,
	});
	await loadSchedule();
	showToast("Bucket created successfully", "success");
}

async function handleBucketRecolor(bucket) {
	const colors = [
		"#57068c", // NYU Purple
		"#ef4444", // Red
		"#f97316", // Orange
		"#f59e0b", // Amber
		"#84cc16", // Lime
		"#10b981", // Emerald
		"#06b6d4", // Cyan
		"#3b82f6", // Blue
		"#6366f1", // Indigo
		"#d946ef", // Fuchsia
	];

	const content = document.createElement("div");
	content.className = "color-grid";

	// Helper to save and close
	const saveColor = async (color) => {
		// Close modal programmatically by clicking the close button or overlay
		// Since showModal returns a promise that resolves when closed, we need to trigger that close.
		// The simplest way with current showModal implementation is to find the close button and click it,
		// but we need to pass the result back.
		// However, showModal resolves with the button value.
		// We can modify showModal to expose a close method, or just update the bucket here and then close.
		// But showModal waits for user interaction.

		// Let's update the bucket first
		if (color !== bucket.color) {
			await updateBucket(bucket.id, { color });
			await loadSchedule();
			showToast("Bucket color updated", "success");
		}

		// Now close the modal. We can simulate a click on the close button which resolves with null.
		// But we've already done the work, so null is fine.
		const closeBtn = document.getElementById("modal-close");
		if (closeBtn) closeBtn.click();
	};

	colors.forEach((color) => {
		const option = document.createElement("div");
		option.className = "color-option";
		option.style.backgroundColor = color;
		if (color === bucket.color) {
			option.classList.add("is-selected");
		}
		option.onclick = () => saveColor(color);
		content.appendChild(option);
	});

	// We don't need a Save button anymore, just Cancel/Close
	await showModal("Select Color", content, [{ label: "Cancel", value: null }]);
}

function normalizeColorInput(input, fallback = "#57068c") {
	if (typeof input !== "string") return fallback;
	const value = input.trim();
	if (!value) return fallback;
	const hexMatch = value.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
	if (!hexMatch) return fallback;
	let hex = hexMatch[1];
	if (hex.length === 3) {
		hex = hex
			.split("")
			.map((char) => char + char)
			.join("");
	}
	return `#${hex.toLowerCase()}`;
}

function cancelInlineRename() {
	if (activeRenameState?.cancel) {
		activeRenameState.cancel();
	}
}

function startBucketRename(bucket, headerEl) {
	if (!bucket?.id || deleteMode) return;

	if (activeRenameState?.bucketId && activeRenameState.bucketId !== bucket.id) {
		cancelInlineRename();
	} else if (activeRenameState?.bucketId === bucket.id) {
		return;
	}

	const labelEl = headerEl.querySelector(".bucket-label");
	if (!labelEl) return;

	const renameContainer = document.createElement("div");
	renameContainer.className = "bucket-rename-inline";
	const input = document.createElement("input");
	input.type = "text";
	input.value = bucket.name ?? "";
	input.className = "bucket-rename-input";
	input.setAttribute("maxlength", "80");

	renameContainer.appendChild(input);
	labelEl.replaceWith(renameContainer);

	const cancel = () => {
		if (!renameContainer.isConnected) {
			activeRenameState = null;
			return;
		}
		renameContainer.replaceWith(labelEl);
		activeRenameState = null;
	};

	const commit = async () => {
		const nextName = input.value.trim();
		if (!nextName) {
			// If empty, just cancel
			cancel();
			return;
		}
		if (nextName === bucket.name) {
			cancel();
			return;
		}

		input.disabled = true;
		try {
			await updateBucket(bucket.id, { name: nextName });
		} catch (error) {
			console.error("[Albert Enhancer] Failed to rename bucket", error);
		}
		activeRenameState = null;
		await loadSchedule();
	};

	input.addEventListener("click", (event) => event.stopPropagation());

	input.addEventListener("keydown", (event) => {
		if (event.key === "Enter") {
			event.preventDefault();
			input.blur(); // Trigger blur to save
		} else if (event.key === "Escape") {
			event.preventDefault();
			cancel();
		}
	});

	input.addEventListener("blur", () => {
		commit();
	});

	renameContainer.addEventListener("click", (event) => event.stopPropagation());

	activeRenameState = {
		bucketId: bucket.id,
		cancel,
		container: renameContainer,
	};
	input.focus();
	input.select();
}

function toggleBucketDeleteSelection(bucketId, headerEl) {
	if (!bucketId) return;
	const isSelected = bucketsPendingDeletion.has(bucketId);
	const pill = headerEl.querySelector(".bucket-delete-select");
	if (isSelected) {
		bucketsPendingDeletion.delete(bucketId);
		headerEl.classList.remove("is-selected-for-delete");
		pill?.classList.remove("is-selected");
		if (pill) pill.textContent = "";
	} else {
		bucketsPendingDeletion.add(bucketId);
		headerEl.classList.add("is-selected-for-delete");
		pill?.classList.add("is-selected");
		if (pill) pill.textContent = "✓";
	}
	updateDeleteButtonState();
}

function enterDeleteMode() {
	deleteMode = true;
	bucketsPendingDeletion.clear();
	btnDeleteBucket.classList.add("is-active");
	updateDeleteButtonState();
	loadSchedule();
}

function exitDeleteMode() {
	deleteMode = false;
	bucketsPendingDeletion.clear();
	btnDeleteBucket.classList.remove("is-active");
	updateDeleteButtonState();
	loadSchedule();
}

function updateDeleteButtonState() {
	if (!btnDeleteBucket) return;

	const trashIcon = `
		<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<polyline points="3 6 5 6 21 6"></polyline>
			<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
		</svg>
	`;

	const cancelIcon = `
		<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<line x1="18" y1="6" x2="6" y2="18"></line>
			<line x1="6" y1="6" x2="18" y2="18"></line>
		</svg>
	`;

	if (!deleteMode) {
		btnDeleteBucket.innerHTML = trashIcon;
		btnDeleteBucket.title = "Delete Buckets";
		return;
	}

	const count = bucketsPendingDeletion.size;
	if (count === 0) {
		btnDeleteBucket.innerHTML = cancelIcon;
		btnDeleteBucket.title = "Cancel Delete Mode";
	} else {
		btnDeleteBucket.innerHTML = trashIcon;
		btnDeleteBucket.title = `Delete ${count} Selected Bucket${
			count > 1 ? "s" : ""
		}`;
	}
}

async function deleteSelectedBuckets() {
	const ids = Array.from(bucketsPendingDeletion);
	if (!ids.length) return;
	const message =
		ids.length === 1
			? "Delete selected bucket? Its courses will move to Unsorted."
			: `Delete ${ids.length} buckets? Their courses will move to Unsorted.`;

	const confirmed = await showModal("Delete Buckets", message, [
		{ label: "Cancel", value: false },
		{ label: "Delete", value: true, danger: true },
	]);

	if (!confirmed) return;

	for (const bucketId of ids) {
		await deleteBucket(bucketId);
		bucketCollapseState.delete(bucketId);
	}
	exitDeleteMode({ reload: false });
	await loadSchedule();
}

// ============ Event Listeners ============

function setupEventListeners() {
	btnAddBucket?.addEventListener("click", () => handleBucketCreate());

	calendarGrid?.addEventListener("dragenter", handleCalendarDragEnter);
	calendarGrid?.addEventListener("dragover", handleCalendarDragOver);
	calendarGrid?.addEventListener("dragleave", handleCalendarDragLeave);
	calendarGrid?.addEventListener("drop", handleCalendarDrop);

	btnDeleteBucket?.addEventListener("click", () => {
		if (!deleteMode) {
			enterDeleteMode();
			return;
		}
		if (bucketsPendingDeletion.size === 0) {
			exitDeleteMode();
			return;
		}
		deleteSelectedBuckets();
	});

	chrome.storage.onChanged.addListener((changes, namespace) => {
		if (
			namespace === "local" &&
			(changes.courses || changes.buckets || changes.plannerSelection)
		) {
			clearCourseBlocks();
			loadSchedule();
		}
	});
}

// ============ Utilities ============

function clearCourseBlocks() {
	const blocks = document.querySelectorAll(".course-block");
	blocks.forEach((block) => block.remove());
}

function toggleCalendarEmptyState(isEmpty) {
	if (!calendarEmptyState) return;
	calendarEmptyState.classList.toggle("is-hidden", !isEmpty);
}

// Initialize view
init();

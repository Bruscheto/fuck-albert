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
	getProfessorRatings,
} from "./course-storage.js";
import { flattenToSchedule } from "./planner.js";
import {
	renderCourseMetadataContent,
	ratingTier,
} from "./course-metadata-panel.js";
import {
	calculateWeeklyHours,
	findConflicts,
	getEarliestStart,
	getLatestEnd,
} from "./utils/calendar-utils.js";
import { formatTime, timeToMinutes } from "./utils/time-parser.js";
import { CALENDAR_CONFIG } from "./utils/constants.js";

// ============ Configuration ============

const START_HOUR = CALENDAR_CONFIG.START_HOUR;
const END_HOUR = CALENDAR_CONFIG.END_HOUR;
const HOUR_HEIGHT = 80;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const CONFLICT_COLOR_PALETTE = [
	{ fill: "#c41e3a", border: "#a71931" },
	{ fill: "#dc143c", border: "#bb1133" },
	{ fill: "#b22222", border: "#971d1d" },
	{ fill: "#e63946", border: "#c4303c" },
	{ fill: "#a4161a", border: "#8b1316" },
	{ fill: "#d32f2f", border: "#b32828" },
];

function buildConflictColorMap(conflictCourseIds) {
	const orderedIds = Array.from(conflictCourseIds).sort((a, b) =>
		String(a).localeCompare(String(b)),
	);
	const map = new Map();
	orderedIds.forEach((courseId, index) => {
		map.set(
			courseId,
			CONFLICT_COLOR_PALETTE[index % CONFLICT_COLOR_PALETTE.length],
		);
	});
	return map;
}

/**
 * Deterministic low-saturation color from a course code string.
 * Same courseCode (regardless of section) always produces the same hue.
 */
function courseCodeToColor(courseCode) {
	let hash = 0;
	for (let i = 0; i < courseCode.length; i++) {
		hash = courseCode.charCodeAt(i) + ((hash << 5) - hash);
		hash |= 0;
	}
	const hue = ((hash % 360) + 360) % 360;
	return `hsl(${hue}, 42%, 56%)`;
}

function isComponentOnline(component) {
	if (!component?.room) return false;
	return /\bonline\b/i.test(component.room);
}

function isCourseOnline(course) {
	return course?.components?.some(isComponentOnline) ?? false;
}

// ============ DOM Elements ============

const timeColumn = document.getElementById("time-column");
const calendarGrid = document.getElementById("calendar-grid");
const calendarContainer = document.querySelector(".calendar-container");
const calendarEmptyState = document.getElementById("calendar-empty-state");
const sidebarPlanner = document.getElementById("sidebar-planner");
const sidebarConflicts = document.getElementById("sidebar-conflicts");
const totalCredits = document.getElementById("total-credits");
const sidebarBuckets = document.getElementById("sidebar-buckets");
const statCourses = document.getElementById("stat-courses");
const statHours = document.getElementById("stat-hours");
const btnAddBucket = document.getElementById("btn-add-bucket");
const btnDeleteBucket = document.getElementById("btn-delete-bucket");
const btnSidebarToggle = document.getElementById("btn-sidebar-toggle");
const weeklySidebar = document.getElementById("weekly-sidebar");
const metadataDrawer = document.getElementById("course-metadata-drawer");
const metadataDrawerBackdrop = document.getElementById("course-metadata-backdrop");
const metadataDrawerBody = document.getElementById("course-metadata-drawer-body");
const metadataDrawerTitle = document.getElementById("course-metadata-drawer-title");
const metadataDrawerClose = document.getElementById("course-metadata-close");

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
let currentBuckets = [];
let activeMetadataCourseId = null;
let lastCourseBlockDragEndedAt = 0;
let isSidebarOpen = true;
let cachedPlannedSchedule = [];
let cachedProfRatings = {};
let skipDrawerRefresh = false;

const SIDEBAR_STORAGE_KEY = "weeklySidebarOpen";
const SECTION_COLLAPSE_KEY = "weeklySectionCollapseState";

// ============ Section Collapse ============

function getSectionCollapseState() {
	try {
		const stored = window.localStorage.getItem(SECTION_COLLAPSE_KEY);
		if (stored) return JSON.parse(stored);
	} catch (e) {
		// Ignore storage access failures in extension contexts.
	}
	return {};
}

function saveSectionCollapseState(state) {
	try {
		window.localStorage.setItem(
			SECTION_COLLAPSE_KEY,
			JSON.stringify(state),
		);
	} catch (e) {
		// Ignore storage access failures in extension contexts.
	}
}

function applySectionCollapseStates() {
	const state = getSectionCollapseState();
	document
		.querySelectorAll(".sidebar-section[data-section]")
		.forEach((section) => {
			const key = section.dataset.section;
			if (state[key]) {
				section.classList.add("is-collapsed");
			}
		});
}

function toggleSectionCollapse(sectionEl) {
	const key = sectionEl.dataset.section;
	if (!key) return;
	const isCollapsed = sectionEl.classList.toggle("is-collapsed");
	const state = getSectionCollapseState();
	state[key] = isCollapsed;
	saveSectionCollapseState(state);
}

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
		let isResolved = false;

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
				closeModal(btn.value);
			});
			footerEl.appendChild(button);
		});

		function closeModal(result = null) {
			if (isResolved) {
				return;
			}
			isResolved = true;
			overlay.classList.remove("is-open");
			resolve(result);
		}

		overlay.classList.add("is-open");

		closeBtn.onclick = closeModal;
		overlay.onclick = (e) => {
			if (e.target === overlay) closeModal();
		};
	});
}

function getStoredSidebarPreference() {
	try {
		const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
		if (stored === "false") return false;
		if (stored === "true") return true;
	} catch (error) {
		// Ignore storage access failures in extension contexts.
	}
	return true;
}

function applySidebarState() {
	document.body.classList.toggle("weekly-sidebar-collapsed", !isSidebarOpen);
	if (btnSidebarToggle) {
		btnSidebarToggle.setAttribute("aria-expanded", String(isSidebarOpen));
		btnSidebarToggle.setAttribute(
			"aria-label",
			isSidebarOpen ? "Collapse planning drawer" : "Expand planning drawer",
		);
		btnSidebarToggle.title = isSidebarOpen
			? "Collapse planning drawer"
			: "Expand planning drawer";
		btnSidebarToggle.classList.toggle("is-collapsed", !isSidebarOpen);
	}
	if (weeklySidebar) {
		weeklySidebar.setAttribute("aria-hidden", String(!isSidebarOpen));
	}
}

function setSidebarOpen(nextOpen) {
	isSidebarOpen = Boolean(nextOpen);
	applySidebarState();
	try {
		window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(isSidebarOpen));
	} catch (error) {
		// Ignore storage access failures in extension contexts.
	}
}

function toggleSidebar() {
	setSidebarOpen(!isSidebarOpen);
}

function closeCourseMetadataDrawer() {
	activeMetadataCourseId = null;
	document.body.classList.remove("metadata-drawer-open");
	metadataDrawer?.setAttribute("aria-hidden", "true");
}

function buildCourseContext(course) {
	const isPlanned = plannerSelectionSet.has(course.id);
	const online = isCourseOnline(course);

	const scheduledDays = [];
	if (isPlanned && course.components) {
		for (const comp of course.components) {
			if (comp.timeRange && comp.days?.length) {
				for (const day of comp.days) {
					if (!scheduledDays.includes(day)) scheduledDays.push(day);
				}
			}
		}
	}

	const conflictCodes = [];
	if (isPlanned) {
		const conflicts = findConflicts(course, cachedPlannedSchedule);
		const seen = new Set();
		for (const c of conflicts) {
			const other = coursesById.get(c.existingCourse);
			if (other && !seen.has(other.courseCode)) {
				conflictCodes.push(other.courseCode);
				seen.add(other.courseCode);
			}
		}
	}

	const missingTypes = [];
	if (course.components?.length > 1) {
		for (const comp of course.components) {
			if (!comp.timeRange || !comp.days?.length) {
				const t = comp.type || "Section";
				if (!missingTypes.includes(t)) missingTypes.push(t);
			}
		}
	}

	return { isPlanned, online, scheduledDays, conflictCodes, missingTypes };
}

function renderCourseMetadataDrawer() {
	if (!metadataDrawerBody || !activeMetadataCourseId) {
		return;
	}

	const course = coursesById.get(activeMetadataCourseId);
	if (!course) {
		closeCourseMetadataDrawer();
		return;
	}

	renderCourseMetadataContent({
		container: metadataDrawerBody,
		course,
		buckets: currentBuckets,
		context: buildCourseContext(course),
		ratings: cachedProfRatings,
		onBucketSelect: async (bucketId) => {
			if ((course.bucket ?? null) === (bucketId ?? null)) {
				return;
			}
			await assignCourseToBucket(course.id, bucketId);
			showToast(
				bucketId ? "Course bucket updated" : "Course moved to Unsorted",
				"success",
			);
			await loadSchedule();
		},
	});
}

function openCourseMetadataDrawer(courseId) {
	if (!courseId) return;
	cancelInlineRename();
	activeMetadataCourseId = courseId;
	renderCourseMetadataDrawer();
	if (!coursesById.has(courseId)) {
		return;
	}
	document.body.classList.add("metadata-drawer-open");
	metadataDrawer?.setAttribute("aria-hidden", "false");
}

// ============ Initialization ============

async function init() {
	isSidebarOpen = getStoredSidebarPreference();
	applySidebarState();
	applySectionCollapseStates();
	generateTimeLabels();
	generateHourLines();
	await loadSchedule();
	setupEventListeners();
}

function generateTimeLabels() {
	timeColumn.innerHTML = "";

	const spacer = document.createElement("div");
	spacer.className = "time-header-spacer";
	timeColumn.appendChild(spacer);

	for (let hour = START_HOUR; hour < END_HOUR; hour++) {
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
		const [courses, buckets, plannerSelection, profRatings] =
			await Promise.all([
				getCourses(),
				getBuckets(),
				getPlannerSelection(),
				getProfessorRatings(),
			]);
		cachedProfRatings = profRatings;

		coursesById = new Map(courses.map((course) => [course.id, course]));
		currentBuckets = buckets;
		plannerSelectionSet = new Set(plannerSelection);
		const plannedCourses = courses.filter((course) =>
			plannerSelectionSet.has(course.id),
		);
		const plannedSchedule = flattenToSchedule(plannedCourses);
		cachedPlannedSchedule = plannedSchedule;

		updatePlannerStats(plannedCourses, plannedSchedule);
		const grouped = buildBucketGroups(courses, buckets);
		const bucketMap = buildBucketMap(buckets);
		renderPlanningTray(plannedCourses, bucketMap);
		renderBucketsSidebar(grouped, plannerSelectionSet);

		const { conflicts, conflictCourseIds } = calculatePlannerConflicts(
			plannedCourses,
			plannedSchedule,
		);
		const conflictColorMap = buildConflictColorMap(conflictCourseIds);
		const incompleteWarnings = checkIncompleteScheduling(plannedCourses);
		renderConflictsSidebar(conflicts, conflictColorMap, incompleteWarnings);
		renderCourseBlocks(plannedSchedule, buckets, {
			highlightConflicts: conflictCourseIds.size > 0,
			conflictCourseIds,
			conflictColorMap,
		});
		toggleCalendarEmptyState(plannedSchedule.length === 0);
		if (activeMetadataCourseId && !skipDrawerRefresh) {
			if (coursesById.has(activeMetadataCourseId)) {
				renderCourseMetadataDrawer();
			} else {
				closeCourseMetadataDrawer();
			}
		}
	} catch (error) {
		console.error("[Albert Enhancer] Error loading schedule", error);
	}
}

// ============ Rendering ============

function renderBucketsSidebar(byBucket, plannedSet = new Set()) {
	sidebarBuckets.innerHTML = "";
	activeRenameState = null;

	const hasUserBuckets = Object.keys(byBucket).some(
		(key) => key !== "unsorted",
	);
	if (!hasUserBuckets) {
		const helper = document.createElement("p");
		helper.className = "bucket-helper-text";
		helper.textContent =
			"Organize courses into groups to compare schedule options.";
		sidebarBuckets.appendChild(helper);
	}

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
		header.tabIndex = 0;
		header.setAttribute("role", "button");
		header.setAttribute(
			"aria-label",
			`${bucket.name} bucket, ${courses.length} courses`,
		);
		header.setAttribute("aria-expanded", String(!isCollapsed));
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
				entry.style.borderLeftColor = courseCodeToColor(course.courseCode);
				entry.setAttribute(
					"aria-label",
					`${course.courseCode} — ${course.title}`,
				);
				const isPlanned = plannedSet.has(course.id);
				if (isPlanned) {
					entry.classList.add("is-planned");
				}

				const body = document.createElement("div");
				body.className = "course-entry-body";
				const onlineBadge = isCourseOnline(course)
					? '<span class="course-online-badge">Online</span>'
					: "";
				body.innerHTML = `
					<strong>${course.courseCode}</strong>
					<span>${course.title}${onlineBadge}</span>
				`;

				const footer = document.createElement("div");
				footer.className = "course-entry-footer";

				const toggleButton = document.createElement("button");
				toggleButton.type = "button";
				if (isPlanned) {
					toggleButton.className = "course-icon-btn course-icon-btn--remove";
					toggleButton.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
					toggleButton.ariaLabel = "Remove from calendar";
					toggleButton.title = "Remove from calendar";
					toggleButton.addEventListener("click", (event) => {
						event.stopPropagation();
						handlePlannerRemove(course.id);
					});
				} else {
					toggleButton.className = "course-icon-btn course-icon-btn--add";
					toggleButton.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
					toggleButton.ariaLabel = "Add to calendar";
					toggleButton.title = "Add to calendar";
					toggleButton.addEventListener("click", (event) => {
						event.stopPropagation();
						handlePlannerAdd(course.id);
					});
				}

				const editButton = document.createElement("button");
				editButton.type = "button";
				editButton.className = "course-icon-btn course-icon-btn--edit";
				editButton.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
				editButton.ariaLabel = "Edit course metadata";
				editButton.title = "Edit course metadata";
				editButton.addEventListener("click", (event) => {
					event.stopPropagation();
					openCourseMetadataDrawer(course.id);
				});

				const dragHandle = document.createElement("button");
				dragHandle.type = "button";
				dragHandle.className = "course-icon-btn course-icon-btn--drag";
				dragHandle.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>`;
				dragHandle.ariaLabel = "Drag course";
				dragHandle.draggable = true;
				dragHandle.dataset.courseId = course.id;
				dragHandle.dataset.bucketId = bucketId ?? "";
				dragHandle.title = "Drag to calendar or another bucket";
				dragHandle.addEventListener("dragstart", handleBucketCourseDragStart);
				dragHandle.addEventListener("dragend", handleBucketCourseDragEnd);

				footer.append(toggleButton, editButton, dragHandle);
				entry.append(body, footer);
				courseListInner.appendChild(entry);
			}
		}

		courseList.appendChild(courseListInner);

		const toggleBucketCollapse = () => {
			const nextCollapsed = !courseList.classList.contains("is-collapsed");
			courseList.classList.toggle("is-collapsed", nextCollapsed);
			header.classList.toggle("is-collapsed", nextCollapsed);
			wrapper.classList.toggle("is-collapsed", nextCollapsed);
			header.setAttribute("aria-expanded", String(!nextCollapsed));
			bucketCollapseState.set(collapseKey, nextCollapsed);
		};

		header.addEventListener("click", (event) => {
			if (event.target.closest(".bucket-action-button")) {
				return;
			}

			if (deleteMode && isDeletable) {
				toggleBucketDeleteSelection(bucketId, header);
				return;
			}

			toggleBucketCollapse();
		});

		header.addEventListener("keydown", (event) => {
			if (event.key === "Enter" || event.key === " ") {
				event.preventDefault();
				if (deleteMode && isDeletable) {
					toggleBucketDeleteSelection(bucketId, header);
				} else {
					toggleBucketCollapse();
				}
			}
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
		(a, b) => (a.priority ?? 0) - (b.priority ?? 0),
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
		chip.style.borderLeftColor = courseCodeToColor(course.courseCode);
		chip.setAttribute(
			"aria-label",
			`${course.courseCode} — ${course.title || "Untitled"}`,
		);

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

		if (isCourseOnline(course)) {
			const onlineTag = document.createElement("span");
			onlineTag.className = "planner-online-tag";
			onlineTag.textContent = "Online";
			actions.appendChild(onlineTag);
		}

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
		removeButton.className = "course-icon-btn course-icon-btn--remove";
		removeButton.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
		removeButton.ariaLabel = "Remove from calendar";
		removeButton.title = "Remove from calendar";
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
		0,
	);
	const weeklyHours = calculateWeeklyHours(plannedSchedule);
	totalCredits.textContent = `${totalCreditsValue} Credits`;
	statCourses.textContent = totalPlanned;
	statHours.textContent = weeklyHours.toFixed(1);

	const statEarliest = document.getElementById("stat-earliest");
	const statLatest = document.getElementById("stat-latest");

	if (plannedSchedule.length > 0) {
		const earliest = getEarliestStart(plannedSchedule);
		const latest = getLatestEnd(plannedSchedule);
		if (statEarliest)
			statEarliest.textContent = earliest ? formatTime(earliest) : "—";
		if (statLatest)
			statLatest.textContent = latest ? formatTime(latest) : "—";
	} else {
		if (statEarliest) statEarliest.textContent = "—";
		if (statLatest) statLatest.textContent = "—";
	}
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

function checkIncompleteScheduling(plannedCourses) {
	const warnings = [];
	for (const course of plannedCourses) {
		if (!course.components || course.components.length <= 1) continue;

		const withTime = [];
		const withoutTime = [];
		for (const comp of course.components) {
			if (comp.timeRange && comp.days && comp.days.length > 0) {
				withTime.push(comp);
			} else {
				withoutTime.push(comp);
			}
		}

		if (withTime.length > 0 && withoutTime.length > 0) {
			const missingTypes = [
				...new Set(withoutTime.map((c) => c.type || "Section")),
			];
			warnings.push({ course, missingTypes });
		}
	}
	return warnings;
}

function renderConflictsSidebar(conflicts = [], conflictColorMap = new Map(), warnings = []) {
	if (!sidebarConflicts) return;

	if (!conflicts.length && !warnings.length) {
		sidebarConflicts.innerHTML =
			'<p class="no-conflicts">No conflicts detected</p>';
		return;
	}

	sidebarConflicts.innerHTML = "";

	for (const entry of conflicts) {
		const conflictItem = document.createElement("div");
		conflictItem.className = "conflict-item";

		const conflictColor = conflictColorMap.get(entry.course?.id);
		if (conflictColor) {
			conflictItem.style.setProperty("--conflict-fill", conflictColor.fill);
			conflictItem.style.setProperty("--conflict-border", conflictColor.border);
		}

		const baseCode = entry.course?.courseCode || "Unknown course";
		const conflictingCodes = entry.conflictsWith
			.map((course) => course?.courseCode)
			.filter(Boolean)
			.filter((code, index, arr) => arr.indexOf(code) === index)
			.join(", ");
		const swatch = '<span class="conflict-swatch" aria-hidden="true"></span>';

		conflictItem.innerHTML = conflictingCodes
			? `${swatch}<div><strong>${baseCode}</strong><br>Conflicts with ${conflictingCodes}</div>`
			: `${swatch}<div><strong>${baseCode}</strong><br>Has schedule conflicts</div>`;

		sidebarConflicts.appendChild(conflictItem);
	}

	for (const warning of warnings) {
		const warningItem = document.createElement("div");
		warningItem.className = "warning-item";
		const missingLabel = warning.missingTypes.join(", ");
		warningItem.innerHTML = `<span class="warning-icon" aria-hidden="true">⚠</span><div><strong>${warning.course.courseCode}</strong><br>${missingLabel} not scheduled</div>`;
		sidebarConflicts.appendChild(warningItem);
	}
}

function renderCourseBlocks(schedule, buckets, options = {}) {
	const bucketDetails = {};
	const {
		highlightConflicts = false,
		conflictCourseIds = new Set(),
		conflictColorMap = new Map(),
	} = options;
	for (const bucket of buckets) {
		bucketDetails[bucket.id] = bucket;
	}

	// Group by day
	const eventsByDay = {};
	for (const component of schedule) {
		if (!component.timeRange || component.days.length === 0) continue;
		for (const day of component.days) {
			if (!eventsByDay[day]) eventsByDay[day] = [];
			eventsByDay[day].push(component);
		}
	}

	// Render for each day
	for (const day of Object.keys(eventsByDay)) {
		const slotsContainer = document.getElementById(`slots-${day}`);
		if (!slotsContainer) continue;

		const events = eventsByDay[day];
		const layout = layoutEventsForDay(events);

		for (let i = 0; i < events.length; i++) {
			const component = events[i];
			const { left, width } = layout[i];

			const isConflictCourse =
				highlightConflicts && conflictCourseIds.has(component.courseId);

			const block = createCourseBlock(component, bucketDetails, {
				isConflict: isConflictCourse,
				conflictColorMap,
				left: `${left}%`,
				width: `${width}%`,
			});
			slotsContainer.appendChild(block);
		}
	}
}

/**
 * Calculate layout for overlapping events in a day
 * Returns array of { left, width } objects corresponding to input events array
 */
function layoutEventsForDay(events) {
	// 1. Sort events by start time, then duration (longer first)
	const sortedIndices = events
		.map((_, i) => i)
		.sort((a, b) => {
			const startA = timeToMinutes(events[a].timeRange.start);
			const startB = timeToMinutes(events[b].timeRange.start);
			if (startA !== startB) return startA - startB;

			const endA = timeToMinutes(events[a].timeRange.end);
			const endB = timeToMinutes(events[b].timeRange.end);
			return endB - startB - (endA - startA);
		});

	// 2. Build columns
	const columns = [];
	const eventColumnIndex = new Array(events.length).fill(0);

	for (const eventIndex of sortedIndices) {
		const event = events[eventIndex];
		const start = timeToMinutes(event.timeRange.start);
		const end = timeToMinutes(event.timeRange.end);

		let placed = false;
		for (let i = 0; i < columns.length; i++) {
			const column = columns[i];
			// Check if this column has space (last event ends before this one starts)
			const lastEventIndex = column[column.length - 1];
			const lastEventEnd = timeToMinutes(events[lastEventIndex].timeRange.end);

			if (lastEventEnd <= start) {
				column.push(eventIndex);
				eventColumnIndex[eventIndex] = i;
				placed = true;
				break;
			}
		}

		if (!placed) {
			columns.push([eventIndex]);
			eventColumnIndex[eventIndex] = columns.length - 1;
		}
	}

	// 3. Calculate widths and positions
	// This is a simplified "pack into columns" approach.
	// For a more perfect "Google Calendar" style, we'd need to detect clusters.
	// But simply dividing by total columns overlapping at that time is a good start.

	const result = new Array(events.length);
	const totalColumns = columns.length;

	// Simple approach: width = 100% / totalColumns
	// But we can do better: width = 100% / max_concurrent_at_this_time
	// For now, let's stick to the column-based approach which guarantees no overlap visually
	// but might make items thinner than necessary if they don't overlap with all columns.

	// Refined approach: Find clusters of overlapping events
	// Two events are in the same cluster if they overlap directly or indirectly.

	// Let's use the simple column approach first as it's robust and easy to implement.
	// We can refine to "expand if space available" later if needed.

	// Actually, let's do a slightly smarter thing:
	// For each event, find the maximum number of columns that exist during its time range.
	// This is still hard without full clustering.

	// Let's stick to: width = 100 / totalColumns in the cluster.
	// Since we haven't implemented clustering, let's just use the max columns found for the whole day?
	// No, that makes everything thin if there's one busy time.

	// Let's implement simple clustering.
	const clusters = [];
	let currentCluster = [];
	let clusterEnd = -1;

	for (const eventIndex of sortedIndices) {
		const event = events[eventIndex];
		const start = timeToMinutes(event.timeRange.start);
		const end = timeToMinutes(event.timeRange.end);

		if (currentCluster.length === 0) {
			currentCluster.push(eventIndex);
			clusterEnd = end;
		} else {
			if (start < clusterEnd) {
				currentCluster.push(eventIndex);
				clusterEnd = Math.max(clusterEnd, end);
			} else {
				clusters.push(currentCluster);
				currentCluster = [eventIndex];
				clusterEnd = end;
			}
		}
	}
	if (currentCluster.length > 0) clusters.push(currentCluster);

	// Process each cluster
	for (const cluster of clusters) {
		// Calculate columns just for this cluster
		const clusterColumns = [];
		const clusterEventColumn = {}; // eventIndex -> colIndex

		for (const eventIndex of cluster) {
			const event = events[eventIndex];
			const start = timeToMinutes(event.timeRange.start);

			let placed = false;
			for (let i = 0; i < clusterColumns.length; i++) {
				const lastEventIndex = clusterColumns[i][clusterColumns[i].length - 1];
				const lastEventEnd = timeToMinutes(
					events[lastEventIndex].timeRange.end,
				);

				if (lastEventEnd <= start) {
					clusterColumns[i].push(eventIndex);
					clusterEventColumn[eventIndex] = i;
					placed = true;
					break;
				}
			}
			if (!placed) {
				clusterColumns.push([eventIndex]);
				clusterEventColumn[eventIndex] = clusterColumns.length - 1;
			}
		}

		const width = 100 / clusterColumns.length;
		for (const eventIndex of cluster) {
			const colIndex = clusterEventColumn[eventIndex];
			result[eventIndex] = {
				left: colIndex * width,
				width: width,
			};
		}
	}

	return result;
}

function createCourseBlock(component, bucketDetails, options = {}) {
	const {
		isConflict = false,
		conflictColorMap = new Map(),
		left = "0%",
		width = "100%",
	} = options;
	const block = document.createElement("div");
	block.className = "course-block";
	if (isConflict) {
		block.classList.add("conflict");
	}
	block.draggable = true;
	block.dataset.courseId = component.courseId;
	block.dataset.bucketId = component.bucket ?? "";
	block.tabIndex = 0;
	block.setAttribute("role", "button");
	block.setAttribute("aria-label", `Open metadata for ${component.courseCode}`);
	block.addEventListener("dragstart", handleCourseDragStart);
	block.addEventListener("dragend", handleCourseDragEnd);

	const startMinutes = timeToMinutes(component.timeRange.start);
	const endMinutes = timeToMinutes(component.timeRange.end);
	const startOffset = startMinutes - START_HOUR * 60;
	const duration = endMinutes - startMinutes;

	block.style.top = `${(startOffset / 60) * HOUR_HEIGHT}px`;
	block.style.height = `${(duration / 60) * HOUR_HEIGHT}px`;
	block.style.left = left;
	block.style.width = width;

	const bucketInfo = component.bucket ? bucketDetails[component.bucket] : null;
	const color = courseCodeToColor(component.courseCode);
	if (!isConflict) {
		block.style.backgroundColor = color;
	} else {
		const conflictColor = conflictColorMap.get(component.courseId);
		if (conflictColor) {
			block.style.setProperty("--conflict-fill", conflictColor.fill);
			block.style.setProperty("--conflict-border", conflictColor.border);
		}
	}

	const startStr = formatTime(component.timeRange.start);
	const endStr = formatTime(component.timeRange.end);
	const online = isComponentOnline(component);
	const onlinePill = online
		? '<span class="course-block-pill online">Online</span>'
		: "";
	const bucketPillContent = bucketInfo
		? `<span class="course-block-pill bucket">${bucketInfo.name}</span>`
		: "";
	const typePill =
		component.type && component.type !== "Lecture"
			? `<span class="course-block-pill type">${component.type}</span>`
			: "";

	let ratingPill = "";
	const profName = component.instructor?.trim();
	if (
		profName &&
		!/^(TBA|to be announced)$/i.test(profName) &&
		cachedProfRatings[profName] != null
	) {
		const num = Number(cachedProfRatings[profName]);
		const r = num.toFixed(1);
		const tier = ratingTier(num);
		ratingPill = `<span class="course-block-pill rating rating-${tier}">★ ${r}</span>`;
	}

	const allPills =
		onlinePill || bucketPillContent || typePill || ratingPill
			? `<div class="course-block-tags">${typePill}${onlinePill}${bucketPillContent}${ratingPill}</div>`
			: "";
	const conflictMarker =
		'<button type="button" class="course-block-conflict-mark" aria-label="Remove course from schedule"><span class="course-block-conflict-glyph" aria-hidden="true">&times;</span></button>';
	block.innerHTML = `
    ${conflictMarker}
    <div class="course-block-code">${component.courseCode}</div>
    <div class="course-block-time">${startStr} - ${endStr}</div>
    <div class="course-block-title">${component.courseTitle || ""}</div>
    ${allPills}
  `;

	const removeButton = block.querySelector(".course-block-conflict-mark");
	if (removeButton) {
		removeButton.addEventListener("pointerdown", (event) => {
			event.preventDefault();
			event.stopPropagation();
		});

		removeButton.addEventListener("click", async (event) => {
			event.preventDefault();
			event.stopPropagation();
			await handlePlannerRemove(component.courseId);
		});
	}

	block.addEventListener("click", (event) => {
		if (event.target.closest(".course-block-conflict-mark")) {
			return;
		}
		if (Date.now() - lastCourseBlockDragEndedAt < 200) {
			return;
		}
		openCourseMetadataDrawer(component.courseId);
	});

	block.addEventListener("keydown", (event) => {
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			openCourseMetadataDrawer(component.courseId);
		}
	});

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
	lastCourseBlockDragEndedAt = Date.now();
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
		0,
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
	btnSidebarToggle?.addEventListener("click", toggleSidebar);
	metadataDrawerClose?.addEventListener("click", closeCourseMetadataDrawer);
	metadataDrawerBackdrop?.addEventListener("click", closeCourseMetadataDrawer);

	document
		.querySelectorAll(
			".sidebar-section[data-section] > .sidebar-section-header",
		)
		.forEach((header) => {
			header.addEventListener("click", (e) => {
				if (e.target.closest(".sidebar-actions")) return;
				toggleSectionCollapse(header.closest(".sidebar-section"));
			});
			header.addEventListener("keydown", (e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					toggleSectionCollapse(header.closest(".sidebar-section"));
				}
			});
		});

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

	document.addEventListener("professor-ratings-changed", async () => {
		cachedProfRatings = await getProfessorRatings();
		skipDrawerRefresh = true;
		clearCourseBlocks();
		await loadSchedule();
		skipDrawerRefresh = false;
	});

	document.addEventListener("keydown", (event) => {
		if (event.key === "Escape" && activeMetadataCourseId) {
			closeCourseMetadataDrawer();
			return;
		}
		if (event.key === "Escape" && isSidebarOpen) {
			setSidebarOpen(false);
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

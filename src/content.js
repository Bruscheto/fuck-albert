// Content script for Albert pages
// Parses shopping cart on-demand when requested by popup
// Note: Content scripts can't use ES module imports, so all code is inlined here

const DEBUG = true;
const debugLog = (...args) => {
	if (DEBUG) {
		console.log("[Albert Enhancer]", ...args);
	}
};

debugLog("Content script loaded at", window.location.href);

// ============ Constants ============

// Day abbreviation mapping - Albert uses Mo, Tu, We, Th, Fr, Sa, Su
const DAY_MAP = {
	Mo: "Mon",
	Tu: "Tue",
	We: "Wed",
	Th: "Thu",
	Fr: "Fri",
	Sa: "Sat",
	Su: "Sun",
};

// ============ Selectors for new Albert page structure ============
const SELECTORS = {
	// The main cart table with title containing "Shopping Cart"
	CART_TABLE: 'table.ps_grid-flex[title*="Shopping Cart"]',
	// Each row in the cart
	CART_ROW: "tr.ps_grid-row",
	// Inside each row, the layout container
	LAYOUT: "div.ps_box-group.psc_layout",
};

const DRAWER_IDS = {
	panel: "albert-planner-drawer",
	toggle: "albert-planner-toggle",
	iframe: "albert-planner-frame",
};

let drawerInitialized = false;

function logAvailableTables() {
	const tables = Array.from(document.querySelectorAll("table"));
	if (!tables.length) {
		debugLog("No tables found on page yet");
		return;
	}
	debugLog(
		"Available tables:",
		tables.map((table, idx) => {
			const cls = table.className || "<no-class>";
			const title =
				table.getAttribute("title") ||
				table.getAttribute("summary") ||
				"<no-title>";
			return `#${idx} ${cls} | ${title}`;
		})
	);
}

function findCartTable() {
	let table = document.querySelector(SELECTORS.CART_TABLE);
	if (table) {
		return table;
	}

	const fallbackTables = Array.from(
		document.querySelectorAll("table.ps_grid-flex")
	);
	if (!fallbackTables.length) {
		debugLog("No ps_grid-flex tables present yet");
		return null;
	}

	table = fallbackTables.find((t) => {
		const title = t.getAttribute("title") || t.getAttribute("summary") || "";
		return title.toLowerCase().includes("shopping cart");
	});

	if (!table) {
		debugLog(
			"ps_grid-flex tables found but none mention 'Shopping Cart':",
			fallbackTables.map((t, idx) => ({
				idx,
				title: t.getAttribute("title"),
				summary: t.getAttribute("summary"),
				className: t.className,
			}))
		);
	}

	return table || null;
}

// ============ Time Parsing ============

/**
 * Parse time string like "09:30", "14:00", "9:30AM", "2:00 PM"
 */
function parseTime(timeStr) {
	if (!timeStr) return null;

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
 * Parse days/times string like "TuTh 09:30 - 10:45" or "MoWe 11:00 AM - 12:15 PM"
 */
function parseDaysAndTime(daysTimesStr) {
	if (!daysTimesStr || daysTimesStr.toUpperCase() === "TBA") {
		return { days: [], timeRange: null, isTBA: true };
	}

	// Normalize whitespace
	const normalized = daysTimesStr.replace(/\s+/g, " ").trim();

	// Format: "TuTh 09:30 - 10:45" or "Fr 2:00PM - 3:15PM"
	// Capture days, start time (with optional AM/PM), end time (with optional AM/PM)
	const match = normalized.match(
		/^([A-Za-z]+)\s+(\d{1,2}:\d{2}(?:\s*[AaPp][Mm])?)\s*-\s*(\d{1,2}:\d{2}(?:\s*[AaPp][Mm])?)$/
	);

	if (!match) {
		return { days: [], timeRange: null, isTBA: true };
	}

	const daysStr = match[1];
	const startStr = match[2];
	const endStr = match[3];

	// Parse days - extract 2-letter day codes
	const days = [];
	const dayOrder = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

	for (const dayCode of dayOrder) {
		if (daysStr.includes(dayCode)) {
			days.push(DAY_MAP[dayCode]);
		}
	}

	// Parse time range
	const start = parseTime(startStr);
	const end = parseTime(endStr);

	return {
		days,
		timeRange: start && end ? { start, end } : null,
		isTBA: false,
	};
}

/**
 * Extract course code from class name link text
 * e.g., "Class Code:CORE-UA 203-010 (15133)" -> { code: "CORE-UA 203", section: "010", classNumber: "15133" }
 */
function parseClassCode(linkText) {
	// Format: "Class Code:DEPT-LEVEL NUM-SECTION (classNumber)"
	const match = linkText.match(
		/Class Code:([A-Z]+-[A-Z]+\s+\d+)-(\d+)\s*\((\d+)\)/
	);
	if (!match) return null;

	return {
		code: match[1], // e.g., "CORE-UA 203"
		section: match[2], // e.g., "010"
		classNumber: match[3], // e.g., "15133"
	};
}

/**
 * Parse a single row from the shopping cart
 */
function parseRow(row) {
	const layout = row.querySelector(SELECTORS.LAYOUT);
	if (!layout) return null;

	// Get row index from ID (e.g., "win0divCART_GRID$0" -> 0)
	const layoutId = layout.id || "";
	const indexMatch = layoutId.match(/\$(\d+)$/);
	const rowIndex = indexMatch ? parseInt(indexMatch[1], 10) : -1;

	// Extract class code from the link
	const classNameSpan = layout.querySelector('[id^="P_CLASS_NAME$span"]');
	const classNameText =
		classNameSpan?.getAttribute("title") || classNameSpan?.textContent || "";
	const classInfo = parseClassCode(classNameText);

	if (!classInfo) {
		debugLog(`Could not parse class code from: "${classNameText}"`);
		return null;
	}

	// Section
	const sectionEl = layout.querySelector('[id^="CLASS_TBL_VW_CLASS_SECTION"]');
	const section = sectionEl?.textContent?.trim() || classInfo.section;

	// Description
	const descEl = layout.querySelector('[id^="CLASS_TBL_VW_DESCR"]');
	const description = descEl?.textContent?.trim() || "";

	// Instructor
	const instructorEl = layout.querySelector(
		'[id^="DERIVED_REGFRM1_SSR_INSTR_LONG"]'
	);
	const instructor = instructorEl?.textContent?.trim() || "TBA";

	// Days/Times
	const daysTimesEl = layout.querySelector(
		'[id^="DERIVED_REGFRM1_SSR_MTG_SCHED_LONG"]'
	);
	const daysTimesStr = daysTimesEl?.textContent?.trim() || "TBA";
	const { days, timeRange, isTBA } = parseDaysAndTime(daysTimesStr);

	// Location
	const locationEl = layout.querySelector(
		'[id^="DERIVED_REGFRM1_SSR_MTG_LOC_LONG"]'
	);
	const location = locationEl?.textContent?.trim() || "TBA";

	// Units - blank means this is a recitation/lab
	const unitsEl = layout.querySelector('[id^="SSR_REGFORM_VW_UNT_TAKEN"]');
	const unitsText = unitsEl?.textContent?.trim() || "";
	const units = parseFloat(unitsText) || 0;
	const isRecitation =
		unitsText === "" || unitsText === "\u00A0" || units === 0;

	// Status
	const statusImg = layout.querySelector(
		'[id^="win0divDERIVED_REGFRM1_SSR_STATUS_LONG"] img'
	);
	const status = statusImg?.getAttribute("alt") || "Unknown";

	return {
		rowIndex,
		courseCode: classInfo.code,
		section,
		classNumber: classInfo.classNumber,
		title: description,
		instructor,
		days,
		timeRange,
		location,
		credits: units,
		status,
		isTBA,
		isRecitation,
	};
}

/**
 * Parse the entire shopping cart and group courses with their recitations
 */
function parseShoppingCart(existingTable = null) {
	const cartTable = existingTable || findCartTable();
	if (!cartTable) {
		debugLog("Shopping cart table not found yet");
		logAvailableTables();
		return [];
	}

	debugLog("Found cart table:", cartTable.getAttribute("title"));

	const rows = cartTable.querySelectorAll(SELECTORS.CART_ROW);
	debugLog("Found", rows.length, "rows in cart");

	const courses = [];
	let currentCourse = null;

	for (const row of rows) {
		const parsed = parseRow(row);
		if (!parsed) continue;

		debugLog(
			`Row ${parsed.rowIndex}: ${parsed.courseCode}-${parsed.section}, units=${parsed.credits}, isRecit=${parsed.isRecitation}`
		);

		if (parsed.isRecitation) {
			// This is a recitation - attach to current course if codes match
			if (currentCourse && parsed.courseCode === currentCourse.courseCode) {
				currentCourse.components.push({
					type: "Recitation",
					section: parsed.section,
					days: parsed.days,
					timeRange: parsed.timeRange,
					room: parsed.location,
					instructor: parsed.instructor,
					isTBA: parsed.isTBA,
					status: parsed.status,
				});
				debugLog(
					`Added recitation ${parsed.section} to ${currentCourse.courseCode}`
				);
			} else {
				debugLog(`Orphan recitation: ${parsed.courseCode}-${parsed.section}`);
			}
		} else {
			// This is a main course - save previous and start new
			if (currentCourse) {
				courses.push(currentCourse);
			}

			const id = `${parsed.courseCode}-${parsed.section}`.replace(/\s+/g, "-");

			currentCourse = {
				id,
				courseCode: parsed.courseCode,
				section: parsed.section,
				classNumber: parsed.classNumber,
				title: parsed.title,
				credits: parsed.credits,
				status: parsed.status,
				components: [
					{
						type: "Lecture",
						section: parsed.section,
						days: parsed.days,
						timeRange: parsed.timeRange,
						room: parsed.location,
						instructor: parsed.instructor,
						isTBA: parsed.isTBA,
						status: parsed.status,
					},
				],
				bucket: null,
				addedAt: Date.now(),
			};

			debugLog(
				`Parsed course: ${parsed.courseCode}-${parsed.section} (${parsed.credits} credits)`
			);
		}
	}

	// Don't forget the last course
	if (currentCourse) {
		courses.push(currentCourse);
	}

	return courses;
}

// ============ Message Listener ============

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.type === "PARSE_CART") {
		if (!/NYU_SSENRL_CART/i.test(window.location.href)) {
			debugLog(
				"Skipping parse request in non-cart frame",
				window.location.href
			);
			return false;
		}

		debugLog("Parse request received in frame", window.location.href);

		const cartTable = findCartTable();
		if (!cartTable) {
			debugLog("No shopping cart found in this frame yet; logging tables");
			logAvailableTables();
			return false;
		}

		const courses = parseShoppingCart(cartTable);
		debugLog("Parsed", courses.length, "courses", courses);
		sendResponse({ courses });
	}
	return true;
});

// ============ Drawer Panel Injection ============

if (window.top === window) {
	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", initPlannerDrawer, {
			once: true,
		});
	} else {
		initPlannerDrawer();
	}
}

function initPlannerDrawer() {
	if (drawerInitialized) {
		return;
	}

	// Restrict to specific URL
	const isTargetUrl =
		window.location.hostname === "sis.portal.nyu.edu" &&
		window.location.pathname.startsWith("/psp");

	if (!isTargetUrl) {
		debugLog("Not on target URL for planner toggle");
		return;
	}

	if (!document.body) {
		setTimeout(initPlannerDrawer, 100);
		return;
	}
	drawerInitialized = true;

	const toggle = document.createElement("button");
	toggle.id = DRAWER_IDS.toggle;
	toggle.type = "button";
	toggle.setAttribute("aria-expanded", "false");
	toggle.setAttribute("aria-label", "Open Albert Course Planner side panel");

	// Calendar icon
	toggle.innerHTML = `
		<span>Planner</span>
	`;

	toggle.addEventListener("click", (e) => {
		e.preventDefault();
		e.stopPropagation();
		requestChromeSidePanelOpen();
	});

	document.body.appendChild(toggle);
}

function requestChromeSidePanelOpen() {
	try {
		chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" });
	} catch (error) {
		console.warn("[Albert Enhancer] Failed to request side panel open", error);
	}
}

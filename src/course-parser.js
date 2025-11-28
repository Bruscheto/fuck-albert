// Course parser for Albert shopping cart
// Extracts course data from the Albert DOM

import { SELECTORS } from "./utils/constants.js";
import { parseTimeRange, parseDays } from "./utils/time-parser.js";

/**
 * Parse a course cell to extract course info
 * @param {HTMLTableCellElement} cell
 * @returns {object}
 */
function parseCourseCell(cell) {
	// Title is in the title attribute
	const title = cell.getAttribute("title") || "";

	// Inner text contains code, section, credits
	// Format: "Seminar: Advanced AI\nCSCI-UA 473\n001 (4)"
	const lines = cell.textContent
		.trim()
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean);

	let courseCode = "";
	let section = "";
	let credits = 0;
	let courseName = title;

	// Find the course code line (e.g., "CSCI-UA 473")
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		// Match course code pattern: DEPT-LEVEL NUMBER
		const codeMatch = line.match(/^([A-Z]+-[A-Z]+\s+\d+)$/);
		if (codeMatch) {
			courseCode = codeMatch[1];
			continue;
		}

		// Match section and credits: "001 (4)"
		const sectionMatch = line.match(/^(\d+)\s+\((\d+)\)$/);
		if (sectionMatch) {
			section = sectionMatch[1];
			credits = parseInt(sectionMatch[2], 10);
		}
	}

	return { title: courseName, courseCode, section, credits };
}

/**
 * Parse a meeting row (Lecture, Recitation, Lab, etc.)
 * @param {HTMLTableRowElement} row
 * @returns {object}
 */
function parseMeetingRow(row) {
	const cells = row.querySelectorAll("td");
	if (cells.length < 6) return null;

	// Column order: Component | Days | Time | Room | Instructor | Dates

	const componentCell = cells[0];
	const daysCell = cells[1];
	const timeCell = cells[2];
	const roomCell = cells[3];
	const instructorCell = cells[4];
	const datesCell = cells[5];

	// Component type (Lecture, Recitation, Laboratory)
	const componentType = componentCell?.textContent?.trim() || "Unknown";

	// Days: span contains "TTh", "MW", etc.
	const daysSpan = daysCell?.querySelector("span");
	const daysStr = daysSpan?.textContent?.trim() || "";
	const days = parseDays(daysStr);

	// Time: span contains "09:30 AM -\n10:45 AM"
	const timeSpan = timeCell?.querySelector("span");
	const timeStr = timeSpan?.textContent || "";
	const timeRange = parseTimeRange(timeStr);

	// Room: multiple spans (mode, room, campus)
	const roomSpans = roomCell?.querySelectorAll("span") || [];
	const roomParts = Array.from(roomSpans)
		.map((s) => s.textContent.trim())
		.filter(Boolean);
	const room = roomParts.join(" ") || "TBA";

	// Instructor: span with data-key attribute
	const instructorSpan = instructorCell?.querySelector("span[data-key]");
	const instructor = instructorSpan?.textContent?.trim() || "TBA";

	// Dates: span contains "1/20/2026 -\n5/5/2026"
	const datesSpan = datesCell?.querySelector("span");
	const datesStr = datesSpan?.textContent?.replace(/\s+/g, " ").trim() || "";

	return {
		type: componentType,
		days,
		timeRange,
		room,
		instructor,
		dates: datesStr,
		isTBA: daysStr.includes("TBA") || timeStr.includes("TBA"),
	};
}

/**
 * Parse all courses from the shopping cart
 * @returns {object[]} Array of course objects
 */
export function parseShoppingCart() {
	const courses = [];
	const rows = document.querySelectorAll(
		`${SELECTORS.PRIMARY_ROW}, ${SELECTORS.NON_PRIMARY_ROW}`
	);

	let currentCourse = null;

	for (const row of rows) {
		if (row.classList.contains("isSSS_ShCtPrim")) {
			// Primary row = new course
			if (currentCourse) {
				courses.push(currentCourse);
			}

			const cells = row.querySelectorAll("td");
			const courseCell = cells[0];
			const courseInfo = parseCourseCell(courseCell);

			// Generate a unique ID
			const id = `${courseInfo.courseCode}-${courseInfo.section}`.replace(
				/\s+/g,
				"-"
			);

			currentCourse = {
				id,
				...courseInfo,
				components: [],
				bucket: null,
				addedAt: Date.now(),
			};

			// The primary row also contains meeting info in subsequent cells
			// Parse it as a component if it has meeting data
			const component = parseMeetingRow(row);
			if (component) {
				currentCourse.components.push(component);
			}
		} else if (row.classList.contains("isSSS_ShCtNonPrim")) {
			// Non-primary row = additional component of current course
			if (currentCourse) {
				const component = parseMeetingRow(row);
				if (component) {
					currentCourse.components.push(component);
				}
			}
		}
	}

	// Don't forget the last course
	if (currentCourse) {
		courses.push(currentCourse);
	}

	return courses;
}

/**
 * Watch for changes to the shopping cart and re-parse
 * @param {function} callback - Called with updated courses array
 * @returns {MutationObserver}
 */
export function watchShoppingCart(callback) {
	const observer = new MutationObserver(() => {
		const courses = parseShoppingCart();
		callback(courses);
	});

	// Observe the cart wrapper or body
	const target =
		document.querySelector(SELECTORS.CART_WRAPPER) || document.body;
	observer.observe(target, {
		childList: true,
		subtree: true,
	});

	// Initial parse
	const courses = parseShoppingCart();
	callback(courses);

	return observer;
}

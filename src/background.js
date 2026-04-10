// Background service worker for Albert Course Planner

import { initializeStorage } from "./course-storage.js";

const PANEL_PATH = "src/popup.html?mode=sidepanel";
const WEEKLY_VIEW_PATH = "src/weekly-view.html";
const ALLOWED_SIDE_PANEL_HOSTS = ["sis.portal.nyu.edu", "sis.nyu.edu"];
const hasSidePanelApi = Boolean(chrome.sidePanel);

console.log("[Albert Enhancer] Background service worker started");

function isNonEmptyString(value) {
	return typeof value === "string" && value.trim().length > 0;
}

function isValidCoursePayload(course) {
	if (!course || typeof course !== "object") {
		return false;
	}

	return (
		isNonEmptyString(course.id) &&
		isNonEmptyString(course.courseCode) &&
		isNonEmptyString(course.section) &&
		Array.isArray(course.components)
	);
}

function isBenignTabsError(error) {
	if (!error?.message) {
		return false;
	}
	return (
		error.message.includes("No tab with id") ||
		error.message.includes("Tabs cannot be edited") ||
		error.message.includes("Tab was closed")
	);
}

// Initialize storage on install
chrome.runtime.onInstalled.addListener(async (details) => {
	console.log("[Albert Enhancer] Extension installed:", details.reason);
	try {
		await initializeStorage();
		await setupContextMenus();
	} catch (error) {
		console.error("[Albert Enhancer] Install initialization failed:", error);
	}

	if (hasSidePanelApi) {
		try {
			await chrome.sidePanel.setPanelBehavior({
				openPanelOnActionClick: true,
			});
			const tabs = await chrome.tabs.query({});
			for (const tab of tabs) {
				await configureSidePanelForTab(tab.id, tab.url);
			}
		} catch (error) {
			console.error(
				"[Albert Enhancer] Failed to initialize side panel:",
				error,
			);
		}
	}
});

chrome.runtime.onStartup.addListener(async () => {
	try {
		await initializeStorage();
		await setupContextMenus();
	} catch (error) {
		console.error("[Albert Enhancer] Startup initialization failed:", error);
	}
});

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (!message || typeof message.type !== "string") {
		return false;
	}

	console.log("[Albert Enhancer] Message received:", message.type);

	switch (message.type) {
		case "COURSES_PARSED":
			// Content script parsed the shopping cart - save to storage
			handleCoursesParsed(message.courses, sender.tab).catch((error) => {
				console.error(
					"[Albert Enhancer] Failed to persist parsed courses:",
					error,
				);
			});
			break;

		case "OPEN_PLANNER":
			openPlannerPage().catch((error) => {
				console.error("[Albert Enhancer] Failed to open planner page:", error);
			});
			break;

		case "OPEN_WEEKLY_VIEW":
			openWeeklyView().catch((error) => {
				console.error("[Albert Enhancer] Failed to open weekly view:", error);
			});
			break;

		case "OPEN_SIDE_PANEL":
			if (sender.tab?.id) {
				openSidePanel(sender.tab.id).catch((error) => {
					console.error("[Albert Enhancer] Failed to open side panel:", error);
				});
			}
			break;

		case "GET_COURSES":
			// Return courses to requester
			handleGetCourses()
				.then((courses) => sendResponse(courses))
				.catch((error) => {
					console.error("[Albert Enhancer] Failed to get courses:", error);
					sendResponse([]);
				});
			return true; // Keep channel open for async response

		default:
			console.log("[Albert Enhancer] Unknown message type:", message.type);
	}
});

if (hasSidePanelApi) {
	chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
		const nextUrl = changeInfo.url || tab?.url;
		if (nextUrl) {
			configureSidePanelForTab(tabId, nextUrl).catch((error) => {
				if (!isBenignTabsError(error)) {
					console.error(
						"[Albert Enhancer] Failed to configure side panel on tab update:",
						error,
					);
				}
			});
		}
	});

	chrome.tabs.onActivated.addListener(async ({ tabId }) => {
		try {
			const tab = await chrome.tabs.get(tabId);
			await configureSidePanelForTab(tabId, tab.url);
		} catch (error) {
			if (!isBenignTabsError(error)) {
				console.error(
					"[Albert Enhancer] Failed to handle tab activation:",
					error,
				);
			}
		}
	});
}

// ============ Message Handlers ============

async function handleCoursesParsed(courses, tab) {
	if (!Array.isArray(courses)) {
		throw new Error("Parsed courses payload must be an array");
	}

	const filteredCourses = courses.filter(isValidCoursePayload);
	if (filteredCourses.length !== courses.length) {
		throw new Error("Parsed courses payload contains invalid course objects");
	}

	// Save parsed courses to storage
	await chrome.storage.local.set({ courses: filteredCourses });
	console.log(
		"[Albert Enhancer] Saved",
		filteredCourses.length,
		"courses to storage",
	);

	// Update badge with course count
	if (filteredCourses.length > 0) {
		await chrome.action.setBadgeText({
			text: filteredCourses.length.toString(),
			tabId: tab?.id,
		});
		await chrome.action.setBadgeBackgroundColor({
			color: "#57068c",
			tabId: tab?.id,
		});
	} else {
		await chrome.action.setBadgeText({
			text: "",
			tabId: tab?.id,
		});
	}
}

async function handleGetCourses() {
	const result = await chrome.storage.local.get("courses");
	return result.courses || [];
}

async function openPlannerPage() {
	await chrome.tabs.create({
		url: chrome.runtime.getURL(WEEKLY_VIEW_PATH),
	});
}

async function openWeeklyView() {
	await chrome.tabs.create({
		url: chrome.runtime.getURL(WEEKLY_VIEW_PATH),
	});
}

function isAllowedSidePanelUrl(urlString) {
	try {
		const url = new URL(urlString);
		return ALLOWED_SIDE_PANEL_HOSTS.includes(url.hostname);
	} catch (error) {
		return false;
	}
}

async function configureSidePanelForTab(tabId, url) {
	if (!hasSidePanelApi || !tabId || !url) {
		return;
	}

	const shouldEnable = isAllowedSidePanelUrl(url);

	try {
		await chrome.sidePanel.setOptions(
			shouldEnable
				? {
						tabId,
						path: PANEL_PATH,
						enabled: true,
					}
				: {
						tabId,
						enabled: false,
					},
		);
	} catch (error) {
		console.error("[Albert Enhancer] Failed to configure side panel:", error);
	}
}

async function openSidePanel(tabId) {
	if (!hasSidePanelApi || !tabId) {
		return;
	}

	try {
		await chrome.sidePanel.open({ tabId });
	} catch (error) {
		console.error("[Albert Enhancer] Failed to open side panel:", error);
	}
}

// ============ Context Menu ============

function removeAllContextMenus() {
	return new Promise((resolve) => {
		chrome.contextMenus.removeAll(() => {
			if (chrome.runtime.lastError) {
				console.warn(
					"[Albert Enhancer] Failed to clear context menus:",
					chrome.runtime.lastError.message,
				);
			}
			resolve();
		});
	});
}

function createContextMenu(menuConfig) {
	return new Promise((resolve) => {
		chrome.contextMenus.create(menuConfig, () => {
			if (chrome.runtime.lastError) {
				console.error(
					"[Albert Enhancer] Failed to create context menu:",
					menuConfig.id,
					chrome.runtime.lastError.message,
				);
			}
			resolve();
		});
	});
}

async function setupContextMenus() {
	await removeAllContextMenus();
	await createContextMenu({
		id: "open-planner",
		title: "Open Course Planner",
		contexts: ["action"],
	});
	await createContextMenu({
		id: "clear-courses",
		title: "Clear All Courses",
		contexts: ["action"],
	});
}

chrome.contextMenus.onClicked.addListener(async (info) => {
	switch (info.menuItemId) {
		case "open-planner":
			await openPlannerPage();
			break;

		case "clear-courses":
			await chrome.storage.local.set({ courses: [], plannerSelection: [] });
			await chrome.action.setBadgeText({ text: "" });
			console.log("[Albert Enhancer] All courses cleared");
			break;
	}
});

// ============ Keyboard Shortcuts ============

chrome.commands.onCommand.addListener((command) => {
	console.log("[Albert Enhancer] Command:", command);

	switch (command) {
		case "open-planner":
			openPlannerPage();
			break;
	}
});

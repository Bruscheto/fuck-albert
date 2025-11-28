// Background service worker for Albert Course Planner

import { initializeStorage } from "./course-storage.js";

const PANEL_PATH = "src/popup.html?mode=sidepanel";
const WEEKLY_VIEW_PATH = "src/weekly-view.html";
const ALLOWED_SIDE_PANEL_HOST = "nyu.edu";
const hasSidePanelApi = Boolean(chrome.sidePanel);

console.log("[Albert Enhancer] Background service worker started");

// Initialize storage on install
chrome.runtime.onInstalled.addListener(async (details) => {
	console.log("[Albert Enhancer] Extension installed:", details.reason);
	await initializeStorage();

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
				error
			);
		}
	}
});

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	console.log("[Albert Enhancer] Message received:", message.type);

	switch (message.type) {
		case "COURSES_PARSED":
			// Content script parsed the shopping cart - save to storage
			handleCoursesParsed(message.courses, sender.tab);
			break;

		case "OPEN_PLANNER":
			openPlannerPage();
			break;

		case "OPEN_WEEKLY_VIEW":
			openWeeklyView();
			break;

		case "OPEN_SIDE_PANEL":
			if (sender.tab?.id) {
				openSidePanel(sender.tab.id);
			}
			break;

		case "GET_COURSES":
			// Return courses to requester
			handleGetCourses().then(sendResponse);
			return true; // Keep channel open for async response

		default:
			console.log("[Albert Enhancer] Unknown message type:", message.type);
	}
});

if (hasSidePanelApi) {
	chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
		const nextUrl = changeInfo.url || tab?.url;
		if (nextUrl) {
			configureSidePanelForTab(tabId, nextUrl);
		}
	});

	chrome.tabs.onActivated.addListener(async ({ tabId }) => {
		try {
			const tab = await chrome.tabs.get(tabId);
			await configureSidePanelForTab(tabId, tab.url);
		} catch (error) {
			console.error(
				"[Albert Enhancer] Failed to handle tab activation:",
				error
			);
		}
	});
}

// ============ Message Handlers ============

async function handleCoursesParsed(courses, tab) {
	// Save parsed courses to storage
	await chrome.storage.local.set({ courses: courses });
	console.log("[Albert Enhancer] Saved", courses.length, "courses to storage");

	// Update badge with course count
	if (courses && courses.length > 0) {
		chrome.action.setBadgeText({
			text: courses.length.toString(),
			tabId: tab?.id,
		});
		chrome.action.setBadgeBackgroundColor({
			color: "#57068c",
			tabId: tab?.id,
		});
	} else {
		chrome.action.setBadgeText({
			text: "",
			tabId: tab?.id,
		});
	}
}

async function handleGetCourses() {
	const result = await chrome.storage.local.get("courses");
	return result.courses || [];
}

function openPlannerPage() {
	chrome.tabs.create({
		url: chrome.runtime.getURL(WEEKLY_VIEW_PATH),
	});
}

function openWeeklyView() {
	chrome.tabs.create({
		url: chrome.runtime.getURL(WEEKLY_VIEW_PATH),
	});
}

function isAllowedSidePanelUrl(urlString) {
	try {
		const url = new URL(urlString);
		return (
			url.hostname === ALLOWED_SIDE_PANEL_HOST ||
			url.hostname.endsWith(`.${ALLOWED_SIDE_PANEL_HOST}`)
		);
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
				  }
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

chrome.runtime.onInstalled.addListener(() => {
	chrome.contextMenus.create({
		id: "open-planner",
		title: "Open Course Planner",
		contexts: ["action"],
	});

	chrome.contextMenus.create({
		id: "clear-courses",
		title: "Clear All Courses",
		contexts: ["action"],
	});
});

chrome.contextMenus.onClicked.addListener(async (info) => {
	switch (info.menuItemId) {
		case "open-planner":
			openPlannerPage();
			break;

		case "clear-courses":
			await chrome.storage.local.set({ courses: [] });
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

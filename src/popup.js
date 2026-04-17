// Popup script for Albert Course Planner

(async () => {
	const [
		courseStorage,
		plannerModule,
		bucketModule,
		constantsModule,
		metadataPanelModule,
	] =
		await Promise.all([
			import(chrome.runtime.getURL("src/course-storage.js")),
			import(chrome.runtime.getURL("src/planner.js")),
			import(chrome.runtime.getURL("src/bucket-manager.js")),
			import(chrome.runtime.getURL("src/utils/constants.js")),
			import(chrome.runtime.getURL("src/course-metadata-panel.js")),
		]);

	const {
		getCourses,
		getBuckets,
		getPlannerSelection,
		setPlannerSelection,
		exportData,
		assignCourseToBucket,
	} = courseStorage;
	const { analyzeSchedule } = plannerModule;
	const { renderBuckets } = bucketModule;
	const { CURRENT_TERM_NAME } = constantsModule;
	const { renderCourseMetadataContent } = metadataPanelModule;

	const params = new URLSearchParams(window.location.search);
	const panelMode = params.get("mode") || "popup";
	const isEmbeddedPanel = panelMode === "drawer" || panelMode === "sidepanel";

	if (isEmbeddedPanel) {
		document.body.classList.add("layout-drawer");
		document.body.dataset.panelMode = panelMode;
	}

	const statCoursesCount = document.getElementById("stat-courses-count");
	const bucketsContainer = document.getElementById("buckets-container");
	const planningTrayContainer = document.getElementById(
		"planning-tray-container",
	);
	const btnWeeklyView = document.getElementById("btn-weekly-view");
	const btnFetch = document.getElementById("btn-fetch");
	const btnFetchLabel = document.getElementById("btn-fetch-label");
	const btnExport = document.getElementById("btn-export");
	const btnClear = document.getElementById("btn-clear");
	const btnSettings = document.getElementById("btn-settings");
	const settingsPanel = document.getElementById("settings-panel");
	const btnCloseSettings = document.getElementById("btn-close-settings");
	const linkHelp = document.getElementById("link-help");
	const termBadge = document.getElementById("term-badge");
	const metadataDrawer = document.getElementById("course-metadata-drawer");
	const metadataDrawerBackdrop = document.getElementById(
		"course-metadata-backdrop",
	);
	const metadataDrawerBody = document.getElementById(
		"course-metadata-drawer-body",
	);
	const metadataDrawerTitle = document.getElementById(
		"course-metadata-drawer-title",
	);
	const metadataDrawerClose = document.getElementById("course-metadata-close");
	let loadDataDebounceTimer = null;
	let currentCourses = [];
	let currentBuckets = [];
	let activeMetadataCourseId = null;

	function scheduleLoadData() {
		if (loadDataDebounceTimer) {
			clearTimeout(loadDataDebounceTimer);
		}
		loadDataDebounceTimer = setTimeout(() => {
			loadDataDebounceTimer = null;
			loadData();
		}, 80);
	}

	function isNyuHost(urlString) {
		if (!urlString) return false;
		try {
			const url = new URL(urlString);
			return url.hostname === "nyu.edu" || url.hostname.endsWith(".nyu.edu");
		} catch (error) {
			return false;
		}
	}

	function isValidCourseShape(course) {
		if (!course || typeof course !== "object") return false;
		if (typeof course.id !== "string" || !course.id.trim()) return false;
		if (typeof course.courseCode !== "string" || !course.courseCode.trim()) {
			return false;
		}
		if (typeof course.section !== "string" || !course.section.trim()) {
			return false;
		}
		if (!Array.isArray(course.components)) {
			return false;
		}

		return true;
	}

	function assertValidParseResponse(response) {
		if (!response || typeof response !== "object") {
			throw new Error("Invalid response from Albert page parser.");
		}

		if (!Array.isArray(response.courses)) {
			const reason =
				typeof response.error === "string" && response.error.trim()
					? response.error
					: "Missing courses data from parser response.";
			throw new Error(reason);
		}

		const invalidCourse = response.courses.find(
			(course) => !isValidCourseShape(course),
		);
		if (invalidCourse) {
			throw new Error("Parser returned malformed course data.");
		}
	}

	function wait(ms) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	function closeCourseMetadataDrawer() {
		activeMetadataCourseId = null;
		document.body.classList.remove("metadata-drawer-open");
		metadataDrawer?.setAttribute("aria-hidden", "true");
		if (metadataDrawerTitle) {
			metadataDrawerTitle.textContent = "Course Metadata";
		}
	}

	function renderCourseMetadataDrawer() {
		if (!metadataDrawerBody || !activeMetadataCourseId) {
			return;
		}

		const course = currentCourses.find((item) => item.id === activeMetadataCourseId);
		if (!course) {
			closeCourseMetadataDrawer();
			return;
		}

		if (metadataDrawerTitle) {
			metadataDrawerTitle.textContent = course.courseCode || "Course Metadata";
		}

		renderCourseMetadataContent({
			container: metadataDrawerBody,
			course,
			buckets: currentBuckets,
			onBucketSelect: async (bucketId) => {
				if ((course.bucket ?? null) === (bucketId ?? null)) {
					return;
				}
				await assignCourseToBucket(course.id, bucketId);
				await loadData();
			},
		});
	}

	function openCourseMetadataDrawer(courseId) {
		if (!courseId) return;
		activeMetadataCourseId = courseId;
		renderCourseMetadataDrawer();
		if (!currentCourses.some((course) => course.id === courseId)) {
			return;
		}
		document.body.classList.add("metadata-drawer-open");
		metadataDrawer?.setAttribute("aria-hidden", "false");
	}

	async function requestParseCart(tabId) {
		return chrome.tabs.sendMessage(tabId, { type: "PARSE_CART" });
	}

	async function requestParseCartWithRetry(tabId, maxAttempts = 6) {
		let lastError = null;

		for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
			try {
				const response = await requestParseCart(tabId);
				if (response && typeof response === "object") {
					return response;
				}
				lastError = new Error("Parser did not return a response.");
			} catch (error) {
				lastError = error;
			}

			if (attempt < maxAttempts) {
				await wait(60 * attempt);
			}
		}

		throw (
			lastError || new Error("Unable to reach Albert parser content script.")
		);
	}

	async function init() {
		if (termBadge) {
			termBadge.textContent = CURRENT_TERM_NAME;
		}

		await loadData();
		setupEventListeners();
		listenForUpdates();
	}

	async function loadData() {
		try {
			const analysis = await analyzeSchedule();

			if (statCoursesCount) {
				const label = analysis.totalCourses === 1 ? "course" : "courses";
				statCoursesCount.textContent = `${analysis.totalCourses} ${label}`;
			}

			const [courses, buckets, plannerSelection] = await Promise.all([
				getCourses(),
				getBuckets(),
				getPlannerSelection(),
			]);
			currentCourses = courses;
			currentBuckets = buckets;

			renderPlanningTray(courses, plannerSelection);

			if (courses.length === 0) {
				bucketsContainer.innerHTML = `
        <div class="empty-state">
          <p class="empty-state-line">// no courses yet</p>
          <p class="empty-state-text">
            open albert shopping cart,<br>
            then run <span class="empty-state-cmd">fetch from albert</span>.
          </p>
        </div>
      `;
			} else {
				renderBuckets(bucketsContainer, buckets, courses, {
					onEditCourse: openCourseMetadataDrawer,
				});
			}

			if (activeMetadataCourseId) {
				renderCourseMetadataDrawer();
			}
		} catch (error) {
			console.error("[Albert Enhancer] Error loading data:", error);
			bucketsContainer.innerHTML = `
      <div class="empty-state empty-state--error">
        <p class="empty-state-line">// error</p>
        <p class="empty-state-text">failed to load courses</p>
      </div>
    `;
		}
	}

	function renderPlanningTray(courses, plannerSelection) {
		if (!planningTrayContainer) return;

		const plannerSet = new Set(plannerSelection);
		const plannedCourses = courses.filter((c) => plannerSet.has(c.id));

		if (plannedCourses.length === 0) {
			planningTrayContainer.innerHTML = `
				<p class="empty-state-text-small">// nothing queued &mdash; drag from buckets</p>
			`;
			return;
		}

		planningTrayContainer.innerHTML = "";
		const list = document.createElement("div");
		list.className = "planning-list";

		plannedCourses.forEach((course) => {
			const item = document.createElement("div");
			item.className = "planning-item";
			item.innerHTML = `
				<span class="planning-code">${course.courseCode}</span>
				<span class="planning-title">${course.title}</span>
			`;
			list.appendChild(item);
		});

		planningTrayContainer.appendChild(list);
	}

	function setupEventListeners() {
		btnWeeklyView.addEventListener("click", () => {
			chrome.runtime.sendMessage({ type: "OPEN_WEEKLY_VIEW" });
		});

		btnFetch.addEventListener("click", handleFetch);
		btnExport.addEventListener("click", handleExport);
		btnClear.addEventListener("click", handleClear);

		btnSettings.addEventListener("click", () => {
			settingsPanel.classList.remove("hidden");
		});

		btnCloseSettings.addEventListener("click", () => {
			settingsPanel.classList.add("hidden");
		});

		metadataDrawerClose?.addEventListener("click", closeCourseMetadataDrawer);
		metadataDrawerBackdrop?.addEventListener("click", closeCourseMetadataDrawer);

		linkHelp.addEventListener("click", (e) => {
			e.preventDefault();
			chrome.tabs.create({
				url: "https://www.reddit.com/r/nyu/comments/igr460/rant_why_is_nyu_albert_the_way_it_is/",
			});
		});

		document.addEventListener("coursesUpdated", loadData);
		document.addEventListener("keydown", (event) => {
			if (event.key === "Escape" && activeMetadataCourseId) {
				closeCourseMetadataDrawer();
			}
		});
	}

	function listenForUpdates() {
		chrome.storage.onChanged.addListener((changes, namespace) => {
			if (namespace === "local" && (changes.courses || changes.buckets)) {
				scheduleLoadData();
			}
		});
	}

	function setFetchLabel(text) {
		if (btnFetchLabel) {
			btnFetchLabel.textContent = text;
		} else {
			btnFetch.textContent = text;
		}
	}

	async function handleFetch() {
		btnFetch.disabled = true;
		setFetchLabel("fetching...");

		try {
			const [tab] = await chrome.tabs.query({
				active: true,
				currentWindow: true,
			});

			if (!tab) {
				alert("No active tab found");
				return;
			}

			if (!isNyuHost(tab.url)) {
				alert("Please open Albert (sis.portal.nyu.edu) first, then try again.");
				return;
			}

			let response;
			try {
				response = await requestParseCart(tab.id);
				if (!response || typeof response !== "object") {
					throw new Error("Parser did not return a response.");
				}
			} catch (sendError) {
				console.log(
					"[Albert Enhancer] Content script not responding, trying to inject...",
				);

				try {
					await chrome.scripting.executeScript({
						target: { tabId: tab.id },
						files: ["src/content.js"],
					});

					response = await requestParseCartWithRetry(tab.id);
				} catch (injectError) {
					console.error(
						"[Albert Enhancer] Failed to inject content script:",
						injectError,
					);
					throw new Error(
						"Could not access the page. Please refresh and try again.",
					);
				}
			}

			assertValidParseResponse(response);

			if (response.courses.length > 0) {
				await chrome.storage.local.set({ courses: response.courses });
				await chrome.action.setBadgeText({
					text: String(response.courses.length),
					tabId: tab.id,
				});
				await chrome.action.setBadgeBackgroundColor({
					color: "#57068c",
					tabId: tab.id,
				});

				const fetchedCourseIds = new Set(response.courses.map((c) => c.id));
				const currentPlannerSelection = await getPlannerSelection();
				const validPlannerSelection = currentPlannerSelection.filter((id) =>
					fetchedCourseIds.has(id),
				);

				if (validPlannerSelection.length !== currentPlannerSelection.length) {
					await setPlannerSelection(validPlannerSelection);
				}

				setFetchLabel(`fetched ${response.courses.length} courses`);
				await loadData();
			} else {
				setFetchLabel("no courses found");
				const errorMsg = response.error || "No courses found in shopping cart.";
				alert(
					errorMsg +
						"\n\nMake sure you're on the Shopping Cart page with courses added.",
				);
			}
		} catch (error) {
			console.error("[Albert Enhancer] Fetch failed:", error);
			setFetchLabel("fetch failed");
			alert(
				error.message ||
					"Failed to fetch courses.\nMake sure you're on Albert's Shopping Cart page and try refreshing the page.",
			);
		} finally {
			setTimeout(() => {
				btnFetch.disabled = false;
				setFetchLabel("fetch from albert");
			}, 2000);
		}
	}

	async function handleExport() {
		try {
			const data = await exportData();
			const blob = new Blob([JSON.stringify(data, null, 2)], {
				type: "application/json",
			});
			const url = URL.createObjectURL(blob);

			const a = document.createElement("a");
			a.href = url;
			a.download = `albert-courses-${
				new Date().toISOString().split("T")[0]
			}.json`;
			a.click();

			URL.revokeObjectURL(url);
		} catch (error) {
			console.error("[Albert Enhancer] Export failed:", error);
			alert("Export failed. Please try again.");
		}
	}

	async function handleClear() {
		if (!confirm("Are you sure you want to clear all courses?")) {
			return;
		}

		try {
			await chrome.storage.local.set({ courses: [], plannerSelection: [] });
			await chrome.action.setBadgeText({ text: "" });
			await loadData();
		} catch (error) {
			console.error("[Albert Enhancer] Clear failed:", error);
			alert("Failed to clear courses.");
		}
	}

	init();
})();

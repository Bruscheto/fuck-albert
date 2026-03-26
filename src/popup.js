// Popup script for Albert Course Planner

(async () => {
	const [courseStorage, plannerModule, bucketModule, constantsModule] =
		await Promise.all([
			import(chrome.runtime.getURL("src/course-storage.js")),
			import(chrome.runtime.getURL("src/planner.js")),
			import(chrome.runtime.getURL("src/bucket-manager.js")),
			import(chrome.runtime.getURL("src/utils/constants.js")),
		]);

	const {
		getCourses,
		getBuckets,
		getPlannerSelection,
		setPlannerSelection,
		exportData,
	} = courseStorage;
	const { analyzeSchedule } = plannerModule;
	const { renderBuckets } = bucketModule;
	const { CURRENT_TERM_NAME } = constantsModule;

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
	const btnExport = document.getElementById("btn-export");
	const btnClear = document.getElementById("btn-clear");
	const btnSettings = document.getElementById("btn-settings");
	const settingsPanel = document.getElementById("settings-panel");
	const btnCloseSettings = document.getElementById("btn-close-settings");
	const linkHelp = document.getElementById("link-help");
	const termBadge = document.getElementById("term-badge");

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
				statCoursesCount.textContent = `${analysis.totalCourses} Courses`;
			}

			const [courses, buckets, plannerSelection] = await Promise.all([
				getCourses(),
				getBuckets(),
				getPlannerSelection(),
			]);

			renderPlanningTray(courses, plannerSelection);

			if (courses.length === 0) {
				bucketsContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📚</div>
          <p class="empty-state-text">
            No courses yet.<br>
            Open Albert shopping cart, then<br>
            click "Fetch from Albert" above.
          </p>
        </div>
      `;
			} else {
				renderBuckets(bucketsContainer, buckets, courses);
			}
		} catch (error) {
			console.error("[Albert Enhancer] Error loading data:", error);
			bucketsContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <p class="empty-state-text">Error loading courses</p>
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
				<p class="empty-state-text-small">No courses in "About to Enroll". Add from buckets.</p>
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

		linkHelp.addEventListener("click", (e) => {
			e.preventDefault();
			chrome.tabs.create({
				url: "https://www.reddit.com/r/nyu/comments/igr460/rant_why_is_nyu_albert_the_way_it_is/",
			});
		});

		document.addEventListener("coursesUpdated", loadData);
	}

	function listenForUpdates() {
		chrome.storage.onChanged.addListener((changes, namespace) => {
			if (namespace === "local" && (changes.courses || changes.buckets)) {
				loadData();
			}
		});
	}

	async function handleFetch() {
		btnFetch.disabled = true;
		btnFetch.textContent = "⏳ Fetching...";

		try {
			const [tab] = await chrome.tabs.query({
				active: true,
				currentWindow: true,
			});

			if (!tab) {
				alert("No active tab found");
				return;
			}

			if (!tab.url?.includes("nyu.edu")) {
				alert("Please open Albert (sis.portal.nyu.edu) first, then try again.");
				return;
			}

			let response;
			try {
				response = await chrome.tabs.sendMessage(tab.id, {
					type: "PARSE_CART",
				});
			} catch (sendError) {
				console.log(
					"[Albert Enhancer] Content script not responding, trying to inject...",
				);

				try {
					await chrome.scripting.executeScript({
						target: { tabId: tab.id },
						files: ["src/content.js"],
					});

					await new Promise((resolve) => setTimeout(resolve, 100));

					response = await chrome.tabs.sendMessage(tab.id, {
						type: "PARSE_CART",
					});
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

			if (response?.courses && response.courses.length > 0) {
				await chrome.storage.local.set({ courses: response.courses });

				const fetchedCourseIds = new Set(response.courses.map((c) => c.id));
				const currentPlannerSelection = await getPlannerSelection();
				const validPlannerSelection = currentPlannerSelection.filter((id) =>
					fetchedCourseIds.has(id),
				);

				if (validPlannerSelection.length !== currentPlannerSelection.length) {
					await setPlannerSelection(validPlannerSelection);
				}

				btnFetch.textContent = `✅ Found ${response.courses.length} courses`;
				await loadData();
			} else {
				btnFetch.textContent = "❌ No courses found";
				const errorMsg =
					response?.error || "No courses found in shopping cart.";
				alert(
					errorMsg +
						"\n\nMake sure you're on the Shopping Cart page with courses added.",
				);
			}
		} catch (error) {
			console.error("[Albert Enhancer] Fetch failed:", error);
			btnFetch.textContent = "❌ Fetch failed";
			alert(
				error.message ||
					"Failed to fetch courses.\nMake sure you're on Albert's Shopping Cart page and try refreshing the page.",
			);
		} finally {
			setTimeout(() => {
				btnFetch.disabled = false;
				btnFetch.textContent = "📥 Fetch from Albert";
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
			await chrome.storage.local.set({ courses: [] });
			await loadData();
		} catch (error) {
			console.error("[Albert Enhancer] Clear failed:", error);
			alert("Failed to clear courses.");
		}
	}

	init();
})();

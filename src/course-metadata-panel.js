import { formatTime } from "./utils/time-parser.js";
import { getProfessorRatings, setProfessorRating } from "./course-storage.js";

function getPrimaryComponent(course) {
	return (
		course?.components?.find(
			(component) => component?.type?.toLowerCase() === "lecture",
		) ||
		course?.components?.[0] ||
		null
	);
}

function getInstructors(course) {
	if (!course?.components) return [];
	const seen = new Set();
	const names = [];
	for (const comp of course.components) {
		const name = comp.instructor?.trim();
		if (name && !/^(TBA|to be announced)$/i.test(name) && !seen.has(name)) {
			seen.add(name);
			names.push(name);
		}
	}
	return names;
}

function rmpSearchUrl(professorName) {
	return `https://www.google.com/search?q=${encodeURIComponent(`ratemyprofessors ${professorName} NYU`)}`;
}

export function ratingTier(val) {
	if (val >= 4) return "good";
	if (val >= 3) return "mid";
	return "low";
}

function formatMetaLine(course) {
	const parts = [];
	if (course.section) {
		parts.push(`Section ${course.section}`);
	}
	const component = getPrimaryComponent(course);
	if (component?.timeRange) {
		const dayLabel =
			Array.isArray(component.days) && component.days.length
				? component.days.join("/")
				: "Days TBA";
		parts.push(
			`${dayLabel} ${formatTime(component.timeRange.start)}\u2009\u2013\u2009${formatTime(component.timeRange.end)}`,
		);
	} else {
		parts.push("Time TBA");
	}
	return parts.join(" \u00B7 ");
}

function buildStatusTags(context) {
	const {
		isPlanned = false,
		online = false,
		scheduledDays = [],
		conflictCodes = [],
		missingTypes = [],
	} = context;

	const tags = [];

	if (isPlanned && scheduledDays.length > 0) {
		tags.push({
			text: `Scheduled \u00B7 ${scheduledDays.join("/")}`,
			cls: "status-scheduled",
		});
	} else if (!isPlanned) {
		tags.push({ text: "Not scheduled", cls: "status-neutral" });
	}

	if (online) {
		tags.push({ text: "Online", cls: "status-online" });
	}

	if (isPlanned && conflictCodes.length > 0) {
		tags.push({
			text: `Conflicts with ${conflictCodes.join(", ")}`,
			cls: "status-conflict",
		});
	} else if (isPlanned) {
		tags.push({ text: "No conflicts", cls: "status-ok" });
	}

	for (const type of missingTypes) {
		tags.push({ text: `${type} not scheduled`, cls: "status-warn" });
	}

	if (tags.length === 0) return null;

	const container = document.createElement("div");
	container.className = "metadata-status-tags";
	for (const tag of tags) {
		const el = document.createElement("span");
		el.className = `metadata-status-tag ${tag.cls}`;
		el.textContent = tag.text;
		container.appendChild(el);
	}
	return container;
}

function createBucketOption(bucket, isActive, onBucketSelect) {
	const button = document.createElement("button");
	button.type = "button";
	button.className = "metadata-bucket-option";
	if (isActive) {
		button.classList.add("is-active");
	}

	const dot = document.createElement("span");
	dot.className = "metadata-bucket-dot";
	if (bucket.color) {
		dot.style.backgroundColor = bucket.color;
	}

	const labelWrap = document.createElement("span");
	labelWrap.className = "metadata-bucket-copy";

	const name = document.createElement("span");
	name.className = "metadata-bucket-name";
	name.textContent = bucket.name;
	labelWrap.appendChild(name);

	if (bucket.description) {
		const helper = document.createElement("span");
		helper.className = "metadata-bucket-helper";
		helper.textContent = bucket.description;
		labelWrap.appendChild(helper);
	}

	const indicator = document.createElement("span");
	indicator.className = "metadata-bucket-indicator";
	indicator.setAttribute("aria-hidden", "true");

	button.setAttribute("aria-pressed", String(isActive));
	button.append(dot, labelWrap, indicator);
	button.addEventListener("click", () => onBucketSelect(bucket.id ?? null));
	return button;
}

function showRatingInput(badge, profName, currentVal) {
	if (badge.querySelector("input")) return;

	const rect = badge.getBoundingClientRect();
	badge.style.width = `${Math.max(rect.width, 38)}px`;
	badge.style.height = `${rect.height}px`;

	const input = document.createElement("input");
	input.type = "number";
	input.className = "metadata-prof-rating-input";
	input.min = "0";
	input.max = "5";
	input.step = "0.1";
	input.value = currentVal != null ? currentVal : "";
	input.placeholder = "0–5";

	badge.textContent = "";
	badge.appendChild(input);
	input.focus();
	input.select();

	input.addEventListener("wheel", (e) => e.preventDefault(), {
		passive: false,
	});

	const commit = async () => {
		const raw = input.value.trim();
		badge.classList.remove("rating-good", "rating-mid", "rating-low");
		if (raw === "") {
			await setProfessorRating(profName, null);
			badge.classList.remove("has-value");
			badge.textContent = "★";
			badge.title = "Add rating";
		} else {
			const val = Math.min(5, Math.max(0, parseFloat(raw) || 0));
			await setProfessorRating(profName, val);
			badge.classList.add("has-value", `rating-${ratingTier(val)}`);
			badge.textContent = val.toFixed(1);
			badge.title = `Rating: ${val}/5 — click to edit`;
		}
		badge.style.width = "";
		badge.style.height = "";
		document.dispatchEvent(new CustomEvent("professor-ratings-changed"));
	};

	input.addEventListener("blur", commit);
	input.addEventListener("keydown", (e) => {
		if (e.key === "Enter") {
			e.preventDefault();
			input.blur();
		}
		if (e.key === "Escape") {
			input.value = currentVal != null ? currentVal : "";
			input.blur();
		}
	});
}

export function renderCourseMetadataContent({
	container,
	course,
	buckets,
	context = {},
	ratings = {},
	onBucketSelect,
}) {
	if (!container) return;

	container.innerHTML = "";

	if (!course) {
		container.innerHTML = `
			<div class="metadata-empty-state">
				<h3>No course selected</h3>
				<p>Pick a course to organize it and add more metadata later.</p>
			</div>
		`;
		return;
	}

	const summary = document.createElement("div");
	summary.className = "metadata-summary";

	const headline = document.createElement("div");
	headline.className = "metadata-headline";
	headline.innerHTML = `
		<h2 class="metadata-course-code">${course.courseCode}</h2>
		<span class="metadata-credit-pill">${course.credits ?? "-"} cr</span>
	`;

	const title = document.createElement("p");
	title.className = "metadata-course-title";
	title.textContent = course.title || "Untitled Course";

	const meta = document.createElement("p");
	meta.className = "metadata-meta-line";
	meta.textContent = formatMetaLine(course);

	summary.append(headline, title, meta);

	const instructors = getInstructors(course);
	if (instructors.length > 0) {
		const instructorLine = document.createElement("div");
		instructorLine.className = "metadata-instructor-line";
		for (let i = 0; i < instructors.length; i++) {
			if (i > 0) {
				instructorLine.appendChild(document.createTextNode(", "));
			}
			const entry = document.createElement("span");
			entry.className = "metadata-instructor-entry";

			const link = document.createElement("a");
			link.className = "metadata-instructor-link";
			link.href = rmpSearchUrl(instructors[i]);
			link.target = "_blank";
			link.rel = "noopener noreferrer";
			link.textContent = instructors[i];
			link.title = `Search ${instructors[i]} on Rate My Professors`;
			entry.appendChild(link);

			const ratingVal = ratings[instructors[i]];
			const badge = document.createElement("span");
			badge.className = "metadata-prof-rating";
			if (ratingVal != null) {
				const num = Number(ratingVal);
				badge.classList.add("has-value", `rating-${ratingTier(num)}`);
				badge.textContent = num.toFixed(1);
				badge.title = `Rating: ${ratingVal}/5 — click to edit`;
			} else {
				badge.textContent = "★";
				badge.title = "Add rating";
			}
			badge.addEventListener("click", (e) => {
				e.stopPropagation();
				showRatingInput(badge, instructors[i], ratingVal);
			});
			entry.appendChild(badge);

			instructorLine.appendChild(entry);
		}
		summary.appendChild(instructorLine);
	}

	const statusTags = buildStatusTags(context);
	if (statusTags) {
		summary.appendChild(statusTags);
	}

	const divider = document.createElement("hr");
	divider.className = "metadata-divider";

	const bucketHeading = document.createElement("div");
	bucketHeading.className = "metadata-section-heading";
	bucketHeading.textContent = "Bucket";

	const bucketList = document.createElement("div");
	bucketList.className = "metadata-bucket-list";

	const unsortedBucket = {
		id: null,
		name: "Unsorted",
		color: "#9ca3af",
		description: "Keep the course ungrouped for now",
	};

	bucketList.appendChild(
		createBucketOption(unsortedBucket, !course.bucket, onBucketSelect),
	);

	for (const bucket of buckets) {
		bucketList.appendChild(
			createBucketOption(
				bucket,
				course.bucket === bucket.id,
				onBucketSelect,
			),
		);
	}

	container.append(summary, divider, bucketHeading, bucketList);
}

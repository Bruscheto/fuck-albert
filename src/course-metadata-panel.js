import { formatTime } from "./utils/time-parser.js";

function getPrimaryComponent(course) {
	return (
		course?.components?.find(
			(component) => component?.type?.toLowerCase() === "lecture",
		) ||
		course?.components?.[0] ||
		null
	);
}

function formatMeetingSummary(course) {
	const component = getPrimaryComponent(course);
	if (!component?.timeRange) {
		return "Time TBA";
	}

	const dayLabel = Array.isArray(component.days) && component.days.length
		? component.days.join(" / ")
		: "Days TBA";

	return `${dayLabel} • ${formatTime(component.timeRange.start)} - ${formatTime(component.timeRange.end)}`;
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

	const helper = document.createElement("span");
	helper.className = "metadata-bucket-helper";
	helper.textContent = bucket.description || "Primary course organization";

	labelWrap.append(name, helper);

	const status = document.createElement("span");
	status.className = "metadata-bucket-state";
	status.textContent = isActive ? "Selected" : "Choose";

	button.append(dot, labelWrap, status);
	button.addEventListener("click", () => onBucketSelect(bucket.id ?? null));
	return button;
}

function createFutureSection(title, description) {
	const section = document.createElement("section");
	section.className = "metadata-section";

	const heading = document.createElement("div");
	heading.className = "metadata-section-heading";
	heading.textContent = title;

	const card = document.createElement("div");
	card.className = "metadata-future-card";
	card.innerHTML = `
		<div class="metadata-future-badges">
			<span class="metadata-future-badge">Soon</span>
			<span class="metadata-future-badge">Expandable</span>
		</div>
		<p>${description}</p>
	`;

	section.append(heading, card);
	return section;
}

export function renderCourseMetadataContent({
	container,
	course,
	buckets,
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

	const summary = document.createElement("section");
	summary.className = "metadata-summary";
	summary.innerHTML = `
		<div class="metadata-summary-top">
			<div>
				<p class="metadata-eyebrow">Course</p>
				<h2 class="metadata-course-code">${course.courseCode}</h2>
			</div>
			<span class="metadata-credit-pill">${course.credits ?? "-"} Credits</span>
		</div>
		<h3 class="metadata-course-title">${course.title || "Untitled Course"}</h3>
		<div class="metadata-summary-grid">
			<div class="metadata-summary-item">
				<span class="metadata-summary-label">Section</span>
				<span class="metadata-summary-value">${course.section || "TBA"}</span>
			</div>
			<div class="metadata-summary-item">
				<span class="metadata-summary-label">Meeting</span>
				<span class="metadata-summary-value">${formatMeetingSummary(course)}</span>
			</div>
		</div>
	`;

	const bucketSection = document.createElement("section");
	bucketSection.className = "metadata-section";

	const bucketHeading = document.createElement("div");
	bucketHeading.className = "metadata-section-heading";
	bucketHeading.textContent = "Bucket";

	const bucketDescription = document.createElement("p");
	bucketDescription.className = "metadata-section-copy";
	bucketDescription.textContent =
		"Buckets stay as the main organizer and planner priority signal.";

	const bucketList = document.createElement("div");
	bucketList.className = "metadata-bucket-list";

	const unsortedBucket = {
		id: null,
		name: "Unsorted",
		color: "#9ca3af",
		description: "Keep the course ungrouped for now",
	};

	bucketList.appendChild(
		createBucketOption(
			unsortedBucket,
			!course.bucket,
			onBucketSelect,
		),
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

	bucketSection.append(bucketHeading, bucketDescription, bucketList);

	container.append(summary, bucketSection);
	container.appendChild(
		createFutureSection(
			"Tags",
			"Multi-select tags can live here later for filtering, requirement tracking, and personal labels without replacing buckets.",
		),
	);
	container.appendChild(
		createFutureSection(
			"Links & Notes",
			"Reserve space for quick links such as Rate My Professor, course notes, or reminders tied to a class.",
		),
	);
}

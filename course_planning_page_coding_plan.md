# Course Planning Page — Remaining Improvements

## Architecture Context

This is a **Chrome Manifest V3 extension** built with **vanilla HTML/CSS/JS** (no framework, no TypeScript, no build step). All UI is DOM manipulation in plain ES modules. Data persists immediately via `chrome.storage.local` — there is no draft/save distinction.

### Key Files

- `src/weekly-view.js` / `src/weekly-view.css` — Calendar page UI and logic
- `src/planner.js` — Schedule flattening and conflict-free generation
- `src/course-storage.js` — `chrome.storage.local` CRUD for courses, buckets, planner selection
- `src/utils/calendar-utils.js` — Conflict detection, weekly hours calculation
- `src/utils/time-parser.js` — Time formatting and conversion
- `src/content.js` — Albert shopping cart parser (groups lectures + recitations under `components[]`)
- `src/bucket-manager.js` — Popup card rendering and drag-drop

---

## Already Completed

The following items from the original plan have been implemented and require no further work:

- **Course grouping model** — `content.js` already parses lectures and recitations into a parent course with a `components[]` array. `flattenToSchedule()` in `planner.js` handles expansion for rendering.
- **Calendar card redesign** — Cards now show: course code, time range, title (2-line clamp), then pills. Type is demoted to a pill shown only for non-Lecture components. Online indicators appear per-component.
- **Per-course deterministic colors** — `courseCodeToColor()` hashes the course code to produce a consistent HSL color. Same course code across sections always matches.
- **Online class indicators** — Shown on calendar blocks, sidebar bucket entries, planner tray chips, and popup cards.
- **Unified icon buttons** — All sidebar card actions (add, remove, edit, drag) use a consistent `course-icon-btn` system with proper sizing and hit targets.
- **Bucket rename** — `startBucketRename()` supports double-click and button-triggered inline rename.
- **Remove from sidebar** — Planned courses show a remove button directly in bucket entries.
- **Visual redesign** — Modern glass effects, purple-tinted shadows, gradient header, refined typography.

---

## Product Objectives (Remaining)

1. Reduce cognitive load in the left sidebar through collapsible sections.
2. Help users evaluate schedule quality with additional metrics.
3. Surface incomplete course configurations (e.g. lecture scheduled, recitation missing).
4. Improve accessibility: contrast, keyboard navigation, ARIA labels.
5. Add helper microcopy so new users understand bucket purpose.

---

## Workstream 1: Sidebar Section Collapsibility

### Problem

The sidebar has four sections (Planning Tray, Buckets, Conflicts, Statistics) but only bucket course lists collapse. The other sections are always fully expanded, adding visual weight when users don't need them.

### Tasks

- Add collapse/expand toggle to each `sidebar-section` (Planning Tray, Conflicts, Statistics).
- Persist collapse state in `localStorage` keyed by section name (same pattern as `bucketCollapseState`).
- Animate open/close with the existing `grid-template-rows` technique used by `.bucket-course-list`.

### Files to Change

- `src/weekly-view.js` — Add collapse state tracking and toggle handlers for each section.
- `src/weekly-view.css` — Add `.sidebar-section.is-collapsed` styles with the grid-row animation.

### Acceptance Criteria

- Each sidebar section can be independently collapsed and expanded.
- Collapse state persists across page reloads.
- Collapsed sections show only their header with a chevron indicator.

---

## Workstream 2: Schedule Quality Metrics

### Problem

The stats panel currently shows only course count and hours/week. Users have to mentally calculate whether their schedule has painful gaps, too-early mornings, or too many campus days.

### Tasks

- Add these metrics to the existing stats grid in `updatePlannerStats()`:
  - Earliest class start time
  - Latest class end time
- Add utility functions in `src/utils/calendar-utils.js`:
  - `getEarliestStart(schedule)` — returns the earliest `timeRange.start` across all components
  - `getLatestEnd(schedule)` — returns the latest `timeRange.end`

### Files to Change

- `src/utils/calendar-utils.js` — Add the three analysis functions.
- `src/weekly-view.js` — Call them in `updatePlannerStats()` and render into the stats grid.
- `src/weekly-view.html` — Add stat items to the `.stats-grid` container.
- `src/weekly-view.css` — Adjust grid to accommodate additional stats.

### Acceptance Criteria

- Users can see at a glance when their earliest class is and when their latest one ends.
- Stats update automatically when courses are added or removed.

---

## Workstream 3: Incomplete Course Warnings

### Problem

A course with a lecture and a required recitation can have its lecture scheduled but its recitation left out. The planner does not flag this — the user might not realize their schedule is incomplete.

### Tasks

- After `flattenToSchedule()`, check each planned course: if it has multiple components (e.g. Lecture + Recitation) but only some have valid time ranges on the calendar, flag it.
- Show a warning in the Conflicts sidebar section (or a new "Warnings" area) listing courses with missing components.
- Example message: "CSCI-UA 202 — Recitation not scheduled"

### Files to Change

- `src/weekly-view.js` — Add completeness check in `loadSchedule()` after building the planned schedule. Render warnings alongside conflicts.
- `src/weekly-view.css` — Style warning items (can reuse `.conflict-item` with a different accent color, e.g. amber).

### Acceptance Criteria

- Courses with missing required components show a visible warning.
- Warnings clear automatically when the missing component is resolved.

---

## Workstream 4: Bucket Onboarding Microcopy

### Problem

New users may not understand what "Buckets" are for. The label is fine, but there's no explanation on first use.

### Tasks

- Add a short helper line under the "Buckets" section header when no user-created buckets exist yet: "Organize courses into groups to compare schedule options."
- Once the user creates their first bucket, the helper text disappears (replaced by the bucket list).

### Files to Change

- `src/weekly-view.js` — In `renderBucketsSidebar()`, render helper text when `buckets.length === 0` (only the default "Unsorted" group exists).
- `src/weekly-view.css` — Style the helper text (reuse `.tray-empty` pattern).

### Acceptance Criteria

- First-time users see a brief explanation of what buckets do.
- The helper text goes away once buckets are created.

---

## Workstream 5: Accessibility Pass

### Problem

Some interactive elements lack proper keyboard support and ARIA labeling. Contrast on small pills inside colored calendar blocks may not meet WCAG AA.

### Tasks

- Audit contrast ratios on `.course-block-pill` elements (white text on colored backgrounds). Increase opacity or add text shadows if needed.
- Ensure all `.course-icon-btn` buttons have `aria-label` attributes (most already do — verify completeness).
- Add visible focus-ring styles for keyboard navigation on calendar blocks, bucket entries, and sidebar sections.
- Verify that the drag-and-drop flow has keyboard alternatives (the "+ Add" button already serves as the non-drag path to add courses).

### Files to Change

- `src/weekly-view.css` — Add `:focus-visible` styles for interactive elements.
- `src/weekly-view.js` — Verify and add missing `aria-label` attributes.

### Acceptance Criteria

- All interactive elements are keyboard-reachable with visible focus indicators.
- Text on colored backgrounds meets WCAG AA contrast (4.5:1 for small text).
- Screen readers can announce course details on calendar blocks.

---

## Suggested Implementation Order

### Phase 1: Low-Effort High-Value

- Sidebar section collapsibility (Workstream 1)
- Bucket onboarding microcopy (Workstream 4)

### Phase 2: Schedule Intelligence

- Additional stats metrics (Workstream 2)
- Incomplete course warnings (Workstream 3)

### Phase 3: Polish

- Accessibility audit and fixes (Workstream 5)
- Performance checks on drag-and-drop with many courses

---

## QA Checklist

### UX

- Can users tell what is scheduled versus unscheduled?
- Do they understand what buckets are for on first use?
- Can they identify conflicts and incomplete courses quickly?
- Do the additional stats help with schedule comparison?

### Accessibility

- Keyboard navigation works across all planner interactions.
- Focus states are visible on all interactive elements.
- Contrast passes on cards, badges, and labels.
- Screen readers announce course details on calendar blocks.

### Functional

- Drag-and-drop still works correctly.
- Schedule metrics update after every add/remove.
- Collapsing sidebar sections does not break layout.
- Completeness warnings appear and clear correctly.

---

## Risks and Watchouts

- Additional stats should not clutter the stats panel — keep the grid compact.
- Completeness warnings should use a softer treatment than conflict errors to avoid alarm fatigue.
- Sidebar collapse animations should not cause layout jank during drag-and-drop.

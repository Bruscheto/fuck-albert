# Fuck Albert — Project Instructions

## What this is
Chrome extension (Manifest V3) that improves NYU Albert course registration. Scrapes shopping cart, renders weekly calendar, supports priority buckets and schedule planning.

## Stack
- Vanilla JavaScript (ES modules) — no bundler, no build step
- Chrome Extension APIs (storage, scripting, sidePanel, contextMenus)
- All state in `chrome.storage.local`
- No external dependencies

## Architecture
- `src/content.js` — DOM observer + course scraping, injected into Albert pages
- `src/background.js` — service worker, messaging hub, context menus
- `src/popup.js/html/css` — extension popup (doubles as side panel via `?mode=sidepanel`)
- `src/weekly-view.js/html/css` — full calendar page
- `src/course-storage.js` — CRUD layer over chrome.storage
- `src/bucket-manager.js` — bucket UI + drag-drop
- `src/planner.js` — conflict detection + schedule optimization
- `src/utils/` — constants, time parsing, calendar math

## Conventions
- Vanilla JS with ES module imports (`type: "module"` in manifest)
- No build tools — files run directly in the browser
- Use JSDoc `@typedef` and `@param` for complex data models (Course, Bucket, Schedule)
- DOM manipulation is direct — no framework abstractions
- All cross-component communication via `chrome.runtime.sendMessage` / `chrome.storage.onChanged`
- Colors and selectors defined in `src/utils/constants.js`

## Testing
- `test-harness.html` in project root for manual testing outside Chrome
- `src/chrome-mock.js` mocks Chrome APIs for local dev
- No test framework — keep it simple

## Target pages
- `https://sis.portal.nyu.edu/*`
- `https://sis.nyu.edu/*`

## Plan docs
- `plan/PROJECT_PLAN.md` — full feature spec and phased roadmap
- `plan/ideas.md` — feature brainstorm
- `plan/popup-simplification.md` — popup redesign notes

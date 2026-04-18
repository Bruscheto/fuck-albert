# Fuck Albert

A Chrome extension that unfucks NYU's Albert course registration. Scrapes your shopping cart, throws it on a weekly calendar, and lets you plan your schedule without losing your mind.

## What it does

- **Reads your shopping cart** — auto-parses courses, times, instructors, rooms, credits from Albert's DOM
- **Calendar page** — full weekly schedule view with conflict highlighting, clean grid layout
- **Priority buckets** — drag courses into Required / High / Medium / Low / Backup tiers
- **Course metadata panel** — quick-view course details without leaving the page
- **Export/Import** — backup your picks as JSON

## Install

1. Clone this repo
2. Go to `chrome://extensions/` → enable **Developer mode**
3. **Load unpacked** → select this folder
4. Navigate to [Albert](https://sis.nyu.edu) and start planning

Works on Chrome and Edge (Chromium-based).

## Project structure

```
fuck-albert/
├── manifest.json
├── assets/                     # Extension icons (16/48/128)
├── plan/                       # Dev planning docs
└── src/
    ├── background.js           # Service worker, messaging, context menus
    ├── content.js              # DOM observer, course scraping, UI injection
    ├── content.css             # Injected page styles
    ├── course-storage.js       # chrome.storage CRUD for courses & buckets
    ├── course-metadata-panel.js/css  # Course detail overlay
    ├── bucket-manager.js       # Bucket UI + drag-drop logic
    ├── planner.js              # Conflict detection & schedule optimization
    ├── popup.html/css/js       # Extension popup / side panel
    ├── weekly-view.html/css/js # Full calendar view
    └── utils/
        ├── constants.js        # Selectors, config, defaults
        ├── time-parser.js      # "09:30 AM - 10:45 AM", "TTh" → structured data
        └── calendar-utils.js   # Grid layout, overlap detection
```

## License

MIT

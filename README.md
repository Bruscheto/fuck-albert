# Albert Course Planner

A browser extension to enhance the NYU course registration experience with Albert. This tool automatically tracks courses in your shopping cart, displays them in a weekly calendar view, and helps you organize courses into priority buckets.

## Features

- **Automatic Course Detection**: Parses course info from shopping cart DOM (code, section, credits, times, days, room, instructor)
- **Weekly Calendar View**: Real-time visual schedule with conflict highlighting
- **Priority Buckets**: Drag-and-drop courses into Required, High, Medium, Low, Backup priorities
- **Conflict Detection**: Automatic schedule conflict detection with suggestions
- **Auto Planner**: Greedy algorithm to generate conflict-free schedule by priority order
- **Export/Import**: Backup and restore course selections as JSON

## Installation

1. Clone or download this repository
2. Open Chrome/Edge and navigate to `chrome://extensions/` (or `edge://extensions/`)
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select this project directory
5. The extension icon should appear in your browser toolbar

## Usage

1. Navigate to Albert (sis.nyu.edu) and log in
2. Go to your Shopping Cart
3. Click ➕ next to courses to add them to the planner
4. Click the extension icon to view courses and manage buckets
5. Open 📅 Weekly View to see the calendar
6. Use Alt+Shift+P to quickly open the planner

## Project Structure

```
albert-enhancer/
├── manifest.json           # MV3 extension config
├── assets/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── src/
    ├── background.js       # Service worker (messages, context menu, commands)
    ├── content.js          # DOM observer, course detection, UI injection
    ├── content.css         # Injected styles
    ├── course-storage.js   # chrome.storage.local CRUD
    ├── bucket-manager.js   # Bucket UI + drag-drop
    ├── planner.js          # Conflict detection, schedule optimization
    ├── popup.html/css/js   # Extension popup
    ├── weekly-view.html/css/js  # Full calendar page
    └── utils/
        ├── constants.js    # Selectors, config, defaults
        ├── time-parser.js  # Parse "09:30 AM - 10:45 AM", "TTh"
        └── calendar-utils.js # Grid building, overlap checks
```

## DOM Selectors

The extension parses Albert's shopping cart using these selectors:

- `table.ps_grid-flex[title*="Shopping Cart"]` — Shopping cart table
- `tr.ps_grid-row` — Course rows in the cart table
- `div.ps_box-group.psc_layout` — Row layout wrapper for course fields
- Day abbreviations: `M`, `T`, `W`, `Th`, `F` (parsed to `Mon`, `Tue`, etc.)
- Time format: `09:30 AM -\n10:45 AM`

## Development

```bash
# No build step required - plain ES modules
# Load as unpacked extension for development

# To update icons:
python3 -c "from PIL import Image..."  # see assets/ generation
```

## License

MIT

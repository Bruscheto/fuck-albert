# Albert Course Planner - Project Plan

## Overview

**Project Name**: Albert Course Planner  
**Purpose**: Enhance the NYU course registration experience by providing intelligent course management and planning tools  
**Target System**: Albert (NYU's Student Information System)

## Problem Statement

NYU's Albert course registration system has significant UX issues:

- Limited visibility into schedule conflicts
- No easy way to visualize weekly course load
- Difficulty organizing alternative course options
- Manual process for tracking shopping cart items
- No intelligent scheduling assistance

## Solution Overview

A browser extension that integrates with Albert to provide:

1. Automatic course detection and information extraction
2. Real-time weekly calendar visualization
3. Bucket-based course organization with priorities
4. Custom requirement group tracking with configurable completion rules
5. Intelligent auto-planner for schedule optimization

---

## Core Features

### 1. Automatic Course Detection

**Goal**: Automatically read and parse course information when added to shopping cart

**Requirements**:

- Detect when courses are added to Albert shopping cart
- Extract course information:
  - Course code and title
  - Meeting times (days, start/end times)
  - Location
  - Instructor
  - Credits
  - Enrollment capacity and availability
  - Section details
- Store parsed data for further processing

**Implementation Approach**:

- Content script monitors DOM changes on Albert shopping cart page
- Use MutationObserver to detect new course entries
- Parse HTML tables/structured data to extract course details
- Normalize time formats and day abbreviations

### 2. Weekly Calendar View

**Goal**: Dynamic, real-time weekly schedule visualization

**Requirements**:

- Display courses in a 7-day weekly grid
- Show time slots (hourly or 15-minute intervals)
- Visual representation:
  - Course blocks on appropriate days/times
  - Color coding by course or bucket
  - Conflict highlighting
- Real-time updates when courses are added/removed
- Interactive calendar (hover for details, click to manage)

**Technical Considerations**:

- Use SVG or Canvas for rendering
- Responsive design for different screen sizes
- Support for courses spanning multiple time slots
- Handle overlapping times (show conflicts clearly)

### 3. Bucket & Priority System

**Goal**: Organize courses into customizable buckets with priority levels

**Requirements**:

- Create multiple buckets (e.g., "Must Take", "Backups", "Electives")
- Assign courses to buckets
- Set priority levels within each bucket
- Visual indicators for bucket membership
- Quick filtering by bucket
- Drag-and-drop course management

**Bucket Management**:

- Default buckets: "Required", "High Priority", "Medium Priority", "Low Priority", "Backup"
- Custom bucket creation
- Bucket colors for visual distinction
- Priority ordering (1-10 scale or named levels)

### 4. Requirement Group Manager

**Goal**: Let students customize requirement categories (e.g., Core, Major Electives, Minor) and assign prospective courses to track progress toward graduation goals.

**Requirements**:

- Create, rename, and delete requirement groups
- Define completion targets per group (credits, course count, specific course lists)
- Attach multiple courses to one or more groups
- Visual indicators showing progress toward each requirement
- Support nested or linked groups (e.g., Major → Track)
- Export/import templates for common degree plans

**Implementation Approach**:

- Requirement builder UI within popup (drag-and-drop or checklist style)
- Store group definitions in `chrome.storage.local`
- Compute progress using current course selections plus completed/transfer credits (if provided)
- Provide quick filters on calendar and planner views based on requirement groups

### 5. Auto Planner

**Goal**: Intelligent scheduling assistance

**Requirements**:

- Detect schedule conflicts
- Suggest optimal course combinations
- Consider priorities and bucket assignments
- Recommend alternative sections if conflicts exist
- Show multiple schedule options
- Highlight trade-offs between options

**Planning Algorithm Considerations**:

- Conflict detection (time overlaps)
- Priority-based selection
- Credit hour optimization
- Waitlist consideration
- Preference matching (time of day, instructor, location)

---

## Architecture

### File Structure

```
albert-enhancer/
├── manifest.json
├── README.md
├── PROJECT_PLAN.md
├── assets/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── src/
│   ├── background.js          # Service worker for data management
│   ├── content.js             # Content script for Albert interaction
│   ├── content.css            # Styling for Albert page enhancements
│   ├── popup.html             # Extension popup interface
│   ├── popup.js               # Popup logic
│   ├── popup.css              # Popup styling
│   ├── weekly-view.html       # Weekly calendar view page
│   ├── weekly-view.js         # Weekly calendar logic
│   ├── weekly-view.css        # Weekly calendar styling
│   ├── course-parser.js       # Course data extraction logic
│   ├── course-storage.js      # Data persistence layer
│   ├── bucket-manager.js      # Bucket management logic
│   ├── planner.js             # Auto-planner algorithm
│   └── utils/
│       ├── time-parser.js     # Time parsing utilities
│       ├── calendar-utils.js  # Calendar calculation helpers
│       └── constants.js       # Constants and configuration
└── tests/
    └── (test files)
```

### Data Models

#### Course Object

```javascript
{
  id: string,              // Unique identifier
  courseCode: string,      // e.g., "CS-UY 1134"
  courseTitle: string,     // Full course name
  section: string,         // Section number
  credits: number,         // Credit hours
  instructor: string,      // Instructor name
  location: string,        // Building/room
  times: [                 // Array of meeting times
    {
      days: string[],      // ["Mon", "Wed", "Fri"]
      startTime: string,   // "10:00"
      endTime: string,     // "11:50"
      startDate: string,   // Semester start
      endDate: string      // Semester end
    }
  ],
  enrollment: {
    current: number,
    capacity: number,
    waitlist: number
  },
  bucket: string,          // Bucket assignment
  priority: number,        // Priority level (1-10)
  requirements: string[],  // Requirement group IDs
  addedAt: timestamp,      // When detected
  source: "shopping_cart"  // Data source
}
```

#### Bucket Object

```javascript
{
  id: string,
  name: string,           // "Must Take", "Backups", etc.
  color: string,          // Hex color code
  priority: number,       // Bucket priority level
  createdAt: timestamp
}
```

#### Requirement Group Object

```javascript
{
  id: string,
  name: string,             // "Core Math", "Major Electives", etc.
  color?: string,           // Optional color for UI
  target: {
    type: "credits" | "courses" | "specific",
    value: number,
    courseList?: string[]   // Required courses if type === "specific"
  },
  description?: string,
  parentGroupId?: string,   // Support nesting
  createdAt: timestamp
}
```

#### Schedule Object

```javascript
{
  courses: Course[],      // Courses in this schedule
  conflicts: Conflict[],  // Detected conflicts
  score: number,          // Optimization score
  metadata: {
    totalCredits: number,
    averagePriority: number,
    generatedAt: timestamp
  }
}
```

### Data Flow

1. **Course Detection**:

   ```
   Albert Page → Content Script (MutationObserver)
   → Course Parser → Background Script (Storage)
   → Update All Views
   ```

2. **User Interaction**:

   ```
   Popup/Weekly View → Background Script (Storage)
   → Update Data → Refresh Views
   ```

3. **Planning**:
   ```
   Courses in Storage → Planner Algorithm
   → Generate Schedules → Display in UI
   ```

---

## Implementation Phases

### Phase 1: Foundation (MVP)

- [x] Project setup and structure
- [ ] Basic content script injection
- [ ] Course detection on shopping cart page
- [ ] Simple course data extraction
- [ ] Storage implementation (Chrome storage API)
- [ ] Basic popup UI

### Phase 2: Course Management

- [ ] Complete course parser (all fields)
- [ ] Course list view in popup
- [ ] Add/remove courses manually
- [ ] Basic bucket creation and assignment
- [ ] Priority assignment UI
- [ ] Requirement group creation and management UI
- [ ] Requirement progress indicators in popup

### Phase 3: Weekly View

- [ ] Weekly calendar component
- [ ] Time slot rendering
- [ ] Course block placement
- [ ] Conflict detection and visualization
- [ ] Interactive calendar (zoom, scroll, details)

### Phase 4: Advanced Features

- [ ] Auto-planner algorithm
- [ ] Schedule optimization
- [ ] Multiple schedule generation
- [ ] Comparison view
- [ ] Export functionality
- [ ] Requirement-aware planning templates (ensure generated schedules satisfy selected requirement sets)

### Phase 5: Polish & Enhancement

- [ ] UI/UX improvements
- [ ] Performance optimization
- [ ] Error handling and edge cases
- [ ] Settings page
- [ ] User preferences
- [ ] Analytics and usage tracking (optional)

---

## Technical Details

### Content Script Strategy

**Albert Shopping Cart Page Detection**:

- Monitor URL patterns: `/psc/.../SA_LEARNER_SERVICES/...`
- Look for shopping cart table structure
- Use selectors like `[id*="shopping"]` or class patterns

**Course Extraction**:

- Identify table rows containing course data
- Parse structured HTML:
  ```html
  <tr>
  	<td>Course Code</td>
  	<td>Course Title</td>
  	<td>Section</td>
  	<td>Days/Time</td>
  	<td>Location</td>
  	...
  </tr>
  ```
- Use regex/parsing for time strings: "MoWeFr 10:00AM-11:50AM"
- Extract enrollment data from text/numeric fields

### Storage Strategy

**Chrome Storage API**:

- Use `chrome.storage.local` for course data
- Structure:
  ```javascript
  {
    courses: { [courseId]: Course },
    buckets: { [bucketId]: Bucket },
    requirements: { [requirementId]: RequirementGroup },
    settings: {
      defaultBucket: string,
      colorScheme: string,
      ...
    }
  }
  ```

**Data Sync**:

- Real-time updates across popup, content script, and weekly view
- Event-based communication using Chrome messaging API

### Weekly Calendar Implementation

**Time Grid**:

- Start time: 7:00 AM (configurable)
- End time: 11:00 PM (configurable)
- Interval: 30 minutes (configurable)
- Display: 7 columns (days) × N rows (time slots)

**Course Block Rendering**:

- Calculate position based on day and time
- Height proportional to duration
- Width spans full day column
- Color from bucket assignment
- Tooltip on hover with course details

**Conflict Visualization**:

- Overlapping blocks highlighted in red/orange
- Z-index management for overlaps
- Conflict indicator badges

### Planner Algorithm

**Conflict Detection**:

```javascript
function hasConflict(course1, course2) {
	for (const time1 of course1.times) {
		for (const time2 of course2.times) {
			if (hasDayOverlap(time1.days, time2.days)) {
				if (hasTimeOverlap(time1, time2)) {
					return true;
				}
			}
		}
	}
	return false;
}
```

**Schedule Generation**:

1. Start with highest priority courses
2. Add courses iteratively, checking for conflicts
3. When conflict detected:
   - Skip if lower priority
   - Try alternative section if available
   - Generate alternative schedule branch
4. Score schedules based on:
   - Total priority sum
   - Credit hour distribution
   - Time preference matching
   - Conflict count

---

## UI/UX Design

### Popup Interface

- **Tab 1: Courses**: List all detected courses with filters
- **Tab 2: Buckets**: Manage buckets and assignments
- **Tab 3: Requirements**: Create requirement groups, set targets, view progress
- **Tab 4: Calendar**: Quick weekly view preview
- **Tab 5: Planner**: Auto-planner interface

### Weekly View

- Full-page calendar (opened in new tab or sidebar)
- Time column on left
- Day headers at top
- Scrollable for long days
- Zoom controls for time scale
- Filter by bucket/priority

### Color Scheme

- Use distinct colors for buckets
- Conflict indicators: red/orange
- Available courses: green
- Waitlisted: yellow
- Past: gray

---

## Challenges & Considerations

### Technical Challenges

1. **Albert DOM Structure**:
   - May change over time, need robust selectors
   - Solution: Use flexible selectors and fallbacks
2. **Dynamic Content**:
   - Courses load asynchronously
   - Solution: MutationObserver with debouncing
3. **Time Parsing**:

   - Various time formats ("10AM", "10:00 AM", "10:00AM-11:50AM")
   - Solution: Comprehensive time parser with multiple format support

4. **Performance**:
   - Many courses = complex rendering
   - Solution: Virtual scrolling, lazy rendering, optimization

### Edge Cases

- Multiple sections of same course
- TBA (To Be Announced) times
- Variable credit courses
- Courses with irregular schedules
- Weekend classes
- Online/asynchronous courses

### Privacy & Security

- All data stored locally (no external servers)
- No user credentials stored
- Only reads public course information
- Compliant with browser extension privacy policies

---

## Future Enhancements

1. **Integration Features**:

   - Export to Google Calendar
   - Export to iCal format
   - Share schedules with friends
   - Rate My Professor integration

2. **Advanced Planning**:

   - Multi-semester planning
   - Graduation requirement tracking
   - Prerequisite checking
   - Degree progress visualization

3. **Notifications**:

   - Course availability alerts
   - Registration window reminders
   - Waitlist status updates

4. **Community Features**:
   - Course reviews and ratings
   - Professor reviews
   - Study group finder
   - Course popularity data

---

## Testing Strategy

1. **Unit Tests**:

   - Course parser with sample HTML
   - Time parsing functions
   - Conflict detection logic
   - Planner algorithm

2. **Integration Tests**:

   - Content script on Albert pages
   - Storage operations
   - Cross-component communication

3. **Manual Testing**:
   - Various course combinations
   - Edge cases (conflicts, TBA times)
   - Different browsers

---

## Timeline Estimate

- **Phase 1**: 1-2 weeks
- **Phase 2**: 2-3 weeks
- **Phase 3**: 2-3 weeks
- **Phase 4**: 2-3 weeks
- **Phase 5**: 1-2 weeks

**Total**: ~8-13 weeks for full implementation

---

## Resources & References

- [Chrome Extension Documentation](https://developer.chrome.com/docs/extensions/)
- [Albert SIS Documentation](https://www.nyu.edu/students/student-information-and-resources/registration-records-and-graduation/albert.html)
- [Chrome Storage API](https://developer.chrome.com/docs/extensions/reference/storage/)
- [Content Scripts Guide](https://developer.chrome.com/docs/extensions/mv3/content_scripts/)

---

## Questions & Notes

- Need to verify Albert's exact DOM structure
- Consider if web app version would be useful
- May need to handle NYU SSO authentication
- Consider browser compatibility (Chrome, Edge, Firefox)

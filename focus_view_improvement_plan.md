# Focus View Improvement Plan

## Goal
Improve the course detail focus view so it feels like a confident decision surface rather than a passive information panel. The redesign should make bucket selection clearer, explain the feature in plain language, strengthen feedback, and help users understand what their choice changes.

---

## Scope Overview

### In Scope
- Focus view header and close control
- Course summary card improvements
- Bucket explainer copy
- Bucket option list redesign
- Selected and hover states
- Save and system feedback
- Optional planning context in the detail card

### Out of Scope
- Full planner page redesign
- Registration workflows
- Major visual rebrand
- Multi-step onboarding flows

---

## Workstream 1: Strengthen the Focus View’s Purpose

### Problem
The current screen is visually polished but feels too passive. It presents information clearly, but the main decision action is understated.

### Solution
Redesign the focus view so the primary task is unmistakable: assign this course to a planning bucket.

### Tasks
- Make the bucket list the dominant interaction zone.
- Reduce any visual ambiguity about whether rows are selectable.
- Ensure the screen clearly communicates what action the user is expected to take.
- Add optional helper text near the bucket section title.

### Acceptance Criteria
- Users immediately understand that the main purpose of the screen is to assign a bucket.
- The selection interaction feels obvious without requiring explanation.

---

## Workstream 2: Rewrite Bucket Copy in Plain Language

### Problem
The current bucket explainer text sounds abstract and internal. It does not clearly tell students what buckets are for.

### Solution
Replace system-oriented language with user-centered language that explains buckets in plain terms.

### Recommended Section Copy
**Bucket**  
Assign this course to a planning group based on how important it is to your schedule.

### Recommended Item Descriptions
- Unsorted — Keep this course ungrouped for now
- Required — Must be included in your schedule
- High Priority — Strong preference
- Medium Priority — Nice to have
- Low Priority — Optional
- Backup — Use if other options do not work

### Tasks
- Replace current bucket description.
- Replace repeated generic subtext for each option.
- Review copy for tone consistency across planner surfaces.

### Acceptance Criteria
- First-time users understand what buckets are for without guessing.
- Each bucket option communicates a distinct meaning.

---

## Workstream 3: Redesign Bucket Rows as Clear Selection Controls

### Problem
The rows look elegant, but the action model is too soft. “Choose” and “Selected” do not create a strong enough sense of direct control.

### Solution
Turn the bucket list into a more explicit single-select control using full-row click behavior and stronger interaction states.

### Recommended Interaction Pattern
- Entire row is clickable.
- Use radio-button behavior or an equivalent single-select pattern.
- Right-side status text becomes secondary to the selected state.
- Hover, active, and keyboard focus states should be obvious.

### Tasks
- Make each bucket row clickable across the full width.
- Add stronger hover and pressed states.
- Add keyboard support for selection.
- Replace weak action-only emphasis on the right side.
- Evaluate whether a radio indicator, check icon, or filled state improves clarity.

### Acceptance Criteria
- Users can identify bucket rows as controls at a glance.
- Selection can be completed quickly by mouse, touch, or keyboard.
- The control behaves consistently as a single-choice input.

---

## Workstream 4: Strengthen the Selected State

### Problem
The current selected row is visible but not emphatic enough. Users should feel instant confidence about what is selected.

### Solution
Increase visual distinction between selected and unselected rows.

### Recommended Enhancements
- Stronger selected background tint
- Clearer border contrast
- Checkmark or selected radio indicator
- More explicit typography treatment for the chosen option

### Tasks
- Update selected row styling.
- Introduce a dedicated selected icon or state marker.
- Reduce ambiguity between colored dots and selection state.
- Ensure selected state remains accessible in high contrast and keyboard focus states.

### Acceptance Criteria
- The selected bucket is unmistakable.
- Users can confirm the current state in under a second.

---

## Workstream 5: Improve the Course Summary Card

### Problem
The course summary card is clean and readable, but it is mostly static. This focus view would be more helpful if it included a little more planning context.

### Solution
Keep the summary card simple, but add compact context that supports the bucket decision.

### Recommended Additions
- Modality
- Scheduled or unscheduled state
- Conflict status
- Whether another required section is still missing

### Example Status Lines
- Scheduled on Mon/Wed
- No conflicts
- In-person lecture
- Recitation still needed

### Tasks
- Add an optional course status region in the summary card.
- Define which signals are most useful and safe to show.
- Prevent secondary details from overwhelming the primary course information.

### Acceptance Criteria
- The card still feels clean.
- Users gain enough context to make a smarter planning choice.

---

## Workstream 6: Improve System Feedback and Save Clarity

### Problem
The screen does not clearly communicate what happens after a bucket is chosen or whether the change is saved automatically.

### Solution
Add lightweight, persistent feedback so the user knows the result of their action.

### Recommended Feedback Patterns
- Saved automatically
- Moved to High Priority
- This course will appear in Required

### Tasks
- Add inline save-state text or lightweight confirmation messaging.
- Confirm whether updates are instant or deferred.
- Reflect bucket changes immediately in the planner where possible.
- Add non-intrusive feedback for successful selection.

### Acceptance Criteria
- Users understand whether their change has been applied.
- The interface creates confidence without needing a modal confirmation.

---

## Workstream 7: Refine Header and Close Control

### Problem
The close button is easy to spot, but it feels slightly detached and visually heavier than it needs to be.

### Solution
Refine the header so the close control feels integrated with the frame while preserving discoverability.

### Tasks
- Slightly reduce the visual weight of the close button.
- Align it more tightly with the title block.
- Add strong hover and focus states.
- Ensure the header feels balanced on wide screens.

### Acceptance Criteria
- The close action is easy to find.
- The header feels visually cohesive and intentional.

---

## Workstream 8: Tighten Vertical Rhythm Without Losing Comfort

### Problem
The screen looks premium, but the bucket list is taller than necessary for a simple single-choice decision.

### Solution
Preserve spaciousness while improving scan speed.

### Tasks
- Reduce vertical padding slightly within bucket rows.
- Tighten spacing between title and description in each row.
- Review scroll length on smaller screens.
- Maintain touch-friendly hit targets while improving density.

### Acceptance Criteria
- More bucket options fit comfortably in view.
- The screen still feels calm and usable.

---

## Workstream 9: Improve Priority Signaling Beyond Color Alone

### Problem
The colored dots imply meaning, but their role is not fully clear. Color alone should not carry the interpretation.

### Solution
Use labels as the primary source of meaning and keep color as a secondary signal.

### Tasks
- Review whether the colored dot is still necessary in its current form.
- Add stronger semantic labeling in copy and state design.
- Ensure users can understand priority options without relying on color perception.
- Validate color choices against accessibility requirements.

### Acceptance Criteria
- Priority meaning is understandable without depending on color.
- Visual signals remain useful but not required for comprehension.

---

## Suggested Component Updates

### New or Updated Components
- `CourseDetailFocusView`
- `CourseSummaryCard`
- `BucketSelector`
- `BucketOptionRow`
- `SelectionIndicator`
- `InlineSaveFeedback`
- `CourseStatusMeta`

### State Considerations
- current selected bucket
- saving state
- saved confirmation state
- hover and focus state per row
- optional status metadata for the selected course

---

## Suggested Implementation Order

### Phase 1: Clarity and Copy
- Rewrite bucket explainer copy
- Replace generic row descriptions
- Make bucket rows fully clickable
- Strengthen selected state styling

### Phase 2: Feedback and Context
- Add save confirmation behavior
- Add optional course planning context
- Improve header balance and close control states

### Phase 3: Polish and Accessibility
- Tighten row spacing
- Improve keyboard interaction
- Validate contrast and non-color signaling
- Test scan speed and comprehension

---

## QA Checklist

### UX QA
- Do users understand what buckets do?
- Can they tell which bucket is selected instantly?
- Do they understand what happens after making a selection?
- Does the screen feel like an action surface, not just a details panel?

### Accessibility QA
- Keyboard users can move through and select bucket options.
- Selected, hover, and focus states are clearly differentiated.
- Text contrast passes on all major surfaces.
- Meaning is preserved without relying only on color.

### Functional QA
- Selecting a bucket updates state immediately.
- Save feedback appears reliably.
- The selected bucket is reflected correctly in the planner.
- Optional course status data renders only when available.

---

## Risks and Watchouts

- Overdesigning selection states could make the screen feel noisy.
- Adding too much status data to the course card could weaken focus.
- Overexplaining buckets may add unnecessary reading burden.
- Save feedback should be visible but not distracting.

---

## Success Metrics

- Faster bucket assignment completion
- Reduced confusion about what buckets mean
- Higher confidence in selected state recognition
- Fewer abandoned detail views without action
- Improved accessibility and keyboard task completion

---

## Final Recommendation
Start with the highest-value fixes: rewrite the bucket copy, make the rows behave like clear selection controls, and strengthen selected-state feedback. Once the screen feels more decisive and self-explanatory, layer in save clarity and light planning context.
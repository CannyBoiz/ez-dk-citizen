# 05: Author localized Lesson Texts

**What to build:** In the Lesson editor, the admin sees Language tabs for Danish, English, and Thai, with Thai selected initially. Each tab has a plain-text title input and content textarea for pasting text prepared outside the Admin, saved explicitly and separately per Language. Each Language shows whether its Lesson Text is saved, unsaved, or missing. Blank title or content is rejected before and after submission, edits survive a failed save, and the fields are read-only unless the Lesson is `DRAFT`. Dirty Lesson Text participates in the unsaved-changes rules from ticket 04.

See the spec section "Editing and dirty state" and user stories 18–23 and 26.

**Blocked by:** 04 — Create Draft Lessons and edit their structure

**Status:** resolved

- [x] The editor shows `da`, `en`, and `th` tabs, with Thai selected when a Lesson opens
- [x] Title is a plain-text input and content is a plain-text textarea; no rich-text or Markdown editing
- [x] Saving one Language sends only that Language's Lesson Text
- [x] Each Language indicates saved, unsaved, or missing
- [x] Blank or whitespace-only title or content is rejected in the form, and a backend validation error is attached to its field
- [x] A failed save keeps the pasted text
- [x] Switching tabs keeps unsaved text in other tabs, and dirty text triggers the navigation warnings
- [x] Lesson Text fields are read-only for Published and Archived Lessons
- [x] Whole-app tests cover the default tab, per-Language save, state indicators, validation, failure retention, and read-only states

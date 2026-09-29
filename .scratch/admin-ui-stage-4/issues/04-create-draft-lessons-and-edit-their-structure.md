# 04: Create Draft Lessons and edit their structure

**What to build:** The admin creates a `DRAFT` Lesson from the catalogue by entering chapter and version, lands in its editor, and can edit and explicitly save chapter and version while it is `DRAFT`. The structure form shows saved/unsaved state, keeps edits when a save fails, and shows a clear message on a chapter/version conflict. On Published and Archived Lessons the structure is read-only.

This ticket introduces the unsaved-changes rules that every later form reuses: the browser's before-unload warning when any form is dirty, confirmation before in-app navigation away from dirty edits, no autosave, and no overall Save. A `401` during a save opens the token prompt and keeps the unsaved edits so the save can be retried.

See the spec section "Editing and dirty state" and user stories 14–17 and 64–66.

**Blocked by:** 03 — Browse and filter the Lesson catalogue

**Status:** ready-for-agent

- [ ] Creating a Draft with chapter and version opens its editor and the Lesson appears in the catalogue
- [ ] Editing chapter or version marks the structure form unsaved; saving marks it saved
- [ ] A chapter/version conflict shows a clear message and keeps the edits
- [ ] A failed save keeps the edits and shows the error with request ID
- [ ] Closing or reloading the tab with a dirty form triggers the before-unload warning
- [ ] Navigating back to the catalogue with a dirty form asks for confirmation
- [ ] A `401` during save prompts for the token, keeps the edits, and allows retrying the save
- [ ] Structure fields are read-only for Published and Archived Lessons
- [ ] Whole-app tests cover creation, saving, conflict, failure retention, both navigation warnings, `401` retention, and read-only states

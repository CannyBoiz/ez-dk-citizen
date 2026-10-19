# 07: Create Drafts through a form

**What to build:** **Create draft** in the catalogue stops writing a Lesson immediately. It opens a form that asks for the chapter and shows where that chapter stands: its highest Published or Archived version and that Lesson's status, computed in the browser from the existing unpaginated Lesson list. If the chapter has none yet, the form says so.

Confirm shows the in-page confirmation from ticket 01. Only after that is the Draft created, and its editor opens. Cancel closes the form at once when nothing is filled in, and asks before discarding otherwise. No request reaches the backend before the final confirmation. Backend errors are shown in the form, with the input kept.

Ticket 08 reuses this form for Create new version.

See the spec section "Admin" (Create form) and user stories 6–9.

**Blocked by:** 02 — Give versions at publication

**Status:** resolved

- [x] Clicking Create draft opens the form and sends no request
- [x] The form shows the typed chapter's highest Published or Archived version and its status, or says the chapter has none
- [x] Confirm requires the in-page confirmation; confirming creates the Draft and opens its editor
- [x] Cancelling the confirmation makes no request and keeps the form
- [x] Cancel on an empty form closes it at once; on a filled form it asks before discarding
- [x] A backend error is shown in the form with the chapter kept
- [x] Whole-app tests cover the above

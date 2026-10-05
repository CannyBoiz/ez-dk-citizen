# 07: Publish and archive from the Admin

**What to build:** The Lesson editor shows a publication checklist that mirrors the backend rule from ticket 01: a saved Thai Lesson Text and at least one saved Lesson Source are required, and Thai audio and Danish/English Lesson Text are listed as optional. Publish is disabled while any form on the Lesson is unsaved. When the backend refuses (incomplete publication, or another Published version of the chapter), its message is shown and the backend remains the authority.

The admin can archive a Draft or Published Lesson after a confirmation explaining that archiving is terminal, makes the Lesson read-only, and removes a Published Lesson from the learner catalogue. Archived Lessons stay readable with their Lesson Texts and Lesson Sources, with every mutation disabled. Replacing a published version stays two explicit actions (archive the current version, then publish the new Draft), with no combined Replace action.

See the spec section "Publication UI" and user stories 67–77.

**Blocked by:** 01 — Refuse incomplete publication and report actual current audio; 05 — Author localized Lesson Texts; 06 — Find, create, and cite Sources

**Status:** resolved

- [x] The checklist shows Thai Lesson Text and Lesson Source as required and reflects their saved state; Thai audio and Danish/English Lesson Text are shown as optional
- [x] Publish is disabled while any structure, Lesson Text, or Lesson Source form is unsaved
- [x] Publishing a complete Draft moves it to `PUBLISHED` and the catalogue reflects it
- [x] A backend `409 lesson_publication_incomplete` or `published_lesson_conflict` is displayed with its message
- [x] Archive is offered for Draft and Published Lessons only, behind a confirmation describing the terminal, read-only, catalogue-removing effect
- [x] Cancelling the confirmation makes no request
- [x] An Archived Lesson shows its Lesson Texts and Lesson Sources with every mutation control disabled
- [x] There is no action that archives and publishes in one step
- [x] Whole-app tests cover the checklist, disabled Publish while dirty, successful publication, both displayed conflicts, archive confirmation and cancellation, and the read-only Archived state

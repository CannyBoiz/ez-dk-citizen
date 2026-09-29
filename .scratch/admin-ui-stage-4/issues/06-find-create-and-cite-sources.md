# 06: Find, create, and cite Sources

**What to build:** The admin finds canonical Sources by URL text (client-side filtering over the existing unpaginated list) and creates new ones with a URL and an optional publication date from a native date input. Blank means unknown; a chosen date is sent as midnight UTC and shown back as its UTC calendar date. When the URL already exists, the Admin says so and points to finding and attaching the existing Source. On a `DRAFT` Lesson, the admin attaches Sources, edits each Lesson Source's page-from, page-to, and section reference with its own explicit save, and detaches Sources. Correcting a wrong URL means attaching the right Source and detaching the wrong one; canonical Sources are never edited or deleted. Lesson Source controls are disabled outside `DRAFT`.

See the spec section "Sources" and user stories 27–36.

**Blocked by:** 04 — Create Draft Lessons and edit their structure

**Status:** ready-for-agent

- [ ] Sources can be filtered by URL text
- [ ] Creating a Source with a blank date sends `publishedAt: null`; a chosen date is sent as that date at midnight UTC and displayed back as the same calendar date
- [ ] A duplicate URL shows a `source_url_conflict` message that directs the admin to the existing Source
- [ ] A Source can be attached to a Draft and appears among its Lesson Sources
- [ ] Page-from, page-to, and section reference save separately per Lesson Source, with saved/unsaved state and the navigation warnings
- [ ] Non-positive pages and page-to below page-from are rejected before submission, and backend validation errors attach to their fields
- [ ] A Source can be detached from a Draft
- [ ] No canonical Source edit or delete control exists
- [ ] Attach, detach, and reference editing are disabled for Published and Archived Lessons
- [ ] Whole-app tests cover search, both date cases, URL conflict, attach, reference editing and validation, detach, and read-only states

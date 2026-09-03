# 03 — Localized Lesson Text upsert

**What to build:** Let an authenticated content administrator add or replace
one localized Lesson Text on a Draft Lesson through an idempotent public
operation. The update is persisted by the Data Service, advances the Lesson
aggregate timestamp, and returns the refreshed detail representation.

**Blocked by:** 02 — Authenticated Draft Lesson creation and reads.

**Status:** ready-for-agent

- [ ] `PUT /api/admin/lessons/:lessonId/texts/:languageCode` accepts a strict `{ title, content }` request with non-blank values.
- [ ] The BFF calls one authenticated internal Lesson Text upsert operation and never imports or invokes the database layer.
- [ ] Repeating the same request replaces the composite Lesson-and-Language record without creating a duplicate.
- [ ] Only Languages present in the supported Language lookup may be used; unsupported Language codes return `422` with a stable error code.
- [ ] Invalid Lesson IDs, blank title or content, malformed JSON, and unknown request fields produce the agreed validation behavior.
- [ ] A missing Lesson returns a resource-specific `404` Problem Detail.
- [ ] The Data Service applies the Lesson Text upsert and parent Lesson `updatedAt` advance in one transaction.
- [ ] Successful upsert returns `200` and the updated admin Lesson detail, including all Lesson Texts and recalculated available Language codes.
- [ ] JSON fields, timestamps, status values, IDs, and nullable values follow the shared transport conventions rather than database serialization details.
- [ ] Contract tests cover accepted and rejected payloads, Data Service HTTP tests cover create and replacement against PostgreSQL, and BFF tests cover routing and response composition through the client seam.
- [ ] Existing Lesson creation/list/detail behavior remains green.


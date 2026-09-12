# 06 — Lesson publication and immutable history

**What to build:** Let an authenticated content administrator correct and
publish or archive a Draft Lesson through one atomic operation, while preserving
one Published version per chapter and immutable Published and Archived history
across Lesson structure, Lesson Texts, and Lesson Source associations.

**Blocked by:** 03 — Localized Lesson Text upsert; 05 — Draft Lesson Source associations.

**Status:** ready-for-agent

- [x] `PATCH /api/admin/lessons/:lessonId` accepts a strict non-empty subset of chapter, version, and status.
- [x] Draft chapter and version changes are allowed and advance the aggregate timestamp; duplicate chapter/version identity returns a stable `409` conflict.
- [x] Allowed transitions are exactly `DRAFT -> PUBLISHED`, `DRAFT -> ARCHIVED`, and `PUBLISHED -> ARCHIVED`.
- [x] `ARCHIVED` is terminal, and illegal or repeated transitions return a stable lifecycle `409` rather than silently succeeding.
- [x] A patch may combine final Draft chapter/version changes with publication, and the Data Service commits all changes or none in one transaction.
- [x] Publishing a version when the chapter already has another Published version returns `409` with stable code `published_lesson_conflict`; no existing version is archived automatically.
- [x] Lesson structure becomes immutable after leaving Draft.
- [x] Lesson Text upsert and Lesson Source attach, replace, and detach reject Published and Archived Lessons with `409` and stable code `lesson_not_editable`.
- [x] Successful patch returns `200` with the complete updated admin Lesson detail.
- [x] Failed combined patches leave chapter, version, status, and `updatedAt` unchanged.
- [x] No ETag, conditional-write mechanism, or HTTP concurrency interpretation of the Lesson domain version is introduced.
- [x] Data Service HTTP tests exercise every allowed and rejected transition, competing publication, aggregate immutability, and atomic rollback against PostgreSQL.
- [x] BFF tests exercise strict patch validation and preserve the recognized Data Service `404`, `409`, and `422` outcomes.
- [x] Existing Lesson Text and Lesson Source behavior remains valid for Draft Lessons.

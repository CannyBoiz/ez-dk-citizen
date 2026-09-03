# 05 — Draft Lesson Source associations

**What to build:** Let an authenticated content administrator attach a
canonical Source to a Draft Lesson, replace that citation's locators
idempotently, and detach it safely. The Data Service preserves the reusable
Lesson-to-Source relationship and returns updated Lesson details without
duplicating the Source.

**Blocked by:** 04 — Canonical Source catalog.

**Status:** ready-for-agent

- [ ] `PUT /api/admin/lessons/:lessonId/sources/:sourceId` creates or completely replaces one Lesson Source association.
- [ ] The association request supports nullable or omitted `pageFrom`, `pageTo`, and `sectionReference`; omitted locator values are persisted as absent rather than retaining stale values.
- [ ] Page values must be positive when present, and `pageTo` cannot precede `pageFrom` when both exist.
- [ ] Attachment requires an existing Lesson and Source and produces resource-specific `404` errors when either is missing.
- [ ] Attachment and replacement are allowed only while the Lesson is `DRAFT`; the Data Service owns this check.
- [ ] The association mutation and parent Lesson `updatedAt` advance occur in one Data Service transaction.
- [ ] Successful attachment or replacement returns `200` with the updated admin Lesson detail, including canonical Source fields and relationship-specific locators.
- [ ] `DELETE /api/admin/lessons/:lessonId/sources/:sourceId` detaches the association only and never deletes the canonical Source.
- [ ] Detachment is idempotent and returns `204` even when the association is already absent; an actual detach advances the Lesson aggregate timestamp transactionally.
- [ ] One Source can be attached to multiple Lessons and one Lesson can contain multiple Sources without duplicated canonical Source rows.
- [ ] Public behavior is implemented through corresponding authenticated internal resource operations, not direct BFF persistence access.
- [ ] Data Service HTTP tests cover locator validation, replacement, reuse, timestamp behavior, and detachment against PostgreSQL; BFF tests cover public validation and mappings.
- [ ] Existing Lesson and Source behavior remains green.


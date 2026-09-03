# 07 — Localized mobile Lesson reads

**What to build:** Let a mobile learner list and read current Published Lessons
in Thai by default or another requested supported Language. Responses contain
only usable localized study content and its Source citations, with no Draft,
Archived, admin-only, or speculative audio data.

**Blocked by:** 06 — Lesson publication and immutable history.

**Status:** ready-for-agent

- [ ] `GET /api/mobile/lessons` and `GET /api/mobile/lessons/:lessonId` are public and do not require the admin bearer token.
- [ ] Both routes accept an optional `language` query parameter defaulting to `th`; unsupported or malformed Language values receive the agreed validation response.
- [ ] Mobile reads expose only `PUBLISHED` Lessons and never expose Draft or Archived versions.
- [ ] Mobile list omits Published Lessons without a Lesson Text in the requested Language and performs no Language fallback.
- [ ] Mobile list returns `{ items: [...] }` ordered by chapter ascending, with each item containing only Lesson identity, chapter, version, selected Language code, and localized title.
- [ ] Mobile detail returns the list fields plus localized content, available Language codes, and canonical Sources with Lesson Source locator fields.
- [ ] A Published Lesson lacking the requested Lesson Text returns `404` with stable code `lesson_text_not_found`.
- [ ] Missing and non-Published Lesson identities do not reveal unpublished content through their response representation.
- [ ] The BFF obtains Published and localized data through internal resource queries with status and Language filters, without client-specific internal routes or direct database access.
- [ ] Mobile responses contain no administrative status/timestamp fields beyond the agreed useful identity/version data and no Media Asset, Lesson Audio, upload, or playback placeholders.
- [ ] Data Service HTTP tests cover Published filtering and localization projections against PostgreSQL; BFF tests cover Thai defaults, explicit Language, ordering, omission, no fallback, detail composition, and errors.
- [ ] Existing authenticated admin representations continue to expose all statuses and localizations.


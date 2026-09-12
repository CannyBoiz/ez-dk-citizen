# 02 — Authenticated Draft Lesson creation and reads

**What to build:** Let an authenticated content administrator create, list, and
inspect Draft Lessons through the public BFF, with real internal Data Service
HTTP operations and PostgreSQL persistence. This slice establishes the admin
and service authentication boundaries, strict public/internal validation, and
the base Lesson aggregate representations used by later slices.

**Blocked by:** 01 — Bootable container-first service spine.

**Status:** ready-for-agent

- [x] Protect every `/api/admin/*` route with `ADMIN_API_TOKEN` and every `/internal/*` resource route with the distinct `DATA_SERVICE_TOKEN`; never forward the admin credential internally.
- [x] Application startup fails clearly when a required token is absent, and missing or invalid request credentials return safe `401` Problem Details.
- [x] `POST /api/admin/lessons` accepts only positive chapter and version values, always creates a `DRAFT`, and rejects caller-supplied identity, timestamps, status, or unknown fields.
- [x] Lesson creation traverses BFF validation, the authenticated Data Service client, an authenticated internal route, and a Data Service transaction without direct BFF database access.
- [x] Successful Lesson creation returns `201`, a `Location` header, and the created admin Lesson detail.
- [x] `GET /api/admin/lessons` returns `{ items: [...] }` ordered by chapter ascending and version descending.
- [x] `GET /api/admin/lessons/:lessonId` returns the complete current aggregate shape, including empty Lesson Text, available-Language, and Lesson Source collections where appropriate.
- [x] Admin Lesson summaries contain identity, chapter, version, status, creation/update timestamps, and available Language codes; detail transport types remain distinct from database rows.
- [x] The Data Service exposes resource-oriented internal create, list, and detail operations sufficient for the public behavior without admin- or mobile-named internal routes.
- [x] Duplicate chapter/version creation returns `409` with a stable `lesson_version_conflict` code; missing Lesson detail returns a resource-specific `404`.
- [x] Malformed JSON, non-JSON writes, unknown properties, invalid IDs, empty input, and bodies over 1 MiB are rejected through shared strict schemas with safe Problem Details.
- [x] Browser CORS accepts only exact configured admin origins and required methods/headers, with no wildcard origin or credentialed-cookie mode.
- [x] Data Service HTTP tests exercise the routes against migrated PostgreSQL, while BFF route tests use the injected Data Service client seam.
- [x] Tests prove unauthenticated callers cannot create or inspect admin Lesson data and that neither service leaks credentials or database diagnostics.

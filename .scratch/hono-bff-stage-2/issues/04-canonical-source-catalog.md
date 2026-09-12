# 04 — Canonical Source catalog

**What to build:** Let an authenticated content administrator create and list
canonical Sources through the BFF. URLs are usable, normalized only as agreed,
and stored once; optional publication timestamps are represented consistently
without coupling the client to persistence details.

**Blocked by:** 02 — Authenticated Draft Lesson creation and reads.

**Status:** ready-for-agent

- [x] `POST /api/admin/sources` accepts only a Source URL and nullable publication timestamp through a strict shared schema.
- [x] Source URLs are trimmed, must be absolute HTTP or HTTPS URLs, and otherwise retain their exact textual identity.
- [x] The existing exact URL uniqueness invariant remains authoritative in PostgreSQL and is surfaced as `409` with stable code `source_url_conflict`.
- [x] Semantically equivalent but textually different URLs are not silently rewritten, merged, or deduplicated.
- [x] Publication timestamps accept ISO-8601 values with an explicit offset, normalize to UTC in responses, and may be null.
- [x] Successful Source creation traverses the authenticated BFF and internal Data Service boundaries and returns `201`, `Location`, and the created Source representation.
- [x] `GET /api/admin/sources` returns `{ items: [...] }` ordered by Source identity ascending.
- [x] Invalid schemes, relative URLs, invalid timestamps, unknown properties, malformed JSON, and non-JSON bodies produce safe validation Problem Details.
- [x] The Source API does not expose edit or delete operations.
- [x] Contract tests cover URL and timestamp boundaries, Data Service HTTP tests cover persistence and duplicate conflicts against PostgreSQL, and BFF tests cover authentication, validation, and transport mapping.
- [x] Existing Lesson API behavior remains green.

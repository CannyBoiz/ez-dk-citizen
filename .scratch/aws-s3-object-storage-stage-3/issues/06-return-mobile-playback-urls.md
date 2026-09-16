# 06 — Return mobile Playback URLs

**What to build:** Let a mobile learner fetch localized Published Lesson detail
and receive either an explicit text-only state or the current Lesson Audio with
fresh temporary read authorization. Playback goes directly to S3 and the public
response reveals no storage locator or durable credential.

**Blocked by:** 05 — Promote corrected audio idempotently.

**Status:** resolved

- [x] Extend the internal Published Lesson detail behavior to return the current `READY` Lesson Audio and its storage locator only for the requested Language.
- [x] Keep internal storage fields behind the BFF projection and do not add them to public admin or mobile contracts.
- [x] Add a required nullable `audio` field to `GET /api/mobile/lessons/:lessonId` while preserving existing Published-only, localization, Source, and not-found behavior.
- [x] Return `audio: null` when no current `READY` Lesson Audio exists for the requested Language.
- [x] For current audio, return only `mediaAssetId`, `audioVersion`, `contentType`, numeric `sizeBytes`, nullable `durationMs`, `playbackUrl`, and `playbackExpiresAt`.
- [x] Exclude storage provider, bucket, object key, original filename, current flag, permanent credentials, and internal identifiers not named by the public contract.
- [x] Generate a fresh read-only Playback URL scoped to the current Media Asset for one hour during each Lesson-detail request.
- [x] Generate playback authorization without another S3 metadata request and never persist the resulting URL.
- [x] Set `Cache-Control: no-store` on mobile Lesson-detail responses containing the nullable audio contract.
- [x] Leave mobile Lesson lists unchanged and do not generate Playback URLs while listing Lessons.
- [x] Translate playback-signing failures into correlated safe service errors without leaking the attempted URL or storage locator.
- [x] Test the null state, requested-Language selection, corrected current-version selection, one authorization per detail read, one-hour expiry, no extra metadata request, no-store response, field allow-list, unchanged list response, and signing failure with fake storage.
- [x] Extend the highest-seam credential-free tracer through the public BFF application, real Data Service HTTP client and application, and migrated PostgreSQL, replacing only storage with a fake.
- [x] Have the tracer create localized Lesson content, complete two distinct Media Assets, retry completion, publish and read the Lesson, and verify current version 2, preserved version 1, no version 3, fresh Playback URL, and no leaked storage fields.

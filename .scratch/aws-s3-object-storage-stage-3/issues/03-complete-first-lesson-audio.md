# 03 — Complete the first Lesson Audio

**What to build:** Let an authenticated content administrator complete a valid
uploaded Media Asset for a Lesson and Language. The BFF verifies the stored S3
metadata, then one Data Service transaction turns the asset `READY`, creates
audio version 1 as current, and advances the Lesson aggregate timestamp.

**Blocked by:** 02 — Issue safe MP3 Upload Intents.

**Status:** resolved

- [x] Add strict shared contracts for the completion path parameter, target request, internal Media Asset lookup, validated completion command, and public completion representation.
- [x] Protect `POST /api/admin/media/:mediaAssetId/complete` with the existing admin bearer credential and accept only `lessonId` and `languageCode` in its body.
- [x] Load the persisted Media Asset through a narrow authenticated Data Service read so completion uses its authoritative bucket, key, content type, size, and lifecycle state.
- [x] Inspect S3 object metadata without downloading, parsing, sniffing, or calculating the duration of MP3 bytes.
- [x] Proceed only when the stored content length and content type exactly match the pending Media Asset declaration.
- [x] Authoritatively reject a missing Media Asset or Lesson with `404`, an unsupported Language with `422`, and a missing matching Lesson Text or Archived Lesson with `409`.
- [x] Allow completion for both Draft and Published Lessons without reopening a Published Lesson or permitting changes to its structure, Lesson Texts, or Lesson Sources.
- [x] Keep target-validation failures from changing the `PENDING` Media Asset so an administrator can correct the target and retry.
- [x] In one PostgreSQL transaction, lock the pending Media Asset and target Lesson, recheck their states, set the asset to `READY`, set its upload timestamp, create audio version 1 as current, and advance the Lesson update timestamp.
- [x] Preserve the existing composite Lesson Text requirement and current-audio uniqueness constraints as authoritative database safeguards.
- [x] Leave Media Asset, Lesson Audio, and Lesson timestamp state unchanged if any part of the transaction fails.
- [x] Return `200 OK` with public-safe `READY` Media Asset fields and current Lesson Audio identity, Lesson, Language, version, current flag, and creation timestamp.
- [x] Keep provider, bucket, object key, permanent credentials, and presigned URL out of the completion response and persistence.
- [x] Translate downstream and storage failures through safe Problem Details with request correlation and no internal diagnostics.
- [x] Exercise the complete successful route through the public BFF seam, Data Service HTTP boundary, and real PostgreSQL, with S3 metadata supplied by fake storage.

# 02 — Issue safe MP3 Upload Intents

**What to build:** Let an authenticated content administrator request one
short-lived Upload Intent and receive everything a browser needs to upload a
declared MP3 directly to S3. The request creates a stable `PENDING` Media Asset
through the Data Service before authorization is returned, while ordinary
tests remain deterministic through the injected storage boundary.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] Add strict shared request, path, internal-command, and response contracts for Upload Intent creation and pending Media Asset persistence.
- [x] Accept only safe positive Lesson IDs, supported non-blank Language codes, filenames ending in `.mp3`, exact `audio/mpeg`, and integer sizes from 1 byte through 50 MiB; reject unknown fields.
- [x] Keep the Lesson and Language unbound in persistence during Upload Intent creation; completion remains the authoritative binding step.
- [x] Protect `POST /api/admin/media/upload-intents` with the existing admin bearer credential and request lifecycle behavior.
- [x] Generate opaque `audio/{random UUID}.mp3` keys with the standard library, without embedding Lesson identity, Language code, or original filename.
- [x] Create the Media Asset through an authenticated internal Data Service command before signing, storing provider `s3`, configured bucket, generated key, original filename, exact content type and size, `PENDING` status, null duration, and null upload timestamp.
- [x] Validate the requested Language against the configured Language catalog without persisting an Upload Intent entity or target association.
- [x] Convert transport numbers safely to the database bigint representation and return JSON-safe numbers to callers.
- [x] Add one narrow injected BFF storage boundary with production AWS SDK and fake test implementations; it must support the later inspect, playback, and exact-delete operations without adding a multi-provider framework.
- [x] Generate a 15-minute write authorization scoped to one key and bound to exact content type, declared content length, and `If-None-Match: *`.
- [x] Return `201 Created` with only `mediaAssetId`, `uploadUrl`, required upload headers, and `expiresAt`; do not expose the bucket or object key as separate public fields.
- [x] If Data Service persistence fails, do not issue upload authorization. If signing fails after persistence, return a retryable storage error and leave the Media Asset `PENDING`.
- [x] Require `AWS_REGION`, `S3_BUCKET`, `AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY` at BFF startup, pass them through container runtime configuration, and document only non-secret placeholders.
- [x] Keep BFF readiness free of S3 network calls and keep default automated tests credential-free with explicitly injected fake storage.
- [x] Cover authentication, boundary values, unsupported Language, strict-field rejection, opaque key shape, persisted pending state, signed requirements, expiry, request IDs, safe Problem Details, and the sign-after-persist ordering through observable seams.

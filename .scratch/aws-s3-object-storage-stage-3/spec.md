# Stage 3 Direct S3 Lesson Audio

Status: ready-for-agent

## Problem Statement

The application can create, localize, cite, publish, and read Lessons through
the BFF and Data Service, and PostgreSQL already models Media Assets and Lesson
Audio. It cannot yet complete the audio-first PoC path. An administrator cannot
obtain safe upload authorization for a manually generated MP3, the browser
cannot upload that file directly to private object storage, and the system
cannot validate and associate the stored object with a Lesson and Language.

The mobile Lesson detail also has no current Lesson Audio metadata or Playback
URL, so the Thai-speaking learner cannot stream the audio that is central to
the product. Implementing ordinary media transfer through the BFF would consume
the Hetzner VPS bandwidth, while exposing the bucket or durable AWS credentials
would break the intended security boundary.

The existing AWS infrastructure is only a starting point. It has an S3 bucket
and an IAM user, but does not yet encode the required public-access block,
browser CORS policy, conditional-write bucket policy, or prefix-scoped access
needed by this flow.

## Solution

Implement the Stage 3 Lesson Audio vertical slice with AWS S3 in `eu-north-1`.
The authenticated admin API will create a `PENDING` Media Asset and a 15-minute
Upload Intent for one MP3. The BFF will generate an opaque object key and a
presigned conditional PUT, after which the browser uploads directly to S3.
When the administrator completes the upload, the BFF will inspect S3 metadata
without downloading the object and the Data Service will atomically make a
valid object `READY`, allocate and promote its Lesson Audio version, and update
the Lesson aggregate timestamp.

The mobile Lesson-detail response will include the current Lesson Audio and a
fresh one-hour Playback URL, or `audio: null` when no playable rendition exists.
The mobile client will stream or download the MP3 directly from S3; ordinary
media bytes will never pass through the BFF or Data Service.

Add a narrow injected storage boundary in the BFF, backed by the AWS SDK in the
application and a fake in automated tests. Secure the existing S3 bucket and
least-privilege IAM access in the infrastructure repository. Prove the normal
application flow through the public BFF boundary, the real Data Service, and
migrated PostgreSQL with fake storage, then use one opt-in real-browser tracer
for the live S3 signing, CORS, conditional-write, playback, and cleanup path.

## User Stories

1. As a content administrator, I want to request an Upload Intent for one Lesson and Language, so that I can attach manually generated audio to the correct localized content.
2. As a content administrator, I want Upload Intent creation protected by the existing admin credential, so that anonymous callers cannot consume storage or create Media Assets.
3. As a content administrator, I want the upload request to accept the Lesson ID, Language code, original filename, declared content type, and declared size, so that the system has enough information to authorize and validate the upload.
4. As a content administrator, I want non-positive or unsafe Lesson IDs rejected, so that malformed targets cannot enter the media workflow.
5. As a content administrator, I want unsupported or blank Language codes rejected, so that Lesson Audio uses the configured Language catalog.
6. As a content administrator, I want only filenames ending in `.mp3` accepted, so that the PoC remains limited to its chosen audio format.
7. As a content administrator, I want only the exact declared content type `audio/mpeg` accepted, so that the upload contract is predictable.
8. As a content administrator, I want zero-byte files rejected, so that empty audio cannot consume an Upload Intent.
9. As a content administrator, I want files larger than 50 MiB rejected, so that accidental oversized uploads cannot enter the PoC workflow.
10. As a content administrator, I want unexpected request fields rejected, so that client mistakes are visible instead of silently ignored.
11. As a content administrator, I want each accepted upload to receive a server-generated object key, so that local paths and filenames do not control storage identity.
12. As a content administrator, I want the generated key to reveal no Lesson ID, Language code, or original filename, so that storage layout does not leak domain details.
13. As a content administrator, I want the original filename retained as Media Asset metadata, so that administrators can recognize what was uploaded without using it as storage identity.
14. As a content administrator, I want an accepted Upload Intent to create a `PENDING` Media Asset before upload, so that the attempted transfer has stable identity.
15. As a content administrator, I want the Upload Intent response to contain the Media Asset ID, upload URL, required headers, and expiry, so that a browser can perform the authorized upload without AWS credentials.
16. As a content administrator, I want Upload Intents to expire after 15 minutes, so that abandoned authorization has a short useful lifetime.
17. As a content administrator, I want the presigned upload restricted to one generated object key, so that it cannot write elsewhere in the bucket.
18. As a content administrator, I want the presigned upload bound to the exact declared content type and size, so that a different payload cannot reuse the authorization successfully.
19. As a content administrator, I want every upload to require `If-None-Match: *`, so that reuse of an Upload Intent cannot overwrite an existing object.
20. As a content administrator, I want the browser to upload MP3 bytes directly to S3, so that the Hetzner VPS does not proxy ordinary media traffic.
21. As a content administrator, I want a clear retryable response when upload authorization cannot be generated, so that a temporary AWS failure does not look like invalid input.
22. As a content administrator, I want a failed authorization attempt to leave any already-created Media Asset safely `PENDING`, so that partial orchestration does not claim the audio is playable.
23. As a content administrator, I want to notify the BFF when an upload is complete, so that the stored object can be validated before use.
24. As a content administrator, I want completion to resubmit the Lesson ID and Language code, so that the PoC can bind the uploaded Media Asset without adding a persisted Upload Intent entity.
25. As a content administrator, I want completion protected by the existing admin credential, so that only an administrator can bind uploaded media to a Lesson.
26. As a content administrator, I want completion rejected when the Media Asset does not exist, so that invalid identifiers do not trigger storage work.
27. As a content administrator, I want completion rejected when the target Lesson does not exist, so that audio cannot be attached to an unknown Lesson.
28. As a content administrator, I want completion rejected when the target Language is unsupported, so that Lesson Audio cannot bypass the Language catalog.
29. As a content administrator, I want completion rejected when the Lesson lacks matching Lesson Text, so that audio always has localized textual content.
30. As a content administrator, I want completion allowed for a `DRAFT` Lesson, so that audio can be prepared before publication.
31. As a content administrator, I want completion allowed for a `PUBLISHED` Lesson, so that the first or corrected audio can be added without creating a new Lesson version.
32. As a content administrator, I want completion rejected for an `ARCHIVED` Lesson, so that archived content remains terminal.
33. As a content administrator, I want target failures to leave the Media Asset `PENDING`, so that I can correct the Lesson or Language and retry.
34. As a content administrator, I want the BFF to verify that the object exists in S3 before completion, so that a missing upload cannot become playable.
35. As a content administrator, I want the BFF to verify the stored object's exact content length and content type, so that completion cannot trust browser claims alone.
36. As a security reviewer, I want object validation to use metadata only, so that the BFF does not download or parse untrusted MP3 bytes.
37. As a content administrator, I want a missing object to produce a retryable completion result while leaving the Media Asset `PENDING`, so that eventual upload visibility can be retried safely.
38. As a content administrator, I want transient S3 failures to produce a retryable service response while leaving the Media Asset `PENDING`, so that infrastructure faults do not corrupt lifecycle state.
39. As a content administrator, I want a size or content-type mismatch to mark the Media Asset `FAILED`, so that invalid media can never become playable.
40. As an operator, I want an invalid uploaded object deleted after its Media Asset becomes `FAILED`, so that rejected content does not consume storage unnecessarily.
41. As an operator, I want deletion failure to be logged without reverting the `FAILED` status, so that an inert orphan cannot become playable merely because cleanup failed.
42. As a content administrator, I want a `FAILED` Media Asset to remain terminal, so that correcting an invalid upload requires a new Upload Intent and object key.
43. As a content administrator, I want successful validation to mark the Media Asset `READY` and set its upload timestamp, so that usable storage state is explicit.
44. As a content administrator, I want successful completion to create a Lesson Audio for the selected Lesson and Language, so that the uploaded object becomes part of the Lesson.
45. As a content administrator, I want the first completed rendition to receive audio version 1, so that version history begins predictably.
46. As a content administrator, I want each distinct later completion for the same Lesson and Language to receive the next audio version, so that corrected recordings preserve history.
47. As a content administrator, I want the newly completed Lesson Audio to become current, so that clients receive the latest successful rendition.
48. As a content administrator, I want the previous current Lesson Audio demoted rather than deleted, so that audio history remains immutable.
49. As a maintainer, I want version allocation and current-version promotion to occur in one PostgreSQL transaction, so that no partial audio state is observable.
50. As a maintainer, I want concurrent completions serialized safely, so that audio versions remain unique and exactly one rendition is current.
51. As a maintainer, I want the last successfully committed completion for a Lesson and Language to be current, so that concurrent uploads have deterministic persisted semantics.
52. As a content administrator, I want repeating completion for the same successfully bound Media Asset and target to return the existing Lesson Audio, so that retries never create another audio version.
53. As a content administrator, I want an already-bound Media Asset rejected for a different Lesson or Language, so that idempotency cannot silently rebind audio.
54. As a maintainer, I want a transaction failure to leave the object and Media Asset safe to retry, so that database faults do not require a new upload.
55. As a content administrator, I want successful completion to return the `READY` Media Asset and current Lesson Audio metadata, so that the admin workflow can confirm the result immediately.
56. As a content administrator, I want successful audio promotion to advance the Lesson aggregate timestamp, so that aggregate consumers can observe the change.
57. As a content administrator, I want creation of a `PENDING` Media Asset not to advance the Lesson timestamp, so that an unfinished upload is not presented as a Lesson change.
58. As a mobile learner, I want a Lesson without playable audio to return `audio: null`, so that the app can render the text-only state simply.
59. As a mobile learner, I want the current Lesson Audio included in localized Published Lesson detail, so that playback needs no separate API round trip.
60. As a mobile learner, I want the audio response to include its version, content type, size, optional duration, Playback URL, and expiry, so that the app can present and play it safely.
61. As a mobile learner, I want the Playback URL to expire after one hour, so that access is useful for a listening session without becoming permanent.
62. As a mobile learner, I want each Lesson-detail read to receive fresh playback authorization, so that persisted or expired URLs are never reused by the server.
63. As a mobile learner, I want playback authorization scoped to one current Media Asset and read-only access, so that it cannot write or access unrelated media.
64. As a mobile learner, I want the mobile response to hide the AWS provider, bucket, object key, original filename, and credentials, so that storage internals stay private.
65. As a mobile learner, I want the Lesson-detail response marked `Cache-Control: no-store`, so that temporary Playback URLs are not retained by intermediary caches.
66. As a mobile learner, I want to stream or download the MP3 directly from S3, so that playback does not depend on VPS media throughput.
67. As an operator, I want the S3 bucket private with public access blocked, so that audio is available only through temporary authorization.
68. As an operator, I want browser upload CORS limited to explicit admin origins, the PUT method, and required headers, so that the bucket does not expose a broad browser surface.
69. As an operator, I want the bucket policy to reject object writes without the conditional-write header, so that overwrite protection is enforced by S3 as well as the client contract.
70. As an operator, I want the BFF's IAM identity limited to the required object operations and prefixes, so that compromised credentials have the smallest practical scope.
71. As an operator, I want AWS configuration validated at BFF startup, so that missing runtime secrets fail visibly before traffic is served.
72. As an operator, I want BFF readiness to avoid a live S3 request, so that health polling does not add cloud traffic or couple readiness to intermittent storage checks.
73. As an operator, I want storage logs correlated by request ID and Media Asset ID, so that upload and playback failures can be traced across services.
74. As a security reviewer, I want logs to omit presigned URLs, AWS credentials, authorization tokens, and request bodies, so that observability does not leak secrets or content.
75. As a developer, I want storage behavior behind one narrow BFF boundary, so that orchestration can be tested without live AWS access.
76. As a developer, I want ordinary automated tests to use fake storage, so that the default feedback loop remains deterministic and credential-free.
77. As a developer, I want one high-level automated tracer through the BFF, Data Service, and PostgreSQL, so that the complete Media Asset and Lesson Audio flow is proven at its public boundary.
78. As a developer, I want one opt-in real-browser tracer against the existing S3 bucket, so that presigning, browser-controlled headers, CORS, conditional writes, playback, and cleanup are proven in the real provider.
79. As an operator, I want the live tracer to use isolated `smoke/` object keys and delete only the exact objects it creates, so that verification cannot damage application audio.
80. As a maintainer, I want abandoned `PENDING` rows and objects tolerated for the PoC, so that cleanup automation is added only when leakage is measurable.

## Implementation Decisions

### Scope and service boundaries

- This feature is the complete Stage 3 object-storage slice: Upload Intent creation, direct browser upload, stored-object validation, Media Asset lifecycle, Lesson Audio versioning, and mobile playback authorization.
- AWS S3 in `eu-north-1` is the only PoC object-storage provider, as recorded by the accepted object-storage ADR. Azure support, provider switching, and a generic multi-cloud framework are not introduced.
- Clients transfer ordinary MP3 bytes directly to and from S3, as recorded by the direct-transfer ADR. The BFF handles authorization and metadata operations only; the Data Service handles relational state only.
- The BFF remains the public authentication, request-validation, orchestration, response-composition, and AWS SDK boundary. It must not import Drizzle or directly access PostgreSQL.
- The Data Service remains the only owner of PostgreSQL, Media Asset state transitions, Lesson Audio version allocation and promotion, and Lesson aggregate timestamps.
- The existing Media Asset and Lesson Audio schema is sufficient. No new Upload Intent table or persisted temporary URL is added.
- Storage provider, authorization lifetime, upload limit, and object-key layout are fixed PoC values rather than new configuration knobs.

### Public admin contracts

- `POST /api/admin/media/upload-intents` is protected by the existing admin bearer token.
- The Upload Intent request is strict and contains `lessonId`, `languageCode`, `originalFilename`, `contentType`, and `sizeBytes`.
- `lessonId` and `sizeBytes` are safe positive integers. `sizeBytes` is limited to 50 MiB. `languageCode` must identify a supported Language, `originalFilename` must end in `.mp3`, and `contentType` must equal `audio/mpeg`.
- Upload Intent creation generates `audio/{random UUID}.mp3` with the Node.js standard-library UUID generator. The key contains no Lesson identity, Language code, or original filename.
- The BFF asks the Data Service to persist a `PENDING` Media Asset with provider `s3`, the configured bucket, the generated object key, the original filename, exact content type and numeric size, null duration, and null upload timestamp.
- The target Lesson and Language are not durably bound during Upload Intent creation. They are shape-validated for early client feedback, then resubmitted and authoritatively validated during completion. Durable Upload Intent binding is deferred while the PoC has one trusted administrator.
- A successful Upload Intent returns `201 Created` with `mediaAssetId`, `uploadUrl`, `uploadHeaders`, and `expiresAt`. It does not expose the bucket or object key separately.
- Upload authorization lasts 15 minutes and permits one conditional PUT to the generated key. Signing binds `Content-Type: audio/mpeg`, the declared content length, and `If-None-Match: *`. The response identifies the headers the browser must supply; the browser-generated Content-Length must match the signed declared size.
- If presigning fails after Media Asset creation, the public request returns a retryable storage failure and the row remains `PENDING`. Stage 3 does not add compensating deletion or automatic cleanup for this uncommon case.
- `POST /api/admin/media/:mediaAssetId/complete` is protected by the existing admin bearer token. The strict request contains `lessonId` and `languageCode`.
- Completion returns `200 OK` for both the first success and a matching idempotent retry. The response contains public-safe Media Asset fields—identity, `READY` status, content type, numeric size, null duration, and upload timestamp—and Lesson Audio fields—identity, Lesson ID, Language code, audio version, current flag, and creation timestamp.
- A completion retry for a Media Asset already bound to the same Lesson and Language returns the existing representation without allocating a version or touching the Lesson again. A different target returns `409 Conflict`.
- Public errors continue to use the repository's Problem Details contract, stable machine-readable codes, request IDs, safe messages, and appropriate `404`, `409`, `422`, `502`, `503`, or `504` status codes.

### Storage boundary and S3 behavior

- The BFF gains one narrow injected storage interface covering upload authorization, object metadata inspection, playback authorization, and exact-object deletion. The production implementation uses the modular AWS SDK; automated tests use an in-memory fake at the same interface.
- The BFF adds only the AWS SDK packages required for S3 commands and request presigning. No storage framework, MinIO service, or provider abstraction beyond the testable boundary is added.
- Upload validation uses S3 object metadata and compares exact content length and exact `audio/mpeg` content type with the persisted Media Asset declaration. It does not download, parse, sniff, or calculate the duration of MP3 bytes.
- A missing object is reported as a retryable incomplete-upload conflict and leaves the Media Asset `PENDING`. A transient or throttled S3 error is translated to a retryable service failure and also leaves it `PENDING`.
- A size or content-type mismatch first transitions the Media Asset from `PENDING` to terminal `FAILED`, then attempts to delete that exact S3 object. Cleanup failure is logged and does not restore `PENDING` or permit completion.
- Successful object validation is followed by the Data Service completion command. If that transaction fails, the uploaded object and `PENDING` Media Asset remain available for an idempotent retry.
- Playback authorization is a one-hour presigned read for the single current Media Asset. Generating it requires no additional object metadata request.
- Final audio keys use the `audio/` prefix. Live verification uses the `smoke/` prefix. S3 bucket versioning remains disabled.

### Data Service contracts and transactions

- Shared executable contracts are extended for public media requests and responses, internal Media Asset commands, internal Lesson Audio results, storage-backed mobile detail, and all corresponding path parameters.
- Transport uses JSON-safe numbers for `sizeBytes` and `durationMs`. The 50 MiB feature limit keeps these values safely representable, while the Data Service converts them to and from the database's bigint representation.
- The BFF Data Service client gains narrow operations to create a pending Media Asset, record validation failure, complete a validated Media Asset, and fetch Published Lesson detail with current audio storage metadata. Generic Media Asset or Lesson Audio patch endpoints are not added.
- The Data Service exposes command-oriented internal routes for those operations behind the existing internal bearer token. Internal route names may follow the existing resource conventions; their behavioral contract, not a generic CRUD surface, is fixed by this spec.
- The Data Service owns authoritative target validation. Completion returns `404` for a missing Media Asset or Lesson, `409` for missing matching Lesson Text, an Archived Lesson, a terminal failed asset, or an attempt to rebind a completed Media Asset, and `422` for an unsupported Language.
- Target-validation failures do not change a `PENDING` Media Asset, allowing an administrator to correct the request and retry.
- Successful completion locks the Media Asset and target Lesson, rechecks their state, marks the asset `READY`, sets its upload timestamp, allocates the next positive audio version for the Lesson and Language, demotes the previous current Lesson Audio, inserts the new current Lesson Audio, and advances the Lesson's update timestamp in one PostgreSQL transaction.
- Concurrency uses database row locking plus the existing unique constraints. Distinct completions for one Lesson and Language serialize version allocation, and the last successfully committed completion is current.
- The existing Lesson Audio history is immutable. Superseded rows and their `READY` Media Assets remain stored; no replacement or deletion endpoint is introduced.
- A `DRAFT` or `PUBLISHED` Lesson may receive or promote Lesson Audio. An `ARCHIVED` Lesson may not. Audio changes do not reopen a Published Lesson or permit changes to Lesson structure, Lesson Texts, or Lesson Sources.
- A successful first completion advances the Lesson timestamp. A matching idempotent retry and creation of a pending Media Asset do not.
- Published Lesson detail returned internally for a requested Language gains the current playable Media Asset locator and metadata needed by the BFF. The internal locator is never copied directly into a public DTO.

### Mobile playback contract

- `GET /api/mobile/lessons/:lessonId` keeps its existing Language selection and Published-only rules and adds a required nullable `audio` field.
- `audio` is null when there is no current `READY` Lesson Audio for the requested Language.
- Non-null `audio` contains only `mediaAssetId`, `audioVersion`, `contentType`, numeric `sizeBytes`, nullable `durationMs`, `playbackUrl`, and `playbackExpiresAt`.
- The mobile response never contains the storage provider, bucket, object key, original filename, permanent AWS credentials, or internal Lesson Audio flags.
- The BFF generates a fresh one-hour Playback URL while composing each detail response and sets `Cache-Control: no-store` on the response. Playback URLs are never persisted.
- Mobile Lesson lists remain unchanged and do not generate Playback URLs.

### Runtime, security, and infrastructure

- BFF runtime configuration adds required `AWS_REGION`, `S3_BUCKET`, `AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY` values. Startup rejects missing values. Region, bucket, and credentials are passed through container runtime configuration and documented with non-secret placeholders; real values remain in ignored local or deployment secrets.
- BFF readiness continues to cover the BFF-to-Data-Service-to-PostgreSQL path but makes no network call to S3. Real request failures and the opt-in tracer are the storage operational signal.
- The existing S3 bucket receives an explicit public-access block and remains private. Bucket versioning is not enabled for the PoC.
- S3 browser CORS allows PUT only from the explicit local Admin origin and the production Admin origin once known, with only the headers required by the signed upload. Wildcard origins, credentials, and unrelated methods or headers are not allowed.
- The bucket policy requires conditional writes with `If-None-Match`, so a generated object key cannot be overwritten even if a caller omits the intended condition.
- The dedicated BFF IAM user is retained. Its policy is narrowed to the required GetObject, PutObject, and DeleteObject actions over the `audio/` and `smoke/` prefixes of the one application bucket; it receives no bucket-management or list permissions unless the live implementation proves one indispensable.
- Terraform remains the source of truth for bucket, public-access, CORS, bucket-policy, and IAM policy configuration in the sibling infrastructure repository. One infrastructure change blocks the live S3 tracer, but application tests with fake storage do not depend on it.
- Access-key creation, rotation, and placement are human-performed secret operations documented through the repository's wizard workflow after the infrastructure policy is applied. No access key is generated into tracked Terraform state or committed files.
- Storage logs include request ID, operation, Media Asset ID when available, and the safe AWS error or request code. They exclude request bodies, credentials, authorization headers, and complete presigned URLs.
- Stage 3 adds no custom metrics, dashboards, tracing backend, or storage-specific readiness probe.

## Testing Decisions

- Good tests assert observable HTTP responses, persisted lifecycle state, direct-transfer authorization, transactional outcomes, and security boundaries. They do not assert private helper names, AWS SDK command construction, SQL statement order, Hono middleware arrangement, or complete presigned URL strings.
- The primary automated seam is one high-level flow at the public BFF Hono boundary using the real Data Service HTTP client, real Data Service HTTP application, and freshly migrated PostgreSQL, with only the storage interface replaced by an injected fake. This is the highest stable seam that remains credential-free and deterministic.
- The primary tracer creates a Lesson and matching Thai Lesson Text, requests an Upload Intent, places matching object metadata into fake storage, completes the Media Asset, verifies version 1 is current and the Lesson timestamp advances, reads the Published Lesson through the mobile endpoint, and verifies the public audio projection and fresh Playback URL.
- The same tracer completes a second distinct Media Asset for the same Lesson and Language, verifies audio version 2 becomes current while version 1 remains history, and verifies a completion retry does not create version 3.
- Shared-contract tests cover strict Upload Intent and completion requests, positive safe identifiers, supported Language codes, `.mp3`, exact `audio/mpeg`, the 1-byte and 50-MiB boundaries, response timestamp formats, JSON-safe media sizes, nullable duration, mobile `audio`, and rejection of unknown fields or leaked storage fields.
- BFF route tests use fake Data Service and storage implementations at their existing application-construction seams. They verify authentication, request IDs, status codes, Upload Intent response composition, required signed headers, expiry values, completion orchestration, `Cache-Control: no-store`, and safe error translation without Docker or AWS.
- Storage-interface tests assert behavior at the adapter boundary: opaque `audio/` and `smoke/` keys, 15-minute conditional write authorization, one-hour read authorization, metadata mapping, not-found classification, retryable AWS error classification, exact deletion, and secret-safe logging. They do not snapshot AWS signatures.
- Data Service HTTP tests run through Hono against real PostgreSQL. They verify pending creation, unsupported and missing targets, Lesson Text requirement, Draft and Published acceptance, Archived rejection, failed-state terminal behavior, success transition, uploaded timestamp, immutable history, matching idempotency, rebind rejection, and Lesson timestamp behavior.
- Data Service concurrency coverage launches competing completions for distinct pending Media Assets targeting one Lesson and Language. It verifies unique consecutive audio versions, one current rendition, retained history, and no partial `READY` asset without its Lesson Audio.
- Transaction rollback coverage forces a completion failure and verifies that Media Asset, Lesson Audio, current-version flags, and Lesson timestamp all retain their pre-command state.
- Metadata-mismatch tests prove that the BFF records `FAILED` before requesting exact-object deletion and that deletion failure cannot make the Media Asset retryable or playable.
- Retryable-storage tests prove that a missing object or transient S3 error leaves the Media Asset `PENDING` and creates no Lesson Audio.
- Mobile tests verify `audio: null`, current-audio selection for the requested Language, public-field allow-listing, one Playback URL generation per detail read, one-hour expiry, no extra metadata request, `Cache-Control: no-store`, and no audio fields added to list responses.
- Existing API-contract, fake Data Service client, BFF Hono route, Data Service HTTP, PostgreSQL integration, container topology, request-correlation, Problem Details, and Node built-in test conventions are the prior art. Existing Media Asset and Lesson Audio database tests remain the constraint-level foundation rather than being duplicated.
- The opt-in live S3 tracer runs from a real browser against the configured local Admin origin and existing private bucket. It obtains a real Upload Intent, performs the direct PUT, completes the media, fetches the presigned playback object, and verifies the exact byte count.
- The live tracer proves browser handling of the signed content length, `Content-Type`, and `If-None-Match` headers; CORS preflight; overwrite rejection on a repeated PUT; private unauthenticated access rejection; Playback URL expiry metadata; and the absence of permanent AWS credentials in browser-visible responses.
- Live-tracer objects use unique `smoke/{random UUID}.mp3` keys. Cleanup records and deletes only the exact keys created by that run in a `finally` path. It never lists or deletes the application `audio/` prefix.
- Infrastructure verification formats and validates the Terraform configuration and inspects the planned public-access block, CORS allow-list, conditional-write policy, and prefix-scoped IAM permissions before the live tracer runs.
- Default workspace tests, typechecking, builds, PostgreSQL integration, and the fake-storage end-to-end tracer require no AWS credentials. The real-browser S3 tracer remains an explicit opt-in command because it requires cloud access and creates temporary external state.

## Out of Scope

- Building the React/Vite Admin application, file picker, upload progress UI, or current-audio management UI. Stage 3 exposes and verifies the backend contracts used by that later work.
- Building the React Native audio player, background playback, transport controls, playback speed, local resume position, or offline downloads. Stage 3 supplies the mobile Lesson audio contract and Playback URL only.
- Automated ElevenLabs API generation, an ElevenLabs service, audio synthesis orchestration, or storage of ElevenLabs credentials.
- Downloading, decoding, parsing, transcoding, waveform analysis, malware scanning, content sniffing, or duration extraction for MP3 files.
- Audio formats other than one `.mp3` declared as `audio/mpeg`.
- Azure Blob Storage, multiple storage providers, active replication, failover, custom S3-compatible endpoints, MinIO, or a second test bucket.
- Proxying upload or playback bytes through the BFF, Data Service, Caddy, or Hetzner VPS.
- Persisting Upload Intents, Playback URLs, presigned upload URLs, AWS credentials, browser sessions, or client progress.
- Automatic expiration, reconciliation, or cleanup of abandoned `PENDING` Media Assets and objects. Add it only when measurable leakage or multiple administrators make it necessary.
- Media Asset `DELETED` lifecycle behavior, administrator deletion, restoration, replacement in place, or deletion of superseded `READY` audio history.
- S3 bucket versioning, lifecycle policies, archive tiers, replication, CDN delivery, CloudFront, or caching of Playback URLs.
- Generic Media Asset and Lesson Audio CRUD APIs, direct client access to the Data Service, or BFF database access.
- Changing Lesson structure, Lesson Texts, or Lesson Sources after publication; Lesson Audio remains independently versioned.
- Durable binding of Lesson and Language to an Upload Intent. Add it when multiple or untrusted administrators make completion resubmission unsafe.
- Production Admin-origin selection, production deployment, Caddy, Cloudflare, GHCR, GitHub Actions, SSH rollout, or deployment-secret injection beyond documenting the Stage 3 runtime variables.
- Automatic IAM access-key creation or rotation in Terraform, committing credentials, or exposing permanent credentials to any frontend.
- Storage metrics, dashboards, alarms, distributed tracing infrastructure, log shipping, rate limiting, quotas, or abuse prevention beyond existing admin authentication and the fixed upload limit.
- Reorganizing the monorepo, database schema, application service boundaries, or existing Stage 2 APIs beyond the media fields and commands required by this slice.
- Quiz, learner-account, payment, subscription, recommendation, or server-synchronized progress domains.

## Further Notes

- The repository already has the seven-table Drizzle schema, committed migration, Media Asset constraints, Lesson Audio constraints, Data Service HTTP foundation, BFF Data Service client, shared Zod contracts, fake-client route tests, real-PostgreSQL integration harness, and Stage 2 end-to-end tracer. Stage 3 should extend these seams rather than create parallel infrastructure.
- The BFF currently has no AWS SDK dependency or storage boundary, and neither service exposes Media Asset or Lesson Audio HTTP behavior. Mobile Lesson detail intentionally contains no audio field yet.
- The sibling infrastructure repository already defines the named S3 bucket and dedicated IAM user. It still needs the public-access, CORS, conditional-write, and narrowed prefix policy required by this spec.
- ADR-0001 requires matching Lesson Text before Lesson Audio. ADR-0002 permits a pending Media Asset without Lesson Audio. ADR-0004 selects AWS S3, and ADR-0005 requires direct client-to-S3 media transfer. This spec preserves all four decisions.
- Stage 3 intentionally adds required cloud configuration to BFF startup. The credential-free default remains the automated test workflow; developers who run the real media-enabled application or live tracer must obtain runtime credentials through the human setup wizard.
- The feature is large enough to split into tracer-bullet implementation tickets. The infrastructure policy change must precede the live S3 tracer, while contract, Data Service, BFF, and fake-storage work can proceed without live cloud credentials.

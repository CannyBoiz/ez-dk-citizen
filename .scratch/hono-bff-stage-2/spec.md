# Hono BFF Stage 2 Lesson Slice

Status: ready-for-agent

## Problem Statement

The Danish citizenship learning application has a verified PostgreSQL and
Drizzle foundation, but neither an administrator nor the mobile learner can use
it through an application API. The Data Service exposes only process and
database health behavior; it has no internal resource API. The public Hono BFF,
its client-facing contracts, authentication boundary, validation, response
composition, and Data Service client do not exist.

Without this layer, the admin application cannot create a Lesson, add localized
Lesson Text, or associate reusable Sources, and the mobile application cannot
list or read published Lessons in Thai. Implementing only a BFF shell or mocking
its persistence dependency would not prove the service boundary described by
the PoC architecture.

## Solution

Build a functional Stage 2 vertical slice spanning the public Hono BFF and the
internal Hono Data Service API. The BFF will expose authenticated admin routes
for Lessons, Lesson Texts, Sources, and Lesson Source associations, along with
public mobile routes for localized published Lesson reads. It will validate and
compose client-facing traffic while accessing persistence exclusively through
authenticated internal REST calls.

Add a shared runtime-contract package containing strict transport schemas and
inferred TypeScript types. The Data Service will remain the authoritative owner
of transactions, lifecycle rules, relational invariants, and PostgreSQL. Add
operational configuration, structured errors and logs, health and readiness
behavior, local Docker Compose integration, and automated coverage culminating
in one end-to-end HTTP and PostgreSQL tracer path.

This slice stops before object-storage integration. It establishes the public
and internal seams that Stage 3 will extend with Upload Intents, Media Assets,
Lesson Audio, and temporary upload and playback authorization.

## User Stories

1. As a content administrator, I want to create a Lesson with a chapter and version, so that I can begin preparing a new unit of citizenship-study content.
2. As a content administrator, I want every new Lesson to begin as a Draft, so that incomplete work cannot become learner-visible accidentally.
3. As a content administrator, I want to list all Lesson versions, so that I can see current work, published content, and archived history.
4. As a content administrator, I want Lessons ordered by chapter and newest version, so that related versions are easy to compare.
5. As a content administrator, I want to inspect one Lesson with all its localized text and Sources, so that I can review the complete Lesson aggregate.
6. As a content administrator, I want to correct a Draft Lesson's chapter or version, so that data-entry mistakes can be fixed before publication.
7. As a content administrator, I want to publish a Draft Lesson, so that it becomes available to learners.
8. As a content administrator, I want to archive a Draft or Published Lesson, so that abandoned or superseded content no longer appears to learners.
9. As a content administrator, I want Archived Lessons to remain terminal, so that historical content cannot silently return to an editable or published state.
10. As a content administrator, I want published and archived versions to be immutable, so that corrections create auditable new Lesson versions instead of rewriting history.
11. As a content administrator, I want a final Draft structure correction and publication to succeed atomically, so that learners never observe a partially applied change.
12. As a content administrator, I want an explicit conflict when another version of the chapter is already Published, so that the system never chooses a replacement on my behalf.
13. As a content administrator, I want to add or replace a Lesson Text for a supported Language, so that a Draft can be localized incrementally.
14. As a content administrator, I want repeated Lesson Text writes to be idempotent, so that retrying a save does not create duplicates.
15. As a content administrator, I want unsupported Languages rejected, so that content cannot drift outside the application's configured Languages.
16. As a content administrator, I want blank localized titles and content rejected, so that unusable Lesson Text cannot be saved.
17. As a content administrator, I want to create a canonical Source once, so that the same official material can support several Lessons.
18. As a content administrator, I want Source URLs validated as absolute HTTP or HTTPS URLs, so that citations are usable.
19. As a content administrator, I want surrounding whitespace removed from Source URLs, so that accidental spaces do not create distinct Sources.
20. As a content administrator, I want exact duplicate Source URLs rejected, so that canonical Sources are not silently duplicated.
21. As a content administrator, I want a Source publication timestamp to be optional, so that undated government webpages remain representable.
22. As a content administrator, I want Source publication timestamps normalized to UTC, so that clients interpret them consistently.
23. As a content administrator, I want Sources listed deterministically, so that I can select an existing Source for a Lesson.
24. As a content administrator, I want to attach an existing Source to a Draft Lesson, so that the Lesson cites its supporting material.
25. As a content administrator, I want page and Section Reference locators stored on the Lesson Source association, so that one canonical Source can support different Lessons precisely.
26. As a content administrator, I want repeated Source attachment to replace the complete locator idempotently, so that saving the same association is safe.
27. As a content administrator, I want to detach a Source from a Draft Lesson, so that an incorrect citation can be removed before publication.
28. As a content administrator, I want repeated detachment to succeed, so that retries do not require special client recovery.
29. As a content administrator, I want edits to Lesson Texts and Lesson Sources rejected after a Lesson leaves Draft, so that published history remains stable.
30. As a content administrator, I want each successful Lesson mutation to return the current Lesson detail, so that the admin UI can refresh without assembling the aggregate itself.
31. As a mobile learner, I want to list Published Lessons in Thai by default, so that the application immediately serves my primary Language.
32. As a mobile learner, I want to request another supported Language explicitly, so that localized content can be selected without a separate API.
33. As a mobile learner, I want Lessons without the requested Lesson Text omitted from the list, so that every result is displayable.
34. As a mobile learner, I want no silent Language fallback, so that I always know which localization I am reading.
35. As a mobile learner, I want Lessons ordered by chapter, so that study content follows its intended sequence.
36. As a mobile learner, I want to open a localized Published Lesson and read its title and content, so that I can study on my phone.
37. As a mobile learner, I want to see which other Languages are available for a Lesson, so that the UI can offer valid alternatives.
38. As a mobile learner, I want to see the Lesson's cited Sources and locators, so that I can identify the official material behind it.
39. As a mobile learner, I want Draft and Archived Lessons hidden, so that only current approved content appears.
40. As a mobile learner, I want a clear not-found response when the requested localization does not exist, so that the client can handle missing content predictably.
41. As an administrator, I want admin routes protected by one PoC credential, so that anonymous callers cannot mutate content.
42. As an operator, I want the internal Data Service protected by a credential distinct from the admin credential, so that public credentials are never propagated across the service boundary.
43. As an operator, I want services to refuse startup when required credentials are absent, so that a deployment cannot run with an unintentionally open boundary.
44. As an operator, I want browser access limited to configured admin origins, so that arbitrary origins cannot call the BFF with admin credentials.
45. As an API consumer, I want malformed or invalid requests rejected consistently, so that I can correct them without interpreting database failures.
46. As an API consumer, I want machine-readable Problem Details with stable error codes, so that clients can branch on failures safely.
47. As an API consumer, I want request IDs returned in responses, so that a failed operation can be correlated with service logs.
48. As an operator, I want request IDs propagated from the BFF to the Data Service, so that one client request can be traced across both services.
49. As an operator, I want structured completion logs without secrets or request bodies, so that behavior is observable without leaking sensitive data.
50. As an API consumer, I want a bounded Data Service timeout, so that public requests do not hang indefinitely.
51. As an API consumer, I want dependency failures distinguished from client mistakes, so that unavailable and timed-out services produce meaningful gateway errors.
52. As an operator, I want liveness checks that do not depend on other systems, so that process failure can be distinguished from dependency failure.
53. As an operator, I want readiness checks that cover the complete BFF-to-Data-Service-to-PostgreSQL path, so that traffic reaches only a usable stack.
54. As a developer, I want the BFF and Data Service to share executable transport contracts, so that request and response shapes cannot drift silently.
55. As a developer, I want transport contracts kept separate from database models, so that the public API is not coupled to persistence layout.
56. As a developer, I want the BFF to use a narrow Data Service client interface, so that route behavior can be tested without PostgreSQL or a live downstream process.
57. As a developer, I want Data Service HTTP behavior tested against real PostgreSQL, so that service rules and database constraints are verified together.
58. As a developer, I want one end-to-end tracer test through both HTTP services and PostgreSQL, so that the architectural path is proven rather than inferred from isolated tests.
59. As a developer, I want ordinary contract and BFF tests to run without Docker, so that the fast feedback loop remains fast.
60. As a developer, I want explicit commands for unit, PostgreSQL integration, and end-to-end tests, so that infrastructure requirements are visible.
61. As a developer, I want both applications available through root workspace commands, so that monorepo workflows remain discoverable.
62. As a developer, I want host development ports that do not collide, so that the BFF and Data Service can run concurrently.
63. As a developer, I want a local Compose stack with only the BFF publicly reachable, so that development reflects the intended service boundary.
64. As a developer, I want clearly labeled local-only token defaults, so that a clean checkout can run without mistaking development values for production secrets.
65. As a future storage integrator, I want Stage 2 responses free of speculative audio fields, so that Stage 3 can establish the media contract deliberately.

## Implementation Decisions

### Scope and service boundaries

- The feature is a functional Stage 2 Lesson slice, not a BFF scaffold and not the Stage 3 object-storage slice.
- There is one public Hono BFF serving both admin and mobile clients. Separate deployed Web and Mobile BFF services are not introduced.
- The BFF owns public authentication, CORS, request validation, public response composition, dependency error translation, correlation, and calls to the internal Data Service.
- The Data Service remains the only application service that imports Drizzle or accesses PostgreSQL. The BFF must not import the Data Service database client or mutate PostgreSQL directly.
- The Data Service gains an internal resource-oriented HTTP API. It does not gain client-specific `admin` or `mobile` route groups.
- Every internal write is transactional. Lifecycle, mutability, Source identity, relational, and publication invariants are authoritative in the Data Service and backed by PostgreSQL constraints where possible.
- The BFF may repeat inexpensive validation to produce prompt client feedback, but BFF validation is never the sole enforcement of a domain invariant.

### Public routes

- The BFF exposes unauthenticated `GET /health` and `GET /ready` operational routes.
- The BFF exposes these admin routes behind the admin bearer token:
  - `GET /api/admin/lessons`
  - `POST /api/admin/lessons`
  - `GET /api/admin/lessons/:lessonId`
  - `PATCH /api/admin/lessons/:lessonId`
  - `PUT /api/admin/lessons/:lessonId/texts/:languageCode`
  - `GET /api/admin/sources`
  - `POST /api/admin/sources`
  - `PUT /api/admin/lessons/:lessonId/sources/:sourceId`
  - `DELETE /api/admin/lessons/:lessonId/sources/:sourceId`
- The BFF exposes public `GET /api/mobile/lessons` and `GET /api/mobile/lessons/:lessonId` routes.
- The first API has no explicit version prefix because the BFF and Data Service deploy together from one monorepo during the PoC.
- Lesson, Lesson Text, and Source deletion are not exposed. Canonical Source editing is also not exposed.

### Admin behavior

- Lesson creation accepts a positive chapter and version. The server assigns identity and timestamps and always creates the Lesson as `DRAFT`; callers cannot choose the initial status.
- Admin Lesson lists are ordered by chapter ascending and version descending and use an `{ items: [...] }` envelope. Each item contains identity, chapter, version, status, timestamps, and available Language codes.
- Admin Lesson detail returns the summary fields plus all Lesson Texts and all attached Sources with their Lesson Source locator fields.
- Lesson patching is strict and requires at least one change. A Draft's chapter and version may change. Status transitions are limited to `DRAFT -> PUBLISHED`, `DRAFT -> ARCHIVED`, and `PUBLISHED -> ARCHIVED`; `ARCHIVED` is terminal.
- A patch may combine final Draft structural changes with publication. The Data Service validates and applies the complete patch atomically.
- Lesson structure, Lesson Text, and Lesson Source associations become immutable as soon as a Lesson leaves `DRAFT`. Corrections require a new Lesson version.
- Attempting to publish when another version of the chapter is already Published returns `409 Conflict`; the service never archives or replaces the current version implicitly.
- Lesson Text uses an idempotent upsert addressed by Lesson and Language. Its request contains required non-blank title and content.
- Source creation accepts a canonical URL and nullable publication timestamp. Publication timestamps require an ISO-8601 value with an explicit offset and are normalized to UTC.
- A Source URL is trimmed and validated as absolute HTTP or HTTPS before persistence. Exact stored URL uniqueness is enforced; broader semantic URL normalization remains an admin responsibility.
- Duplicate Source creation returns `409 Conflict` rather than returning or modifying the existing Source.
- Sources are listed by identity ascending in an `{ items: [...] }` envelope.
- Lesson Source attachment is an idempotent complete replacement of page-from, page-to, and Section Reference locator values. Omitted or null locator fields mean that locator is absent.
- Lesson Source detachment is idempotent and returns success even when the association is already absent.
- Successful Lesson creation returns the new Lesson detail. Successful Lesson patch, Lesson Text upsert, and Lesson Source attachment return the updated Lesson detail. Source creation returns the new Source.

### Lesson lifecycle and timestamps

- New Lessons begin as `DRAFT`.
- Allowed lifecycle transitions are `DRAFT -> PUBLISHED`, `DRAFT -> ARCHIVED`, and `PUBLISHED -> ARCHIVED`.
- `ARCHIVED` is terminal, and neither Published nor Archived Lessons can be edited in place.
- The existing database constraint continues to enforce at most one Published version per chapter.
- Lesson `updatedAt` represents the most recent change to the complete Lesson aggregate. The Data Service advances it for Lesson structure or status changes, Lesson Text upserts, and Lesson Source attachment, replacement, or detachment.
- No database update trigger is added. The Data Service explicitly manages the aggregate timestamp in the same transaction as the change.

### Mobile behavior

- Mobile list and detail accept an optional `language` query parameter defaulting to `th`.
- The requested Language must be supported. There is no automatic fallback to another Language.
- Mobile routes expose only Published Lessons. The list omits Published Lessons that have no Lesson Text in the requested Language.
- Mobile list results are ordered by chapter ascending and returned in an `{ items: [...] }` envelope.
- A mobile list item contains Lesson identity, chapter, version, requested Language code, and localized title.
- Mobile detail contains the list fields plus localized content, available Language codes, and attached Sources with their Lesson Source locators.
- Mobile detail returns `404` with code `lesson_text_not_found` when the Lesson is Published but lacks the requested Lesson Text.
- Mobile DTOs do not include Draft or Archived data, internal administrative fields, or placeholder Media Asset, Lesson Audio, upload, or playback fields.

### Transport contracts and validation

- A tracked shared workspace package contains public and internal runtime transport schemas plus inferred TypeScript types. The root workspace includes both application and package directories.
- Transport contracts do not export Drizzle schemas, database row types, database clients, or persistence implementation details.
- Zod provides executable schemas, consumed through Hono's Standard Schema validation integration rather than custom hand-written parsing.
- Request objects are strict. Unknown fields, malformed JSON, non-JSON write bodies, invalid positive-integer path parameters, invalid query values, unsupported Languages, invalid timestamps, blank required strings, invalid Lesson Source page ranges, and empty Lesson patches are rejected.
- Write request bodies are limited to 1 MiB.
- JSON fields use camel case. IDs are positive JSON numbers, timestamps are ISO-8601 UTC strings, nullable values use JSON null, and domain enum values retain their canonical uppercase spelling.
- Transport DTOs are deliberately distinct from database row shapes.
- List responses use an `{ items: [...] }` envelope. Individual resources are returned directly without a `{ data: ... }` wrapper.
- There are no ETags or conditional-write headers in this single-admin PoC. Lesson domain version is never treated as an HTTP concurrency token.

### Internal Data Service contract

- Internal endpoints live below `/internal` and support the same resource operations required by the public Lesson, Lesson Text, Source, and Lesson Source routes.
- Internal Lesson reads accept optional status and Language filters. These enable the BFF to request Published localized rows efficiently without making the Data Service aware of a mobile client.
- Internal admin detail reads return the complete Lesson aggregate required by the BFF. Internal localized reads return enough data for the BFF to compose the agreed mobile DTOs.
- Internal mutation endpoints return the resulting aggregate when the public operation needs it. The BFF does not perform a mutation followed by a second internal read.
- Data Service errors also use the shared Problem Details contract and stable codes so that the BFF can map known client-caused failures without inspecting free-form text.
- Existing database health behavior is separated into liveness and readiness: Data Service liveness has no database dependency, while readiness executes a PostgreSQL check.

### HTTP semantics and failures

- Resource creation returns `201 Created`, includes `Location`, and returns the created representation.
- Successful reads, patches, and idempotent puts return `200 OK` with the agreed representation.
- Successful Lesson Source detachment returns `204 No Content`, including when the association was already absent.
- Invalid client content returns `422 Unprocessable Content`; malformed JSON and invalid HTTP framing may return `400 Bad Request` where parsing cannot produce a semantic request.
- Missing or invalid admin credentials return `401 Unauthorized` with the appropriate bearer challenge. There is no role model and therefore no separate authorization-based `403` behavior in this slice.
- Missing Lesson, Source, or other addressed resources return `404 Not Found` with resource-specific stable codes.
- Duplicate chapter/version, conflicting Published versions, duplicate Source URLs, illegal lifecycle transitions, and attempts to edit non-Draft Lessons return `409 Conflict` with stable codes.
- All error bodies use `application/problem+json` and the RFC 9457 members `type`, `title`, `status`, `detail`, and `instance`, extended with stable `code` and `requestId` fields. Validation failures also contain a structured `errors` array.
- Problem details expose only public HTTP semantics. SQL diagnostics, internal URLs, stack traces, credential values, and unexpected Data Service response bodies never pass through the BFF.
- The BFF preserves recognized downstream `404`, `409`, and `422` domain outcomes. An unreachable Data Service becomes `502 Bad Gateway`, a Data Service timeout becomes `504 Gateway Timeout`, and malformed or unexpected downstream behavior becomes `502 Bad Gateway`.
- The Data Service client uses a configurable timeout with a two-second default and performs no automatic retries, including for reads. This avoids duplicating writes or multiplying latency invisibly.

### Authentication, CORS, correlation, and logging

- `ADMIN_API_TOKEN` configures the shared PoC bearer token protecting every `/api/admin/*` route.
- `DATA_SERVICE_TOKEN` configures the independent bearer token protecting every `/internal/*` route. The BFF sends this token and never forwards the admin token.
- Both applications fail startup when their required token configuration is absent. Tokens are compared safely, never included in logs, and never exposed in responses.
- Health and readiness routes are unprotected.
- The future browser admin receives its token at runtime. The token must not be embedded in a frontend build artifact.
- Browser cross-origin access uses an exact comma-separated `ADMIN_ORIGINS` allowlist. Wildcard origins and credentialed cookies are not enabled.
- CORS allows the required HTTP methods and the `Authorization`, `Content-Type`, and `X-Request-ID` headers. Native mobile traffic does not rely on browser CORS.
- Each request accepts a syntactically safe `X-Request-ID` or generates a UUID when one is absent or unusable. The BFF returns it and forwards it to the Data Service.
- Both services emit one structured JSON completion log containing request ID, method, matched path template, status, and duration. Tokens, authorization headers, and request bodies are excluded.

### Health and runtime configuration

- BFF `/health` reports process liveness without calling the Data Service.
- BFF `/ready` calls Data Service readiness with a bounded timeout and returns `503 Service Unavailable` when the dependency path is not ready.
- Data Service `/health` reports process liveness without querying PostgreSQL.
- Data Service `/ready` succeeds only when its PostgreSQL check succeeds.
- Both containers listen on configurable `PORT`, defaulting to container port 3000.
- Host development runs the Data Service on port 3000 and the BFF on port 3001 by default.
- Local Compose resolves the private Data Service by its service name and container port. Only the BFF is published to localhost, using configurable `BFF_PORT` with default 3001; PostgreSQL retains the existing local-development exposure.
- BFF configuration includes the Data Service base URL, Data Service timeout, admin token, internal token, allowed admin origins, and port.
- The tracked environment template contains placeholders and documents every new variable. Real environment files and production credentials remain untracked.
- Local Compose may supply clearly labeled non-secret development token defaults so a clean local stack can start. Application code still rejects absent token configuration, and a future production override must require externally supplied secrets.
- The BFF has its own reproducible Docker image and non-root runtime. Compose starts it only after the Data Service readiness check succeeds.

### Workspace and development workflow

- The existing pnpm monorepo is extended to include shared package workspaces as well as application workspaces.
- The BFF follows the repository's ESM, strict TypeScript, Node.js, Hono, pnpm, compiled-output, and Node built-in test conventions.
- Explicit root development commands are provided for the Data Service and BFF. The root development command runs both concurrently.
- Root type-check, build, and ordinary test commands cover all workspace packages.
- PostgreSQL integration and full end-to-end commands remain explicit because they provision infrastructure. Ordinary contract and BFF tests do not require Docker.
- Existing Data Service workflows remain usable, and the isolated PostgreSQL foundation harness must not acquire unrelated BFF or credential dependencies.
- Ignored compiled residue is not an authoritative contract or implementation source. Only tracked source and the new agreed contracts define behavior.

## Testing Decisions

- Tests assert observable HTTP, contract, persistence, and lifecycle behavior rather than private helper structure, individual SQL statements, Hono middleware arrangement, or exact log formatting beyond required fields and redaction.
- The highest test seam is one end-to-end tracer path over real HTTP services and migrated PostgreSQL. It authenticates an admin, creates a Draft Lesson, adds Thai Lesson Text, creates and attaches a reusable Source, publishes the Lesson, and reads it through mobile list and detail routes.
- The end-to-end tracer verifies that the BFF never requires direct database access and that the public operation becomes visible only through the internal REST and Data Service persistence path.
- Shared contract tests exercise valid parsing and rejection boundaries for path parameters, query parameters, bodies, response DTOs, Problem Details, timestamps, strict unknown-field handling, and the 1 MiB body policy where applicable.
- Data Service HTTP tests run against fresh PostgreSQL migrations and exercise the internal routes through Hono's request boundary. They verify returned resources and persisted behavior, not repository-method calls.
- Data Service coverage includes Lesson create/list/detail/patch, lifecycle transitions, atomic draft-update-and-publish behavior, Published-version conflicts, non-Draft immutability, Lesson aggregate timestamps, Lesson Text upsert, supported-Language enforcement, Source validation and exact uniqueness, and Lesson Source attach/replace/detach.
- Data Service tests verify that a failed combined patch persists none of its requested changes.
- Data Service authentication tests prove that internal routes reject missing or incorrect credentials while health and readiness remain accessible.
- BFF route tests construct the Hono application with a fake Data Service client at the narrow client interface. They cover public authentication, CORS, input validation, DTO composition, request ID behavior, response statuses, and downstream error translation without PostgreSQL or Docker.
- The fake Data Service client is a test double for the HTTP client seam, not a replacement for the end-to-end test. Tests assert calls at the behavioral client-operation level rather than the implementation details of `fetch`.
- Data Service HTTP-client tests use a controlled HTTP server or fetch boundary to verify internal bearer authorization, request ID forwarding, timeout cancellation, response validation, known Problem Details mapping, and rejection of malformed downstream responses.
- Mobile tests verify Thai default selection, explicit supported Languages, no fallback, Published-only visibility, deterministic chapter order, omission of missing localizations from lists, missing-localization detail errors, available Languages, and Source locator composition.
- Admin tests verify deterministic list order, complete detail aggregates, success representations, `Location` headers, idempotent puts and detach, and rejection of unsupported delete/edit operations.
- Error tests cover the principal public `401`, `404`, `409`, `422`, `502`, and `504` outcomes and verify the RFC 9457 media type, stable code, request ID, safe detail, and absence of internal diagnostics.
- Logging tests focus only on correlation propagation, required structured completion fields, and redaction of tokens and bodies.
- Liveness and readiness tests prove their distinct dependency semantics in both services. A database outage affects Data Service readiness, and a Data Service outage affects BFF readiness, without changing process liveness.
- Compose configuration tests verify private Data Service exposure, BFF localhost publication, health-based startup ordering, configurable ports, and local-only token defaults.
- Existing PostgreSQL integration tests remain prior art for fresh-database isolation, real constraint verification, deterministic cleanup, and Node's built-in test runner.
- A successful implementation passes formatting where configured, workspace type-checking, workspace build, ordinary tests, the existing PostgreSQL integration suite, the new Data Service HTTP suite, and the end-to-end tracer suite.

## Out of Scope

- AWS S3 or Azure Blob Storage selection.
- Storage adapters, Upload Intents, upload authorization, object-key generation, direct browser upload, object metadata validation, or upload completion.
- Media Asset and Lesson Audio HTTP operations, audio versioning workflows, playback URLs, streaming, downloading, or proxying MP3 bytes.
- Admin React application implementation, including token entry or storage UX.
- React Native application implementation, background audio, offline downloads, or local playback position.
- Automated ElevenLabs API integration or any audio generation.
- Full administrator accounts, learner accounts, sessions, password flows, role-based access control, or server-synchronized progress.
- ETags, conditional requests, or other optimistic-concurrency mechanisms.
- Lesson, Lesson Text, or Source deletion and canonical Source editing.
- Semantic URL canonicalization beyond trimming and exact stored-value uniqueness.
- Pagination, full-text search, filtering beyond the confirmed status and Language needs, caching, or rate limiting.
- OpenAPI generation, interactive API documentation, generated SDKs, GraphQL, or an explicit API-version prefix.
- A circuit breaker or automatic Data Service retries.
- Telemetry backends, distributed tracing infrastructure, metrics collection, or log shipping.
- Caddy, production Compose overrides, Cloudflare configuration, GHCR, GitHub Actions, SSH deployment, Hetzner provisioning, DNS, TLS, or production secret provisioning.
- Quiz, learner-state, payment, subscription, recommendation, or additional media domains.
- Reorganizing the existing database schema or service boundaries beyond changes required to enforce the confirmed Stage 2 behavior.

## Further Notes

- The PostgreSQL and Drizzle foundation is substantively complete and remains the persistence base for this feature. Its HTTP layer currently exposes no resource operations, so the internal API is required rather than optional follow-up work.
- The existing Source URL column already has an exact uniqueness constraint. This feature adds transport normalization and service-level conflict behavior rather than redefining Source identity.
- ADR 0001 continues to require Lesson Text before future Lesson Audio. ADR 0002 continues to permit an unattached Pending Media Asset. Stage 2 does not exercise either media behavior but must not create contracts that contradict them.
- The canonical product context records the confirmed Source identity, Lesson lifecycle, immutability, aggregate timestamp, and atomic publication rules.
- No new ADR is required. The feature implements the existing BFF/Data Service architecture and adds visible domain rules rather than choosing a surprising hard-to-reverse architecture.
- The complete Stage 2 work is large enough to split into tracer-bullet implementation tickets with explicit blocking relationships before implementation.

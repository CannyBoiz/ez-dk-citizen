# One Backend

Status: ready-for-agent

## Problem Statement

The admin (the developer, building this PoC alone) pays for every backend
feature twice. Stage 4b ticket 04 added one operation, deleting a Draft, and
had to change a Data Service mutation, a Data Service route, the Data Service
HTTP tests, a shared contract, a BFF client method, the BFF's fake client, a
BFF route, and the BFF route tests. Tickets 06 and 08 would pay the same again.

The split was meant to protect PostgreSQL, but it does not. The
internet-facing BFF holds a Data Service token that can read and change every
record, so the boundary hides only raw SQL and a database password that is
useless off the host. The 2026-10-16 design review (ADR-0009) found the split
overengineered for what it protects.

## Solution

The BFF and Data Service become one Hono application, the **Backend**: one
image, one process, one container. It serves the Admin API and the Mobile API
exactly as the BFF does today, and it reaches PostgreSQL in-process through a
data module that is the only code allowed to touch the database. The internal
HTTP hop, its token, its client, and its error translation disappear.

Nothing changes for the admin in the browser or for the learner's app: the
Admin API and Mobile API keep their routes, contracts, status codes, and
Problem Details codes. The one visible difference is that a PostgreSQL outage
now answers `503 database_unavailable` instead of `502
data_service_unavailable` or `504 data_service_timeout`.

The Backend keeps the AWS identity exactly as the BFF holds it today
(ADR-0006). ADR-0009 rejects a separate Storage Service and records the
accepted risk.

## User Stories

1. As the admin, I want every Admin API route to behave exactly as it does today, so that the merge costs me no relearning and no Admin UI change.
2. As the admin, I want to create a Draft Lesson, so that authoring works as before.
3. As the admin, I want to save a chapter and a Language's Lesson Text with one Save, so that ticket 05's behaviour survives the merge.
4. As the admin, I want to list, read, and edit Lessons, so that the catalogue and Lesson view keep working.
5. As the admin, I want to publish a Draft and receive its `major.patch` version, so that publication works as before.
6. As the admin, I want to delete a Draft and have its unused Media Assets marked `DELETED` and removed from storage, so that ticket 04's behaviour survives the merge.
7. As the admin, I want to create, list, and edit canonical Sources, so that citation management works as before.
8. As the admin, I want to attach Sources to a Lesson and remove them, so that Lesson Source references work as before.
9. As the admin, I want to request an Upload Intent, so that I can still upload MP3 files directly to S3.
10. As the admin, I want completion to validate the uploaded object and create Lesson Audio, so that only valid audio becomes playable.
11. As the admin, I want a transient storage failure at completion to leave the Media Asset `PENDING` and retryable, so that I can retry without re-uploading.
12. As the admin, I want a size or content-type mismatch to mark the Media Asset `FAILED` and delete the object, so that invalid media never becomes playable.
13. As the admin, I want to hear the current Lesson Audio of a Draft through a fresh Playback URL, so that I can check narration before publishing.
14. As the admin, I want every conflict (not editable, lifecycle conflict, version conflict, publication incomplete, Source URL conflict, and the rest) to keep its current status and Problem Details code, so that the Admin's in-page messages stay correct.
15. As the admin, I want a clear `503 database_unavailable` Problem Details when PostgreSQL is down, so that I know the failure is not my input.
16. As the admin, I want requests to fail within a bounded time when PostgreSQL is unreachable, so that the page never hangs.
17. As the learner, I want the Mobile API to list and read Published Lessons in my Language exactly as before, so that the merge is invisible to me.
18. As the learner, I want each Lesson's current audio to come with a fresh Playback URL, so that playback works as before.
19. As the developer, I want one feature to touch one data operation, one route, and their tests, so that Stage 4b tickets 06 to 08 and Stage 5 cost half as much.
20. As the developer, I want the data module to be the only package that depends on Drizzle and the PostgreSQL driver, so that the Backend's routes cannot reach the database by accident.
21. As the developer, I want data operations to return results or named outcomes, never HTTP responses, so that HTTP concerns live in one place.
22. As the developer, I want outcome-to-Problem-Details mapping to happen once, in the Backend's routes, so that there is no second translation table to keep in sync.
23. As the developer, I want default `pnpm test`, typechecking, and builds to need no Docker, PostgreSQL, or AWS credentials, so that the fast loop stays fast.
24. As the developer, I want route tests to keep stubbing the data module and using `FakeStorage`, so that today's route tests survive with small edits.
25. As the developer, I want the former Data Service HTTP tests to run against the Admin API with real PostgreSQL, so that they keep proving status codes and persistence together.
26. As the developer, I want schema and constraint tests to move unchanged with the data module, so that database invariants stay proven.
27. As the developer, I want the end-to-end tracer to run the Backend against real PostgreSQL with `FakeStorage`, so that the whole flow is proven without AWS.
28. As the developer, I want liveness to stay OK and readiness to report `503` while PostgreSQL is paused, so that health checks stay independent.
29. As the developer, I want `pnpm dev` to start PostgreSQL, run migrations, and start the Backend with Compose Watch, so that local development is one command as before.
30. As the developer, I want `db:generate` and `db:migrate` to keep working through the data module, so that schema changes follow the same committed-migration workflow.
31. As the developer, I want the name "Backend" everywhere (directory, package, Compose service, image, environment variables), so that no file still says BFF or Data Service for something that no longer exists.
32. As the developer, I want the Backend to drop `DATA_SERVICE_URL`, `DATA_SERVICE_TOKEN`, and `DATA_SERVICE_TIMEOUT_MS`, so that no configuration describes a hop that is gone.
33. As the operator, I want the Backend to keep rejecting static AWS access-key variables at startup, so that the Roles Anywhere rule keeps holding in the merged Backend.
34. As the operator, I want the one-shot migration and integration-test containers to receive no AWS profile or identity mounts, so that only the running Backend holds the identity.
35. As the operator, I want the Backend to close its database connections on shutdown, so that restarts are clean.
36. As a future reader, I want poc-context, the README, and the remaining Stage 4b tickets to describe the Backend, so that agents stop planning work for two services.

## Implementation Decisions

- **One Backend.** The BFF application becomes the Backend: one Hono app, one
  image, one process, one container, one listener for now. ADR-0007's split into
  a public and an admin listener remains Stage 6 step 0 and applies to the
  Backend.
- **Data library package.** The Data Service application becomes a library
  package and stops being a server. It is the only package that depends on
  `drizzle-orm` and `pg`. It keeps the schema, relations, committed
  migrations, Drizzle Kit configuration, the `migrate` command, and the
  schema-level integration tests. Its package `exports` expose only the data
  module API, so pnpm's strict `node_modules` keeps the Backend from importing
  Drizzle.
- **Data module API.** The package exports one factory that takes a database
  URL and a connection timeout and returns the data module: the operations the
  Backend uses today through the Data Service client (Lessons, Lesson Texts,
  Lesson Sources, Sources, Media Assets, Published Lessons, current Lesson
  Audio), plus a readiness check and a close. Operations return results or the
  outcome codes they already use (`lesson_not_found`, `lesson_not_editable`,
  `source_url_conflict`, and so on); they never build HTTP responses. Unique
  violations that the Data Service routes translated, such as a duplicate
  Source URL, become outcome codes inside the module.
- **One error mapping.** The Backend's routes map outcome codes to Problem
  Details. Every status and code the Admin API and Mobile API return today is
  preserved. The Data Service client, its error class, and the downstream
  error translation are deleted.
- **PostgreSQL outages.** The connection pool has a bounded connection timeout,
  configured by `DATABASE_TIMEOUT_MS` (default 2000, replacing
  `DATA_SERVICE_TIMEOUT_MS`). A connection failure or timeout answers `503`
  with code `database_unavailable`. `/ready` checks PostgreSQL within the same
  bound; `/health` never touches it.
- **Contracts.** Admin API and Mobile API contracts are unchanged, and the
  Admin's only change is the base-URL variable rename. Contract schemas used
  only by the internal hop (pending Media Asset creation, completion, Media
  Asset lookup, and similar) are deleted once nothing uses them.
- **Configuration.** The Backend requires `DATABASE_URL`, `ADMIN_API_TOKEN`,
  `AWS_REGION`, and `S3_BUCKET`. It still rejects `AWS_ACCESS_KEY_ID` and
  `AWS_SECRET_ACCESS_KEY`. `DATA_SERVICE_URL`, `DATA_SERVICE_TOKEN`, and
  `DATA_SERVICE_TIMEOUT_MS` are removed everywhere, including `.env.example`.
- **Naming.** `bff` becomes `backend` in the application directory, package
  name, Compose service, image tag, and scripts. `BFF_PORT` becomes
  `BACKEND_PORT` and `VITE_BFF_BASE_URL` becomes `VITE_BACKEND_BASE_URL`. The
  future `BFF_ADMIN_PORT` named by ADR-0007 is built as `BACKEND_ADMIN_PORT`.
  ADRs keep their wording; ADR-0009 maps the old names.
- **Image.** One Backend image on the glibc base with the pinned, checksummed
  signing helper, as the BFF image is today. The same image runs the Backend,
  the one-shot `migrate`, and the integration-test commands. The Data
  Service's Alpine image is deleted.
- **Compose.** Services become `postgres`, `migrate`, and `backend`; `hono-data`
  and `bff` are gone. `migrate` runs before `backend` starts, and `backend`
  becomes healthy on `/ready`. The development override publishes the Backend
  on `127.0.0.1:${BACKEND_PORT}` and watches the Backend and data package
  sources. The Roles Anywhere overlay targets `backend`. Root scripts
  (`db:generate`, `db:migrate`, `test:*`, `dev:live-s3`) retarget.
- **Shutdown.** The Backend closes the database pool on `SIGINT` and `SIGTERM`
  after the server stops, as the Data Service does today.
- **No schema change.** Migrations and the database are untouched.
- **Documentation.** Rewrite poc-context §8.11 and §9 to §18 (architecture,
  service boundaries, flows, repository shape, Drizzle ownership, API
  boundaries, deployment, security) and §24 and §27 for the Backend, then
  remove the ADR-0009 banners. Update the README and the data package README.
  Reword Stage 4b tickets 06 and 08: "one Data Service transaction" becomes
  "one data module transaction", and "the BFF passes X through as 409" becomes
  "the Backend maps X to 409".

## Testing Decisions

- A good test drives the Backend over HTTP and asserts what a client sees: the
  status, the Problem Details code, the response body, and persisted effects
  observed through later requests. Tests do not assert on module internals,
  SQL, or call order.
- **Seam 1, Backend app factory, default tier.** The renamed app factory takes
  a readiness check, the data module, and `Storage`. Route tests stub the data
  module with today's override pattern (every operation throws unless
  overridden) and use `FakeStorage`. They now stub outcome codes instead of
  Data Service errors and keep their status and Problem Details assertions.
  Prior art: the BFF's admin and mobile route tests, including media completion
  and upload.
- **Seam 1, Backend app factory, integration tier.** The former Data Service
  HTTP integration tests run against the Admin API with the real data module,
  real PostgreSQL, and `FakeStorage`. `/internal/lessons` and
  `/internal/sources` calls map onto `/api/admin/*` with the admin token.
  Calls to internal Media Asset routes, which have no Admin API equivalent,
  go through the real Upload Intent and completion flow. Prior art: the
  Lesson HTTP integration test and its integration-database helper.
- **Seam 2, schema and constraints.** The Lesson, Source, Media Asset, Lesson
  Audio, and deletion integration tests move unchanged with the data package.
- **Seam 3, end-to-end tracer.** `test:e2e` runs the Backend in-process with the
  real data module, real PostgreSQL, and `FakeStorage`, covering the existing
  completion, playback, transient-failure, invalid-object, cleanup, and
  deletion checks. Its readiness check pauses `postgres` instead of
  `hono-data` and expects `/health` OK and `/ready` `503`.
- The compiled-topology and container checks keep proving that only `backend`
  receives the AWS profile and identity mounts, and that `postgres` and
  `migrate` receive none.
- Tests for deleted code (the Data Service client and the downstream error
  translation) are deleted with it.
- The live S3 tracer and the Roles Anywhere identity proof are not rerun for
  this spec. Stage 4b ticket 09 runs them once on the merged Backend.

## Out of Scope

- Moving the AWS identity out of the Backend (rejected in ADR-0009).
- Bucket versioning and upload checksums (`.scratch/s3-hardening/`).
- The key-misuse alert (Stage 6 item 9).
- The public and admin listener split (Stage 6 step 0, ADR-0007).
- Stage 6 deployment: production Compose, Caddy, GHCR, CI, and the host.
- Any database schema or migration change.
- Any Admin API or Mobile API contract change beyond outage handling.
- The deferred STRIDE items (`.scratch/security-at-scale/issues/01`).
- Stage 4b tickets 06 to 08 themselves, which build on the Backend afterwards.

## Further Notes

- Decision record: ADR-0009. Glossary: poc-context §4 (Backend, Admin API,
  Mobile API).
- Order (poc-context §23): ticket 05 is committed; this spec comes next, then
  Stage 4b tickets 06 to 08, then ticket 09 on real S3, then Stage 5 and
  Stage 6.
- The Backend image is glibc because it runs the signing helper.

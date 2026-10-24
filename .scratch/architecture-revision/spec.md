# Architecture revision

Status: ready-for-agent

## Problem Statement

On 2026-10-21 an architecture review of the Backend, the data module, and the
API contracts found four places where a module's interface looked wider or
leakier than its job. Grilling kept three of them and dropped one (see Further
Notes). None of them changes what the Admin or the learner sees. Each one makes
the next feature cheaper to change and to test.

The review also confirmed ADR-0009. The project will not be split into
services, so module interfaces are not designed for an HTTP split.

## Solution

There are three refactors that keep behaviour unchanged, plus one follow-up,
with one ticket each. They go on branch `architecture-revision`, started from
`main` after PR #7 (Stage 4b) merges, and land as one squash-merged PR. The
Admin API and Mobile API keep their routes, contracts, status codes, Problem
Details codes, and details.

| Ticket | Change                                                | Blocked by |
| ------ | ----------------------------------------------------- | ---------- |
| 01     | Move the Backend's HTTP code out of the API contracts | None       |
| 02     | One refusal table for the data module's outcome codes | 01         |
| 03     | Let the data module decide a Media Asset's completion | 02         |
| 04     | Typed request validation, removing the routes' casts  | 01         |

## User Stories

1. As the admin and the learner, I want every Admin API and Mobile API route to behave exactly as before, so that the revision is invisible to me.
2. As the developer, I want `packages/api-contracts` to hold only request and response schemas, so that the Admin, the Backend, and the data module share contracts without sharing Hono.
3. As the developer, I want the data module to load no HTTP code, so that its rule against HTTP holds at runtime and not only in its source.
4. As the developer, I want each Backend middleware file to hold its own implementation, so that reading a middleware means reading one file.
5. As the developer, I want one import path for the contracts, so that no one has to know which entry point is safe for the browser.
6. As a future reviewer, I want ADR-0009 to record that module interfaces are not designed for an HTTP split, and when data tests may go below the interface, so that later reviews stop suggesting either.
7. As the developer, I want each outcome code's status and detail written once, so that a new outcome code costs one table row and typecheck tells me when I forget it.
8. As the developer, I want a route's deliberate exceptions to that mapping written at the top of the route file, so that an exception is easy to see and is never an accident.
9. As the developer, I want the rule that a mismatched upload fails for good to live with the other Media Asset status rules, so that every status decision is made in one transaction in one module.
10. As the admin, I want a mismatched upload still marked `FAILED` and its object still deleted, even when its target Lesson is also refused, so that invalid media can never become playable.
11. As the developer, I want each route's validated input to carry its schema's type, so that a contract change shows up in the routes at typecheck instead of being hidden by a cast.

## Implementation Decisions

### Ticket 01: the Backend's HTTP code moves into the Backend

- `packages/api-contracts/src/http.ts` dates from when the BFF and Data
  Service shared Hono helpers. It moves into the Backend, into the files that
  now only re-export it:
  - `middleware/request-id.ts` holds `requestId` and `RequestIdEnvironment`.
  - `middleware/logging.ts` holds `logging`.
  - `middleware/admin-auth.ts` holds `adminAuth` with its constant-time token
    comparison.
  - A new `middleware/validation.ts` holds `validateRequest` and
    `validateJson`.
  - `errors/problem-details.ts` holds `problem` and the status titles, next to
    `refuseWith`.
- The functions take the Backend's existing names: `requestId` rather than
  `assignRequestId`, `logging` rather than `logRequest`, and `adminAuth` rather
  than `requireBearerToken`.
- Hono's `Context<RequestIdEnvironment>` replaces the hand-written
  `HttpContext` type. A narrow type stays only where the validator's
  error-handling callback will not typecheck against `Context`.
- The contracts package keeps one entry point. `"."` points straight at
  `schemas.ts`, and `src/index.ts` and the `./schemas` entry are deleted. The
  Admin's `@ez-dk-citizen/api-contracts/schemas` imports become
  `@ez-dk-citizen/api-contracts`.
- The contracts package drops `hono` and `@hono/standard-validator`, leaving
  `zod`. The Backend gains `@hono/standard-validator`. Once Hono is gone from
  the contracts package's dependencies, pnpm's strict `node_modules` makes any
  later Hono import there fail, so nothing else is needed to stop the leak
  coming back.
- `src/index.test.ts` in the contracts package becomes `src/schemas.test.ts`,
  and its test script follows.
- ADR-0009 gains two lines:
  - Considered Options: "Design module interfaces for a later HTTP split:
    rejected. No service split is planned at this scale, and the data module's
    interface already returns contract-shaped results and outcome codes, so a
    later split would stay cheap."
  - Consequences: "Data package tests go below the data module interface only
    to inject faults, a forced rollback or a held lock, through the database
    handle."
- No new ADR is needed. poc-context §15 already says the contracts package
  holds the schemas.

### Ticket 02: one refusal table

- poc-context §10 says the routes map outcome codes "in one place", but today
  the mapping is repeated in each route. `refuseWith` is used in three of the
  six route files, and the other three use `if` chains. Some details are
  repeated in many routes, such as "Lesson was not found.".
- `errors/problem-details.ts` holds one table from each data module outcome
  code to the status and `detail` it has today. The table is typed as a
  `Record` over the outcome codes, which the Backend derives from the
  `DataModule` interface
  (`Extract<Awaited<ReturnType<DataModule[keyof DataModule]>>, string>`), less
  `change_kind_required`. A new outcome code without a row fails typecheck.
  The data package does not change.
- `refuse` answers from the shared table. `refuseWith(overrides)` keeps its
  shape and falls back to the shared table for any code it does not override.
- `detail` is part of the contract, because the Admin shows it as the error
  message (`apps/admin/src/shared/lib/backend.ts`). Two overrides are
  deliberate, and each is declared in its own route file:
  - Completion answers `lesson_text_not_found` with 409 (Stage 3 spec,
    ADR-0001). The table's 404 is Mobile's (Stage 2 spec).
  - Draft deletion answers `lesson_not_editable` with "Only Draft Lessons can
    be deleted." (Stage 4b spec). The table's detail is "Only Draft Lessons
    can be edited.".
- The `patchLesson` handler keeps its two refusals that carry an `errors`
  list: `change_kind_required`, which answers `422 validation_failed` with a
  field error, and `{ missing }`, which answers `409
  lesson_publication_incomplete`. It goes from nine branches to three.
- Problems that come from Storage (`storage_unavailable`, `storage_timeout`,
  and `upload_incomplete`) stay out of the table. `invalid_uploaded_media`
  stays out too, until ticket 03 makes it an outcome code.

### Ticket 03: the data module decides a Media Asset's completion

- Today the completion route sets the Media Asset's status itself, using three
  data module operations. `failMediaAsset` has one caller, and its lock and
  `PENDING` check repeat ones `completeMediaAsset` already makes. There is no
  race today, because `failMediaAsset` re-checks `PENDING` under a lock. The
  gains are that the interface is smaller and the status rules sit together.
- `completeMediaAsset(id, input, storedObject?)` takes the stored object's
  content type and size. The data module defines that type itself and does not
  import the Backend's `Storage`. The route passes it only when it read the
  asset as `PENDING`, because a READY retry or a FAILED asset needs no
  inspection.
- The mismatch check runs right after the status checks and before the
  Language, Lesson, and Lesson Text checks. That keeps today's order, in which
  a mismatched upload fails for good even when its target is also refused. A
  mismatch marks the asset `FAILED` in the same transaction and returns the
  new outcome code `invalid_uploaded_media`, which takes a row in ticket 02's
  table: 422 with today's detail.
- A `PENDING` asset with no `storedObject` throws, giving `500
  internal_error`. Only a caller bug can cause it, because a Media Asset never
  returns to `PENDING`.
- The route keeps `getMediaAsset`, the inspection, and its storage errors. On
  `invalid_uploaded_media` it deletes the object using the key it read, logs a
  failed delete as today, and refuses. poc-context §8.10's order holds: the
  asset is marked `FAILED`, then the object is deleted.
- `failMediaAsset` leaves the `DataModule` interface and the data package.
- In poc-context §10's Backend list, "object metadata validation" becomes
  "stored-object inspection for completion". The data module's list already
  says "domain outcomes".

### Ticket 04: typed request validation

- `validateRequest` throws away the schema's types
  (`as unknown as MiddlewareHandler<any, …>`). It probably did so because the
  contracts package emits declarations, and the inferred type cannot be named
  there. The Backend emits none, so after ticket 01 the reason is gone.
- `validateRequest` returns `sValidator(target, schema, hook)` without a cast,
  so `c.req.valid(...)` takes the schema's output type. Routes drop all 20
  `c.req.valid(...) as X` casts, and the request-type imports that only those
  casts needed.
- If Hono's inference fights a schema, such as one that refines or transforms
  its value, a cast is allowed only inside `middleware/validation.ts`, never
  in a route. If even that fails for a schema, the ticket notes it rather than
  putting the cast back in a route.

## Testing Decisions

- These refactors keep behaviour unchanged, so the existing tests are the
  proof. A good test drives the Backend over HTTP and asserts what a client
  sees: the status, the Problem Details code, and the body.
- Ticket 01's code is already tested through HTTP, except one branch. The
  Backend's app tests cover request IDs, logging, admin authentication, the
  body limit, and unmatched routes. Route tests cover `validation_failed` and
  `malformed_json`. The exception is `invalid_content_type`, which no test
  covers, so ticket 01 adds one Backend route test for it.
- Contract schema tests carry over unchanged under their new file name.
- Ticket 02 adds no tests. The route tests already assert each refusal's
  status and code, and many assert its `detail`. Typecheck guards that every
  outcome code has a row. A test that pinned every row would only repeat the
  table.
- Ticket 03 replaces tests rather than adding them. The mismatch rule now lives
  in the data module, so the real-PostgreSQL test proves it: "a size or
  content-type mismatch fails the Media Asset for good and deletes its object"
  in `media.integration.test.ts`. That test gains one case, in which a
  mismatched upload whose target is refused still answers 422 and is `FAILED`,
  because the order of checks is where this refactor could regress. The
  stubbed `media.complete.test.ts` keeps one case, in which
  `invalid_uploaded_media` deletes the object and answers 422, and loses its
  cases that stub `failMediaAsset` refusals.
- Ticket 04 adds no tests. Typecheck is the proof, and the existing suites
  show that behaviour has not changed.

## Out of Scope

- An HTTP split, or module interfaces designed for one (ADR-0009).
- Any Admin API or Mobile API contract change.
- Any database schema or migration change.
- Problems that come from Storage, in the refusal table.
- Stage 4b ticket 09 and PR #7.
- The Stage 6 split into a public and an admin listener (ADR-0007).

## Further Notes

- Source: the 2026-10-21 architecture review (an HTML report that is not
  committed). Parts it reviewed and left alone:
  - `patchLesson` is already deep.
  - HTTP-ready facades are rejected by ADR-0009.
  - `data-operations.ts` keeps Zod parsing and the mapping from PostgreSQL
    errors to outcome codes in one place.
- Grilling dropped the review's fourth candidate, testing the data module only
  through its interface. Three of the four data tests below the interface
  inject a forced rollback or a held lock through the database handle, and
  only a test can do that. ADR-0009 records the rule (ticket 01).
- Order: PR #7 merges first. Ticket 01 comes before 02 because both change
  `errors/problem-details.ts`. Ticket 03 needs 02's table. Ticket 04 needs only
  01.
- Glossary: poc-context §4.

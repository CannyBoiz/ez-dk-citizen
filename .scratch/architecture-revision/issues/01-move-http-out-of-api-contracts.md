# 01: Move the Backend's HTTP code out of the API contracts

**What to build:** `packages/api-contracts/src/http.ts` moves into the Backend
(spec: Ticket 01), so that the contracts package holds only schemas and the
data module stops loading Hono through it. Request ID, logging, and admin
authentication go into the Backend middleware files that now only re-export
them. Validation goes into a new `middleware/validation.ts`, and `problem`
joins `refuseWith` in `errors/problem-details.ts`. Each function takes the
Backend's existing name, and Hono's `Context` replaces the hand-written
`HttpContext`. The contracts package keeps one entry point, `"."`, which
points at `schemas.ts`, and the Admin imports from it. ADR-0009 gains two
lines: one rejects module interfaces designed for an HTTP split, and one
allows data tests below the interface only for fault injection. Typing the
routes' `c.req.valid(...)` results is ticket 04, not this one.

**Blocked by:** None. Start `architecture-revision` from `main` once PR #7 has
merged.

**Status:** resolved

- [x] `packages/api-contracts` has no `src/http.ts` or `src/index.ts`. Its `exports` has only `"."`, pointing at `schemas.ts`. Its runtime dependencies are `zod` alone.
- [x] `apps/backend/src/middleware/` and `errors/problem-details.ts` hold the implementations, and no Backend file only re-exports them
- [x] Nothing in `apps/backend` imports `@ez-dk-citizen/api-contracts` for anything but schemas and their types
- [x] The Admin imports `@ez-dk-citizen/api-contracts`, and nothing imports `@ez-dk-citizen/api-contracts/schemas`
- [x] One Backend route test proves that a JSON body without `Content-Type: application/json` answers `422 invalid_content_type`
- [x] ADR-0009's Considered Options rejects designing module interfaces for a later HTTP split
- [x] ADR-0009's Consequences says data package tests go below the data module interface only to inject faults (a forced rollback or a held lock) through the database handle
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:dev`, `pnpm test:integration`, and `pnpm test:e2e` pass
- [x] The Backend and Admin images rebuild with `--build`

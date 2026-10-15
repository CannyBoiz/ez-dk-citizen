# 03: Serve Sources from the data module in-process

**What to build:** The first slice of the merge. The Backend creates the data module from `DATABASE_URL` and `DATABASE_TIMEOUT_MS` (default 2000) and serves the Admin API's Sources routes (create, list, edit) through it, mapping outcome codes to the same statuses and Problem Details codes as today. When PostgreSQL is unreachable or the connection times out, any route that uses the data module answers `503 database_unavailable` within the timeout. Other routes keep calling the Data Service until tickets 04 and 05.

This ticket builds the integration tier of the Backend app seam (spec: Testing Decisions, Seam 1): the Backend app with the real data module, real PostgreSQL, and `FakeStorage`, run by `test:integration`. The former Data Service HTTP tests for `/internal/sources` move onto it as Admin API tests.

**Blocked by:** 01 — Rename the BFF to the Backend; 02 — Give the data package a data module API

**Status:** ready-for-agent

- [ ] Creating, listing, and editing Sources in the Admin behave as before, including `409 source_url_conflict` and `404 source_not_found`
- [ ] With PostgreSQL unreachable, a Sources request answers `503 database_unavailable` within `DATABASE_TIMEOUT_MS`
- [ ] Sources route tests in the default tier stub the data module and need no Docker
- [ ] The `/internal/sources` HTTP tests run as Admin API tests against real PostgreSQL in `test:integration`
- [ ] The Data Service client's Source methods and their stubs are deleted
- [ ] In Compose, the Backend receives `DATABASE_URL` and starts only after `migrate` succeeds
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:dev`, `pnpm test:integration`, and `pnpm test:e2e` pass

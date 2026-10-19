# 06: Retire the Data Service

**What to build:** The Backend is the only backend application (spec: One Backend, Compose, Image, Configuration, Shutdown). Delete the Data Service server and HTTP routes, the Data Service client, its error class and error translation, the contract schemas only the internal hop used, `DATA_SERVICE_URL`, `DATA_SERVICE_TOKEN`, `DATA_SERVICE_TIMEOUT_MS`, and the Data Service's Alpine image. The data package moves under `packages/` as a library that keeps its schema, migrations, Drizzle Kit configuration, `migrate` command, and schema-level tests. Compose runs `postgres`, `migrate`, and `backend`, and `migrate` and the integration-test commands run from the Backend image. `/ready` checks PostgreSQL within `DATABASE_TIMEOUT_MS`, and the Backend closes its database pool on `SIGINT` and `SIGTERM`.

**Blocked by:** 04 — Serve Lessons, Lesson Texts, and Lesson Sources in-process; 05 — Serve Media Assets, Lesson Audio, and the Mobile API in-process

**Status:** resolved

- [x] No source, script, Compose file, or example environment refers to the Data Service, `hono-data`, or `DATA_SERVICE_*`; ADRs and `.scratch` history keep their wording
- [x] Only the data package depends on `drizzle-orm` and `pg`; the Backend cannot import Drizzle
- [x] `pnpm dev` starts PostgreSQL, runs migrations, and starts the Backend with Compose Watch on the Backend and data package sources
- [x] `pnpm db:generate` and `pnpm db:migrate` work through the data package
- [x] The end-to-end tracer pauses `postgres` and sees `/health` OK and `/ready` `503`, then recovers
- [x] The container checks prove that `postgres`, `migrate`, and the test containers receive no AWS profile or identity mounts, and that `backend` still rejects static AWS access-key variables
- [x] `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:dev`, `pnpm test:integration`, and `pnpm test:e2e` pass

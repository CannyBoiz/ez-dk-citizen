# 01 — Bootable container-first service spine

**What to build:** Establish the smallest complete local-development path from
the public BFF through the private Data Service to PostgreSQL. A developer can
start a clean checkout through one container-first command, receive live source
updates, and distinguish process liveness from dependency readiness, while
future feature routes retain testable application and contract seams.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [x] Add the public BFF as an ESM, strict-TypeScript Hono workspace application with separate application-construction and process-startup boundaries.
- [x] Refactor the Data Service to expose the same testable application-construction seam without changing its database ownership or established schema behavior.
- [x] Add a tracked shared contracts workspace containing executable transport schemas and inferred TypeScript types, with no Drizzle schemas, database clients, or database row types.
- [x] Data Service `GET /health` reports liveness without querying PostgreSQL, while `GET /ready` succeeds only when PostgreSQL is reachable.
- [x] BFF `GET /health` reports liveness without contacting the Data Service, while `GET /ready` checks Data Service readiness through an injected dependency.
- [x] Health and readiness responses are validated against shared contracts, remain unauthenticated, and return `503` when their dependency path is unavailable.
- [x] Give both applications one Dockerfile with a writable development target and a compiled non-root runtime target, using the repository's pinned Node.js and pnpm conventions.
- [x] Keep the base Compose topology compiled and suitable for isolated integration workflows; place development targets, commands, Watch rules, and loopback publication in the automatically loaded local override.
- [x] Root `pnpm dev` runs Docker Compose Watch in the foreground and starts PostgreSQL, the one-shot migration service, the private ready Data Service, and then the BFF.
- [x] Compose Watch synchronizes only BFF and Data Service source plus generated migrations; shared contracts, package manifests, the workspace lockfile, and Dockerfiles rebuild affected services, while host dependency and compiled-output directories are never synchronized.
- [x] Both application containers use configurable `PORT=3000`; local Compose publishes the BFF on `127.0.0.1:${BFF_PORT:-3001}` and PostgreSQL on `127.0.0.1:${POSTGRES_PORT:-5432}` while leaving the Data Service private.
- [x] Local Compose supplies clearly labeled development-only defaults for PostgreSQL, application credentials, ports, and admin origins, starts without an `.env` file, and accepts ignored root `.env` overrides.
- [x] Container-specific database and Data Service URLs use Compose service names. Application startup, migration, and verification consume injected container configuration rather than searching the host filesystem.
- [x] Migration generation remains host-run, and only that Drizzle authoring path may load the optional root `.env`; root migration application executes inside the running development Data container.
- [x] Root type-check, build, and ordinary test commands remain host-run and Docker-free. No supported host application-runtime fallback or duplicate root Data/BFF development commands remain.
- [x] Normal stack teardown preserves the named development database volume.
- [x] A container-development smoke test starts an isolated merged development project without `.env`, waits for BFF readiness, verifies loopback publication, Data Service privacy, and declared Watch rules, then removes only its own resources.
- [x] The smoke test validates repository configuration rather than Docker Compose's internal synchronization implementation.
- [x] Existing isolated PostgreSQL integration behavior explicitly uses the compiled base topology and remains green without BFF credentials or development overrides.
- [x] Automated Docker-free tests exercise all four BFF/Data Service liveness and readiness outcomes through Hono's request boundary rather than private middleware functions.

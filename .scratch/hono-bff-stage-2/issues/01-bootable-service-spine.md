# 01 — Bootable public-to-private service spine

**What to build:** Establish the smallest runnable Hono service path from the
public BFF through the internal Data Service to PostgreSQL. A developer can
start both applications without port collisions and can distinguish process
liveness from dependency readiness, while future feature routes have testable
application factories and shared executable transport contracts to build on.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Add the public BFF as an ESM, strict-TypeScript Hono workspace application with separate application construction and process-startup boundaries.
- [ ] Refactor the Data Service to expose the same testable application-construction seam without changing its database ownership or established schema behavior.
- [ ] Add a tracked shared contracts workspace containing executable transport schemas and inferred TypeScript types, with no Drizzle schemas, database clients, or database row types.
- [ ] Make both services consume configurable ports with container default 3000; document host defaults of Data Service 3000 and BFF 3001.
- [ ] Data Service `GET /health` reports liveness without querying PostgreSQL.
- [ ] Data Service `GET /ready` succeeds only when PostgreSQL is reachable and returns `503` when it is not ready.
- [ ] BFF `GET /health` reports liveness without contacting the Data Service.
- [ ] BFF `GET /ready` checks Data Service readiness through an injected dependency and returns `503` when the complete dependency path is unavailable.
- [ ] Health and readiness responses are validated against shared contracts and remain unauthenticated.
- [ ] Root workspace type-check, build, and ordinary test commands include application and shared-package workspaces without requiring Docker.
- [ ] Automated tests exercise all four liveness/readiness outcomes through Hono's request boundary rather than private middleware functions.
- [ ] Existing PostgreSQL migration and integration behavior remains green.


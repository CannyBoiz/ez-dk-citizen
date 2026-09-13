# 09 — End-to-end Stage 2 tracer and workflow hardening

**What to build:** Prove the completed Stage 2 behavior through the real
containerized BFF, private Data Service, and migrated PostgreSQL path. A
developer can run one isolated tracer from authenticated content creation to
public localized mobile reading and use documented commands to verify the
entire implementation without risking development data.

**Blocked by:** 07 — Localized mobile Lesson reads; 08 — Predictable gateway failures and request tracing.

**Status:** ready-for-agent

- [x] One automated end-to-end test starts an isolated compiled PostgreSQL, migration, Data Service, and BFF stack and traverses their real HTTP boundaries.
- [x] The tracer authenticates an admin, creates a Draft Lesson, adds Thai Lesson Text, creates and attaches a Source with locators, publishes the Lesson, and reads it through mobile list and detail.
- [x] The tracer verifies Draft content is initially hidden, Published content becomes visible, Thai localization is selected, available Languages and Source locators are returned, and no speculative audio fields appear.
- [x] The tracer proves the BFF and Data Service use distinct credentials and propagates one request ID across the public response, internal request, and safe completion logs.
- [x] A clean-stack readiness test proves BFF liveness independently and BFF readiness only after the private Data Service and PostgreSQL are ready.
- [x] The compiled stack preserves health-based PostgreSQL-to-migration-to-Data-Service-to-BFF startup ordering and exposes only the BFF among application services.
- [x] The end-to-end and readiness workflows use their own Compose project, ports, and temporary database volume, and clean up deterministically without touching persistent development state.
- [x] The container-development smoke test from ticket 01 remains green with the completed Stage 2 credentials and configuration.
- [x] Root commands expose the container-first development runtime, containerized migration application, Docker-free quality checks, isolated PostgreSQL integration tests, and the full end-to-end tracer without restoring host application-runtime commands.
- [x] Workspace type-check, build, ordinary tests, the PostgreSQL integration suite, Data Service HTTP tests, BFF tests, container-development smoke test, and end-to-end tracer all pass through documented commands.
- [x] Developer documentation explains clean-checkout container startup, Compose Watch behavior, optional `.env` overrides, local-only credentials, ports and service privacy, schema generation and migration application, health/readiness, testing, shutdown, and persistent development data.
- [x] No object-storage SDK, Upload Intent, Media Asset or Lesson Audio route, OpenAPI layer, rate limiter, cache, Caddy configuration, production Compose override, CI/CD, or deployment automation is added.

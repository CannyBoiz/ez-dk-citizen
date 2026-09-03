# 09 — Runnable Stage 2 stack and end-to-end tracer

**What to build:** Make the complete Stage 2 stack reproducibly runnable through
root commands and local Docker Compose, then prove the real user-visible path
from authenticated content creation to public localized mobile reading across
the BFF, internal Data Service HTTP boundary, and migrated PostgreSQL.

**Blocked by:** 07 — Localized mobile Lesson reads; 08 — Predictable gateway failures and request tracing.

**Status:** ready-for-agent

- [ ] Provide a reproducible BFF container image following the repository's Node.js, pinned-pnpm, compiled-output, and non-root-runtime conventions.
- [ ] Local Compose starts PostgreSQL, applies committed migrations, starts the ready Data Service privately, and then starts the BFF only after Data Service readiness succeeds.
- [ ] Compose publishes only the BFF to `127.0.0.1:${BFF_PORT:-3001}` among the application services; the Data Service remains reachable by its private service name and container port.
- [ ] Both containers use configurable `PORT=3000`, and the BFF receives its Data Service URL, timeout, admin token, internal token, and admin-origin configuration through environment variables.
- [ ] Local Compose supplies clearly labeled non-secret development token defaults while application startup still rejects absent required token configuration outside that local convenience path.
- [ ] The tracked environment template documents all Stage 2 variables with placeholders; real environment files and production credentials remain ignored.
- [ ] Root commands expose separate Data Service and BFF development entry points, a concurrent development entry point, workspace-wide type-check/build/test, and explicit PostgreSQL integration and end-to-end workflows.
- [ ] Ordinary workspace tests remain Docker-free, and the existing isolated PostgreSQL foundation workflow does not begin depending on BFF credentials or unrelated services.
- [ ] One automated end-to-end test starts from migrated PostgreSQL and traverses real HTTP boundaries to authenticate an admin, create a Draft Lesson, add Thai Lesson Text, create and attach a Source, publish, and fetch the Lesson through mobile list and detail.
- [ ] The tracer verifies Published-only visibility, Thai localization, available Languages, Source locators, request correlation, and the absence of audio placeholder fields.
- [ ] A clean-stack readiness test proves BFF liveness independently and BFF readiness only after Data Service and PostgreSQL are ready.
- [ ] Workspace type-check, build, ordinary tests, the existing PostgreSQL integration suite, Data Service HTTP tests, BFF tests, and the end-to-end tracer all pass through documented commands.
- [ ] Developer documentation explains host and Compose startup, authentication headers, ports, health/readiness, test commands, and the local-only nature of development tokens.
- [ ] No object-storage SDK, Upload Intent, Media Asset or Lesson Audio route, OpenAPI layer, rate limiter, cache, Caddy configuration, production Compose override, CI/CD, or deployment automation is added.

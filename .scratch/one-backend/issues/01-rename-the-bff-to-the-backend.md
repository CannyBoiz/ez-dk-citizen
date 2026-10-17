# 01: Rename the BFF to the Backend

**What to build:** Every name for the BFF becomes "Backend" (spec: Naming; ADR-0009), before any behaviour changes, so later tickets speak the glossary. The application directory, package name, Compose service, image tag, development and Roles Anywhere Compose overlays, root scripts, test scripts, and container checks say `backend`. `BFF_PORT` becomes `BACKEND_PORT` and `VITE_BFF_BASE_URL` becomes `VITE_BACKEND_BASE_URL`, including `.env.example` and the Admin. The Data Service, its token, and its problem codes keep their names until ticket 06.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] No source, script, Compose file, or example environment still says `bff`, `BFF_PORT`, or `VITE_BFF_BASE_URL`; ADRs and `.scratch` history keep their wording
- [x] The Admin calls its page origin when `VITE_BACKEND_BASE_URL` is unset and the given URL when set
- [x] `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:dev`, `pnpm test:integration`, and `pnpm test:e2e` pass
- [x] The container checks still prove that only `backend` receives the AWS profile and identity mounts
- [x] The ticket's comment log notes the local `.env` variables the developer must rename

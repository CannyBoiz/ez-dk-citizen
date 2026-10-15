# 05: Serve Media Assets, Lesson Audio, and the Mobile API in-process

**What to build:** The remaining routes run on the data module. In the Admin API: requesting an Upload Intent, completing an upload (a transient storage failure leaves the Media Asset `PENDING` and retryable; a size or content-type mismatch marks it `FAILED` and deletes the object), and reading current Lesson Audio with a fresh Playback URL. In the Mobile API: listing and reading Published Lessons in a Language, each with a fresh Playback URL for its current audio. After this ticket the Backend sends nothing to the Data Service except its readiness check.

Ticket 04 also edits the Data Service client and the integration tier, so run 04 and 05 one after the other.

**Blocked by:** 03 — Serve Sources from the data module in-process

**Status:** ready-for-agent

- [ ] Upload Intent, completion, and current Lesson Audio keep today's statuses and Problem Details codes, including `media_asset_not_pending`, `media_asset_failed`, `media_asset_rebind_conflict`, `lesson_archived`, and `storage_unavailable`
- [ ] Mobile API responses are unchanged, and every Playback URL is freshly created for the current audio
- [ ] Route tests in the default tier stub the data module and use `FakeStorage`, and need no Docker
- [ ] The `/internal/media-assets` HTTP tests are replaced by Admin API tests that go through the real Upload Intent and completion flow with `FakeStorage` against real PostgreSQL
- [ ] The Data Service client has no operations left except what readiness needs
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:integration`, and `pnpm test:e2e` pass

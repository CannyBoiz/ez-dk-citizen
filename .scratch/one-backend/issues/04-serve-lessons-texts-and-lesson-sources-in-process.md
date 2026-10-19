# 04: Serve Lessons, Lesson Texts, and Lesson Sources in-process

**What to build:** The Admin API's Lesson routes run on the data module: create a Draft, list and read Lessons, save a chapter with a Language's Lesson Text in one Save, publish with a `major.patch` version, move through the lifecycle, delete a Draft, and attach or remove Lesson Sources. Deleting a Draft still marks unused Media Assets `DELETED` and removes their objects from storage. Every status and Problem Details code the Admin sees stays the same.

**Blocked by:** 03 — Serve Sources from the data module in-process

**Status:** resolved

- [x] Every Lesson, Lesson Text, and Lesson Source route keeps today's statuses and Problem Details codes, including `lesson_not_found`, `lesson_not_editable`, `lesson_lifecycle_conflict`, `lesson_version_conflict`, `published_lesson_conflict`, `lesson_publication_incomplete`, and `unsupported_language`, and `422 validation_failed` on `changeKind` when publishing without a change kind
- [x] Draft deletion removes from storage exactly the objects of Media Assets that no remaining Lesson Audio uses
- [x] Route tests in the default tier stub the data module's outcome codes and need no Docker
- [x] The `/internal/lessons` HTTP tests run as Admin API tests against real PostgreSQL in `test:integration`
- [x] The Data Service client's Lesson, Lesson Text, and Lesson Source methods and their stubs are deleted
- [x] `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:integration`, and `pnpm test:e2e` pass

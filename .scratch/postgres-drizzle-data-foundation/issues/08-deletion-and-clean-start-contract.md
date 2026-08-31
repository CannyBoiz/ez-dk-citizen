# 08 — Prove deletion behavior and the clean-start contract

**What to build:** A maintainer can run one command that recreates the complete migrated data foundation, exercises a representative Lesson graph, verifies safe deletion behavior and startup ordering, and cleans up without affecting normal development data.

**Blocked by:** 05 — Prove reusable Source citations; 07 — Prove localized Lesson Audio versioning.

**Status:** ready-for-agent

- [x] The root integration command starts isolated PostgreSQL, applies the committed migration through the one-shot service, runs the complete suite, and removes only test-specific state.
- [x] A representative graph loads bidirectionally through Drizzle: a Lesson with localized Lesson Texts, reusable Sources, historical and current Lesson Audio, associated Media Assets, and an unattached pending Media Asset.
- [x] Deleting a Lesson cascades to its Lesson Text, Lesson Source, and Lesson Audio rows without deleting shared Sources or referenced Media Assets.
- [x] Deleting a Source cascades only to its Lesson Source rows and leaves Lessons intact.
- [x] Deleting a referenced Language is rejected.
- [x] Deleting a Media Asset referenced by Lesson Audio is rejected, while deleting Lesson Audio leaves its Media Asset intact.
- [x] Starting the stack against an already migrated database is idempotent and does not duplicate Language rows.
- [x] A migration failure is observable as a failed one-shot service and prevents the compiled Data Service from starting.
- [x] Compose validation, Data Service type-checking and build, migration tests, constraint tests, and relational-query tests all pass through documented root commands.
- [x] Local PostgreSQL remains available for host-run hot reload, while production override behavior remains outside this ticket.

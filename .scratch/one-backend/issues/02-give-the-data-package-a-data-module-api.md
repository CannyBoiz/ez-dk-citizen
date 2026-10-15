# 02: Give the data package a data module API

**What to build:** Prefactor the data package so the Backend can use it in-process (spec: Data module API). One factory takes a database URL and a connection timeout and returns the data module: the operations the Data Service client offers today (Lessons, Lesson Texts, Lesson Sources, Sources, Media Assets, Published Lessons, current Lesson Audio), a readiness check, and a close. Operations return results or outcome codes and never build HTTP responses; unique violations the routes translate today, such as a duplicate Source URL, become outcome codes inside the module. The connection pool fails a connection attempt after the given timeout. The package `exports` expose only this API. The Data Service's own HTTP routes now call the module, so nothing changes for the BFF.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The data package's public entry is the data module factory and its types; Drizzle, the schema, and the pool are not exported
- [ ] Every Data Service route calls the data module and only maps outcome codes to Problem Details
- [ ] The Data Service's HTTP integration tests and schema-level integration tests pass unchanged
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:integration`, and `pnpm test:e2e` pass

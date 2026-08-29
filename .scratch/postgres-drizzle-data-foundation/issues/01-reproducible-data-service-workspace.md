# 01 — Make the Data Service a reproducible workspace package

**What to build:** A developer can install dependencies once from the repository root, run every supported Data Service workflow through root commands, build a reproducible container image, and start the compiled Hono service without relying on conflicting nested workspace state.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] One root pnpm workspace declares the application packages and owns the authoritative lockfile.
- [ ] Redundant nested workspace and lockfile ownership is removed without collapsing the Data Service package boundary.
- [ ] A frozen root install succeeds and resolves the Data Service dependencies from the authoritative lockfile.
- [ ] Root commands expose Data Service development, build, schema-generation, migration, and test workflows.
- [ ] The Data Service type-checks and builds successfully from the root workspace.
- [ ] The production start command executes compiled JavaScript rather than TypeScript source.
- [ ] The Data Service container image builds from the workspace, contains required runtime dependencies, and starts the compiled Hono process.
- [ ] Existing user-authored schema and configuration work is preserved while package ownership is consolidated.

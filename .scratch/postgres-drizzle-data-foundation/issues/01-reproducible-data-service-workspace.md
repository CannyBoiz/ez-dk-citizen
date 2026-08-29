# 01 — Make the Data Service a reproducible workspace package

**What to build:** A developer can install dependencies once from the repository root, run every supported Data Service workflow through root commands, build a reproducible container image, and start the compiled Hono service without relying on conflicting nested workspace state.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [x] One root pnpm workspace declares the application packages and owns the authoritative lockfile.
- [x] Redundant nested workspace and lockfile ownership is removed without collapsing the Data Service package boundary.
- [x] A frozen root install succeeds and resolves the Data Service dependencies from the authoritative lockfile.
- [x] Root commands expose Data Service development, build, schema-generation, migration, and test workflows.
- [x] The Data Service type-checks and builds successfully from the root workspace.
- [x] The production start command executes compiled JavaScript rather than TypeScript source.
- [x] The Data Service container image builds from the workspace, contains required runtime dependencies, and starts the compiled Hono process.
- [x] Existing user-authored schema and configuration work is preserved while package ownership is consolidated.

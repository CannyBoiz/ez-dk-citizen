# 02 — Establish the isolated PostgreSQL integration loop

**What to build:** A developer can use one root workflow to start a healthy local PostgreSQL 18 database, connect through the same database URL contract used by Drizzle, verify real database access, and tear down isolated test state without disturbing the persistent development database.

**Blocked by:** 01 — Make the Data Service a reproducible workspace package.

**Status:** ready-for-agent

- [ ] The local Compose definition is valid and starts PostgreSQL 18 successfully.
- [ ] PostgreSQL uses the canonical database name, user, and password variables supported by the official image.
- [ ] PostgreSQL publishes a localhost port for host-run development and reports healthy only when the configured database accepts connections.
- [ ] Normal local development data persists in a correctly mounted named volume across container restarts.
- [ ] Compose constructs the internal database URL while Drizzle-facing processes consume only that URL.
- [ ] A tracked environment example contains safe placeholders for every required local variable, and no real credentials are added to version control.
- [ ] One root integration command creates test-specific Compose state, waits for PostgreSQL health, proves a real connection, and cleans up its containers and volumes.
- [ ] The integration workflow cannot remove or overwrite the normal development volume.

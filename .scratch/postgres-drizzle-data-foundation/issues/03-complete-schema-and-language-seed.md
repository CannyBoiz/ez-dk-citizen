# 03 — Migrate the complete PoC schema and seed Languages

**What to build:** Starting with an empty local database, the committed Drizzle migration creates the entire PoC relational model, inserts the required Languages, and allows the compiled Data Service to start only after migration succeeds.

**Blocked by:** 02 — Establish the isolated PostgreSQL integration loop.

**Status:** ready-for-agent

- [x] Drizzle defines Lesson, Language, Lesson Text, Source, Lesson Source, Media Asset, and Lesson Audio using the confirmed domain names.
- [x] PostgreSQL enum types use the distinct Lesson Status and Media Asset Status names and approved values.
- [x] Generated identity integers, composite identities, foreign keys, checks, unique constraints, partial unique indexes, and timezone-aware timestamps match the parent specification.
- [x] Lesson Source uses Lesson and Source as its composite primary key and has no surrogate identifier.
- [x] Lesson Audio has the composite foreign key to Lesson Text required by ADR 0001.
- [x] Media Asset to Lesson Audio permits an unattached Media Asset and at most one associated Lesson Audio as required by ADR 0002.
- [x] Bidirectional Drizzle relationship metadata is defined for all seven tables in addition to database foreign keys.
- [x] One generated and reviewed baseline migration creates the complete schema from an empty database.
- [x] The baseline migration inserts exactly the canonical Danish, English, and Thai Language rows without relying on a separately invoked seed command.
- [x] A one-shot Compose migration service waits for PostgreSQL health and applies committed migrations through the canonical database URL.
- [x] The compiled Data Service waits for successful migration and starts against the migrated database.
- [x] A clean-database smoke test proves migration, Language seeding, and Data Service startup through the root integration seam.

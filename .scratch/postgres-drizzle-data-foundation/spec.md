# PostgreSQL and Drizzle Data Foundation

Status: ready-for-agent

## Problem Statement

The Danish citizenship learning application does not yet have a repeatable,
verified relational-data foundation. A partial Drizzle schema, Data Service,
Dockerfile, and local Compose definition exist, but they disagree with the
confirmed domain model, the Compose and image definitions do not currently form
a valid runnable stack, and there is no committed migration, Language seed,
Drizzle relationship metadata, or automated constraint coverage.

As a result, development cannot reliably start from an empty machine or
database, apply the same schema every time, and trust PostgreSQL to preserve the
Lesson, localized Lesson Text, reusable Source, Media Asset, and Lesson Audio
invariants needed by the PoC.

## Solution

Provide a complete local data-foundation slice owned by the Hono Data Service.
Consolidate package management under one pnpm workspace, make the local Compose
stack start PostgreSQL, run committed Drizzle migrations once PostgreSQL is
healthy, and start the compiled Data Service only after migration succeeds.

Implement the seven confirmed tables, their PostgreSQL enums, keys, checks,
indexes, delete behavior, and bidirectional Drizzle relationship metadata.
Generate and commit the initial migration, including the three initial
Languages. Add one high-level integration seam that provisions a fresh
PostgreSQL database through Compose, applies the real migration path, and
exercises observable database behavior through the Data Service's exported
Drizzle layer.

This solution creates the persistence foundation only. It does not add Data
Service CRUD routes, BFF behavior, object-storage integration, client features,
or production deployment configuration.

## User Stories

1. As a developer, I want one root pnpm workspace, so that I can manage the Data Service without switching package-management contexts.
2. As a developer, I want one authoritative lockfile, so that local, test, and container installs resolve identical dependency versions.
3. As a developer, I want root commands for development, build, schema generation, migration, and tests, so that the supported workflows are discoverable.
4. As a developer, I want a documented environment template with placeholders, so that I can configure local PostgreSQL without committing secrets.
5. As a developer, I want Drizzle to consume one canonical database URL, so that credentials cannot drift between duplicated configuration variables.
6. As a developer, I want a valid local Compose definition, so that I can start the database foundation reliably.
7. As a developer, I want PostgreSQL exposed on localhost during local development, so that host-run tools and hot-reloading code can connect to it.
8. As a developer, I want PostgreSQL data stored in a named local volume, so that normal container restarts do not erase my development data.
9. As a developer, I want PostgreSQL health checked before migrations run, so that migration failures do not depend on startup timing.
10. As a developer, I want migrations executed by a one-shot Compose service, so that schema application has a visible success or failure state.
11. As a developer, I want the Data Service to wait for successful migration, so that it never starts against a stale or empty schema.
12. As a developer, I want the local Data Service container to run compiled output, so that the container path is reproducible and catches build problems.
13. As a developer, I want the option to run the Data Service with hot reload on the host, so that ordinary development remains fast.
14. As a maintainer, I want generated SQL migrations committed and reviewable, so that schema history does not depend on schema push.
15. As a maintainer, I want an empty database to become usable from the committed migration alone, so that new environments are deterministic.
16. As a content administrator, I want Lessons stored independently from translations and audio, so that one Lesson can support several Languages and renditions.
17. As a content administrator, I want each Lesson identified by chapter and version, so that citizenship-study content can evolve without overwriting history.
18. As a content administrator, I want draft and archived Lesson versions to coexist, so that work in progress and historical content remain available.
19. As a learner, I want no more than one published Lesson version per chapter, so that the application cannot present competing current content.
20. As a maintainer, I want invalid chapter and version numbers rejected by PostgreSQL, so that corrupt Lesson identities cannot enter through any caller.
21. As a content administrator, I want Danish, English, and Thai available immediately, so that localized PoC content can be created after the first migration.
22. As a maintainer, I want Language codes capable of representing BCP 47 tags, so that later regional variants do not require a schema redesign.
23. As a content administrator, I want one localized Lesson Text per Lesson and Language, so that duplicate translations cannot conflict.
24. As a learner, I want every persisted Lesson Text to contain a meaningful title and body, so that incomplete records cannot reach a client.
25. As a content administrator, I want a canonical Source stored once, so that multiple Lessons can cite the same official document or webpage.
26. As a content administrator, I want Source publication dates to be optional, so that undated government webpages can still be represented accurately.
27. As a content administrator, I want a Lesson associated with many Sources and a Source associated with many Lessons, so that citations reflect the real study material.
28. As a content administrator, I want page ranges and Section References stored on the Lesson Source association, so that reusable Sources are not duplicated for different citations.
29. As a content administrator, I want citation locators to be optional, so that a Lesson can cite an entire Source when no narrower locator applies.
30. As a maintainer, I want invalid page numbers and reversed ranges rejected, so that citations remain coherent.
31. As a storage integrator, I want Media Asset identity to remain provider-neutral, so that the later storage-provider choice does not alter relational identity.
32. As a storage integrator, I want duplicate provider/container/object-key combinations rejected, so that one stored object has one Media Asset identity.
33. As a storage integrator, I want a pending Media Asset recorded before upload completes, so that an upload can be tracked without claiming usable audio exists.
34. As a storage integrator, I want creation and successful-upload timestamps to have distinct meanings, so that pending and completed uploads are distinguishable.
35. As a maintainer, I want invalid media sizes, durations, and blank content types rejected, so that unusable metadata cannot be persisted.
36. As a content administrator, I want several audio versions for the same Lesson and Language, so that corrected recordings preserve history.
37. As a learner, I want at most one current Lesson Audio per Lesson and Language, so that playback selection is unambiguous.
38. As a learner, I want Lesson Audio to require a matching localized Lesson Text, so that audio is never offered for a missing translation.
39. As a storage integrator, I want a Media Asset associated with at most one Lesson Audio, so that binary identity and rendition metadata cannot diverge.
40. As a storage integrator, I want pending or failed Media Assets allowed to remain unattached, so that incomplete uploads do not create Lesson Audio.
41. As a maintainer, I want deleting a Lesson to remove its owned texts, citations, and audio associations, so that orphaned Lesson data cannot remain.
42. As a maintainer, I want deleting a Source to remove only its Lesson Source associations, so that unrelated Lessons remain intact.
43. As a maintainer, I want referenced Languages and Media Assets protected from deletion, so that shared lookup values and stored-object metadata cannot be invalidated accidentally.
44. As a Data Service developer, I want bidirectional Drizzle relationships for all seven tables, so that later persistence queries can traverse the domain model consistently.
45. As a Data Service developer, I want timestamps stored with timezone awareness, so that data remains consistent across developer and deployment time zones.
46. As a maintainer, I want one command to provision a fresh database, migrate it, and run integration tests, so that the schema has a tight feedback loop.
47. As a maintainer, I want integration tests to exercise actual PostgreSQL behavior, so that PostgreSQL-specific constraints and partial indexes are verified rather than assumed.
48. As a maintainer, I want relational-query tests to use the exported Drizzle layer, so that ORM metadata and database constraints are verified through one high-level seam.
49. As a maintainer, I want failed migrations to prevent Data Service startup, so that migration errors are visible instead of producing runtime data failures.
50. As a future deployment operator, I want local-only port exposure clearly separated from production overrides, so that development convenience does not weaken deployment networking.

## Implementation Decisions

- The Hono Data Service remains the only application service that owns and directly accesses PostgreSQL. The BFF and clients do not import the database client.
- PostgreSQL 18, Drizzle ORM, and Drizzle Kit remain the selected persistence stack.
- Package management is consolidated into one root pnpm workspace declaring application packages. There is one root lockfile and root scripts delegate development, build, schema generation, migration, and test tasks to the Data Service.
- Redundant nested workspace and lockfile ownership is removed while preserving the Data Service package boundary.
- The local Compose stack contains PostgreSQL, a one-shot migration service, and the Hono Data Service.
- PostgreSQL publishes its port to localhost for development and persists data in a named volume. This Compose definition is explicitly local-development configuration.
- Compose waits for PostgreSQL health before starting migration. The Data Service starts only after migration exits successfully.
- The migration and Data Service containers use the same reproducible Data Service image. The runtime executes compiled JavaScript and includes the production dependencies required by Drizzle, PostgreSQL, and Hono.
- Hot reload remains a host-run development workflow that connects to the PostgreSQL port published by Compose; source bind mounts are not required for the container path.
- Compose accepts PostgreSQL database name, user, and password variables and constructs the internal database URL. Drizzle and the Data Service consume only the database URL.
- A tracked environment example contains non-secret placeholders. Actual environment files and credentials remain untracked.
- Drizzle Kit generates SQL migrations. Migrations are committed, reviewed, and applied through the migration command; schema push is not the normal workflow.
- The first committed migration creates the complete seven-table schema and inserts the required Danish, English, and Thai Language rows.
- PostgreSQL enums have domain-specific names: Lesson Status and Media Asset Status are distinct types rather than sharing an overloaded generic status type.
- Surrogate identifiers use PostgreSQL generated identity integers. Composite domain identities remain composite primary or unique keys as specified below.
- Database timestamps are timezone-aware. Creation timestamps default to the database clock.
- Lesson update timestamps also default on insertion, while the Data Service must explicitly advance the update timestamp whenever it changes a Lesson. No database update trigger is introduced.
- Lesson contains a generated identity, positive chapter, positive version, required Lesson Status, creation timestamp, and update timestamp.
- Lesson Status contains exactly DRAFT, PUBLISHED, and ARCHIVED.
- Chapter and version are unique together. A PostgreSQL partial unique index permits at most one PUBLISHED Lesson for a chapter while allowing multiple draft and archived versions.
- Language uses a BCP 47-compatible code of up to 35 characters as its primary key and a required unique name. Supported Languages remain data, not an enum.
- Lesson Text has the composite primary key of Lesson and Language. Its title and content are required and rejected when empty or whitespace-only.
- Deleting a Lesson cascades to its Lesson Text records. Deleting a referenced Language is restricted.
- Source has a generated identity, required unique URL, and nullable publication timestamp. Future publisher, retrieval, and display metadata are not introduced by this slice.
- Lesson Source is the many-to-many association between Lesson and Source and uses their two foreign keys as its composite primary key; it has no surrogate identifier.
- Lesson Source may contain nullable starting page, ending page, and Section Reference fields. All locators may be absent when the whole Source applies.
- Starting and ending pages must be positive when present, and an ending page cannot precede a starting page when both are present.
- Deleting a Lesson or Source cascades only to the corresponding Lesson Source associations.
- Media Asset stores metadata only; no MP3 bytes, credentials, or temporary signed URLs enter PostgreSQL.
- Media Asset contains a generated identity, required storage provider, storage container, object key, original filename, content type, positive size in bytes, optional positive duration in milliseconds, required Media Asset Status, creation timestamp, and nullable upload timestamp.
- Media Asset Status contains exactly PENDING, READY, FAILED, and DELETED and defaults to PENDING.
- Storage provider, storage container, and object key are unique together. The schema remains neutral between AWS S3 and Azure Blob Storage.
- Media Asset creation time is required immediately. Upload time remains null while pending and is set after successful object validation. Duration may remain unknown.
- Content type must be non-blank, but PostgreSQL does not restrict the table to one MIME type.
- Lesson Audio contains a generated identity, Lesson and Language identity, a unique Media Asset identity, positive audio version, current-version flag, and creation timestamp.
- Lesson Audio has a composite foreign key to the corresponding Lesson Text. A rendition therefore cannot exist before its localized text, as required by ADR 0001.
- One Media Asset may back zero or one Lesson Audio. A pending Media Asset may remain unattached, and Lesson Audio is created only after validation marks the Media Asset ready, as required by ADR 0002.
- Lesson, Language, and audio version are unique together. A PostgreSQL partial unique index allows at most one current Lesson Audio per Lesson and Language while permitting historical versions.
- Deleting a Lesson cascades to Lesson Audio. Referenced Languages and Media Assets are deletion-restricted. Deleting a Lesson Audio does not delete its Media Asset.
- Bidirectional Drizzle relationship metadata covers every relationship among Lesson, Language, Lesson Text, Source, Lesson Source, Media Asset, and Lesson Audio in addition to the database foreign keys.
- Existing partial schema, configuration, Docker, and Compose work is evolved in place. Unrelated user-owned changes and study materials are preserved.
- Production Compose overrides, private deployment networking, and production migration orchestration are intentionally deferred to the deployment phase.

## Testing Decisions

- The primary and intentionally singular test seam is a root-level PostgreSQL integration workflow. It provisions a fresh Compose database, applies the committed migration through the same one-shot migration service used by developers, then exercises the database through the Data Service's exported Drizzle layer.
- Tests assert externally visible relational behavior: accepted rows, rejected invalid operations, returned relations, cascade results, restriction errors, seed contents, and service startup ordering. They do not assert the internal arrangement of schema source files or snapshot generated TypeScript.
- The integration workflow uses isolated test-specific Compose state and cleans it up after execution so it cannot overwrite a developer's normal local volume.
- A successful clean-database migration proves all required tables, enum types, indexes, foreign keys, checks, and seed rows can be created from committed history.
- Re-running the normal startup path against an already migrated database must not recreate the schema or duplicate Language seed rows.
- Compose configuration is validated, PostgreSQL must become healthy, migration must complete successfully, and the compiled Data Service must start only afterward.
- Seed tests verify that `da`, `en`, and `th` exist with their canonical names after migration.
- Lesson tests verify positive chapter and version checks, chapter/version uniqueness, valid status values, timestamp defaults, and the one-published-version-per-chapter partial unique index.
- Lesson Text tests verify composite identity, required non-blank title and content, valid Lesson and Language references, and rejection when the localized parent identity is absent.
- Source tests verify URL uniqueness and acceptance of an unknown publication date.
- Lesson Source tests prove both directions of Source reuse, composite identity, optional locators, positive page checks, and ordered page ranges.
- Media Asset tests verify stable-object uniqueness, default PENDING status, creation and nullable upload timestamps, positive size and optional duration, non-blank content type, and rejection of invalid enum values.
- Lesson Audio tests verify positive versions, version uniqueness per Lesson and Language, unique Media Asset use, at-most-one current rendition, and rejection when no matching Lesson Text exists.
- Deletion tests verify cascading from Lesson to its owned Lesson Text, Lesson Source, and Lesson Audio rows; cascading from Source only to Lesson Source; and restrictions for referenced Languages and Media Assets.
- Drizzle relationship tests load representative data in both directions, including a Lesson with localized texts, reusable Sources, historical/current audio, and an unattached pending Media Asset.
- Migration failure must be observable as a failed migration service and must prevent the Data Service container from starting successfully.
- There is no prior automated-test convention in the repository. This feature establishes the first integration harness and keeps its public entry point at the root workspace.

## Out of Scope

- Data Service CRUD routes, request validation, API contracts, or repository/service methods beyond the database seam required by tests.
- Hono BFF implementation or direct database access from the BFF.
- Admin web and React Native features.
- Choosing AWS S3 or Azure Blob Storage.
- Upload Intent generation, object upload, object validation, playback URLs, or transfer of MP3 bytes.
- Automated ElevenLabs API integration or any TTS generation.
- Production Docker Compose overrides, Caddy, Hetzner provisioning, private production networking, GHCR, SSH deployment, or CI/CD.
- Authentication, authorization, learner accounts, progress synchronization, payments, recommendations, or subscriptions.
- Quiz, answer, attempt, learner-state, or playback-position tables.
- Additional media types, media transcoding, or multi-cloud replication.
- Database triggers for update timestamps or media lifecycle transitions.
- A source-mounted hot-reload container workflow; host-run development remains available.
- Reorganizing application packages beyond the agreed pnpm workspace consolidation and Data Service data foundation.
- Production data backfills, downgrade migrations, or rollback procedures; this is the initial PoC migration.

## Further Notes

- The current repository has a type-checking Data Service scaffold and a partial seven-table schema, but no generated migrations, language seed, Drizzle relationship declarations, or tests.
- The existing local Compose and Data Service image definitions contain structural and path inconsistencies and are not currently runnable as a complete stack. They are starting material, not authoritative behavior.
- ADR 0001 requires localized Lesson Text before Lesson Audio. ADR 0002 permits pending Media Assets without a Lesson Audio association. Implementations must satisfy both.
- The object-storage provider remains intentionally undecided. Stable Media Asset identity must therefore continue to use provider, container, and object key.
- This specification is large enough to split into tracer-bullet implementation tickets with explicit blocking relationships before implementation begins.

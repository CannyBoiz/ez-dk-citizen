# 04 — Prove Lesson localization and publication rules

**What to build:** The migrated database reliably stores versioned Lessons and complete localized Lesson Texts while PostgreSQL rejects invalid versions, competing published content, missing parents, and incomplete Lesson Texts.

**Blocked by:** 03 — Migrate the complete PoC schema and seed Languages.

**Status:** ready-for-agent

- [x] Integration tests create valid draft, published, and archived Lessons through the exported Drizzle layer.
- [x] PostgreSQL rejects non-positive chapters and versions and duplicate chapter/version pairs.
- [x] Multiple draft and archived versions for one chapter are accepted.
- [x] PostgreSQL rejects a second published Lesson for the same chapter while allowing published Lessons for different chapters.
- [x] Lesson creation and update timestamps receive database-clock defaults, and updates can explicitly advance the update timestamp without a trigger.
- [x] Seeded Language rows are queryable, BCP 47-compatible codes up to the approved length can be stored, and duplicate codes or names are rejected.
- [x] One Lesson Text per Lesson and Language is accepted, while duplicate composite identities and missing Lesson or Language references are rejected.
- [x] Null, empty, and whitespace-only Lesson Text titles or content are rejected by PostgreSQL.
- [x] Drizzle relational queries traverse Lesson to Lesson Text, Lesson Text to Lesson and Language, and Language to its Lesson Texts.
- [x] Referenced Languages cannot be deleted.

# 06 — Prove the Media Asset metadata lifecycle

**What to build:** The migrated database can track provider-neutral object metadata from pending upload onward, distinguish creation from successful upload, and reject identities or metadata that could not describe a usable stored object.

**Blocked by:** 03 — Migrate the complete PoC schema and seed Languages.

**Status:** ready-for-agent

- [ ] Integration tests persist a pending Media Asset without any Lesson Audio association.
- [ ] New Media Assets default to PENDING, receive a database-clock creation timestamp, and may have no upload timestamp or duration.
- [ ] READY, FAILED, and DELETED Media Asset Status values are accepted, while values outside the approved enum are rejected.
- [ ] Storage provider, storage container, and object key form a unique stable-object identity.
- [ ] Duplicate stable-object identities are rejected while the same object key in a different provider or container is accepted.
- [ ] Zero or negative sizes, zero or negative non-null durations, and null, empty, or whitespace-only content types are rejected.
- [ ] A positive size, optional positive duration, and non-MP3 content type can be stored without hard-coding a MIME-type allowlist.
- [ ] Creation and upload timestamps can represent pending and successfully validated objects without a database update trigger.
- [ ] Drizzle exposes the optional Media Asset to Lesson Audio relationship without requiring an associated rendition.

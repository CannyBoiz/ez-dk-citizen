# 05 — Prove reusable Source citations

**What to build:** A content administrator's data can store one canonical Source and reuse it across several Lessons, with relationship-specific page and Section Reference details that remain valid for PDFs, webpages, and whole-Source citations.

**Blocked by:** 03 — Migrate the complete PoC schema and seed Languages.

**Status:** ready-for-agent

- [x] Integration tests store a canonical Source once and associate it with multiple Lessons.
- [x] One Lesson can be associated with multiple Sources without duplicating either parent.
- [x] Duplicate Source URLs and duplicate Lesson/Source association identities are rejected.
- [x] Sources with known and unknown publication dates are both accepted.
- [x] Lesson Sources accept page-only, Section Reference-only, combined, and entirely absent citation locators.
- [x] Non-positive page values and an ending page before its starting page are rejected, while a single valid page bound is accepted.
- [x] Drizzle relational queries traverse Lesson to Sources through Lesson Source and Source to Lessons through the same association.
- [x] Deleting a Source removes its Lesson Source associations without deleting any Lesson.

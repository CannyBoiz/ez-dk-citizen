# 07 — Prove localized Lesson Audio versioning

**What to build:** A Lesson with localized text can retain historical audio renditions and expose one unambiguous current rendition, while PostgreSQL prevents audio without matching text or reuse of one Media Asset across renditions.

**Blocked by:** 04 — Prove Lesson localization and publication rules; 06 — Prove the Media Asset metadata lifecycle.

**Status:** ready-for-agent

- [x] Integration tests create Lesson Audio only after creating the matching Lesson Text and use a validated READY Media Asset for the successful fixture.
- [x] PostgreSQL rejects Lesson Audio when the corresponding Lesson and Language pair has no Lesson Text, satisfying ADR 0001.
- [x] An unattached pending or failed Media Asset remains valid on its own, satisfying ADR 0002 without introducing lifecycle triggers.
- [x] Several positive audio versions for one Lesson and Language are accepted and remain queryable as history.
- [x] Duplicate Lesson/Language/audio-version identities and non-positive audio versions are rejected.
- [x] At most one Lesson Audio can be current for a Lesson and Language, while other Languages and Lessons may each have their own current rendition.
- [x] One Media Asset can back at most one Lesson Audio, and a Lesson Audio always references exactly one Media Asset.
- [x] Drizzle relational queries traverse Lesson and Language to their audio renditions, Lesson Audio to localized Lesson Text, and Media Asset to its optional Lesson Audio.

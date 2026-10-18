# 06: Replace a Published version in one step

**What to build:** Publishing a Draft in a chapter that already has a Published Lesson becomes a **replacement**: one confirmation, and one data module transaction that archives the Published Lesson and publishes the Draft. The chapter is never left without a Published version.

Publication accepts `replacesLessonId`, the ID of the Published Lesson the admin expects to replace:

- If the chapter has a Published Lesson and `replacesLessonId` is missing or names any other Lesson, the result is `409 published_lesson_conflict`, as today. The same applies when `replacesLessonId` is sent and the chapter has no Published Lesson. A stale page therefore never archives the wrong Lesson.
- With a matching `replacesLessonId`, the replacement is refused with a new `409 lesson_unchanged` when the Draft's Lesson Texts (Language, title, content) and Lesson Sources (Source, page from, page to, section reference) are identical to the Published Lesson's. Audio is not compared, because an audio-only change goes straight onto the Published Lesson.
- Otherwise the Published Lesson becomes `ARCHIVED` and the Draft becomes `PUBLISHED` with the version computed from the chosen change kind (ticket 02), in one transaction. The publication prerequisites still apply.

The data module returns `lesson_unchanged` as an outcome code, and the Backend maps it to `409`.

In the Admin, the publish confirmation reads the Lesson list fresh when it opens. When the chapter has a Published Lesson, the action is labelled **Replace**, and the confirmation names both versions, for example "Archive version 2.1 and publish this Draft as 2.2?", with the version following the content/fix choice from ticket 02. The request carries `replacesLessonId`. Backend `409`s appear inside the confirmation, and afterwards the catalogue reflects both changes.

See the spec sections "The Lesson command" (publication rules) and "Admin" (Publication), and user stories 21–24.

**Blocked by:** 02 — Give versions at publication

**Status:** ready-for-agent

- [ ] A replacement with a matching `replacesLessonId` archives the Published Lesson and publishes the Draft with its computed version, in one transaction
- [ ] A missing or mismatched `replacesLessonId` while the chapter has a Published Lesson, or one sent while it has none, is `409 published_lesson_conflict` and changes nothing
- [ ] Identical Lesson Texts and Lesson Sources are `409 lesson_unchanged` and change nothing; a difference only in audio is still `lesson_unchanged`
- [ ] A failure partway leaves both Lessons as they were
- [ ] The Backend maps `lesson_unchanged` to `409` with its message
- [ ] The Admin labels the action Replace, names both versions, sends `replacesLessonId`, shows `409`s inside the confirmation, and makes no request when cancelled
- [ ] The fake-storage end-to-end tracer replaces a Published Lesson with a Draft: the old one becomes Archived, and the mobile list shows the new version
- [ ] Contract, Backend route, Admin API integration (real PostgreSQL), and whole-app tests cover the above

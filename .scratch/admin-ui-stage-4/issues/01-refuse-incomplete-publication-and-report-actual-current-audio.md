# 01: Refuse incomplete publication and report actual current audio

**What to build:** Two backend rules that the Admin will rely on, provable through the BFF API alone.

First, a Lesson cannot leave `DRAFT` for `PUBLISHED` unless it has a Thai (`th`) Lesson Text and at least one Lesson Source. Any client, including curl, gets a `409 lesson_publication_incomplete` Problem Details response with one `errors` entry per unmet requirement, and the Lesson stays `DRAFT` with an unchanged timestamp. The check runs inside the lifecycle transaction and is evaluated against the final state when structure edits and the transition arrive in one command. Thai audio and Danish/English Lesson Text stay optional.

Second, retrying completion of a Media Asset whose Lesson Audio another rendition has since superseded returns `200` with its original audio version and `isCurrent: false`. Today the BFF fails that retry with a `500`, because the shared completion contract only accepts `isCurrent: true` even though the Data Service returns the stored value. The retry must not create a version, promote the historical rendition, or demote the actual current audio.

See the spec sections "Publication prerequisites (Data Service)" and "Completion contract correction".

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Publishing a Draft without a Thai Lesson Text returns `409 lesson_publication_incomplete` with an error identifying the missing Thai Lesson Text
- [ ] Publishing a Draft without any Lesson Source returns `409 lesson_publication_incomplete` with an error identifying the missing Lesson Source
- [ ] Missing both returns one error entry per requirement
- [ ] A refused publication leaves the Lesson `DRAFT` with its `updated_at` unchanged
- [ ] Publishing with a Thai Lesson Text and at least one Lesson Source succeeds, without requiring audio or Danish/English Lesson Text
- [ ] A combined structure-and-status command is evaluated against its final state
- [ ] Existing lifecycle rules are unchanged: allowed transitions, terminal `ARCHIVED`, `published_lesson_conflict`, and `lesson_version_conflict`
- [ ] The BFF passes `lesson_publication_incomplete` through as `409` with its field errors
- [ ] The shared completion contract accepts `isCurrent` as a boolean
- [ ] An idempotent completion retry for superseded audio returns its original version with `isCurrent: false` through the BFF, while the newer rendition remains current and no new version exists
- [ ] Every existing Data Service, BFF, end-to-end, and live-S3 test or tracer that publishes a Lesson now creates the Thai Lesson Text and Lesson Source it needs
- [ ] The fake-storage end-to-end tracer at the BFF boundary shows publication refused, then accepted after adding the prerequisites, and a second upload superseding the first, followed by a retried completion of the first returning `isCurrent: false`
- [ ] Contract, Data Service HTTP (real PostgreSQL), and BFF route tests cover the behavior above

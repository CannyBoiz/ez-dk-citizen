# 08: Create new versions with shared audio

**What to build:** A Published or Archived Lesson offers **Create new version**. This creates a Draft of the same chapter that starts with everything the original has, so a correction only changes what needs changing. The copied audio shares the original Media Asset instead of copying the S3 object (ADR-0008).

Changes to Lesson Audio and completion:

- `lesson_audio`'s uniqueness on the Media Asset becomes uniqueness on Lesson, Language, and Media Asset, so one Media Asset may back Lesson Audio in several Lessons.
- Completion's idempotent path for a `READY` Media Asset looks for its Lesson Audio in the requested Lesson and Language. Finding none is still `409 media_asset_rebind_conflict`, and completion never creates a second Lesson Audio for a `READY` Media Asset.

Creating a Lesson also accepts `{ copyFromLessonId }`:

- One Data Service transaction copies the source's chapter, every Lesson Text, and every Lesson Source with its references.
- For each Language with a current `READY` Lesson Audio, it creates a current Lesson Audio at audio version 1 backed by the same Media Asset. Audio history is not copied.
- A Draft source is a new `409 lesson_not_copyable`, a missing Lesson is `404 lesson_not_found`, and success returns `201` with the Lesson detail.
- The BFF passes `lesson_not_copyable` through as `409`.

In the Admin, Published and Archived editors offer Create new version. It opens the form from ticket 07 with the chapter fixed and a read-only list of what will be copied: the Languages with Lesson Text, the number of Lesson Sources, and the Languages with current audio. Confirm creates the copy and opens its editor. The copied audio plays at once.

Saving a Lesson Text in a Language with copied audio shows the existing narration warning. A new upload in that Language becomes audio version 2.

Deleting a new version (ticket 04) leaves the shared Media Assets `READY` and their objects in storage, because the original still uses them.

See the spec sections "Creating Lessons and new versions", "Shared Media Assets (ADR-0008)", and "Admin" (New version), and user stories 10–14 and 25.

**Blocked by:** 04 — Delete Drafts instead of archiving them; 07 — Create Drafts through a form

**Status:** ready-for-agent

- [ ] Copying a Published or Archived Lesson creates a Draft of the same chapter with every Lesson Text, every Lesson Source and its references, and each Language's current audio at version 1 on the same Media Asset
- [ ] Copying a Draft is `409 lesson_not_copyable`; a missing Lesson is `404`
- [ ] The copy's admin audio read returns a playable URL with no upload
- [ ] Completion retried for the original upload still returns the original Lesson Audio; completion naming a Lesson and Language with no Lesson Audio for that Media Asset is `409 media_asset_rebind_conflict`
- [ ] A new upload on the copy becomes audio version 2 there and leaves the original's audio current
- [ ] Deleting the copy keeps the shared Media Assets `READY` with their objects in storage; deleting a Draft whose audio is not shared still removes it
- [ ] The Admin offers Create new version on Published and Archived Lessons only, shows the copy list with the chapter fixed, requires the confirmation, and opens the copy's editor
- [ ] Saving a Lesson Text in a Language with copied audio shows the narration warning
- [ ] The fake-storage end-to-end tracer copies a Published Lesson with audio, plays the copy's audio without an upload, and deletes the copy with the shared object kept in fake storage
- [ ] Contract, Data Service (real PostgreSQL), BFF route, and whole-app tests cover the above

# Stage 4b Admin Revisions

Status: ready-for-agent

## Problem Statement

Stage 4's manual acceptance on real S3 ran the whole authoring workflow in the
browser and showed where the agreed design works against the admin (the
developer, preparing Thai audio-first content):

- Chapter/version and each Lesson Text have separate Saves, so a numbering fix
  plus pasted text takes two clicks on two forms.
- **Create draft** writes a Lesson the moment it is clicked, and a Draft created
  by mistake can only be archived. It then stays forever as an Archived Lesson
  that was never published.
- Correcting a Published Lesson means starting a Draft from nothing: typing a
  chapter and version, re-pasting every Lesson Text, re-attaching every Source,
  and re-uploading audio. Replacing the Published version then takes two
  separate lifecycle actions, and the chapter has no Published version between
  them.
- A typo in a Source URL cannot be fixed. The Stage 4 workaround (create the
  correct Source, attach it, detach the wrong one) is impossible on Published
  Lessons, whose citations are immutable, so a broken link stays in front of
  the learner.
- Versions are integers typed when a Draft is created. Drafts hold numbers
  before anyone knows the order in which they will be published, and nothing
  stops a lower Draft from replacing a higher Published version.

## Solution

Each Language tab gets one Save that stores the chapter and that Language's
Lesson Text in one transaction. Creating a Draft opens a form, and nothing is
written until the admin confirms. A Published or Archived Lesson offers
**Create new version**, which copies its Lesson Texts, Lesson Sources, and
current audio into a new Draft of the same chapter. The copied audio shares the
original Media Asset instead of duplicating the S3 object (ADR-0008).

A Draft has no version. The admin gives it a `major.minor.patch` version when
publishing, pre-filled one patch above the chapter's highest Published or
Archived version, and the backend refuses anything not higher. When the chapter
already has a Published version, Publish becomes **Replace**: one confirmation
and one Data Service transaction archive the old version and publish the new
one. A replacement that changes no Lesson Text or citation is refused. There is
no undo. Rolling back means creating a new version from the Archived Lesson and
replacing again.

Drafts can be deleted, together with their Lesson Texts, citations, and Lesson
Audio. Audio that no other Lesson uses is marked `DELETED` and removed from S3.
Archiving a Draft is removed from the domain. Canonical Sources become
editable (URL and publication date), and a correction applies to every Lesson
that cites the Source. Every Admin confirmation moves from browser dialogs into
the page.

## User Stories

### Saving

1. As the admin, I want one Save on each Language tab that stores the chapter together with that Language's Lesson Text, so that a correction and pasted text take one click.
2. As the admin, I want that Save to be all-or-nothing, so that a rejected text never leaves a chapter change saved on its own, or the other way round.
3. As the admin, I want the chapter field above the Language tabs, marked Unsaved when changed and sent by whichever tab's Save I click, so that I can see that a pending chapter change goes with my next Save.
4. As the admin, I want a tab whose Language has no Lesson Text and blank fields to save only the chapter, so that I can fix the chapter from any tab.
5. As the admin, I want each Lesson Source's page and section references to keep their own Save, so that citation edits stay next to Attach and Detach.

### Creating Drafts

6. As the admin, I want **Create draft** to open a form instead of writing a Lesson immediately, so that nothing reaches the backend until I confirm.
7. As the admin, I want the form to show the chapter's latest version and its status, so that I know where the chapter stands before creating another Draft.
8. As the admin, I want an in-page confirmation before the Draft is created, so that I create it deliberately.
9. As the admin, I want Cancel to ask before discarding only when I have filled something in, so that an empty form closes immediately.
10. As the admin, I want **Create new version** on Published and Archived Lessons, so that I can correct a Lesson without retyping it.
11. As the admin, I want the new-version form to fix the chapter and list what will be copied, so that I know what the new Draft starts with.
12. As the admin, I want Confirm to copy every Lesson Text, every Lesson Source with its page and section references, and each Language's current audio, and then open the new Draft, so that I only change what needs changing.
13. As the admin, I want copied audio to play immediately without uploading the MP3 again, so that unchanged narration costs nothing.
14. As the admin, I want saving a Lesson Text on a new version to warn me when that Language has copied audio, so that I remember the narration may no longer match.

### Versions

15. As the admin, I want Drafts to have no version until I publish them, so that versions follow the order in which Lessons actually reach the learner.
16. As the admin, I want the version in the publish confirmation pre-filled one patch above the chapter's highest Published or Archived version (or 1.0.0 for a new chapter), so that a routine correction needs no typing.
17. As the admin, I want to raise the minor or major part instead, so that the version can signal a larger change.
18. As the admin, I want a version that is not higher than every Published and Archived version of the chapter refused with a message naming the highest one, so that a chapter can never go backwards.
19. As the admin, I want Drafts shown in the catalogue as "Draft" with their creation date, so that I can tell several Drafts of one chapter apart.
20. As the admin, I want Published and Archived Lessons shown with their `major.minor.patch` version, so that the version reads the way the learner will see it.

### Publishing and replacement

21. As the admin, I want Publish to become **Replace** when the chapter already has a Published version, with one in-page confirmation naming both versions, so that I see exactly what the learner will lose and gain.
22. As the admin, I want the replacement applied in one backend transaction, so that the chapter is never left without a Published version.
23. As the admin, I want a replacement refused when the Draft's Lesson Texts and citations are identical to the Published version's, so that I never publish a version that changes nothing.
24. As the admin, I want audio left out of that comparison, so that an audio-only change goes straight onto the Published Lesson instead of becoming a new version.
25. As the admin, I want to roll back by creating a new version from the Archived Lesson and replacing again, so that recovery uses the same workflow and keeps the audio.
26. As the admin, I want Archive offered only on Published Lessons, so that a Draft I no longer want is deleted rather than archived.
27. As the admin, I want to keep uploading audio to Published Lessons, so that text-first publishing still works.

### Deleting Drafts

28. As the admin, I want to delete a Draft after an in-page confirmation that lists what will be lost, so that I can discard a Draft I changed my mind about.
29. As the admin, I want deletion to remove the Draft's Lesson Texts, Lesson Source references, and Lesson Audio, while canonical Sources and audio shared with other Lessons stay, so that nothing outside the Draft is affected.
30. As the admin, I want audio that only the deleted Draft used removed from S3, so that abandoned narration does not pile up in storage.
31. As the admin, I want Delete disabled while an upload is Uploading or Finalizing, so that deletion cannot race the completion.
32. As the admin, I want the backend to refuse deleting a Published or Archived Lesson, and to refuse archiving a Draft, so that no client can bypass these rules.

### Sources

33. As the admin, I want to edit a Source's URL and publication date from the Source finder, so that I can fix a typo or a moved page.
34. As the admin, I want to edit a Source even when Published or Archived Lessons cite it, so that a broken link is fixed for the learner too.
35. As the admin, I want an in-page confirmation saying the correction applies to every Lesson that cites the Source, including Published and Archived Lessons, so that I know the change reaches beyond the Draft I'm working on.
36. As the admin, I want a duplicate URL to show the existing "Source already exists" message, so that I attach the existing Source instead.
37. As the admin, I want no Source delete, so that a citation can never disappear from a Published Lesson.

### Confirmations

38. As the admin, I want every confirmation shown inside the page (create, cancel, publish, replace, archive, delete, detach, Source correction, and leaving with unsaved forms or recoverable upload state), so that confirmations look consistent and can say what is at stake.
39. As the admin, I want closing the tab or refreshing to keep the browser's own warning, so that unsaved work is still protected where the page cannot show its own.

### Development

40. As the developer, I want whole-app tests covering every new Admin behavior through visible controls, so that the revisions are protected the same way as Stage 4.
41. As the developer, I want the opt-in live S3 tracer to delete a Draft with uploaded audio and prove the object is gone, so that the only new real-S3 call is tested against AWS.
42. As the developer, I want a manual acceptance walkthrough on real S3, so that Stage 4b is signed off on the real path.

## Implementation Decisions

### Lesson versions

- `lesson` replaces the integer `version` with `version_major`, `version_minor`, and `version_patch`, all absent while the Lesson is `DRAFT` and all present otherwise. Checks: major ≥ 1, minor ≥ 0, patch ≥ 0, and absence exactly when `status = 'DRAFT'`. Uniqueness becomes `UNIQUE(chapter, version_major, version_minor, version_patch)`; Drafts never collide because absent parts are distinct. The one-Published-per-chapter partial index is unchanged.
- The migration maps every existing version N to N.0.0 on Published and Archived Lessons and clears it on Drafts. Lessons archived as Drafts before this stage keep their version and their status.
- Contracts carry the version as a string, `"1.2.3"`, with no leading zeros and major ≥ 1. The admin Lesson summary and detail return `null` for Drafts; the mobile summary always has a version, because it lists Published Lessons only.
- Versions compare part by part (1.10.0 > 1.2.0). The parts carry no enforced meaning.

### The Lesson command

`PATCH /api/admin/lessons/:id` (and the internal Data Service command behind it) stays the one command for changing a Lesson. It accepts any combination of:

- `chapter`: Draft only.
- `text: { languageCode, title, content }`: upserts that Language's Lesson Text in the same transaction. Draft only. Blank fields are `422` with field errors; an unsupported Language is `422 unsupported_language`.
- `status`: `PUBLISHED` (from `DRAFT`) or `ARCHIVED` (from `PUBLISHED`). `DRAFT -> ARCHIVED` is now `409 lesson_lifecycle_conflict`.
- `version`: required with `status: "PUBLISHED"` and rejected otherwise (`422`).
- `replacesLessonId`: allowed only with `status: "PUBLISHED"`.

Everything in one command is applied atomically or not at all. Editing a non-Draft is `409 lesson_not_editable`, as today. The separate Lesson Text `PUT` route stays for API clients; the Admin stops using it.

Publication rules, all checked in the transaction that applies the change and evaluated on the final state:

- The Stage 4 prerequisites are unchanged: a Thai Lesson Text and at least one Lesson Source (`409 lesson_publication_incomplete`).
- The version must be higher than every Published and Archived version of the chapter, otherwise `409 lesson_version_conflict`, with a detail naming the highest version.
- If the chapter has a Published Lesson and `replacesLessonId` is missing, or names any other Lesson, the result is `409 published_lesson_conflict`, as today. The admin sends the ID it expects to replace, so a stale page never archives the wrong Lesson.
- With a matching `replacesLessonId`, the command is a **replacement**. It is refused with a new `409 lesson_unchanged` when the Draft's Lesson Texts (Language, title, content) and Lesson Sources (Source, page from, page to, section reference) are identical to the Published Lesson's. Audio is not compared. Otherwise the Published Lesson becomes `ARCHIVED` and the Draft becomes `PUBLISHED` with its version, both in this transaction.
- `replacesLessonId` when the chapter has no Published Lesson is also `409 published_lesson_conflict`.

The BFF adds `lesson_unchanged` to its known-conflict translations.

### Creating Lessons and new versions

- `POST /api/admin/lessons` accepts either `{ chapter }`, which creates a Draft with no version, or `{ copyFromLessonId }`, which creates a **new version**.
- A new version copies, in one Data Service transaction, the source Lesson's chapter, every Lesson Text, and every Lesson Source with its references. For each Language with a current `READY` Lesson Audio, it creates a current Lesson Audio at audio version 1 backed by the **same** Media Asset. Audio history is not copied. The source must be `PUBLISHED` or `ARCHIVED`; a Draft is a new `409 lesson_not_copyable`, and a missing Lesson is `404 lesson_not_found`.
- Both forms return `201` with the Lesson detail.

### Shared Media Assets (ADR-0008)

- `lesson_audio`'s `UNIQUE(media_asset_id)` becomes `UNIQUE(lesson_id, language_code, media_asset_id)`, so one Media Asset may back Lesson Audio in several Lessons.
- Completion's idempotent path for a `READY` Media Asset looks for its Lesson Audio in the requested Lesson and Language. Finding none is still `409 media_asset_rebind_conflict`. Completion never creates a second Lesson Audio for a `READY` Media Asset.
- The admin and mobile current-audio reads are unchanged; they already sign by Media Asset.

### Deleting Drafts

- The BFF adds `DELETE /api/admin/lessons/:id`, backed by a Data Service delete.
- One Data Service transaction locks the Lesson and deletes it with its Lesson Texts, Lesson Sources, and Lesson Audio. It marks `DELETED` every Media Asset that backed the deleted Lesson Audio and is no longer used by any remaining Lesson Audio, and returns those object keys to the BFF only. A non-Draft is `409 lesson_not_editable` with the detail "Only Draft Lessons can be deleted."; a missing Lesson is `404 lesson_not_found`.
- After the commit, the BFF deletes each returned object with the existing storage `deleteObject`. A storage failure is logged with the existing secret-safe storage logging and does not fail the request; the object stays behind under its `DELETED` row. The route returns `204` and never exposes object keys.
- `PENDING` Media Assets have no link to a Lesson and are untouched (ADR-0002).
- The BFF role already has `s3:DeleteObject` on `audio/*` and the bucket policy only restricts `PutObject`, so no infrastructure change is needed.

### Sources

- The BFF adds `PATCH /api/admin/sources/:id` with optional `url` and `publishedAt` (at least one), backed by a Data Service update with the same URL and date validation as creation.
- A duplicate URL is `409 source_url_conflict`; a missing Source is `404 source_not_found`. The update is allowed whichever Lessons cite the Source, and does not advance any Lesson's `updated_at`.
- No Source delete is added. Deleting would be unsafe anyway: `lesson_source.source_id` cascades.

### Admin

- **Editor.** On Drafts, the chapter field sits above the Language tabs without its own button and shows its own Unsaved marker. Each tab's Save sends one `PATCH` containing the dirty chapter (if any) and that tab's Lesson Text (if dirty and not entirely blank). The leave warning names "Chapter" and each "Lesson Text (code)" separately. The audio-mismatch warning, the upload gate on saved Lesson Text, and Publish being disabled while anything is dirty are unchanged.
- **Heading and catalogue.** Published and Archived Lessons read "Chapter 3, version 1.0.2". Drafts read "Chapter 3 · Draft, created 11 Oct 2026". The catalogue shows the same, with the existing chapter and status filters.
- **Create form.** **Create draft** opens a form asking for the chapter. It shows the chapter's highest Published or Archived version and its status, computed in the browser from the existing unpaginated Lesson list, or says the chapter has none yet. Confirm shows an in-page confirmation and then creates the Draft and opens its editor. Cancel closes at once when the form is empty and asks first otherwise.
- **New version.** Published and Archived editors offer **Create new version**. It opens the same form with the chapter fixed and a list of what will be copied: the Languages with Lesson Text, the number of Lesson Sources, and the Languages with current audio. Confirm creates the copy and opens its editor.
- **Publication.** Publish opens an in-page confirmation with a version input pre-filled one patch above the highest Published or Archived version (1.0.0 if none). When the chapter has a Published Lesson, read fresh from the Lesson list when the confirmation opens, the action is labelled **Replace**, the confirmation names both versions, and the request carries `replacesLessonId`. Backend `409`s appear inside the confirmation. Archive is offered only on Published Lessons; Delete only on Drafts.
- **Uploads.** Delete joins Publish and Archive in being disabled while an upload is Uploading or Finalizing. The other upload rules are unchanged.
- **Sources.** Each Source in the Source finder gets Edit, which opens an inline URL and date form whose dirty state counts in the leave warnings. Saving shows the in-page confirmation from story 35.
- **Confirmations.** One small in-page confirmation replaces every `window.confirm`: archive, detach, leaving with unsaved forms, and discarding upload recovery, plus the new create, cancel, publish, replace, delete, and Source-correction confirmations. The before-unload warning stays native.

## Testing Decisions

- Good tests assert externally observable behavior, as in Stage 4: status codes, response bodies, and persisted state for the backend, and what the admin can see and do in the rendered Admin. Prior art for each seam is the corresponding Stage 4 suite.
- **Shared contracts**: version strings accept `1.0.0` and `12.3.45` and reject `0.1.0`, `1.01.0`, `1.0`, and non-numeric parts. The admin summary accepts a `null` version and the mobile summary rejects one. The Lesson command accepts `text`, `version`, and `replacesLessonId` only in their valid combinations. Both create forms and the Source update request are covered.
- **Data Service HTTP against real PostgreSQL**:
  - Combined save: a blank text leaves the chapter unchanged.
  - Publication: refused without a version, or with a version not higher than every Published and Archived one, and succeeds otherwise.
  - Replacement: archives and publishes together. It is refused as `lesson_unchanged` when nothing differs, and as `published_lesson_conflict` when `replacesLessonId` is missing or stale. Audio differences alone do not count as changes.
  - Archiving a Draft is refused.
  - New version: copies texts, sources, and current audio at version 1 on the same Media Asset, and refuses a Draft source.
  - Delete: cascades. It marks only unshared Media Assets `DELETED`, leaves shared ones `READY` with the other Lesson's audio intact, returns only unshared keys, and refuses non-Drafts.
  - Completion: still idempotent with shared Media Assets.
  - Source update: covers the URL conflict and works on Sources cited by Published Lessons without advancing their timestamps.
  - Migration: maps N to N.0.0 and clears Draft versions.
- **BFF route tests with fake Data Service and fake storage**: Delete deletes exactly the returned keys, still returns `204` when storage fails, logs the failure safely, and never exposes keys. Source update passes through its outcomes. `lesson_unchanged` and `lesson_not_copyable` pass through as `409`.
- **Fake-storage end-to-end tracer at the BFF boundary**: extend the Stage 4 tracer so a Published Lesson with audio is copied, and the copy's audio plays without an upload. The copy is published as a replacement, so the old version becomes Archived. Then a Draft with its own uploaded audio is deleted: its object leaves fake storage, while an object it shared stays.
- **Admin whole-app tests** cover:
  - the per-tab Save, including the chapter riding along from another tab and all-or-nothing failure;
  - the Create form, latest-version display, in-page create confirmation, and cancel with and without content;
  - Create new version with its copy list;
  - the publish confirmation's pre-filled and edited version, Replace naming both versions with `replacesLessonId`, and backend `409`s inside the confirmation;
  - Archive only on Published and Delete only on Drafts, with the delete confirmation and disabled Delete during uploads;
  - Source editing with its confirmation and URL conflict;
  - every confirmation rendered in the page, with no `window.confirm` left.
- **Live S3 tracer** (opt-in): after the existing upload path, delete the Draft and assert that the object no longer exists in the bucket.
- **Manual acceptance** is a separate human ticket on real S3. The walkthrough covers:
  - create a Draft through the form, save chapter and text with one Save, upload, and publish with a version;
  - create a new version, change a text, and replace;
  - roll back by copying the Archived version and replacing;
  - delete a Draft with uploaded audio and confirm the object is gone from the bucket;
  - edit a Source that a Published Lesson cites and see the correction in that Lesson's mobile detail.
- Default tests, typechecking, and builds still need no AWS credentials, no Docker for the Admin suite, and no real browser.

## Out of Scope

- Undo or reversal of a replacement, `ARCHIVED -> PUBLISHED`, `PUBLISHED -> DRAFT`, and anything else that makes `ARCHIVED` non-terminal.
- Deleting Published or Archived Lessons, including Lessons archived as Drafts before this stage.
- Change notes, the learner-facing "Updated" date, and `updatedAt` in the mobile contract. Stage 5 adds these when the learner screen is designed.
- Enforced meaning for version parts, automatic renumbering, and versions on Drafts.
- Copying from Drafts, copying audio history, and copying S3 objects.
- Retrying or sweeping objects left behind after a failed storage delete, and discovering abandoned `PENDING` Media Assets.
- Source delete, Source deduplication beyond exact URL uniqueness, and counting the Lessons that cite a Source.
- An overall Save across Languages, autosave, and combining Lesson Source references into the tab Save.
- Everything Stage 4 already excluded that is not reversed above, including token persistence, durable upload sessions, pagination, and audio history browsing.
- Mobile app work (Stage 5) and deployment work (Stage 6).

## Further Notes

- This stage reverses these Stage 4 decisions: version editing on Drafts and the version conflict on creation (stories 15–16); separate structure and text saves and no overall Save (stories 20 and 66, in part); archiving Drafts (story 72); replacement as two actions (story 73); new Drafts without cloning or automatic versions (story 75); and Source update being out of scope.
- The decisions come from the interview on 2026-10-11. The Lesson, version, new version, replacement, and Source definitions are already updated in `docs/product/poc-context.md` §4, and §5, §6, and §23 describe the target model. ADR-0008 records the shared Media Assets.
- Mobile keeps identifying Lessons by ID. A replacement publishes a different Lesson ID for the chapter, so if Stage 5 wants resume position to survive a replacement it can key it by chapter. Nothing in this stage changes mobile identity.
- Fixture churn is expected and is not a regression: every test that creates a Lesson with a version, or publishes without one, must change. The admin's local database loses its Draft versions in the migration.
- Suggested ticket order: versions and the Lesson command (migration, contracts, publication rules, replacement) come first, because everything else depends on them. Shared Media Assets with new versions, Draft deletion, and Source update can then proceed in parallel. The Admin slices follow their backend: per-tab Save, Create form and new version, publication and replacement, delete, Source editing, and in-page confirmations. Then the tracer extensions, and manual acceptance last.

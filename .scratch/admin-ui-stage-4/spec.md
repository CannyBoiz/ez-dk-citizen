# Stage 4 Admin UI

Status: ready-for-agent

## Problem Statement

The BFF and Data Service can already create, localize, cite, publish, and
archive Lessons, and Stage 3 proved that an MP3 can travel directly from a
browser to private S3 and become the current Lesson Audio. None of this is
usable without curl, hand-built JSON, and direct database inspection. The
admin (the developer, preparing Thai audio-first content for one Thai-speaking
learner) has no browser screen for finding Lessons, pasting Lesson Texts that
were prepared elsewhere, citing canonical Sources, uploading the MP3 generated
manually in the ElevenLabs web app, hearing the current Lesson Audio, or
publishing the result.

Several backend gaps also block a safe authoring UI. A Lesson can currently
be published with no Thai Lesson Text and no Lesson Source, so an incomplete
Lesson can reach the learner catalogue. There is no admin way to read the
current Lesson Audio of a Draft or Archived Lesson or to obtain a Playback URL
for it; the only playback path is the public mobile route, which serves
Published Lessons only. The completion response contract still requires
`isCurrent: true`, so an idempotent completion retry for audio that another
rendition has since superseded cannot be represented, even though the Data
Service returns the true value.

Finally, a browser upload has failure modes that an HTTP API alone does not
resolve: the PUT can succeed while completion fails, the PUT outcome can be
uncertain, the token can expire mid-flow, and the admin can navigate away with
unsaved edits or a recoverable upload. Without deliberate UI behavior the admin
would lose work, create duplicate Upload Intents, or believe an upload
succeeded when it did not.

## Solution

Build a desktop-first React + Vite Admin that serves one trusted admin and
retains the existing single-admin bearer-token authentication. The admin
enters `ADMIN_API_TOKEN` at runtime; it is held only in memory. Through the
browser alone, the admin can find and list Lessons, create a `DRAFT` Lesson
and edit its chapter and version, create and edit Lesson Text in `da`, `en`,
and `th` (Thai first), find and create reusable Sources, attach and detach
Sources and edit Lesson Source references, upload an MP3 with visible
progress, see and play the current Lesson Audio, and publish the Lesson.
Archiving is available with an explicit, terminal confirmation.

Every save is explicit and separate: Lesson structure, each Lesson Text, and
each Lesson Source association. The UI tracks saved and unsaved state per
form, retains edits on failure, and warns before losing them. Uploads follow a
visible Uploading → Finalizing → Complete path with page-local recovery that
never reports false success and never silently starts a second Upload Intent.

The Data Service gains publication prerequisites (a Thai Lesson Text and at
least one Lesson Source), the BFF gains an authenticated admin current-audio
read with a fresh Playback URL for Lessons in any status, and the completion
contract reports the actual `isCurrent` value. The Admin runs locally under
Compose Watch at the origin already allowed by the BFF and the S3 CORS policy.
Acceptance is a manual browser walkthrough against the containerized backend
and real AWS S3. Hosted Admin deployment remains Stage 6 work.

## User Stories

### Connecting

1. As the admin, I want to enter `ADMIN_API_TOKEN` into a password field when I open the Admin, so that no token is baked into the built application.
2. As the admin, I want the token held only in memory, so that it never persists in local storage, session storage, cookies, or the Vite build.
3. As the admin, I want an invalid token to be rejected with a clear message on connect, so that I know immediately that I typed it wrong.
4. As the admin, I want a Disconnect action that clears the token, so that I can end a session deliberately.
5. As the admin, I want refreshing the page to require re-entering the token, so that the token never survives outside the running page.
6. As the admin, I want a `401` during any operation to prompt me for the token without discarding my unsaved edits, so that an expired or mistyped token never costs me work.
7. As the admin, I want to retry the interrupted operation after re-entering the token, so that I don't have to repeat the steps that led to it.

### Lesson catalogue

8. As the admin, I want to see every Lesson with its chapter, version, status, and available Languages, so that I can find what I'm working on at a glance.
9. As the admin, I want to filter Lessons by chapter, so that I can see all versions of one chapter together.
10. As the admin, I want to filter Lessons by status, so that I can focus on Drafts, Published Lessons, or Archived Lessons.
11. As the admin, I want filtering to happen instantly in the browser, so that browsing the small PoC catalogue feels immediate.
12. As the admin, I want to open a Lesson from the catalogue into its editor, so that I can inspect or change it.
13. As the admin, I want the catalogue to reflect the backend after I create, publish, or archive a Lesson, so that I never act on stale status.

### Lesson structure

14. As the admin, I want to create a `DRAFT` Lesson by entering chapter and version, so that I can start a new unit of study content.
15. As the admin, I want to edit a Draft's chapter and version and save them explicitly, so that I can correct numbering mistakes before publication.
16. As the admin, I want a conflict message when a chapter/version pair already exists, so that I can choose a free version number myself.
17. As the admin, I want structural fields to be read-only on Published and Archived Lessons, so that I cannot attempt an edit the domain forbids.

### Lesson Text

18. As the admin, I want Language tabs for Danish, English, and Thai, with Thai selected initially, so that the primary learner's Language is always the default.
19. As the admin, I want a plain-text title input and a plain-text content textarea, so that I can paste text prepared outside the Admin without formatting surprises.
20. As the admin, I want to save each Language's Lesson Text separately, so that saving Thai never submits half-finished Danish text.
21. As the admin, I want to see whether each Language's Lesson Text is saved, unsaved, or missing, so that I always know what the backend holds.
22. As the admin, I want blank titles or content rejected before and after submission, so that I never store an empty Lesson Text.
23. As the admin, I want my edits kept in the form when a save fails, so that a network or validation error doesn't erase what I pasted.
24. As the admin, I want a warning when I save a Lesson Text in a Language that already has current Lesson Audio, so that I remember the narration may no longer match and may need replacing.
25. As the admin, I want that warning to leave the current audio in place, so that I decide myself whether to upload a new rendition.
26. As the admin, I want Lesson Text fields read-only on Published and Archived Lessons, so that corrections go through a new Lesson version as the domain requires.

### Sources and Lesson Sources

27. As the admin, I want to search existing Sources by URL text, so that I reuse a canonical Source instead of duplicating it.
28. As the admin, I want to create a Source with its URL and an optional publication date, so that I can cite material the catalogue doesn't have yet.
29. As the admin, I want a native date picker for the publication date, where blank means unknown, so that government webpages without a date are recorded honestly.
30. As the admin, I want a clear message when a Source URL already exists, so that I select the existing Source instead.
31. As the admin, I want to attach a Source to a Draft Lesson, so that the Lesson cites its study material.
32. As the admin, I want to set page-from, page-to, and section reference on each Lesson Source and save them explicitly, so that the learner can find the exact passage.
33. As the admin, I want page ranges validated as positive and ordered, so that I cannot save an impossible reference.
34. As the admin, I want to detach a Source from a Draft Lesson, so that I can remove a wrong citation.
35. As the admin, I want to fix a wrong Source URL by attaching the correct Source and detaching the wrong one, so that canonical Sources used by other Lessons are never silently changed.
36. As the admin, I want Lesson Source editing disabled on Published and Archived Lessons, so that published citations stay immutable.

### Current Lesson Audio

37. As the admin, I want to see the current Lesson Audio for the selected Language, including audio version, original filename, and file size, so that I know which rendition the learner hears.
38. As the admin, I want a native audio player for the current Lesson Audio, so that I can listen to it before publishing.
39. As the admin, I want to hear current audio on Draft, Published, and Archived Lessons, so that I can review content in any lifecycle state.
40. As the admin, I want the audio panel to read current state from the backend after a reload, so that it never relies on what the page remembered.
41. As the admin, I want a clear "no audio yet" state when a Language has no current Lesson Audio, so that I know an upload is still needed.
42. As the admin, I want playback expiry or storage errors shown as an audio-specific error, so that they never block ordinary editing or discard my unsaved text.
43. As the admin, I want a **Reload audio** action that fetches fresh playback authorization, so that I can recover from an expired Playback URL on demand.
44. As the admin, I want Playback URLs not to refresh silently in the background, so that the page makes no hidden requests; manual reload and restarting playback are acceptable.

### Uploading audio

45. As the admin, I want to choose an MP3 file for the selected Language, so that I can upload the narration I generated in the ElevenLabs web app.
46. As the admin, I want files that are not `.mp3`, are empty, or exceed 50 MiB rejected before any request, so that I learn about invalid files instantly.
47. As the admin, I want upload blocked until the selected Language's Lesson Text is saved, so that audio never targets text the backend doesn't have.
48. As the admin, I want upload disabled on Archived Lessons, so that I cannot attempt audio the domain rejects.
49. As the admin, I want to upload audio to a Published Lesson, so that a Published Lesson can receive its first or replacement narration.
50. As the admin, I want visible progress while the MP3 uploads, so that I know a large file is still moving.
51. As the admin, I want distinct Uploading, Finalizing, Failed, and Complete states, so that I always know what stage the upload is in.
52. As the admin, I want only one active upload at a time, so that uploads never compete for the same Lesson and Language.
53. As the admin, I want the Lesson and Language locked while uploading or finalizing, so that the upload cannot silently target something else.
54. As the admin, I want publishing and archiving disabled for that Lesson while uploading or finalizing, so that lifecycle changes cannot race the completion.
55. As the admin, I want a successful upload to become the current Lesson Audio and appear in the audio panel, so that I can hear the new rendition immediately.
56. As the admin, I want to retry finalization without re-uploading when the MP3 reached S3 but completion failed, so that a transient backend error doesn't cost me another upload.
57. As the admin, I want a **Check upload / Retry finalization** action when the PUT outcome is uncertain, so that the existing object validation decides whether the upload landed.
58. As the admin, I want retries to reuse the same Media Asset and original Lesson and Language, so that a retry never creates a second Upload Intent or a second pending Media Asset.
59. As the admin, I want the Admin never to report success until completion succeeds, so that a green state always means the audio is really current.
60. As the admin, I want terminal failures such as a metadata mismatch explained as requiring a new upload, so that I don't retry something that cannot succeed.
61. As the admin, I want an explicit **Start new upload** action when recovery cannot succeed, so that starting over is always my decision.
62. As the admin, I want a warning before leaving the page during an upload or with recoverable upload state, so that I don't lose recovery by accident.
63. As the admin, I want confirmation before navigating to another Lesson with recoverable upload state, telling me that page-local recovery will be discarded, so that I leave knowingly.

### Unsaved changes

64. As the admin, I want a warning before navigating away or closing the tab with unsaved edits, so that pasted text is not lost by accident.
65. As the admin, I want no autosave, so that nothing reaches the backend until I choose to save it.
66. As the admin, I want no overall "Save everything" action, so that each save has a clear, reviewable scope.

### Publication and lifecycle

67. As the admin, I want a publication checklist showing whether a Thai Lesson Text and at least one Lesson Source exist, so that I know what is missing before I try to publish.
68. As the admin, I want Thai audio and Danish or English Lesson Text shown as optional, so that I can publish text first and add narration later.
69. As the admin, I want Publish disabled while any edit on the Lesson is unsaved, so that what I publish is exactly what I reviewed.
70. As the admin, I want the backend to refuse publication without a Thai Lesson Text or a Lesson Source, so that no client, including curl, can publish an incomplete Lesson.
71. As the admin, I want a clear message when another version of the chapter is already published, so that I know to archive it first.
72. As the admin, I want to archive a Draft or Published Lesson after a confirmation that explains archiving is terminal, makes the Lesson read-only, and removes a Published Lesson from the learner catalogue, so that I never archive by accident.
73. As the admin, I want replacing a published version to be two explicit actions (archive the current version, then publish the new Draft), so that each lifecycle change is visible and deliberate.
74. As the admin, I want to accept that the chapter has no Published version if the second action fails, so that recovery is simply retrying the publish.
75. As the admin, I want to correct published text by creating a new Draft with a chapter and version I type, pasting Lesson Texts, and attaching Sources, so that published versions stay immutable.

### Archived Lessons

76. As the admin, I want Archived Lessons to stay readable with their Lesson Texts, Lesson Sources, and current audio, so that history remains inspectable.
77. As the admin, I want every mutation disabled on Archived Lessons, so that the terminal state is obvious in the UI and not just enforced by the backend.

### Errors and diagnostics

78. As the admin, I want backend errors shown with their message and request ID, so that I can match a failure to BFF logs.
79. As the admin, I want validation errors attached to the fields they concern, so that I can fix the right input.
80. As the admin, I want Data Service or storage outages reported without losing form state, so that I can simply retry once the stack recovers.

### Development

81. As the developer, I want `pnpm dev` to start the Admin under Compose Watch at `http://127.0.0.1:5173`, so that the local runtime stays container-first like every other service.
82. As the developer, I want the Admin to reach the BFF through a configurable non-secret base URL, so that the same code can later point at the production BFF.
83. As the developer, I want the Admin to reuse the shared API contracts, so that request and response shapes cannot drift between the Admin and the BFF.
84. As the developer, I want whole-app tests that exercise the Admin the way I use it, so that refactoring components never breaks tests while behavior stays the same.
85. As the developer, I want a manual acceptance checklist against the containerized backend and real S3, so that Stage 4 is signed off on the real path and not only against fakes.

## Implementation Decisions

### Scope and users

- One trusted admin (the developer) and the existing single-admin bearer-token model. No multiple administrators, invitations, roles, permission management, or approval workflow.
- Admin controls use English. Lesson Text editing supports `da`, `en`, and `th`, with Thai selected initially.
- Authoring is desktop-first with a basically responsive layout; dedicated phone authoring is not an acceptance requirement.

### Admin application

- A new React + Vite + TypeScript workspace application, following the suggested `admin` app position in the repository shape, joins the existing pnpm workspace.
- It consumes the shared API-contract package for request and response types and validates BFF responses with the same Zod schemas the BFF uses. The browser bundle must not pull in server-only Hono middleware helpers; if tree-shaking does not keep them out, split the browser-safe schemas behind a separate export rather than duplicating them.
- The Admin's network access sits behind one small injected module with two responsibilities: authenticated BFF requests and the direct S3 PUT. The application receives it at construction, in the same way the BFF receives its Data Service client and storage. Tests substitute a fake; production uses the real one. This is the only new test seam.
- BFF requests send `Authorization: Bearer <token>` from in-memory state and parse Problem Details on failure, surfacing `code`, `detail`, `requestId`, and field `errors`.
- The S3 PUT uses `XMLHttpRequest` so the browser reports upload progress, which `fetch` cannot. It sends the File as the body with only the signed `Content-Type: audio/mpeg` and `If-None-Match: *` headers. The browser derives `Content-Length` from the File, because scripts cannot set that header; the Stage 3 live tracer already proves this signing arrangement.
- The Admin always declares `audio/mpeg` for a chosen `.mp3`, regardless of the operating system's reported file type, and checks the `.mp3` suffix and the 1-byte–50-MiB size before requesting an Upload Intent.
- The BFF base URL is a non-secret Vite build/runtime setting defaulting to the local BFF at `http://127.0.0.1:3001`. `ADMIN_API_TOKEN` is never a Vite variable.
- Screens: a Lesson catalogue (unpaginated list from the existing admin list API, filtered client-side by chapter and status, showing chapter, version, status, and available Languages); a Lesson editor (structure form, Language tabs with Lesson Text form, Lesson Source panel, current-audio panel with upload, publication checklist, lifecycle actions); and a Source finder (unpaginated list filtered client-side by URL text, plus Source creation). No router-level features are needed beyond moving between the catalogue and one Lesson.

### Authentication behavior

- A password field collects the token; connecting verifies it with an authenticated read and rejects it on `401`.
- The token lives only in memory. It is never written to local storage, session storage, IndexedDB, cookies, the URL, or the build. Refresh requires re-entry; Disconnect clears it.
- Any `401` opens a token re-entry prompt over the current screen without resetting editor state; after re-entry the admin may retry the failed operation. Upload recovery state (Media Asset ID and original target) survives the prompt.

### Editing and dirty state

- Lesson structure, each localized Lesson Text, and each Lesson Source association are separate forms with separate explicit saves and separate saved/unsaved indicators. There is no autosave, no overall Save, and no "Save everything and publish".
- A failed save keeps the form's edits and shows the error. Leaving with any dirty form triggers the browser's before-unload warning and an in-app confirmation for in-app navigation.
- After saving a Lesson Text in a Language whose current Lesson Audio exists, the Admin shows a non-blocking warning that the narration may no longer match and may need replacing. The audio stays current. No text revisions, audio-to-text revision linkage, checksums, stale-audio tracking, or automatic invalidation, detachment, or replacement.
- Structure, Lesson Text, and Lesson Source controls are disabled unless the Lesson is `DRAFT`. On `ARCHIVED` Lessons every mutation is disabled, including uploads and lifecycle actions; reading and audio playback remain available.

### Sources

- Canonical Sources support find, create, and reuse only; no canonical Source update or delete capability is added.
- The publication date uses a native date input. Blank sends `publishedAt: null`; a chosen date is sent as midnight UTC of that date in the existing ISO timestamp format, and displayed back as its UTC calendar date.
- A `source_url_conflict` response tells the admin that the Source already exists and points them to finding and attaching it.
- Only a Draft's Lesson Source page and section references are editable. Correcting a wrong URL means attaching the correct Source and detaching the wrong one.

### Publication prerequisites (Data Service)

- The lifecycle transition `DRAFT -> PUBLISHED` requires a Thai (`th`) Lesson Text and at least one Lesson Source. The Data Service checks both inside the same transaction that applies the transition, evaluated against the final state when structure edits and the transition arrive in one command.
- A missing prerequisite returns `409` with a new domain code, `lesson_publication_incomplete`, and one Problem Details `errors` entry per unmet requirement, so the client can show which one is missing. The BFF adds this code to its known-conflict translations.
- Thai Lesson Audio and Danish or English Lesson Text remain optional. Published Lessons may still receive their first Lesson Audio later.
- Existing rules are unchanged: allowed transitions, `ARCHIVED` as terminal, one Published version per chapter (`published_lesson_conflict`), and version identity conflicts.

### Publication UI

- The checklist mirrors the backend prerequisites (Thai Lesson Text saved; at least one Lesson Source saved) and lists Thai audio and Danish/English text as optional.
- Publish is disabled while any form on the Lesson is dirty or an upload is Uploading or Finalizing. The backend `409` remains the authority and its message is shown if the checklist and backend ever disagree.
- Replacing a published version is two explicit actions: archive the current version, then publish the new Draft. The UI does not chain them into a Replace action; a future atomic replacement must be a backend transaction.
- Corrections to published text use a new Draft with a manually entered chapter and version, manually pasted Lesson Texts, and manually attached Sources. No cloning and no automatic version allocation.
- Archiving is offered for `DRAFT` and `PUBLISHED` Lessons behind a confirmation explaining that it is terminal, makes the Lesson read-only, and removes a Published Lesson from the learner catalogue.

### Admin current-audio read (Data Service and BFF)

- The Data Service gains an internal read of the current `READY` Lesson Audio for one Lesson and Language, for any Lesson status. It returns the Media Asset ID, audio version, original filename, content type, size, nullable duration, and the object key the BFF needs for signing. It returns no audio when no current `READY` rendition exists, including when no Lesson Text exists in that Language. A missing Lesson is `404 lesson_not_found`; an unsupported Language is `422 unsupported_language`.
- The BFF adds an authenticated admin route, `GET /api/admin/lessons/:lessonId/audio/:languageCode`, which returns `{ "audio": null }` or an audio object with `mediaAssetId`, `audioVersion`, `originalFilename`, `contentType`, `sizeBytes`, `durationMs`, `playbackUrl`, and `playbackExpiresAt`. It never exposes provider, bucket, or object key.
- The route generates a fresh one-hour Playback URL with the existing storage interface and no extra S3 metadata request, responds with `Cache-Control: no-store`, and translates storage failures to the existing `503 storage_unavailable` / `504 storage_timeout` problems with the existing secret-safe storage logging. It does not reuse the public mobile route, which stays limited to Published Lessons.
- The Admin loads this route when a Language is shown in the editor, after a successful upload, and on **Reload audio**. Audio errors are confined to the audio panel and never reset editor state. There is no background refresh of Playback URLs.
- Audio history browsing, rollback, selecting historical renditions, and deletion are not added.

### Completion contract correction

- The shared Lesson Audio response in the completion contract changes `isCurrent` from the literal `true` to a boolean. The Data Service already returns the stored value. An idempotent completion retry for a superseded rendition returns its original audio version with `isCurrent: false`, without creating a version, promoting the historical rendition, or demoting the actual current audio.

### Upload workflow

The upload panel is a small state machine owned by the Admin page. It is not a durable upload session.

- **Idle**: a file may be chosen when the Lesson is `DRAFT` or `PUBLISHED`, the selected Language has a saved Lesson Text, that Lesson Text form is not dirty, and no other upload is active.
- **Uploading**: after a `201` Upload Intent, the Admin keeps the Media Asset ID together with the original Lesson and Language, then PUTs to S3 while showing progress.
- **Finalizing**: after a successful PUT, the Admin calls completion with the original Lesson and Language.
- **Complete**: completion returned `200`; the audio panel reloads current audio from the backend.
- **Failed, retryable**: completion failed with a transient outcome (Data Service or storage `502`/`503`/`504`, network failure, or `401` followed by token re-entry). **Retry finalization** calls completion again with the same Media Asset ID and target.
- **Failed, uncertain PUT**: the PUT errored or its outcome is unknown. **Check upload / Retry finalization** calls completion with the same Media Asset ID, letting the existing object validation decide. `409 upload_incomplete` means the object did not land, so recovery cannot succeed and the Admin offers **Start new upload**.
- **Failed, terminal**: `422 invalid_uploaded_media`, `409 media_asset_failed`, or a failed Upload Intent request. The Admin explains that a new upload is required and offers only **Start new upload**; it does not offer repeated finalization.
- The Admin never reports success before completion succeeds and never creates a second Upload Intent except through the explicit **Start new upload** action. At most one upload is active.
- During Uploading and Finalizing, the Lesson and Language are locked, and publishing or archiving that Lesson is disabled until Complete or a settled Failed state. Before-unload warns during an upload and while recoverable state exists; navigating to another Lesson with recoverable state requires confirmation that page-local recovery will be discarded.
- Refresh recovery, resumable or multipart uploads, and discovery of abandoned `PENDING` Media Assets are out of scope. Stage 3's abandoned-upload behavior is kept.

### Local runtime

- The Admin runs as a Compose Watch development service started by `pnpm dev`, serving Vite on `127.0.0.1:5173`. That origin is already in the local `ADMIN_ORIGINS` default and the S3 CORS local origin, so no BFF or infrastructure change is needed.
- Compose Watch syncs Admin source, and dependency manifests, shared contracts, and lockfile changes trigger rebuilds, matching the other services. Tests, typechecking, and builds stay host-run.
- Local browser acceptance against the containerized backend and real AWS S3 is sufficient. Hosted Admin deployment, Cloudflare Pages, production CORS, and production origin selection remain Stage 6 work.

## Testing Decisions

- Good tests assert externally observable behavior: HTTP status codes, response bodies, and persisted state for the backend; and what the admin can see and do in the rendered Admin (text, enabled and disabled controls, confirmations, and requests sent to the fake network module). They do not assert component structure, React state, hook usage, CSS, SQL statements, or middleware arrangement.
- **Shared contracts**: `isCurrent` accepts both booleans in the completion response; the admin audio response accepts `null` and the full audio object, requires a URL and expiry, and rejects leaked provider, bucket, or object-key fields and unknown fields. Prior art: the existing API-contract test suite.
- **Data Service HTTP against real PostgreSQL**: publishing without a Thai Lesson Text, without a Lesson Source, and without both returns `409 lesson_publication_incomplete` with one error per missing requirement and leaves the Lesson `DRAFT` with an unchanged timestamp. Publishing with both succeeds. A combined structure-and-status command is evaluated on its final state. The admin current-audio read returns the current rendition for Draft, Published, and Archived Lessons, returns none when no current `READY` rendition or Lesson Text exists, never returns superseded renditions, and translates missing Lessons and unsupported Languages. Prior art: the Lesson HTTP and Lesson Audio integration suites.
- **BFF route tests with fake Data Service and fake storage**: the admin audio route requires authentication, composes the response with one Playback URL generation and no metadata request, sets `Cache-Control: no-store`, omits storage identity, and maps storage and Data Service failures safely. `lesson_publication_incomplete` passes through as `409` with its field errors. A completion retry returning `isCurrent: false` is returned rather than failing response parsing. Prior art: the existing BFF Hono route suite.
- **Fake-storage end-to-end tracer at the BFF boundary** (real Data Service client, real Data Service, freshly migrated PostgreSQL, injected fake storage): extend the existing tracer so publishing is refused until Thai Lesson Text and a Lesson Source exist; the admin audio read works on a Draft; a second upload supersedes the first; a retried completion of the first returns `isCurrent: false` while the second remains current; and the audio remains readable after archiving. This is the highest backend seam.
- **Admin whole-app tests** with Vitest, Testing Library, and jsdom. The entire Admin is rendered with a fake network module, and tests drive it only through visible, accessible controls. Coverage includes token entry, rejection, Disconnect, and `401` re-entry that keeps unsaved edits and allows retry; catalogue filters; Draft creation and version-conflict display; per-form dirty indicators, failure retention, and navigation warnings; the Thai-first Language tabs; the audio-mismatch warning on text save; Source search, creation with blank and chosen dates (midnight UTC), URL-conflict handling, and Lesson Source edit, attach, and detach; the publication checklist, disabled Publish while dirty, and the displayed backend `409`; archive confirmation and read-only Archived Lessons with playable audio; the audio panel's no-audio, playing, error, and **Reload audio** states; and every upload state transition. The upload transitions cover client-side file rejection, progress display, completion retry reusing the same Media Asset ID and target, uncertain-PUT check, `upload_incomplete` leading to **Start new upload**, terminal failures offering only **Start new upload**, no second Upload Intent without that explicit action, the target lock, and disabled lifecycle actions during Uploading and Finalizing.
- No separate unit tests for the upload state machine or individual components. The whole-app seam is the only Admin seam.
- The Admin tests use Vitest because it runs natively on Vite and handles JSX and jsdom. The other workspaces keep Node's built-in test runner, and the root `pnpm test` runs the Admin suite alongside them.
- **Manual acceptance** is a separate human ticket. Using only the browser against the containerized backend and real AWS S3, the admin walks through: find and list Lessons; create a Draft and edit chapter/version; create and edit Lesson Texts; find and create Sources; attach, detach, and edit Lesson Sources; upload an MP3 with visible progress; play the current Lesson Audio; and publish. The walkthrough also spot-checks archive confirmation and a finalization retry. The existing opt-in live S3 browser tracer remains the automated proof of direct S3 transfer.
- Default tests, typechecking, and builds require no AWS credentials, Docker for the Admin suite, or a real browser.

## Out of Scope

- Multiple administrators, invitations, roles, permission management, approval workflows, or any authentication model other than the single runtime-entered admin token.
- Persisting the token anywhere, including browser storage, cookies, or the build.
- Rich-text, Markdown, or WYSIWYG editing; text import tools; spellchecking or translation assistance.
- Autosave, an overall Save, "Save everything and publish", or any combined multi-form submission.
- Lesson Text revisions, linking audio to text revisions, checksums, stale-audio tracking, or automatic audio invalidation, detachment, or replacement.
- Cloning Lessons, automatic version allocation, or an atomic "Replace published version" action. A future atomic replacement must be a backend transaction.
- Canonical Source update or delete, Source deduplication beyond exact URL uniqueness, and Source title, publisher, or retrieval-date fields.
- Audio history browsing, rollback, selecting historical renditions, audio deletion, and Media Asset `DELETED` behavior.
- Background or automatic Playback URL refresh.
- Refresh recovery, resumable or multipart uploads, durable upload sessions, concurrent uploads, and discovery or cleanup of abandoned `PENDING` Media Assets.
- Durable binding of an Upload Intent to its Lesson and Language.
- Pagination, title or full-text search, and server-side filtering.
- Dedicated phone authoring as an acceptance requirement.
- Hosted Admin deployment, Cloudflare Pages, production CORS or origin configuration, Caddy, GHCR, GitHub Actions, and other Stage 6 deployment work.
- Automated browser-driven end-to-end tests of the Admin, and new browser-automation dependencies.
- Mobile app work (Stage 5), ElevenLabs API automation, quiz, learner accounts, payments, and server-synchronized progress.

## Further Notes

- The BFF already exposes the admin routes the Admin needs for Lessons, Lesson Texts, Sources, Lesson Sources, Upload Intents, and completion, and already allows the local Admin origin through CORS. Stage 4 backend work is limited to publication prerequisites, the admin current-audio read, and the `isCurrent` contract correction.
- Today the BFF would fail an idempotent completion retry for superseded audio with a `500`, because the response schema rejects the `isCurrent: false` that the Data Service correctly returns. The contract correction fixes a live defect, not only a type.
- Adding publication prerequisites changes existing behavior. Data Service, BFF, end-to-end, and live-S3 tests that publish a Lesson without a Thai Lesson Text or Lesson Source must add them. Updating these fixtures is part of the prerequisite work, not a regression.
- The S3 CORS policy in `../cannyboiz-devops-hub/terraform/ez-dk-citizen/` already allows `PUT` from `http://127.0.0.1:5173`. Playback through a plain `<audio>` element needs no CORS, so no infrastructure change is expected. If the player ever needs `crossorigin` access, that becomes an infrastructure ticket.
- ADR-0001 (Lesson Text before audio) is enforced in the UI by requiring the selected Language's Lesson Text to be saved before upload. ADR-0002 (pending Media Assets without Lesson Audio) is why abandoned uploads are harmless. ADR-0003 (container-first local runtime) places the Admin under Compose Watch. ADR-0005 (direct client–S3 transfer) is preserved: the Admin PUTs and plays directly against S3. No ADR is contradicted.
- The publication-prerequisite rule and the admin current-audio read are domain decisions confirmed in the Stage 4 interview and recorded in `docs/product/poc-context.md`. Consider recording the publication prerequisites as an ADR if they are ever questioned, since they change what "publishable" means.
- Suggested ticket order: contract correction and backend changes (prerequisites, admin audio read, tracer extension) can proceed in parallel with the Admin scaffold and Compose service. The Admin feature slices build on the scaffold, and the manual acceptance ticket comes last.

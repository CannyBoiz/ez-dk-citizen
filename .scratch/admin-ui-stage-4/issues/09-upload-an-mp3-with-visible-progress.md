# 09: Upload an MP3 with visible progress

**What to build:** The normal upload path. For the selected Language on a Draft or Published Lesson, the admin chooses an MP3 generated in the ElevenLabs web app. The Admin rejects files that do not end in `.mp3`, are empty, or exceed 50 MiB before any request, and allows upload only when that Language's Lesson Text is saved and not dirty. It then requests an Upload Intent, keeps the Media Asset ID together with the original Lesson and Language in memory, and PUTs the file directly to S3 through `XMLHttpRequest` with visible progress. The PUT sends only the signed `Content-Type: audio/mpeg` and `If-None-Match: *` headers and lets the browser derive `Content-Length`. The panel then shows Finalizing, calls completion with the original target, and on success shows Complete and reloads the current audio from the backend.

Only one upload is active at a time, and the Lesson and Language are locked while Uploading or Finalizing. Upload is disabled on Archived Lessons. Failure recovery is ticket 10; here a failure only needs to surface as a Failed state without reporting success.

See the spec section "Upload workflow" and user stories 45–55 and 59.

**Blocked by:** 08 — Show and play the current Lesson Audio

**Status:** resolved

- [x] Non-`.mp3`, empty, and over-50-MiB files are rejected before any request
- [x] Upload is unavailable until the selected Language's Lesson Text is saved and not dirty, and unavailable on Archived Lessons
- [x] The Upload Intent always declares `audio/mpeg` with the file's name and exact size
- [x] The S3 PUT reports progress, sends the signed headers except `Content-Length`, and never passes through the BFF
- [x] The panel shows Uploading with progress, then Finalizing, then Complete
- [x] Completion is sent with the original Lesson and Language even if the admin tries to change the selection
- [x] Complete appears only after completion returns `200`, and the audio panel then shows the new current rendition
- [x] A second upload cannot start while one is active, and the Lesson and Language selection is locked during Uploading and Finalizing
- [x] Any failure shows a Failed state and never reports success
- [x] Whole-app tests cover file rejection, the Lesson Text precondition, progress, the full state sequence, the target lock, single-upload enforcement, and Archived disabling

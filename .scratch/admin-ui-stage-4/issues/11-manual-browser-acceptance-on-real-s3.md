# 11: Manual browser acceptance on real S3

**What to build:** Sign off Stage 4 on the real path. With the containerized backend running through `pnpm dev`, the BFF using its Roles Anywhere identity, and the real private S3 bucket, the admin completes the normal authoring workflow in a real desktop browser at `http://127.0.0.1:5173`, with no curl or direct database access. Record the results, including any request IDs for failures, in the comment log for this ticket.

The existing opt-in live-S3 tracer remains the automated proof of direct S3 transfer. Run it first to rule out infrastructure problems.

See the spec section "Testing Decisions" (manual acceptance).

**Blocked by:** 07 — Publish and archive from the Admin; 10 — Recover interrupted uploads; 12 — Escape and clarify upload recovery

**Status:** resolved

- [x] The opt-in live-S3 tracer passes against the current stack
- [x] Find and list existing Lessons, using both filters
- [x] Create a `DRAFT` Lesson and edit its chapter/version
- [x] Create and edit Thai Lesson Text, plus one other Language
- [x] Find an existing Source and create a new one
- [x] Attach and detach Sources and edit Lesson Source references
- [x] Select and upload a real ElevenLabs MP3, watching visible progress through Complete
- [x] Play the current Lesson Audio in the browser
- [x] Publish the Lesson, and confirm it appears in the mobile Lesson list API with its audio
- [x] Spot check: archive a Lesson through the confirmation and verify it is read-only with playable audio
- [x] Spot check: finalization failure and **Retry finalization**: covered by the Admin whole-app upload-recovery tests instead of by hand
- [x] Spot check: after a full page refresh, the token is required again

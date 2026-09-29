# 11: Manual browser acceptance on real S3

**What to build:** Sign off Stage 4 on the real path. With the containerized backend running through `pnpm dev`, the BFF using its Roles Anywhere identity, and the real private S3 bucket, the admin completes the normal authoring workflow in a real desktop browser at `http://127.0.0.1:5173`, with no curl or direct database access. Record the results, including any request IDs for failures, in the comment log for this ticket.

The existing opt-in live-S3 tracer remains the automated proof of direct S3 transfer. Run it first to rule out infrastructure problems.

See the spec section "Testing Decisions" (manual acceptance).

**Blocked by:** 07 — Publish and archive from the Admin; 10 — Recover interrupted uploads

**Status:** ready-for-human

- [ ] The opt-in live-S3 tracer passes against the current stack
- [ ] Find and list existing Lessons, using both filters
- [ ] Create a `DRAFT` Lesson and edit its chapter/version
- [ ] Create and edit Thai Lesson Text, plus one other Language
- [ ] Find an existing Source and create a new one
- [ ] Attach and detach Sources and edit Lesson Source references
- [ ] Select and upload a real ElevenLabs MP3, watching visible progress through Complete
- [ ] Play the current Lesson Audio in the browser
- [ ] Publish the Lesson, and confirm it appears in the mobile Lesson list API with its audio
- [ ] Spot check: archive a Lesson through the confirmation and verify it is read-only with playable audio
- [ ] Spot check: force a finalization failure (for example, stop the Data Service after the PUT), then recover with **Retry finalization** once it is back
- [ ] Spot check: after a full page refresh, the token is required again

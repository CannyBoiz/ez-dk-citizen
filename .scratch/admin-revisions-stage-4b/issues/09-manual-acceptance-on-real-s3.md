# 09: Manual acceptance on real S3

**What to build:** Sign off Stage 4b on the real path. Run the containerized Backend with `pnpm dev:live-s3`, so the Backend uses its Roles Anywhere identity against the real private S3 bucket. The admin then walks the revised authoring workflow in a real desktop browser at `http://127.0.0.1:5173`, with no curl for authoring and no direct database access. Record the results, including request IDs for any failures, in the comment log for this ticket.

Run the opt-in live S3 tracer first (`pnpm test:live-s3`) to rule out infrastructure problems. It now also proves object deletion.

See the spec section "Testing Decisions" (manual acceptance) and user story 42.

**Blocked by:** 01 — Show every confirmation in the page; 02 — Give versions at publication; 03 — Edit canonical Sources; 04 — Delete Drafts instead of archiving them; 05 — One Save per Language tab; 06 — Replace a Published version in one step; 07 — Create Drafts through a form; 08 — Create new versions with shared audio

**Status:** ready-for-human

- [ ] The live S3 tracer passes against the current stack
- [ ] Create a Draft through the form, then save the chapter and the Thai Lesson Text with one Save, and add a second Language
- [ ] Attach a Source, upload a real ElevenLabs MP3, play it, and publish it; it becomes version 1.0
- [ ] Create a new version of the Published Lesson; its copied audio plays without an upload
- [ ] Change a Danish Lesson Text on the new version and Replace as a **Fix**; it becomes 1.1 and the mobile Lesson list shows it
- [ ] Try to replace with an unchanged copy, and see it refused
- [ ] Roll back: create a new version from the Archived Lesson and Replace (it becomes 1.2 as a fix, or 2.0 as a content change); the mobile detail shows the earlier content with its audio
- [ ] Delete a Draft that has its own uploaded audio, and confirm in the AWS console or CLI that its object is gone from the bucket
- [ ] Edit a Source cited by a Published Lesson, and see the corrected URL in that Lesson's mobile detail
- [ ] Spot check: every confirmation appears in the page, Archive is offered only on Published Lessons, and Delete only on Drafts

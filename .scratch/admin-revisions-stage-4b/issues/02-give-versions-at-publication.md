# 02: Give versions at publication

**What to build:** Drafts stop carrying a version. Publishing gives a Lesson a version automatically, written `major.patch`. A chapter's first publication is 1.0. After that, the admin says whether the change is a **content change** (major + 1, patch reset: 2.1 → 3.0) or a **fix** (patch + 1: 2.1 → 2.2), counted from the chapter's highest Published or Archived version. The version is for the admin only; the learner will see an "Updated" date in Stage 5.

Storage and contracts:

- The existing integer `version` column stays as the major part, and an integer `version_patch` column is added. Both are absent on Drafts and present otherwise. Uniqueness becomes (chapter, version, version_patch).
- The migration keeps every existing version N as N.0 on Published and Archived Lessons and clears it on Drafts. Lessons archived as Drafts before this stage keep their version and status.
- Contracts carry `version` and `versionPatch` as integers, both `null` on Drafts in the admin contracts. The mobile summary gains `versionPatch` and always has both.

Backend:

- Creating a Lesson takes only a chapter, and editing a Draft's structure takes only a chapter.
- Publication accepts `changeKind: "content" | "fix"`, which is rejected (`422`) with any other status change.
- The Data Service computes the version in the publication transaction. With no Published or Archived Lesson in the chapter, the result is 1.0 and the kind is ignored. Otherwise the kind is required (`422` with a field error on `changeKind`), and the version is the highest one raised by that kind. A concurrent publication that takes the same number fails on uniqueness as `409 lesson_version_conflict`.
- The kind is not checked against what changed.
- The Stage 4 publication prerequisites and `published_lesson_conflict` are unchanged. Replacement comes in ticket 06.

In the Admin:

- The catalogue and the editor heading show Drafts as "Chapter 3 · Draft, created 11 Oct 2026" and other Lessons as "Chapter 3, version 2.1".
- The new-Draft form and the Draft structure form ask for the chapter only. They keep their current behavior otherwise; tickets 05 and 07 change them.
- Publish opens the in-page confirmation from ticket 01, which reads the Lesson list fresh when it opens. A chapter's first publication says "Publish as version 1.0", with no choice.
- Otherwise the confirmation shows a required choice between **Content change** and **Fix**, with nothing pre-selected, each labelled with the version it produces (for example "Content change → 3.0" and "Fix → 2.2"). The confirm button stays disabled until one is chosen.
- Backend errors appear inside the confirmation.

Update every fixture that creates a Lesson with a version or publishes a chapter's later version without a kind, including the fake-storage end-to-end tracer and the live S3 tracer.

See the spec sections "Lesson versions", "The Lesson command", and "Admin" (Heading and catalogue, Publication), and user stories 15–20.

**Blocked by:** 01 — Show every confirmation in the page

**Status:** ready-for-agent

- [ ] The migration keeps integer versions as N.0 on Published and Archived Lessons and clears Draft versions; Lessons archived as Drafts keep theirs
- [ ] Contracts accept a positive `version` with a non-negative `versionPatch`; the admin summary accepts both `null` or both present, and the mobile summary requires both
- [ ] Creating a Lesson with only a chapter returns a Draft with `null` version parts
- [ ] A chapter's first publication becomes 1.0 whatever kind is sent, or with none
- [ ] A later publication without a kind is `422` with a `changeKind` field error, and the Lesson stays `DRAFT` with an unchanged timestamp
- [ ] `content` and `fix` produce the next major or patch from the highest Published or Archived version, including Lessons archived as Drafts before this stage
- [ ] `changeKind` alongside any status other than `PUBLISHED`, or with a value other than `content` or `fix`, is `422`
- [ ] The catalogue and heading show Drafts with their creation date and other Lessons as `major.patch`
- [ ] The publish confirmation shows "version 1.0" for a first publication; otherwise it shows the content/fix choice with each resulting version, keeps confirm disabled until one is chosen, sends the kind, and shows backend errors inside the confirmation. Cancelling makes no request.
- [ ] Data Service, BFF, and whole-app tests, the fake-storage end-to-end tracer, and the live S3 tracer pass with the new version model

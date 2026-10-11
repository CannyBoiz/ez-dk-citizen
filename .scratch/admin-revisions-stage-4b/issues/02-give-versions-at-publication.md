# 02: Give versions at publication

**What to build:** Drafts stop carrying a version. A Lesson gets a `major.minor.patch` version when it is published, and that version must be higher than every Published and Archived version of its chapter.

The migration maps every existing integer version N to N.0.0 on Published and Archived Lessons and clears it on Drafts. Lessons archived as Drafts before this stage keep their version and status. The version is stored as three parts, so ordering compares part by part (1.10.0 > 1.2.0).

Contracts carry the version as a string such as `"1.2.3"`, with no leading zeros and major ≥ 1. The admin Lesson summary and detail return `null` for Drafts; the mobile summary always has one.

- Creating a Lesson takes only a chapter, and editing a Draft's structure takes only a chapter.
- Publication requires a version, and the version is rejected with any other change. A version that is not higher than every Published and Archived version of the chapter is `409 lesson_version_conflict`, with a detail naming the highest version. This is checked in the transaction that applies the transition.
- The Stage 4 publication prerequisites and `published_lesson_conflict` are unchanged. Replacement comes in ticket 06.

In the Admin:

- The catalogue and the editor heading show Drafts as "Chapter 3 · Draft, created 11 Oct 2026" and other Lessons as "Chapter 3, version 1.0.2".
- The new-Draft form and the Draft structure form ask for the chapter only. They keep their current behavior otherwise; tickets 05 and 07 change them.
- Publish opens the in-page confirmation from ticket 01 with a version input. It is pre-filled one patch above the chapter's highest Published or Archived version (1.0.0 if there is none), computed from the Lesson list, and the admin may raise it. Backend `409`s appear inside the confirmation.

This is the widest ticket: most of the change is test fixtures that create Lessons with a version or publish without one. Update them all, including the fake-storage end-to-end tracer and the live S3 tracer.

See the spec sections "Lesson versions", "The Lesson command", and "Admin" (Heading and catalogue, Publication), and user stories 15–20.

**Blocked by:** 01 — Show every confirmation in the page

**Status:** ready-for-agent

- [ ] The migration turns integer versions into N.0.0 on Published and Archived Lessons and clears Draft versions; Lessons archived as Drafts keep theirs
- [ ] Contracts accept `1.0.0` and `12.3.45` and reject `0.1.0`, `1.01.0`, `1.0`, and non-numeric parts; the admin summary accepts `null` and the mobile summary rejects it
- [ ] Creating a Lesson with only a chapter returns a Draft with a `null` version
- [ ] Publishing without a version, or with a version alongside any status other than `PUBLISHED`, is `422`
- [ ] Publishing with a version not higher than every Published and Archived version of the chapter is `409 lesson_version_conflict` naming the highest version, and the Lesson stays `DRAFT` with an unchanged timestamp
- [ ] Publishing with a higher version succeeds, and the mobile list and detail show that version
- [ ] The catalogue and heading show Drafts with their creation date and other Lessons with `major.minor.patch`
- [ ] The publish confirmation is pre-filled correctly, accepts a raised version, sends it, and shows backend `409`s inside the confirmation; cancelling makes no request
- [ ] Data Service, BFF, and whole-app tests, the fake-storage end-to-end tracer, and the live S3 tracer pass with the new version model

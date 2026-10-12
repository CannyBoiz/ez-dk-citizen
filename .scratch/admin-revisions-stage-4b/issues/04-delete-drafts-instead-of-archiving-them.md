# 04: Delete Drafts instead of archiving them

**What to build:** A Draft the admin no longer wants is deleted, not archived. `DRAFT -> ARCHIVED` is removed from the domain and is now `409 lesson_lifecycle_conflict`, so `ARCHIVED` always means the Lesson was once published. Lessons archived as Drafts earlier stay as they are.

The BFF gains an authenticated Lesson delete, backed by a Data Service delete.

- One Data Service transaction locks the Lesson and deletes it with its Lesson Texts, Lesson Sources, and Lesson Audio.
- In the same transaction, every Media Asset that backed the deleted Lesson Audio and is no longer used by any remaining Lesson Audio is marked `DELETED`. Their object keys go back to the BFF only. Write this rule for the general case: ticket 08 lets Media Assets be shared, and it must keep holding then.
- A Published or Archived Lesson is `409 lesson_not_editable` ("Only Draft Lessons can be deleted."), and a missing Lesson is `404 lesson_not_found`.
- After the commit, the BFF deletes each returned object with the existing storage delete. A storage failure is logged with the existing secret-safe storage logging and does not fail the request.
- The route returns `204` and never exposes object keys. `PENDING` Media Assets have no link to a Lesson and are untouched (ADR-0002).

In the Admin, Archive is offered only on Published Lessons and Delete only on Drafts. Delete uses the in-page confirmation from ticket 01, which says what will be lost: the Lesson Texts, Lesson Source references, and Lesson Audio. Canonical Sources stay, and the deletion cannot be undone. Delete is disabled while an upload is Uploading or Finalizing, like Publish and Archive. After deleting, the admin returns to the catalogue, which no longer lists the Draft.

See the spec sections "Deleting Drafts" and "Admin" (Publication, Uploads), and user stories 26 and 28–32 and 41.

**Blocked by:** 01 — Show every confirmation in the page

**Status:** ready-for-agent

- [x] Archiving a Draft is `409 lesson_lifecycle_conflict` and leaves it `DRAFT`
- [ ] Deleting a Draft removes it with its Lesson Texts, Lesson Sources, and Lesson Audio; its canonical Sources remain
- [ ] The deleted Draft's Media Assets become `DELETED` and their objects are deleted from storage
- [ ] Deleting a Published or Archived Lesson is `409 lesson_not_editable` and changes nothing; a missing Lesson is `404`
- [ ] A storage failure during object deletion still returns `204`, is logged without secrets, and leaves the Media Asset `DELETED`
- [ ] No response exposes object keys, provider, or bucket
- [ ] The Admin shows Archive only on Published Lessons and Delete only on Drafts; Delete requires the confirmation, cancelling makes no request, and Delete is disabled during Uploading and Finalizing
- [ ] The fake-storage end-to-end tracer deletes a Draft with uploaded audio and the object leaves fake storage
- [ ] The opt-in live S3 tracer deletes its Draft after the upload path and asserts that the object no longer exists in the bucket
- [ ] Data Service (real PostgreSQL), BFF route, and whole-app tests cover the above

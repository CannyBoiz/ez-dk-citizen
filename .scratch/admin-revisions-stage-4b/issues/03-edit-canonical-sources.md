# 03: Edit canonical Sources

**What to build:** The admin can correct a Source's URL and publication date, even when Published or Archived Lessons cite it. A Source is the document itself, not its address, so the correction applies to every Lesson that cites the Source.

The BFF gains an authenticated Source update with optional `url` and `publishedAt` (at least one; `publishedAt: null` means unknown), backed by a Data Service update. It uses the same URL and date validation as Source creation. A duplicate URL is `409 source_url_conflict`, and a missing Source is `404 source_not_found`. The update does not advance any Lesson's `updated_at`. No Source delete is added.

In the Source finder, each Source gets **Edit**, which opens an inline URL and publication-date form. The date uses the same native date input and midnight-UTC encoding as creation. Saving shows the in-page confirmation from ticket 01: "This correction applies to every Lesson that cites this Source, including Published and Archived Lessons." An unsaved Edit form counts in the leave warnings.

See the spec sections "Sources" and "Admin" (Sources), and user stories 33–37.

**Blocked by:** 01 — Show every confirmation in the page

**Status:** resolved

- [x] Updating a Source's URL, publication date, or both returns the updated Source, and the change shows in every citing Lesson's detail, including the mobile detail of a Published Lesson
- [x] A duplicate URL is `409 source_url_conflict` and the Admin shows the existing "Source already exists" message with the edit kept
- [x] An invalid URL is `422` with a field error; a missing Source is `404 source_not_found`
- [x] Updating a Source does not advance the `updated_at` of any Lesson that cites it
- [x] Clearing the date sends `publishedAt: null`; choosing one sends midnight UTC and displays back as the same calendar date
- [x] Saving requires the in-page confirmation; cancelling makes no request
- [x] An unsaved Source Edit form is named in the leave warning
- [x] Contract, Data Service (real PostgreSQL), BFF route, and whole-app tests cover the above

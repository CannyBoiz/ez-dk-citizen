# 12: Escape and clarify upload recovery

**What to build:** Three follow-ups from reviewing ticket 10, so the admin can never be stuck in recovery and can tell what a failed attempt targets.

- **Start new upload alongside recovery**: a retryable or uncertain failure offers **Start new upload** next to **Retry finalization** or **Check upload / Retry finalization**. A backend that keeps failing transiently otherwise leaves leaving the Lesson as the only way out. Starting over is still an explicit admin action and discards the page-local recovery.
- **The panel names the attempt's Language**: once an attempt has started, the upload panel's heading shows the Language that attempt targets, not the selected one, so a failed `th` attempt shown under the `en` tab still reads "Upload audio (th)".
- **A `500` is flagged for investigation**: a `500` during completion stays retryable. Every Admin error message for a `500` says the server failed unexpectedly and that the request ID can be traced in the backend logs. Unlike `502`/`503`/`504`, a `500` is a backend bug rather than an outage, so a retry may not help.

See the spec section "Upload workflow".

**Review decisions:** the code review of ticket 10 also flagged code smells. These were fixed here: AudioUpload's redundant reset on unmount, the untyped `failureKinds` map, and the recovery test's hand-written network-failure wrapper and `"network"` string marker. These were kept on purpose, with comments at each site:

- The upload status is held in both LessonView and App, as unsaved edits are. LessonView locks Back, the Language tabs, and Publish/Archive on it, and App warns on it.
- Unsaved edits and the upload status are reported to App separately. The Sources screen has edits but no upload, and each screen uses its own value for its own locks.
- `UploadStatus` keeps `"idle"`, meaning nothing to lose, which includes a completed attempt and a terminal failure.

**Blocked by:** 10 — Recover interrupted uploads

**Status:** resolved

- [x] A retryable failure offers **Start new upload** next to **Retry finalization**, and it alone requests a new Upload Intent
- [x] An uncertain PUT offers **Start new upload** next to **Check upload / Retry finalization**
- [x] Starting over from a recoverable failure discards the recovery, so leaving no longer warns
- [x] After switching Language, a failed attempt's panel heading names the attempt's Language
- [x] A `500` during completion offers recovery and says the failure needs investigating in the backend logs

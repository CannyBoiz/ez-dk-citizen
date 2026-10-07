# 10: Recover interrupted uploads

**What to build:** Page-local recovery for every way an upload can fail, without reporting false success and without silently creating a second Upload Intent. All recovery reuses the Media Asset ID and original Lesson and Language held in memory, and relies on the existing completion and object-validation flow.

- **Retry finalization**: the PUT succeeded but completion failed transiently (Data Service or storage `502`/`503`/`504`, network failure, or a `401` followed by token re-entry). Completion is retried without uploading again.
- **Check upload / Retry finalization**: the PUT outcome is uncertain. Completion is called with the same Media Asset ID; `409 upload_incomplete` means the object never landed, so only **Start new upload** is offered.
- **Terminal failures**: `422 invalid_uploaded_media`, `409 media_asset_failed`, or a failed Upload Intent request explain that a new upload is required and offer only **Start new upload**, never repeated finalization.
- **Start new upload** is always an explicit admin action.

While Uploading or Finalizing, Publish and Archive for that Lesson are disabled until Complete or a settled Failed state. Leaving the page during an upload or with recoverable upload state triggers the before-unload warning. Navigating to another Lesson with recoverable state requires confirmation that page-local recovery will be discarded. Refresh recovery, resumable uploads, and discovery of abandoned `PENDING` Media Assets are out of scope.

See the spec section "Upload workflow" and user stories 56–63.

**Blocked by:** 07 — Publish and archive from the Admin; 09 — Upload an MP3 with visible progress

**Status:** resolved

- [x] A transient completion failure offers **Retry finalization**, which calls completion with the same Media Asset ID and target and makes no new Upload Intent or PUT
- [x] A `401` during finalization prompts for the token, keeps the recovery state, and then allows **Retry finalization**
- [x] An uncertain PUT offers **Check upload / Retry finalization** using the same Media Asset ID
- [x] `409 upload_incomplete` from that check offers only **Start new upload**
- [x] `422 invalid_uploaded_media`, `409 media_asset_failed`, and a failed Upload Intent request explain that a new upload is required and offer only **Start new upload**
- [x] No second Upload Intent is requested except through **Start new upload**
- [x] Publish and Archive are disabled for the Lesson during Uploading and Finalizing, and re-enabled at Complete or a settled Failed state
- [x] Leaving the page during an upload or with recoverable state triggers the before-unload warning
- [x] Navigating to another Lesson with recoverable state asks for confirmation that recovery will be discarded, and confirming discards it
- [x] Whole-app tests cover every recovery path above, including asserting the requests the fake network module received

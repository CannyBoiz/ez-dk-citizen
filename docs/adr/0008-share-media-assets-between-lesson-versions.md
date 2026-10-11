# Share Media Assets between Lesson versions

When a new version copies a Lesson, each copied current Lesson Audio points at
the **same** Media Asset instead of a copy of its S3 object. One Media Asset
may therefore back Lesson Audio in several Lessons: `UNIQUE(media_asset_id)` on
`lesson_audio` becomes `UNIQUE(lesson_id, language_code, media_asset_id)`.
Sharing is safe because uploaded objects are never overwritten (every upload is
signed with `If-None-Match: *`), and it keeps the copy to one Data Service
transaction with no storage calls.

## Consequences

- Completion's idempotent path matches a `READY` Media Asset's Lesson Audio on
  the requested Lesson and Language, not on the Media Asset alone.
- Deleting a Draft marks `DELETED`, and removes from storage, only the Media
  Assets that no remaining Lesson Audio uses.
- The pending-upload rule of ADR-0002 is unchanged: a `PENDING` Media Asset
  still has no Lesson Audio.

## Considered Options

- **Server-side S3 copy per new version**: rejected. The bucket policy denies
  any `PutObject` without `If-None-Match`, and a copy counts as one, so it needs
  an infrastructure change. The copy would also span S3 and PostgreSQL without
  atomicity, and duplicate bytes that never change.
- **No audio copy; re-upload the MP3**: rejected as manual work for narration
  that a text correction usually leaves valid.

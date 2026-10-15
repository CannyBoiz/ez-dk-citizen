# 01: Sign upload checksums

**What to build:** Decide whether Upload URLs should also sign a SHA-256 checksum, so S3 accepts only the exact file the admin chose. Today the signature binds type and size, but not the bytes.

**Blocked by:** none

**Status:** needs-triage

**Open questions for triage:**

- Can the Admin browser hash a 50 MiB MP3 before requesting the Upload Intent without hurting the upload flow?
- Which S3 checksum header and signing approach work with presigned `PUT` and `If-None-Match: *`?

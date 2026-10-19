---
status: accepted
---

# Version the audio bucket

The audio bucket enables versioning, and a lifecycle rule removes noncurrent
versions and expired delete markers after 30 days. The workload role has no
`s3:DeleteObjectVersion`, so any delete (Draft deletion, a bug, or a stolen
identity) leaves a recoverable version for 30 days instead of erasing audio.
This reverses the Stage 3 choice to leave versioning off, and it cannot be
fully undone: versioning can afterwards only be suspended.

Uploads are unaffected. Fresh `audio/{uuid}.mp3` keys have no current version,
`If-None-Match: *` still rejects overwriting a live object with `412`, and the
bucket policy's conditional-write deny reads the request header. AWS
documentation disagrees on a write over a delete marker (success or `404`);
keys are never reused, and either outcome keeps the earlier version.

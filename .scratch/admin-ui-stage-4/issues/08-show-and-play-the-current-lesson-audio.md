# 08: Show and play the current Lesson Audio

**What to build:** For the selected Language, the Lesson editor shows the current Lesson Audio (audio version, original filename, and file size) with a native audio player that streams directly from S3. This works for Draft, Published, and Archived Lessons. When no current rendition exists, the panel says so. Playback expiry, storage errors, and loading errors show an audio-specific error that never resets editor state, and **Reload audio** fetches fresh playback authorization on demand. There is no background refresh.

Behind it, the Data Service gains an internal read of the current `READY` Lesson Audio for any Lesson status, including the original filename. The BFF adds the authenticated `GET /api/admin/lessons/:lessonId/audio/:languageCode` route, which returns `{ "audio": null }` or an audio object with a fresh one-hour Playback URL and its expiry, with `Cache-Control: no-store`. It never exposes provider, bucket, or object key and does not reuse the public mobile route.

Saving a Lesson Text in a Language that has current audio shows a non-blocking warning that the narration may no longer match and may need replacing. The audio stays current.

See the spec section "Admin current-audio read (Data Service and BFF)" and user stories 24–25 and 37–44.

**Blocked by:** 05 — Author localized Lesson Texts

**Status:** ready-for-agent

- [ ] The Data Service returns the current `READY` rendition for Draft, Published, and Archived Lessons, and none when there is no current rendition or no Lesson Text in that Language; superseded renditions are never returned
- [ ] A missing Lesson is `404 lesson_not_found` and an unsupported Language is `422 unsupported_language`
- [ ] The BFF route requires the admin token, generates exactly one Playback URL without an S3 metadata request, sets `Cache-Control: no-store`, and returns only `mediaAssetId`, `audioVersion`, `originalFilename`, `contentType`, `sizeBytes`, `durationMs`, `playbackUrl`, and `playbackExpiresAt`
- [ ] Storage failures map to `503 storage_unavailable` or `504 storage_timeout`, with the existing secret-safe logging
- [ ] The shared contract rejects storage identity and unknown fields in the admin audio response
- [ ] The fake-storage end-to-end tracer reads admin audio on a Draft, and again after the Lesson is archived
- [ ] The editor shows version, filename, size, and a native player for the selected Language, or a "no audio yet" state
- [ ] An audio error appears only in the audio panel and leaves unsaved edits intact; **Reload audio** requests fresh authorization
- [ ] The Admin makes no background Playback URL refresh requests
- [ ] Saving Lesson Text in a Language with current audio shows the mismatch warning, and the audio panel still shows the same current rendition
- [ ] Contract, Data Service HTTP (real PostgreSQL), BFF route, and Admin whole-app tests cover the behavior above

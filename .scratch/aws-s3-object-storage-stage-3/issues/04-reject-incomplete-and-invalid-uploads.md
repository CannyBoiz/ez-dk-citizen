# 04 — Reject incomplete and invalid uploads safely

**What to build:** Keep missing, temporarily unavailable, or invalid S3
objects from becoming Lesson Audio. Retryable storage conditions leave the
Media Asset pending; metadata mismatches make it terminally failed before the
exact rejected object is cleaned up.

**Blocked by:** 03 — Complete the first Lesson Audio.

**Status:** ready-for-agent

- [ ] Classify a missing S3 object as a retryable incomplete-upload response and leave the Media Asset `PENDING` with no Lesson Audio.
- [ ] Classify transient, throttled, timed-out, and unavailable S3 operations as retryable service failures and leave relational state unchanged.
- [ ] Treat an exact content-length or content-type mismatch as invalid uploaded media rather than a retryable completion.
- [ ] Add a narrow authenticated Data Service command that atomically changes only a `PENDING` Media Asset to terminal `FAILED`.
- [ ] Record `FAILED` before attempting object deletion, so cleanup failure cannot leave invalid media eligible for completion.
- [ ] Delete only the exact configured bucket and object key belonging to the invalid Media Asset; never list or sweep a prefix.
- [ ] Keep the Media Asset `FAILED` and return the invalid-upload outcome when exact-object deletion fails.
- [ ] Reject later completion of a `FAILED` Media Asset with `409`, requiring a new Upload Intent and object key.
- [ ] Do not implement `DELETED` lifecycle behavior, automatic abandoned-upload cleanup, or compensating deletion for unrelated failures.
- [ ] Log the request ID, storage operation, Media Asset ID, and safe AWS error or request code where available.
- [ ] Prove logs omit credentials, bearer tokens, request bodies, and complete presigned URLs on every failure path.
- [ ] Test missing objects, representative retryable AWS failures, both metadata mismatch dimensions, successful cleanup, cleanup failure, and terminal retry behavior through public HTTP and persisted state.


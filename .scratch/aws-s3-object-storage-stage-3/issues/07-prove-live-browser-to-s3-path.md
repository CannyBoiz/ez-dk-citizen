# 07 — Prove the live browser-to-S3 path

**What to build:** Give a developer a safe, explicit way to configure the
human-owned AWS credentials and prove the complete direct-transfer contract in
a real browser against the private application bucket. The opt-in tracer uses
isolated smoke objects and cleans up only what it creates.

**Blocked by:** 01 — Secure the private S3 boundary; 06 — Return mobile Playback URLs.

**Status:** ready-for-agent

- [ ] Provide an interactive human setup wizard for applying the prepared infrastructure change, creating or rotating the dedicated IAM user's access key, and placing required values only in ignored local or deployment secret locations.
- [ ] Make the wizard show the relevant AWS locations and confirmations without printing, committing, or storing permanent credentials in Terraform state.
- [ ] Add one explicit opt-in live-tracer command that is excluded from default tests, builds, typechecking, readiness, and credential-free integration runs.
- [ ] Fail the tracer early with actionable messages when required AWS configuration, browser prerequisites, application services, or allowed Admin origin are unavailable.
- [ ] Run the upload portion in a real browser from an allowed local Admin origin rather than substituting Node.js HTTP behavior for browser CORS behavior.
- [ ] Exercise an authenticated Upload Intent through the BFF with a test-only injected object-key generator that confines this run to a unique `smoke/{random UUID}.mp3` key without adding a production prefix setting.
- [ ] Perform the direct browser PUT using the returned authorization and required content type, browser-generated exact content length, and `If-None-Match: *`.
- [ ] Prove CORS preflight succeeds for the intended origin, method, and headers and fails for a disallowed origin or unapproved request shape.
- [ ] Prove a second PUT to the same signed object key cannot overwrite the first object.
- [ ] Complete the Media Asset through the authenticated BFF route, read the Published Lesson through the mobile route, fetch the returned Playback URL directly from S3, and verify the exact uploaded bytes.
- [ ] Prove unsigned public object access is rejected and browser-visible responses contain no permanent AWS credentials, bucket, or object key.
- [ ] Record every exact smoke key created by the run and delete only those keys in a `finally` cleanup path, including after partial tracer failure.
- [ ] Never list, sweep, or delete the `audio/` prefix, and report any exact-object cleanup failure clearly for manual recovery.
- [ ] Verify storage and application logs remain free of credentials, bearer tokens, request bodies, and complete presigned URLs during the live flow.
- [ ] Run formatting, workspace typechecking, builds, default tests, PostgreSQL integration, the credential-free Stage 3 tracer, infrastructure validation, and the opt-in live browser tracer as the final Stage 3 verification set.

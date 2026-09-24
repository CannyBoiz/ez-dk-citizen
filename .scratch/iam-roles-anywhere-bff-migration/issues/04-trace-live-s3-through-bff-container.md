# 04: Exercise live S3 through the production-like BFF runtime

**What to build:** Adapt the opt-in live browser tracer to exercise the real
production-like BFF container through its Roles Anywhere credential path while
preserving the existing direct-transfer, validation, playback, and exact-object
cleanup guarantees.

**Blocked by:** 02 — Run the BFF with a containerized Roles Anywhere identity.

**Status:** ready-for-agent

- [x] Run the BFF in the production-like container with the real signing helper, shared profile, and read-only workload-identity mounts, with both legacy access-key variables absent.
- [x] Obtain STS identity evidence through the same container and provider path and require an assumed-role session for `ez-dk-citizen-role-anywhere-s3`.
- [x] Drive the live tracer through the running BFF's public HTTP boundary rather than supplying permanent credentials to an in-process substitute.
- [x] Preserve the existing test-only object-key injection so each run is confined to one unique `smoke/` object without adding a production prefix setting.
- [x] Create an authenticated Upload Intent and prove that its authorization requires the declared content type, exact content length, and `If-None-Match: *`.
- [x] Use a real browser from the allowed Admin origin to prove CORS and the direct S3 upload.
- [x] Prove that a disallowed origin or unapproved request shape fails and that a second PUT cannot overwrite the object.
- [x] Complete the Media Asset through the BFF, validate the stored object, obtain the mobile Lesson response, fetch its Playback URL, and verify the exact bytes.
- [x] Prove unsigned public access remains rejected and frontend-visible responses expose no AWS credential, bucket name, or object key.
- [x] Use the same Roles Anywhere credential path for direct tracer authorization where needed, including exact-object cleanup.
- [x] Record every smoke key created and delete only those exact keys in a `finally` path, including after partial failure; never list or sweep `audio/` or `smoke/`.
- [x] Fail clearly and preserve the exact key for manual recovery when cleanup cannot complete.
- [x] Check application and configured audit logs for access keys, session credentials, private-key material, bearer tokens, request bodies, and complete presigned URLs.
- [x] Keep the tracer opt-in and excluded from default tests, builds, readiness, and ordinary development startup.
- [x] Confirm the workload certificate and key remain uncommitted, the CA private key is not deployed, and the built image contains no private credential material.
- [x] Do not remove the imported broad inline role policy or retire the legacy IAM user in this ticket.
- [x] Run the repository's full credential-free regression set before the opt-in live tracer.

# 01: Move the BFF to the standard AWS credential chain

**What to build:** Make the BFF obtain S3 credentials from the AWS SDK's
standard provider chain instead of accepting a permanent IAM-user access-key
pair. The ordinary development and test experience must remain credential-free,
while stale production access-key configuration is rejected explicitly.

**Blocked by:** None (can start immediately).

**Status:** ready-for-human

- [x] Construct the S3 client with the configured AWS region and no explicit access-key ID, secret key, temporary credentials, or application-owned refresh code.
- [x] Keep the S3 bucket and AWS region as required, non-secret BFF configuration.
- [x] Reject BFF startup with an actionable error when `AWS_ACCESS_KEY_ID` is present, even when `AWS_SECRET_ACCESS_KEY` is absent.
- [x] Reject BFF startup with an actionable error when `AWS_SECRET_ACCESS_KEY` is present, even when `AWS_ACCESS_KEY_ID` is absent.
- [x] Remove both legacy variables from the ordinary Compose topology and tracked local-environment example instead of passing empty or development placeholder values.
- [x] Preserve the existing Storage interface and FakeStorage injection used by BFF route and integration tests.
- [x] Keep BFF readiness dependent on the Data Service without fetching AWS credentials or contacting S3.
- [x] Keep ordinary local startup, unit tests, integration tests, typechecking, and builds independent of a live AWS certificate or session.
- [x] Preserve the existing upload, object inspection, playback signing, and delete behavior of the S3 adapter.
- [x] Do not add a credential sidecar, helper endpoint, custom Roles Anywhere client, temporary-credential persistence, or custom refresh mechanism.
- [x] Update focused tests so the provider-chain behavior and both legacy-variable rejection cases fail before this change and pass afterward.
- [x] Run the repository's formatting, typechecking, build, default test, and credential-free integration checks.


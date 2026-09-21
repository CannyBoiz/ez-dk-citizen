# 02: Run the BFF with a containerized Roles Anywhere identity

**What to build:** Produce a production-like BFF container that can exchange
the workload's mounted X.509 identity for temporary AWS credentials through
the official signing helper and shared AWS profile. Prove the resulting
assumed-role identity from the same container and provider path used by the
BFF.

**Blocked by:** 01 — Move the BFF to the standard AWS credential chain.

**Status:** ready-for-human

- [x] Keep Node 26 while changing only the BFF development and runtime image stages to a glibc-compatible base.
- [x] Leave the Data Service image on Alpine and give the Data Service, PostgreSQL, and frontend clients no AWS identity configuration or files.
- [x] Install a pinned official `aws_signing_helper` release in the BFF image and verify its published checksum during the build.
- [x] Make the image build fail when the helper checksum does not match.
- [x] Configure a shared AWS profile whose `credential_process` invokes the helper with the existing Trust Anchor, Roles Anywhere profile, role, workload certificate, and workload private key.
- [x] Select the shared profile through standard AWS configuration variables rather than application-specific credential plumbing.
- [x] Bind-mount the shared profile, workload certificate, and workload private key read-only at stable container locations used by the profile.
- [x] Mount the identity files only into the BFF and keep the CA private key off the workload runtime entirely.
- [ ] Keep the BFF process non-root and verify that a host-provisioned private key with mode `0600` is readable by that process without broadening its permissions.
- [ ] Start the production-like BFF container without either legacy access-key variable and keep readiness independent of an S3 network call.
- [ ] Call STS `GetCallerIdentity` from the same container and standard provider chain and prove an assumed-role session for `ez-dk-citizen-role-anywhere-s3`, not an IAM user.
- [ ] Start the actual container once with only `AWS_ACCESS_KEY_ID` and once with only `AWS_SECRET_ACCESS_KEY`; both runs must fail before serving requests with an actionable refusal.
- [x] Inspect the built image and its metadata to confirm that it contains the public helper binary but no workload certificate, private key, shared-profile contents, or AWS credentials.
- [x] Keep ordinary development and automated tests runnable without mounting the workload identity.
- [ ] Run the container smoke test and the repository's existing regression checks.


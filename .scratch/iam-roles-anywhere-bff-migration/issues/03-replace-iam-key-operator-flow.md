# 03: Replace IAM-key setup with the workload-identity operator flow

**What to build:** Give the operator one safe, repeatable workflow for
preparing and validating the BFF's Roles Anywhere identity without creating,
copying, printing, or storing permanent AWS access keys or private-key
contents.

**Blocked by:** 02 — Run the BFF with a containerized Roles Anywhere identity.

**Status:** ready-for-agent

- [x] Remove wizard instructions and prompts for creating, rotating, entering, or storing IAM-user access keys.
- [x] Verify that the workload certificate, private key, and shared AWS profile exist at the expected host locations without printing their contents.
- [x] Verify that the workload certificate has the expected `aws-iam-app` subject identity and chains to the dedicated CA's public certificate.
- [x] Verify that the workload private key has restrictive mode `0600` and is readable by the non-root BFF process through the configured read-only mount.
- [x] Prepare or validate the shared profile's Trust Anchor, Roles Anywhere profile, role, certificate, and private-key references without persisting temporary credentials.
- [x] Build or inspect the production-like BFF image and verify the pinned signing helper before attempting an identity exchange.
- [x] Validate the BFF mount configuration and run the same-container STS identity proof used by the application acceptance seam.
- [x] Report only the expected assumed-role identity and safe metadata; never print private-key material, access keys, session tokens, or complete credential-process output.
- [x] Preserve safe reruns and fail early with actionable messages for missing files, unsafe permissions, invalid certificate identity, failed mounts, or unexpected AWS identity.
- [x] Document routine workload-certificate rotation at least 30 days before expiry without changing the current identity during normal cutover.
- [x] Document emergency compromise handling: disable the Roles Anywhere profile, issue a new key and certificate with a new identity, update the trust-policy identity constraint, verify, and only then re-enable the profile.
- [x] Document dedicated-CA rotation as the emergency fallback and state that replacing only the certificate while retaining the trusted identity is not revocation.
- [x] Keep CRL infrastructure, Terraform-managed private keys, helper serve mode, temporary-credential files, and credential sidecars out of the workflow.
- [x] Keep the manually managed Hetzner VPS and its Terraform reconciliation explicitly deferred to Stage 6.
- [x] Update current operator and architecture documentation while leaving clearly historical planning records historical.
- [x] Run shell syntax checks and all applicable documentation or repository checks.

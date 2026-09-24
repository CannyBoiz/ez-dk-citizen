# 05: Tighten the role and prove the least-privilege cutover

**What to build:** Remove the temporary broad inline role policy through a
separately reviewed Terraform change, then prove that the complete
production-like BFF and live S3 path still works using only the existing
prefix-scoped managed policy.

**Blocked by:** 04 — Exercise live S3 through the production-like BFF runtime.

**Status:** ready-for-agent

- [x] Back up and inspect the canonical local Terraform state before changing the imported inline policy.
- [x] Remove only the temporary broad inline role policy from configuration; preserve the Trust Anchor, role, Roles Anywhere profile, managed role attachment, legacy IAM user, and legacy user attachment.
- [x] Run Terraform formatting and validation.
- [x] Produce a saved Terraform plan whose only intended cloud action is destruction of the broad inline role policy.
- [x] Show the exact plan for review and obtain explicit approval before applying it.
- [x] Apply only the approved saved plan and stop if drift or an additional action appears.
- [x] Confirm through live IAM inspection that the role retains the prefix-scoped managed policy and no broad inline policy.
- [x] Confirm the effective role permissions remain only `GetObject`, `PutObject`, and `DeleteObject` for `audio/` and `smoke/`, with no bucket listing or bucket-wide object access.
- [x] Re-run same-container STS identity proof and require the intended Roles Anywhere assumed role.
- [x] Re-run the complete production-like browser-to-BFF-to-S3 tracer, including conditional upload, overwrite rejection, validation, playback, and exact-object cleanup.
- [x] Confirm the legacy workload IAM user and its managed-policy attachment remain, verify it has no access keys, and do not create a key merely for rollback.
- [x] Run a post-apply Terraform plan and require convergence with no further changes.
- [x] Do not disable an access key or remove the legacy IAM user in this ticket.

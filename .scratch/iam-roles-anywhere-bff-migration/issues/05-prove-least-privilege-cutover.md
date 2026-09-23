# 05: Tighten the role and prove the least-privilege cutover

**What to build:** Remove the temporary broad inline role policy through a
separately reviewed Terraform change, then prove that the complete
production-like BFF and live S3 path still works using only the existing
prefix-scoped managed policy.

**Blocked by:** 04 — Exercise live S3 through the production-like BFF runtime.

**Status:** ready-for-agent

- [ ] Back up and inspect the canonical local Terraform state before changing the imported inline policy.
- [ ] Remove only the temporary broad inline role policy from configuration; preserve the Trust Anchor, role, Roles Anywhere profile, managed role attachment, legacy IAM user, and legacy user attachment.
- [ ] Run Terraform formatting and validation.
- [ ] Produce a saved Terraform plan whose only intended cloud action is destruction of the broad inline role policy.
- [ ] Show the exact plan for review and obtain explicit approval before applying it.
- [ ] Apply only the approved saved plan and stop if drift or an additional action appears.
- [ ] Confirm through live IAM inspection that the role retains the prefix-scoped managed policy and no broad inline policy.
- [ ] Confirm the effective role permissions remain only `GetObject`, `PutObject`, and `DeleteObject` for `audio/` and `smoke/`, with no bucket listing or bucket-wide object access.
- [ ] Re-run same-container STS identity proof and require the intended Roles Anywhere assumed role.
- [ ] Re-run the complete production-like browser-to-BFF-to-S3 tracer, including conditional upload, overwrite rejection, validation, playback, and exact-object cleanup.
- [ ] Confirm the legacy workload IAM user and its managed-policy attachment remain available for rollback.
- [ ] Run a post-apply Terraform plan and require convergence with no further changes.
- [ ] Do not disable an access key or remove the legacy IAM user in this ticket.

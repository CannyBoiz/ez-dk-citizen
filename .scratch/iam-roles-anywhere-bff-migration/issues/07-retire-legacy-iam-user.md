# 07: Retire the keyless legacy IAM user after fresh proof

**What to build:** Perform fresh successful Roles Anywhere verification, then
retire only the obsolete workload IAM user through an explicitly reviewed
Terraform destroy.

**Blocked by:** 06 — Confirm keyless Roles Anywhere-only operation.

**Status:** ready-for-agent

- [ ] Confirm the issue 06 keyless baseline has no unresolved reported regression or newly created workload access key; elapsed time is not a gate.
- [ ] Before editing Terraform, run the same-container STS identity proof and the complete browser-to-BFF-to-S3 tracer successfully with zero legacy workload access keys.
- [ ] Resolve the keyless workload user again, and prove it is not the administrative operator identity.
- [ ] If any workload access key appears, stop and obtain new operator direction before deleting a key or proceeding with IAM-user retirement.
- [ ] Remove only the legacy workload user's managed-policy attachment and IAM user from Terraform configuration.
- [ ] Preserve the managed S3 policy, Roles Anywhere Trust Anchor, role, profile, role attachment, S3 resources, and local backend arrangement.
- [ ] Run Terraform formatting and validation.
- [ ] Produce a saved Terraform plan and verify that its intended destroys are limited to the legacy workload user and its managed-policy attachment.
- [ ] Show the exact destroy plan for review and obtain explicit approval before applying it.
- [ ] Apply only the approved saved plan and stop if drift or an additional action appears.
- [ ] Confirm through live IAM inspection that the workload IAM user, its access keys, and its attachment are absent while the Roles Anywhere resources and managed role attachment remain.
- [ ] Run a final same-container identity proof and complete live tracer after retirement.
- [ ] If either proof fails, halt further changes and repair the Roles Anywhere path; do not create an IAM-user key as a planned fallback.
- [ ] Run a post-apply Terraform plan and require convergence with no changes.
- [ ] Update current migration status and operator documentation to state that the permanent workload credential path is retired.
- [ ] Keep Hetzner deployment and server reconciliation out of this ticket; they remain Stage 6 work.

# 07: Retire the legacy IAM user after the rollback window

**What to build:** After the full 24-hour disabled-key observation period,
perform one final successful Roles Anywhere verification and then retire only
the obsolete workload IAM user through an explicitly reviewed Terraform
destroy.

**Blocked by:** 06 — Disable the legacy workload key and prove Roles Anywhere-only operation; completion of the recorded 24-hour observation period.

**Status:** ready-for-agent

- [ ] Confirm that at least 24 hours have elapsed since all legacy workload access keys were disabled and that no rollback or unresolved regression occurred.
- [ ] Before editing Terraform, run the same-container STS identity proof and the complete browser-to-BFF-to-S3 tracer successfully with the legacy keys still disabled.
- [ ] Resolve the workload user and its disabled access keys again, and prove they are not the administrative operator identity.
- [ ] Obtain explicit approval before permanently deleting any remaining disabled access keys that would prevent IAM-user deletion.
- [ ] Remove only the legacy workload user's managed-policy attachment and IAM user from Terraform configuration.
- [ ] Preserve the managed S3 policy, Roles Anywhere Trust Anchor, role, profile, role attachment, S3 resources, and local backend arrangement.
- [ ] Run Terraform formatting and validation.
- [ ] Produce a saved Terraform plan and verify that its intended destroys are limited to the legacy workload user and its managed-policy attachment.
- [ ] Show the exact destroy plan for review and obtain explicit approval before applying it.
- [ ] Apply only the approved saved plan and stop if drift or an additional action appears.
- [ ] Confirm through live IAM inspection that the workload IAM user, its access keys, and its attachment are absent while the Roles Anywhere resources and managed role attachment remain.
- [ ] Run a final same-container identity proof and complete live tracer after retirement.
- [ ] Run a post-apply Terraform plan and require convergence with no changes.
- [ ] Update current migration status and operator documentation to state that the permanent workload credential path is retired.
- [ ] Keep Hetzner deployment and server reconciliation out of this ticket; they remain Stage 6 work.

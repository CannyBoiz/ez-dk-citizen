# 06: Disable the legacy workload key and prove Roles Anywhere-only operation

**What to build:** Disable the legacy workload IAM user's access keys only
after the operator workflow and least-privilege cutover are proven, then repeat
the identity and live S3 acceptance path to demonstrate that the BFF cannot
fall back to the IAM user.

**Blocked by:** 03 — Replace IAM-key setup with the workload-identity operator flow; 05 — Tighten the role and prove the least-privilege cutover.

**Status:** ready-for-agent

- [ ] Resolve the legacy workload IAM user and all of its access keys with read-only inspection before making any change.
- [ ] Distinguish the legacy workload user from the separate administrative operator behind the `default` profile; do not alter the operator identity.
- [ ] Confirm that the production-like BFF configuration contains neither legacy access-key variable and that the same-container identity check reports the intended assumed role.
- [ ] Obtain explicit approval immediately before disabling every active access key belonging to the legacy workload user.
- [ ] Disable, but do not yet delete, those workload access keys so the path remains recoverable during the rollback window.
- [ ] Re-run the same-container STS identity proof after disablement and require the intended Roles Anywhere assumed role.
- [ ] Re-run the complete live browser-to-S3 tracer after disablement, including exact smoke-object cleanup.
- [ ] Confirm through live IAM inspection that the workload access keys are inactive while the IAM user and its managed-policy attachment still exist.
- [ ] Record the disablement time and the earliest permitted Stage D retirement time 24 hours later.
- [ ] Record any observed regression and re-enable a disabled key only as an explicitly approved rollback, then repeat diagnosis before restarting the window.
- [ ] Keep credentials, session tokens, and private-key material out of command output, logs, comments, and tracker files.
- [ ] Do not modify Terraform to remove the user or attachment in this ticket.

# 06: Confirm keyless Roles Anywhere-only operation

**What to build:** Confirm that the legacy workload IAM user has no access keys
and that the production-like BFF passed the identity and live S3 path in that
keyless state. Record the proof for the separately reviewed retirement ticket;
do not create a key merely to disable it.

**Blocked by:** 03 — Replace IAM-key setup with the workload-identity operator flow; 05 — Tighten the role and prove the least-privilege cutover.

**Status:** ready-for-agent

- [x] Resolve the legacy workload IAM user and require zero access keys through read-only inspection.
- [x] Distinguish the legacy workload user from the separate administrative operator behind the `default` profile; do not alter the operator identity.
- [x] Confirm that the production-like BFF configuration contains neither legacy access-key variable and that the same-container identity check reports the intended assumed role.
- [x] Confirm the complete live browser-to-S3 tracer passed after zero-key inspection, including exact smoke-object cleanup; reuse issue 05 evidence rather than repeat an unchanged run.
- [x] Confirm through live IAM inspection that the keyless workload user and its managed-policy attachment still exist.
- [x] Record the keyless proof time for the Stage D audit trail.
- [x] Do not create, disable, or delete an access key merely to satisfy this ticket; stop for operator direction if a key appears.
- [x] Keep credentials, session tokens, and private-key material out of command output, logs, comments, and tracker files.
- [x] Do not modify Terraform to remove the user or attachment in this ticket.

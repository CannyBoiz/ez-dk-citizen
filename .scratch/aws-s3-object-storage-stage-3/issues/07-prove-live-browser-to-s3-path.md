# 07 — Prove the live browser-to-S3 path

**What to build:** Give a developer a safe, explicit way to configure the
BFF's Roles Anywhere workload identity and prove the complete direct-transfer contract in
a real browser against the private application bucket. The opt-in tracer uses
isolated smoke objects and cleans up only what it creates.

**Blocked by:** 01 — Secure the private S3 boundary; 06 — Return mobile Playback URLs.

**Status:** resolved

The original permanent IAM-key setup requirements below are historical and
superseded by [ADR-0006](../../../docs/adr/0006-use-iam-roles-anywhere-for-the-bff.md)
and the completed Roles Anywhere migration. They must not be reimplemented.

- Superseded: ~~Provide an interactive human setup wizard for applying the prepared infrastructure change, creating or rotating the dedicated IAM user's access key, and placing required values only in ignored local or deployment secret locations.~~ Replaced by the workload-identity setup in migration ticket 03 and the reviewed infrastructure changes in tickets 05 and 07, linked below.
- Superseded: ~~Make the wizard show the relevant AWS locations and confirmations without printing, committing, or storing permanent credentials in Terraform state.~~ The replacement prompts for identity ARNs, validates host-provisioned identity files, and never requests or persists AWS credentials.
- [x] Provide a repeatable Roles Anywhere setup workflow that validates the workload certificate, private-key permissions, shared profile, container mounts, and same-container assumed-role identity.
- [x] Add one explicit opt-in live-tracer command that is excluded from default tests, builds, typechecking, readiness, and credential-free integration runs.
- [x] Fail the tracer early with actionable messages when required AWS configuration, browser prerequisites, application services, or allowed Admin origin are unavailable.
- [x] Run the upload portion in a real browser from an allowed local Admin origin rather than substituting Node.js HTTP behavior for browser CORS behavior.
- [x] Exercise an authenticated Upload Intent through the BFF with a test-only injected object-key generator that confines this run to a unique `smoke/{random UUID}.mp3` key without adding a production prefix setting.
- [x] Perform the direct browser PUT using the returned authorization and required content type, browser-generated exact content length, and `If-None-Match: *`.
- [x] Prove CORS preflight succeeds for the intended origin, method, and headers and fails for a disallowed origin or unapproved request shape.
- [x] Prove a second PUT to the same signed object key cannot overwrite the first object.
- [x] Complete the Media Asset through the authenticated BFF route, read the Published Lesson through the mobile route, fetch the returned Playback URL directly from S3, and verify the exact uploaded bytes.
- [x] Prove unsigned public object access is rejected and browser-visible responses contain no permanent AWS credentials, bucket, or object key as separate metadata fields (the presigned URLs necessarily address the S3 object).
- [x] Record every exact smoke key created by the run and delete only those keys in a `finally` cleanup path, including after partial tracer failure.
- [x] Never list, sweep, or delete the `audio/` prefix, and report any exact-object cleanup failure clearly for manual recovery.
- [x] Verify storage and application logs remain free of credentials, bearer tokens, request bodies, and complete presigned URLs during the live flow.
- [x] Run formatting, workspace typechecking, builds, default tests, PostgreSQL integration, the credential-free Stage 3 tracer, infrastructure validation, and the opt-in live browser tracer as the final Stage 3 verification set.

## Completion evidence

These links record prior completion; they do not claim a new live AWS run for
this ticket reconciliation.

| Requirement                                                                                                                                                            | Implementation and recorded evidence                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workload-identity setup and safe operator output                                                                                                                       | [Migration ticket 03](../../iam-roles-anywhere-bff-migration/issues/03-replace-iam-key-operator-flow.md), [setup script](../../../scripts/setup-aws-s3.sh), and [operator instructions](../../../README.md#roles-anywhere-operator-setup). Implemented in `c695ccb`; replacement-certificate validation corrected in `0e8c01f`.                                                    |
| Opt-in command, prerequisites, real browser, signed headers, CORS, overwrite rejection, completion, playback, public-response checks, exact-key cleanup, and safe logs | [Migration ticket 04](../../iam-roles-anywhere-bff-migration/issues/04-trace-live-s3-through-bff-container.md), [live tracer](../../../scripts/test-live-s3-browser.mjs), [test-only BFF entrypoint](../../../scripts/test-live-s3-bff-entrypoint.mjs), and [workspace commands](../../../package.json). Commit `c695ccb` records live validation through the production-like BFF. |
| Local regression suite before live verification                                                                                                                        | Migration ticket 04 records the full credential-free regression set. `pnpm test:live-s3` runs typechecking, default tests, development-container checks, PostgreSQL integration, the fake-storage end-to-end tracer, and build before its live portion.                                                                                                                            |
| Infrastructure validation and least-privilege live proof                                                                                                               | [Migration ticket 05](../../iam-roles-anywhere-bff-migration/issues/05-prove-least-privilege-cutover.md) records Terraform formatting/validation, approved removal of the broad inline policy, live identity/S3 verification, and a converged plan. [Ticket 06](../../iam-roles-anywhere-bff-migration/issues/06-confirm-keyless-operation.md) records the keyless baseline.       |
| Final verification after IAM-user retirement                                                                                                                           | [Migration ticket 07](../../iam-roles-anywhere-bff-migration/issues/07-retire-legacy-iam-user.md) and [current migration state](../../iam-roles-anywhere-bff-migration/spec.md) record successful identity and live S3 checks before and after retirement, plus Terraform convergence. Commit `d38ed75` records that completed cutover.                                            |

## Comments

- 2026-09-18: Added the repeatable AWS setup wizard, opt-in real-browser tracer,
  and test-only smoke-key injection. Workspace typechecking, build, and default
  tests pass. The live run now needs human-owned credentials, a disposable
  localized Lesson, a reachable Data Service, and Chromium. Docker-backed
  verification is waiting for Docker Desktop WSL integration; Terraform provider
  validation is waiting for a runnable AWS provider plugin.
- 2026-09-26: Reconciled the original checklist with the completed Roles Anywhere
  migration and current scripts. The September 18 credential and environment
  blockers above are historical; subsequent migration records supply the
  completion evidence. Permanent IAM-key setup is superseded, the legacy user
  is retired, and no remaining implementation gap was identified for this
  ticket. Live AWS and Terraform proof is reused from the linked records.
  Admin UI and Hetzner deployment remain Stages 4 and 6 respectively.
  Reconciliation checks passed: ticket formatting, all 12 local evidence links,
  `git diff --check`, workspace typechecking, and the full default test suite
  including certificate setup checks. The package scripts ran with installed
  pnpm 12.3.4 and `npm_config_manage_package_manager_versions=false` because
  automatic selection of the pinned pnpm version stalled. Container, live AWS,
  and Terraform checks were not rerun for this documentation-only change.

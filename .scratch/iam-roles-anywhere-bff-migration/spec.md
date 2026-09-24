# IAM Roles Anywhere BFF Migration

Status: ready-for-agent

## Problem Statement

The BFF is an external workload that accesses the private S3 bucket, but its
current application and container configuration still require a permanent IAM
user access-key pair. Those long-lived credentials are written into local
runtime configuration, passed explicitly to the AWS SDK, and required by the
live S3 tracer. This leaves the intended Hetzner workload dependent on a
credential that must be copied, stored, rotated, and eventually revoked by a
human.

A manually configured IAM Roles Anywhere chain already works for this
workload, and its infrastructure is now represented in Terraform. That alone
does not complete the migration: the BFF, container runtime, setup wizard, and
live verification path still use the IAM user. The migration spans the
application and infrastructure repositories and must preserve the currently
working path until the production-like BFF container has proved that it can
obtain temporary credentials, operate against S3, and identify itself as the
intended Roles Anywhere role.

The manually managed Hetzner VPS is not yet governed by a repository-driven
deployment workflow. Treating it as the cutover target now would mix workload
identity migration with an unresolved infrastructure-reconciliation problem.
The migration therefore needs a local production-like acceptance path and a
separately reviewed, keyless retirement stage.

## Solution

Complete the migration in four explicit stages.

Stage A is the accepted infrastructure baseline. Terraform imports and manages
the existing dedicated Trust Anchor, IAM role, Roles Anywhere profile, and
legacy broad inline role policy without replacing live resources. The existing
least-privilege managed S3 policy is attached to both the Roles Anywhere role
and the legacy IAM user. Terraform validation, a converged plan, and live IAM
inspection prove coexistence. The local ignored Terraform state remains
canonical and has a pre-import backup.

Stage B changes only the BFF credential path. The official AWS signing helper
runs in a glibc-compatible Node container as a shared-profile
`credential_process`. The AWS SDK uses its normal credential provider chain,
including its built-in temporary-credential refresh behavior. The BFF stops
accepting explicit access-key credentials, while the Data Service remains on
Alpine and receives no AWS identity files or settings. The helper release and
checksum are pinned, and the workload certificate, private key, and shared
profile are provisioned as read-only runtime mounts only for the BFF. Ordinary
development and automated tests continue to use FakeStorage without a live
certificate. The stale setup wizard, live tracer, Compose configuration, and
operator documentation move to the same Roles Anywhere path.

Before Stage C, remove the imported broad inline role policy through a separate
reviewed Terraform plan, leaving only the existing prefix-scoped managed policy
on the role. Stage C then runs the production-like BFF container locally with
the real signing helper and workload identity. The existing browser-to-BFF-to-
S3 tracer proves the complete upload and playback path and cleans up only its
own `smoke/` object. An STS identity check from the same container and standard
credential-provider path proves that the BFF is using the intended assumed
role. Negative runs prove that either legacy access-key variable causes the BFF
to reject startup. Live IAM inspection found that the legacy workload user has
no access keys. Do not create one merely to stage a rollback: verify the zero-key
state around the successful live path. If a key appears, stop and review that
change before proceeding. An idle delay would not observe a running workload:
the local acceptance containers stop after the tracer, and VPS deployment is
separate Stage 6 work.

Stage D retires the legacy IAM user only after a fresh successful keyless
same-container identity and live S3 proof. Remove its policy attachment and
user from Terraform in a dedicated, explicitly reviewed destroy plan that
requires explicit approval. Repeat the identity and live S3 proof after
retirement. Deployment to the existing Hetzner VPS remains part of Stage 6
and begins with reconciliation of the
manually created server rather than an unreviewed Terraform apply.

## User Stories

1. As the application operator, I want the BFF to use temporary STS credentials, so that no permanent AWS access key is deployed with the workload.
2. As the application operator, I want temporary credentials refreshed by the AWS SDK's supported provider chain, so that I do not maintain custom refresh code.
3. As the application operator, I want the official signing helper to supply credentials through a shared AWS profile, so that the workload uses a documented AWS integration.
4. As the application operator, I want the helper to run inside the BFF container, so that the credential path being verified is the credential path the application actually uses.
5. As the application operator, I want the BFF image to use a glibc-compatible Node base, so that the official helper can execute reliably.
6. As the Data Service maintainer, I want the Data Service to remain on Alpine, so that a service with no AWS responsibility does not change images unnecessarily.
7. As a security reviewer, I want only the BFF to receive the workload identity, so that the Data Service, PostgreSQL, and frontend clients cannot access it.
8. As a security reviewer, I want the dedicated Trust Anchor and exact `aws-iam-app` certificate CN restriction preserved during cutover, so that the working trust boundary does not widen.
9. As a security reviewer, I want the role trust policy restricted to the exact Trust Anchor and certificate identity, so that unrelated certificates cannot assume the role.
10. As a security reviewer, I want the role limited to object reads, writes, and deletes under `audio/` and `smoke/`, so that the BFF has only the permissions its current behavior needs.
11. As a security reviewer, I want no bucket-list permission on the role, so that the workload cannot enumerate unrelated objects.
12. As a security reviewer, I want the broad imported inline role policy removed before final live verification, so that the tracer proves the least-privilege policy rather than a temporary compatibility policy.
13. As the application operator, I want to inspect the legacy workload user's access keys at cutover, so that the plan does not assume a rollback credential exists.
14. As a security reviewer, I want no long-lived key created merely to stage a rollback, so that the migration remains keyless.
15. As the application operator, I want fresh keyless identity and S3 proof before retiring the legacy user, so that retirement depends on evidence rather than an idle delay or an unavailable key-based rollback.
16. As a Terraform operator, I want IAM-user retirement isolated in its own reviewed plan, so that intentional destroys cannot hide among imports or application changes.
17. As a Terraform operator, I want the existing local state to remain canonical for this solo PoC, so that the migration does not introduce an unnecessary backend project.
18. As a Terraform operator, I want manually created Roles Anywhere resources imported rather than recreated, so that working cloud identities are not duplicated or replaced.
19. As a Terraform operator, I want the public CA certificate available to the Trust Anchor configuration, so that Terraform can describe the public trust material.
20. As a security reviewer, I want all CA and workload private keys excluded from Terraform, source control, and image layers, so that infrastructure state and images contain no signing secrets.
21. As a security reviewer, I want the workload certificate and key mounted read-only at runtime, so that the application cannot mutate its own identity material.
22. As a security reviewer, I want the workload private key readable only by the non-root BFF user with mode `0600`, so that other host or container users cannot read it.
23. As a security reviewer, I want the CA private key kept off the workload host, so that compromise of the BFF cannot issue additional trusted certificates.
24. As a build maintainer, I want the signing-helper release and its published checksum pinned, so that image builds do not silently consume a different binary.
25. As a build maintainer, I want the image build to fail on a helper checksum mismatch, so that corrupted or substituted downloads cannot enter the runtime image.
26. As a BFF maintainer, I want S3 client construction to omit explicit credentials, so that the normal AWS provider chain owns credential selection and refresh.
27. As a BFF maintainer, I want AWS region and bucket configuration to remain explicit, so that non-secret deployment configuration stays understandable.
28. As a BFF maintainer, I want startup to reject the presence of either legacy access-key variable, so that a stale secret cannot silently bypass Roles Anywhere.
29. As a BFF maintainer, I want readiness to continue checking the Data Service without calling S3, so that readiness does not depend on an external cloud request.
30. As a developer, I want ordinary local startup and automated tests to remain credential-free, so that application work does not require a live certificate or AWS session.
31. As a developer, I want FakeStorage to remain the normal test double, so that service behavior is deterministic and fast.
32. As a developer, I want the live AWS workflow to remain explicit and opt-in, so that default tests and builds never make cloud changes.
33. As the application operator, I want the setup wizard to guide certificate, key-permission, profile, mount, and identity checks, so that human-only configuration is repeatable.
34. As a security reviewer, I want the setup wizard never to print, copy, or persist private-key content, so that assistance does not become a secret-exfiltration path.
35. As the application operator, I want the wizard to stop requesting IAM-user access keys, so that new operators cannot accidentally restore the retired credential model.
36. As the application operator, I want the live tracer to exercise the production-like BFF container, so that success is evidence about the deployable runtime rather than an in-process substitute.
37. As the application operator, I want an identity check from the BFF's container and provider chain, so that the observed principal is the intended assumed role rather than the legacy IAM user.
38. As a content administrator, I want Upload Intent signing to work through Roles Anywhere, so that direct browser uploads retain their existing workflow.
39. As a content administrator, I want browser uploads to retain the required `If-None-Match: *` condition, so that reusing an authorization cannot overwrite an existing object.
40. As a content administrator, I want completion to inspect the uploaded object through Roles Anywhere, so that invalid media cannot become playable.
41. As a mobile learner, I want Playback URL signing to continue working after cutover, so that lesson audio remains streamable without exposing AWS credentials.
42. As a security reviewer, I want unsigned public access to remain rejected, so that moving credential mechanisms does not weaken the bucket boundary.
43. As the application operator, I want the tracer to use a unique `smoke/` object and delete only that exact object, so that verification cannot damage lesson audio or unrelated data.
44. As the application operator, I want tracer cleanup to use the same least-privilege role, so that the retained delete permission is demonstrated by its intended use.
45. As a security reviewer, I want application and verification logs checked for credentials, private keys, tokens, and complete presigned URLs, so that successful testing does not leak secrets.
46. As a security reviewer, I want the built BFF image inspected for private credential material, so that runtime provisioning remains the only source of workload identity.
47. As the application operator, I want routine workload-certificate rotation scheduled at least 30 days before expiry, so that normal renewal is planned rather than urgent.
48. As an incident responder, I want a compromised private key to trigger immediate profile disablement, so that new sessions cannot be issued while identity is replaced.
49. As an incident responder, I want emergency rotation to use a new certificate identity and matching trust-policy constraint, so that the stolen old certificate no longer satisfies the role trust policy.
50. As an incident responder, I want dedicated-CA rotation available as a fallback, so that trust can still be recovered without maintaining CRL infrastructure for the PoC.
51. As the deployment maintainer, I want Hetzner deployment handled separately in Stage 6, so that identity cutover is not blocked by an unrelated server-ownership decision.
52. As the deployment maintainer, I want the manually created VPS reconciled before any Terraform action, so that it is not accidentally replaced or duplicated.

## Implementation Decisions

- The migration spans the application repository and its sibling infrastructure repository. It is not complete until the BFF no longer depends on permanent IAM-user credentials and the legacy IAM user has been retired after verification.
- Stage A is complete and is the infrastructure baseline. The existing Trust Anchor, IAM role, Roles Anywhere profile, and legacy inline role policy are imported. The least-privilege managed policy is attached to both the role and the legacy IAM user. Terraform converges without changes, and live IAM inspection confirms coexistence.
- The private CA is dedicated exclusively to the `ez-dk-citizen` workload. Preserve the current Trust Anchor and the exact `x509Subject/CN = aws-iam-app` condition during normal cutover.
- The Roles Anywhere role remains `ez-dk-citizen-role-anywhere-s3`, and the Roles Anywhere profile remains `ez-dk-citizen-prod`. Its one-hour maximum session duration remains unchanged.
- The effective S3 permission boundary is `GetObject`, `PutObject`, and `DeleteObject` on only the `audio/` and `smoke/` prefixes. `ListBucket`, wildcard S3 actions, and bucket-wide object access are not required.
- The imported broad inline role policy is temporary migration state. Remove it through a separate reviewed Terraform plan after confirming the managed attachment and before Stage C acceptance, so the live proof exercises only the prefix-scoped policy.
- The old IAM user and its managed-policy attachment remain through Stage B and the successful Stage C run. Live IAM inspection found zero access keys on that user. Do not create a key to manufacture a rollback path or repeat the live tracer solely for a nonexistent disablement. An idle 24-hour wait provides no workload observation or rollback while the local BFF is stopped. If a key appears, stop and obtain operator direction.
- Terraform continues to use the local ignored state. Do not introduce a remote backend, modules, workspaces, or extra deployment environments for this PoC.
- Terraform manages only public trust material. It never generates, imports, stores, or provisions the CA private key, workload private key, or private-key-bearing bundles.
- The committed CA certificate is public trust material and is not encrypted. The workload certificate is not secret but remains host-provisioned runtime material rather than Terraform configuration. No private-key material is committed.
- The BFF uses the official `aws_signing_helper` through `credential_process` in a shared AWS profile. Do not use helper serve mode, a credential sidecar, helper update mode, or a custom Roles Anywhere/CreateSession implementation.
- The AWS SDK uses its normal credential provider chain and refresh behavior. The S3 adapter accepts region and bucket configuration but no access-key ID or secret-key arguments.
- The BFF keeps Node 26 but changes from Alpine to a glibc-compatible base for both development and production targets. The Data Service remains Alpine.
- The BFF image pins one official signing-helper release and verifies its official checksum during the image build. The image contains the helper but no certificate, private key, shared profile, or temporary credentials.
- The host provisions the workload certificate, workload private key, and shared AWS profile at stable locations. They are bind-mounted read-only only into the BFF container. The profile references the mounted paths and the existing Trust Anchor, Roles Anywhere profile, and role.
- The BFF continues to run as a non-root user. Host ownership and mode `0600` make the private key readable by that user without broadening access.
- Standard AWS profile selection and configuration-path variables select the shared profile. `AWS_REGION` and `S3_BUCKET` remain required non-secret BFF configuration.
- The presence of either `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` is a startup error. Remove both variables from normal Compose configuration rather than passing empty placeholders.
- BFF readiness continues to reach only the Data Service. It does not fetch AWS credentials or make an S3 request; storage requests and the opt-in tracer provide the AWS operational signal.
- The existing Storage interface and FakeStorage remain the application testing seam. No workload certificate is required for unit, integration, build, typecheck, readiness, or ordinary container-development checks.
- The human setup wizard is refactored from IAM-access-key creation to workload-identity verification and runtime preparation. It verifies that required public and private workload files exist, verifies restrictive key permissions, prepares or validates the shared profile, validates the BFF mounts, and runs the identity check without displaying private material.
- The existing live browser tracer remains opt-in and retains its direct-transfer behavior, overwrite rejection, Media Asset completion, Playback URL fetch, unsigned-access rejection, safe-log checks, and exact-object cleanup.
- Stage B/C acceptance runs the tracer against the production-like BFF container rather than creating an in-process BFF with explicit credentials. Any direct tracer operation that needs AWS authorization uses the same shared profile/provider mechanism and least-privilege role.
- The BFF runtime identity is proven by calling STS `GetCallerIdentity` from the same container and provider chain used by the BFF. The result must be an assumed-role session for `ez-dk-citizen-role-anywhere-s3`, not an IAM user.
- Negative acceptance starts the actual BFF container once with only the legacy access-key ID variable and once with only the legacy secret-key variable; each run must fail before serving requests with an actionable refusal.
- Confirm the legacy workload user has zero access keys before and after Stage C verification. Do not create or alter a workload key, and do not disable or alter the separate operator identity used to administer AWS.
- Stage D removes the legacy workload user's managed-policy attachment and user from Terraform only after a fresh keyless same-container identity and live S3 proof. Review the exact destroy plan and require explicit approval before applying it; stop if any workload access key appears. Repeat the proof after retirement.
- If the Roles Anywhere path fails, S3-dependent requests fail until the operator repairs the certificate, signing helper, profile, or trust configuration and repeats the identity and live S3 proof. Do not create an IAM-user access key as a planned fallback.
- Routine certificate rotation is manual and scheduled at least 30 days before the current certificate expires. Routine rotation may retain the current identity while the existing certificate remains uncompromised.
- Emergency private-key compromise handling is different from routine rotation: disable the Roles Anywhere profile immediately, issue a new key and certificate with a new certificate identity, update the trust-policy identity constraint, verify the replacement, and only then re-enable the profile. Rotating the dedicated CA is the fallback. Merely replacing a certificate while retaining the trusted identity is not revocation.
- No CRL infrastructure is added for the PoC.
- The existing Hetzner VPS remains manually managed and is not the Stage C target. Stage 6 must reconcile it with the existing, non-authoritative Hetzner Terraform before deciding whether to import or replace anything.
- Update current operator and architecture documentation. Historical scratch tickets may remain unchanged when clearly superseded rather than being rewritten as if they described the original implementation.

## Testing Decisions

- Tests assert external behavior and security boundaries rather than helper invocation details. A good acceptance test proves which principal performed the operation, whether the public BFF behavior still works, and whether forbidden configuration is rejected.
- Stage A uses one infrastructure acceptance seam: Terraform formatting and validation, safe imports into the canonical local state, a reviewed plan, convergence after apply, and live IAM inspection. The seam confirms the exact trust conditions, Roles Anywhere resources, managed role attachment, retained IAM-user attachment, and temporary legacy inline policy.
- Removal of the broad inline role policy gets its own reviewed Terraform plan. Live IAM inspection must show only the prefix-scoped managed policy before Stage C is accepted.
- Stage B/C uses one primary application acceptance seam: the production-like BFF container with the real signing helper, read-only identity mounts, shared profile, normal AWS SDK provider chain, real S3 bucket, and existing browser tracer.
- The acceptance run obtains STS identity evidence from the same container and credential path as the BFF, then exercises authenticated Upload Intent creation, browser CORS preflight, conditional direct upload, overwrite rejection, S3 metadata inspection, Media Asset completion, Playback URL generation, direct playback, unsigned-access rejection, and exact `smoke/` cleanup.
- The same container harness has two negative startup cases. Defining only the legacy access-key ID must fail, and defining only the legacy secret key must fail. This proves each variable is independently forbidden.
- Verify zero legacy workload access keys before and after the Stage B/C acceptance run. The assumed-role identity and live tracer then prove success without an IAM-user access key; no duplicate run is needed for a nonexistent disablement.
- Inspect runtime logs and configured audit logs after the live run. They must not contain access keys, temporary credentials, private-key material, bearer tokens, request bodies, or complete presigned URLs.
- Inspect the built BFF image and its metadata for workload certificates, private keys, shared profile contents, and credentials. Public helper binaries and ordinary non-secret application configuration are expected.
- Keep existing Storage and BFF route tests on FakeStorage. They continue to prove authorization shape, object validation, cleanup behavior, and application errors without AWS credentials.
- Keep the existing Docker-free unit tests, compiled builds, workspace typechecking, PostgreSQL integration harness, BFF-to-Data-Service tracer, and container-development smoke test in the regression set.
- The existing storage-adapter tests are prior art for presigning semantics. The existing container-development smoke test is prior art for Compose configuration and startup behavior. The existing live browser tracer is prior art for the real S3/CORS acceptance path.
- The live S3 acceptance workflow remains opt-in and must not run from default tests, builds, readiness probes, or ordinary development startup.
- Stage D uses a reviewed Terraform destroy plan plus live IAM inspection. After apply, the workload IAM user and attachment must be absent while the Roles Anywhere identity and live S3 path remain operational.

## Out of Scope

- Deploying the migration to the existing Hetzner VPS, creating a production Compose override, or building a repository-driven deployment workflow. Those remain Stage 6 work.
- Applying the existing Hetzner Terraform before reconciling it with the manually created server.
- Introducing a remote Terraform backend, Terraform modules, Terraform workspaces, or separate development and staging Roles Anywhere environments.
- Reissuing the working certificate merely to rename `aws-iam-app` during normal cutover.
- Terraform management or generation of CA keys, workload private keys, workload certificates, or P12/PFX bundles containing private keys.
- A credential sidecar, signing-helper serve mode, custom temporary-credential refresh, direct CreateSession code, or persisting temporary credentials to disk.
- CRL infrastructure. Emergency invalidation uses a new certificate identity and trust-policy update, with dedicated-CA rotation as fallback.
- Automated certificate issuance or rotation. The PoC retains an explicit manual operator procedure.
- Granting `ListBucket`, wildcard S3 actions, bucket-wide object access, or permissions for prefixes other than `audio/` and `smoke/`.
- Changes to the Data Service image, PostgreSQL, frontend clients, Media Asset domain rules, or direct browser-to-S3 architecture.
- Making live AWS access a prerequisite for ordinary development, unit tests, integration tests, builds, or health/readiness checks.
- New dashboards, alarms, log-shipping infrastructure, or CloudTrail infrastructure in this migration. Stage 6 will address a developer email alert for deployed BFF storage-credential failures using a failure signal independent of the BFF's AWS credentials. Existing AWS identity evidence may be inspected when available.
- Automatic deletion of historical audio or abandoned Media Assets. Tracer cleanup remains limited to exact smoke objects created by the run.

## Further Notes

- Stage A has already been applied and verified as one addition, no changes, and no destroys: the existing least-privilege managed policy is now attached to the Roles Anywhere role. Terraform subsequently converged with no changes.
- Stage A deliberately retained both the legacy workload IAM user and the imported broad inline role policy. Their presence is migration state, not the desired final authorization model.
- The `default` operator profile is backed by a separate administrative IAM user. It must not be confused with or retired alongside the legacy `ez-dk-citizen` workload user.
- The working application certificate expires around September 2027. The dedicated CA has a longer lifetime, but its private key remains external to the repositories and workload.
- The role needs `DeleteObject` for invalid-upload cleanup and exact smoke-object cleanup. That permission is intentional despite the otherwise narrow boundary.
- Conditional writes, random immutable object keys, private-bucket enforcement, explicit CORS origins, and short-lived presigned URLs remain unchanged by the credential migration.
- The application credential migration must not be reported complete while any BFF, Compose, wizard, tracer, or current operator documentation still requires permanent AWS access keys.
- Each stage should remain a separate commit or review unit. Any Terraform destroy, IAM key disablement, profile disablement, trust-policy identity change, or IAM-user retirement requires explicit operator visibility appropriate to the action.

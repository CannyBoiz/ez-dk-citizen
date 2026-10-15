# 01: Move S3 into its own Storage Service

**What to build:** Move every S3 responsibility out of the Backend into a separate internal Storage Service, so the AWS identity never sits in the internet-facing process (ADR-0009). The Backend serves clients and owns PostgreSQL through its data module; the Storage Service owns S3.

The Storage Service takes over:

- the Roles Anywhere identity: the workload certificate and private key, the shared AWS profile, the signing helper and its glibc image, and the role's S3 permissions. The certificate CN `aws-iam-app`, Trust Anchor, role, profile, and trust policy stay unchanged (ADR-0006 as amended);
- the four `Storage` operations in `apps/bff/src/storage.ts` today: upload authorization, object inspection, playback authorization, and deletion.

The Backend calls it over the internal network with a bearer token of its own, `X-Request-ID`, and Problem Details, through a client implementing the existing `Storage` interface, so tests keep `FakeStorage`. The Backend keeps generating object keys and passes them in; the Storage Service has no database access. It is never published and has no client-facing routes.

MP3 bytes keep travelling directly between clients and S3 (ADR-0005). This changes who signs, not where the bytes go.

**Blocked by:** the merge of the BFF and Data Service into the Backend (`.scratch/one-backend/spec.md`).

**Status:** wontfix

**Decision (2026-10-16):** Not built, during or after the PoC. ADR-0009 keeps S3 and the AWS identity in the Backend and accepts the key-theft risk, bounded by role scope, `If-None-Match`, bucket versioning (ADR-0010), and the Stage 6 key-misuse alert. The revisit trigger lives in `.scratch/security-at-scale/issues/01`. Checksums and versioning moved to `.scratch/s3-hardening/`.

**Resolved at the 2026-10-16 design review:**

- ADR-0009 records the move and amends ADR-0006; the CN and trust policy move unchanged.
- Checksum signing for Upload URLs is split out to `.scratch/s3-hardening/issues/01-sign-upload-checksums.md`.
- The Backend passes object keys in; the Storage Service never reads Media Assets.
- Deployment: one more container (`storage`) with its own token in Compose; the identity mounts, the operator setup script, and `scripts/test-roles-anywhere-container.mjs` retarget from `bff` to `storage`. Terraform is unchanged. Stage 6 deploys this shape directly.

**Acceptance criteria:**

- [ ] The Backend has no AWS SDK dependency, identity files, or AWS configuration.
- [ ] The Storage Service accepts only `audio/{uuid}.mp3` and `smoke/{uuid}.mp3` keys.
- [ ] Upload intents, completion checks, Playback URLs, and Draft deletion behave as before, proven by the Backend tests, the fake-storage end-to-end tracer, and the live S3 tracer.
- [ ] The Storage Service is internal-only, requires its own token, rejects static AWS access-key configuration, and never returns credentials.
- [ ] Only the `storage` container receives the AWS profile and identity mounts; the operator setup script proves the assumed-role identity from that container.
- [ ] Default tests, typechecking, and builds still need no AWS credentials.

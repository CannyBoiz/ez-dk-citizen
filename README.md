# ez-dk-citizen

The project helps a Thai-speaking learner study for the Danish citizenship
exam.

## Local development

Start the complete development stack from a clean checkout; no `.env` file or
host dependency installation is required:

```sh
pnpm dev
```

Docker Compose Watch builds the shared contracts, applies migrations, starts
PostgreSQL, the private Data Service, and then the BFF, and synchronizes source
updates into the writable application containers. The BFF is available at
`http://127.0.0.1:3001` and PostgreSQL at `127.0.0.1:5432`; the Data Service is
not published to the host.

The defaults are development-only. Copy `.env.example` to `.env` to override
credentials, origins, or ports locally. Real `.env` files are ignored by Git.

## Roles Anywhere operator setup

Provision the workload certificate and private key at `runtime/aws/workload.crt`
and `runtime/aws/workload.key`. The dedicated CA's public certificate is read
from `../cannyboiz-devops-hub/terraform/ez-dk-citizen/certs/ca.crt`. Keep the
private key host-only, owned so container UID `1000` can read it, and mode
`0600`; the setup command checks these conditions without displaying its
contents. The certificate must have subject CN `aws-iam-app` and chain to that
public CA certificate.

Run:

```sh
scripts/setup-aws-s3.sh
```

On first run, it asks for the Trust Anchor, Roles Anywhere profile, and role
ARNs, then prepares the shared profile at `runtime/aws/config`. It stores only
the non-secret `AWS_REGION` and `S3_BUCKET` settings in ignored `.env`. It
validates the certificate subject and chain, checks key mode, builds and
inspects the production-like BFF image, validates the read-only mounts and
non-root key access, and proves the assumed-role identity through STS in that
container. It never asks for or stores IAM access keys or temporary credentials.

For an identity staged at other host paths, set
`AWS_ROLES_ANYWHERE_CERTIFICATE_FILE`, `AWS_ROLES_ANYWHERE_PRIVATE_KEY_FILE`,
and optionally `AWS_ROLES_ANYWHERE_CONFIG_FILE` and
`AWS_ROLES_ANYWHERE_CA_CERTIFICATE_FILE` when running the same command. Use
`scripts/setup-aws-s3.sh --preflight` to validate the image, mounts, and
certificate while a Roles Anywhere profile is disabled; it deliberately skips
the STS exchange. Re-enable the profile only after that succeeds, then rerun the
command without `--preflight` to prove the identity.

Schedule routine certificate rotation at least 30 days before expiry. Issue a
replacement with the same `aws-iam-app` identity, stage it at alternate paths,
and run the full setup check before switching the active host files. Keep the
Trust Anchor, profile, role, and trust-policy identity unchanged.

For a private-key compromise, disable the Roles Anywhere profile immediately.
Issue a new key and certificate with a new certificate identity, update the
role trust-policy identity constraint, and run `--preflight` against the staged
files. Before re-enabling, independently inspect the AWS role trust policy and
confirm its Trust Anchor and new certificate identity conditions; preflight
cannot inspect live IAM policy. Re-enable the profile only after those checks
pass, then immediately rerun the full setup command to prove STS identity. If
that proof fails, disable the profile again. Dedicated-CA rotation is the
emergency fallback. Replacing only the certificate while retaining the trusted
identity does not revoke the compromised certificate. Hetzner VPS
reconciliation remains deferred to Stage 6.

`pnpm test:live-s3` requires exported `ADMIN_API_TOKEN`, `DATA_SERVICE_TOKEN`,
`AWS_REGION`, and `S3_BUCKET`, plus the configured Roles Anywhere profile and a
Chromium-family browser. The tracer scans both containers' logs. If additional
file-based audit logs are configured, set `LIVE_S3_TRACER_LOG_FILES` to their
comma-separated absolute paths; keep those files outside the repo or Git-ignored.
It runs typecheck, unit, container-development, integration, end-to-end, and
build checks before starting the live portion. That portion uses the
production BFF image and its read-only workload-identity mounts, creates a
temporary Lesson in an isolated Data Service, and drives the BFF over its
published HTTP port. It uploads one unique `smoke/` object to the configured
bucket and deletes only recorded exact keys through the same container's Roles
Anywhere credentials. Run it only when live S3 writes and deletes are intended.
It does not use the host development database or pass static AWS keys to the
container.

Stop the stack without deleting its named PostgreSQL volume:

```sh
pnpm db:down
```

Generate migrations on the host, then apply them through the running Data
Service development container:

```sh
pnpm db:generate
pnpm db:migrate
```

Only migration generation reads the optional root `.env`. Application startup,
migration execution, and verification consume container-injected configuration.

## Workspace scripts

The root package coordinates the Data Service, BFF, and shared contracts
workspaces. Both application containers listen on configurable `PORT=3000`.

| Command                    | Purpose                                                                      |
| -------------------------- | ---------------------------------------------------------------------------- |
| `pnpm dev`                 | Run the complete local stack through Docker Compose Watch.                   |
| `pnpm typecheck`           | Type-check every workspace without emitting files.                           |
| `pnpm build`               | Compile every workspace to JavaScript.                                       |
| `pnpm db:generate`         | Generate a Drizzle migration from the schema.                                |
| `pnpm db:migrate`          | Apply committed migrations inside the running development Data container.    |
| `pnpm db:up`               | Start local PostgreSQL and wait until it is healthy.                         |
| `pnpm db:down`             | Stop local Compose containers without deleting development data.             |
| `pnpm test`                | Run Docker-free contract and service-boundary tests.                         |
| `pnpm test:dev`            | Smoke-test the isolated merged development Compose topology.                 |
| `pnpm test:integration`    | Build, migrate, and fully test an isolated PostgreSQL/Data Service stack.    |
| `pnpm test:e2e`            | Run the isolated BFF-to-PostgreSQL Stage 2 tracer.                           |
| `pnpm test:roles-anywhere` | Build the production-like BFF and prove its mounted Roles Anywhere identity. |
| `pnpm test:live-s3`        | Run credential-free regressions, then the opt-in browser-to-S3 tracer.       |

Both container workflows create a temporary Compose project and volume, then
remove both. `pnpm test:e2e` proves the admin-to-mobile flow; neither command
uses the persistent development database. Use `pnpm db:down` to stop development
services; add `--volumes` manually only when intentionally discarding local
development data.

Both services expose unauthenticated `GET /health` liveness and `GET /ready`
dependency-readiness endpoints. The Data Service readiness check reaches
PostgreSQL; the BFF readiness check reaches the Data Service.

The integration command creates a unique Compose project, waits for PostgreSQL
health, applies the committed migration, and waits for the compiled Data
Service. It verifies the canonical
Language seed, runs the complete constraint and relational-query suite through
the exported Drizzle layer, reapplies migration to prove idempotency, and proves
that a failed migration prevents its dependent Data Service from starting. Its
containers, network, and project-scoped volume are removed afterward, including
after test failure. The normal development volume belongs to a different
Compose project and is not removed.

If a migration fails, Compose leaves the Data Service stopped. Fix or replace
the committed migration, rebuild with `pnpm dev`, and verify with
`pnpm test:integration`; do not delete the development volume as recovery.

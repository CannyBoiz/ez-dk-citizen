# ez-dk-citizen

Helps a Thai-speaking learner study for the Danish citizenship exam.

## Local development

Start the whole development stack from a clean checkout. You don't need a
`.env` file or any host dependencies:

```sh
pnpm dev
```

Docker Compose Watch starts PostgreSQL, runs the one-shot `migrate` service,
then starts the Backend and the Admin. It syncs source changes into the writable
application containers.

| Service    | Address                 | Notes                                                                                   |
| ---------- | ----------------------- | --------------------------------------------------------------------------------------- |
| Backend    | `http://127.0.0.1:3001` | Serves the Admin API and Mobile API. Reaches PostgreSQL in-process via `packages/data`. |
| Admin      | `http://127.0.0.1:5173` | Enter `ADMIN_API_TOKEN` to connect. The Admin keeps the token in memory only.           |
| PostgreSQL | `127.0.0.1:5432`        | Published to the host.                                                                  |

The defaults are for development only. To override credentials, origins, or
ports, copy `.env.example` to `.env`. Git ignores real `.env` files.

### Database

Stop the stack without deleting its named PostgreSQL volume:

```sh
pnpm db:down
```

To change the schema, generate a migration on the host, then apply it.
`pnpm db:migrate` rebuilds the image and reruns the one-shot `migrate` service
against the development database:

```sh
pnpm db:generate
pnpm db:migrate
```

Only migration generation reads the optional root `.env`. Application startup,
migration execution, and verification use configuration injected into the
containers.

If a migration fails, Compose leaves the Backend stopped. Fix or replace the
committed migration, rebuild with `pnpm dev`, and verify with
`pnpm test:integration`. Don't delete the development volume to recover.

### Health checks

The Backend has two unauthenticated endpoints:

- `GET /health` reports liveness and never touches PostgreSQL.
- `GET /ready` checks PostgreSQL within `DATABASE_TIMEOUT_MS` (default 2000) and
  answers `503` when it is unreachable.

While PostgreSQL is unreachable, Admin API and Mobile API requests answer
`503 database_unavailable`.

## Workspace scripts

The root package coordinates these workspaces:

- Backend: `apps/backend`. The container listens on `PORT`, 3000 by default.
- Admin: `apps/admin`
- Data: `packages/data`
- Shared contracts: `packages/api-contracts`
- Lesson Text Markdown: `packages/lesson-text`

| Command                    | Purpose                                                                          |
| -------------------------- | -------------------------------------------------------------------------------- |
| `pnpm dev`                 | Run the complete local stack through Docker Compose Watch.                       |
| `pnpm dev:live-s3`         | Run `pnpm dev` with the Backend's mounted Roles Anywhere identity and real S3.   |
| `pnpm typecheck`           | Type-check every workspace without emitting files.                               |
| `pnpm build`               | Compile every workspace to JavaScript.                                           |
| `pnpm lint`                | Check formatting and lint rules with Biome.                                      |
| `pnpm lint:fix`            | Apply Biome's safe fixes.                                                        |
| `pnpm db:generate`         | Generate a Drizzle migration from the data package's schema.                     |
| `pnpm db:migrate`          | Rebuild the image and apply committed migrations with the one-shot `migrate`.    |
| `pnpm db:up`               | Start local PostgreSQL and wait until it is healthy.                             |
| `pnpm db:down`             | Stop local Compose containers without deleting development data.                 |
| `pnpm test`                | Run Docker-free contract, data, Admin, Backend route, and script tests.          |
| `pnpm test:dev`            | Smoke-test the isolated merged development Compose topology.                     |
| `pnpm test:integration`    | Build, migrate, and fully test an isolated PostgreSQL and Backend stack.         |
| `pnpm test:e2e`            | Run the isolated Backend-to-PostgreSQL tracers with fake storage.                |
| `pnpm test:roles-anywhere` | Build the production-like Backend and prove its mounted Roles Anywhere identity. |
| `pnpm test:live-s3`        | Run credential-free regressions, then the opt-in browser-to-S3 tracer.           |
| `pnpm test:clean`          | Remove Docker resources that interrupted test runs left behind.                  |

### Container test runs

`pnpm test:integration` and `pnpm test:e2e` each create a temporary Compose
project and volume, and remove both when they finish, even if you stop the run
with Ctrl+C. A second Ctrl+C aborts that teardown; clean up afterwards with
`pnpm test:clean`, which never touches the development stack, images, or S3.
Neither command uses the persistent development database.

`pnpm test:integration` creates a unique Compose project, waits for PostgreSQL
to be healthy, applies the committed migration, and waits for the compiled
Backend. Then it:

- verifies the canonical Language seed;
- runs the data package's constraint and relational-query suite;
- runs the Backend's Admin API and Mobile API tests against real PostgreSQL;
- reapplies the migration to prove it is idempotent;
- proves that a failed migration stops the Backend from starting.

It removes its containers, network, and project-scoped volume afterwards, also
when tests fail. The development volume belongs to a different Compose project,
so it stays.

`pnpm test:e2e` proves the admin-to-mobile flow. It also pauses `postgres` to
check that `/health` stays OK while `/ready` reports `503`, then recovers.

To stop development services, use `pnpm db:down`. Add `--volumes` by hand only
when you mean to discard local development data.

## Roles Anywhere operator setup

The Backend reaches S3 with a workload certificate through IAM Roles Anywhere
([ADR-0006](docs/adr/0006-use-iam-roles-anywhere-for-the-bff.md)). The local
keyless cutover is complete: the legacy workload IAM user `ez-dk-citizen-app`
and its policy attachment are retired. Hetzner deployment and VPS
reconciliation are Stage 6 work.

### First-time setup

1. Provision the workload certificate and private key at
   `runtime/aws/workload.crt` and `runtime/aws/workload.key`. For normal
   operation the certificate must have subject CN `aws-iam` and chain to the
   dedicated CA's public certificate, which setup reads from
   `../cannyboiz-devops-hub/ez-dk-citizen/terraform/certs/ca.crt`.
2. Keep the private key on the host only, owned so container UID `1000` can
   read it, with mode `0600`. Setup checks this without displaying the key.
3. Remove any `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` entries from local
   `.env` files. Setup refuses to run while they are set.
4. Run the setup command. On first run it asks for the Trust Anchor, Roles
   Anywhere profile, and role ARNs, and writes the shared profile to
   `runtime/aws/config`.

   ```sh
   scripts/setup-aws-s3.sh
   ```

The setup command:

- stores only the non-secret `AWS_REGION` and `S3_BUCKET` settings, in the
  ignored `.env`;
- validates the certificate subject and chain, and checks the key's mode;
- builds and inspects the production-like Backend image, and checks the
  read-only mounts and non-root key access;
- proves the assumed-role identity through STS inside that container.

It never asks for or stores IAM access keys or temporary credentials.

### Credential lifetime for presigned URLs

Presigning needs fresh credentials that stay valid for the whole URL lifetime.
The Roles Anywhere role maximum and the profile session duration must both be
`7200` seconds, and the helper command requests `--session-duration 7200`.
Apply the reviewed Terraform duration change before rolling out this signing
change. If you already have a `runtime/aws/config`, append that flag to its
`credential_process` command and rerun setup after the apply.

The Backend uses a fresh SDK signing client for each URL and refuses to issue
one if the credentials expire too soon. Upload URLs last 15 minutes and
playback URLs one hour.

### Other host paths and preflight

To use an identity staged at other host paths, set these when running the setup
command:

- `AWS_ROLES_ANYWHERE_CERTIFICATE_FILE`
- `AWS_ROLES_ANYWHERE_PRIVATE_KEY_FILE`
- `AWS_ROLES_ANYWHERE_CONFIG_FILE` (optional)
- `AWS_ROLES_ANYWHERE_CA_CERTIFICATE_FILE` (optional)

`scripts/setup-aws-s3.sh --preflight` validates the image, mounts, and
certificate while a Roles Anywhere profile is disabled, and skips the STS
exchange. Re-enable the profile only after preflight passes, then rerun without
`--preflight` to prove the identity.

### Routine certificate rotation

Rotate at least 30 days before the certificate expires:

1. Issue a replacement with the same `aws-iam` identity.
2. Stage it at alternate host paths and run the full setup check.
3. Switch the active host files.

Keep the Trust Anchor, profile, role, and trust-policy identity unchanged.

### Private-key compromise

Replacing only the certificate while keeping the trusted identity does not
revoke the compromised certificate, so the replacement needs a new CN:

1. Disable the Roles Anywhere profile immediately.
2. Issue a new key and certificate with a new CN.
3. In the infrastructure repo, update `ez-dk-citizen/terraform/roles-anywhere.tf`
   so the role trust policy's `aws:PrincipalTag/x509Subject/CN` condition names
   that exact CN. Review and apply the Terraform plan while the profile stays
   disabled.
4. Stage the new files at alternate host paths. Run setup with `--preflight`
   and `AWS_ROLES_ANYWHERE_EXPECTED_CERTIFICATE_CN` set to the new CN.
5. Inspect the live AWS role trust policy yourself and confirm its exact Trust
   Anchor and new CN conditions. Preflight checks the certificate CN and CA
   chain but cannot read live IAM policy.
6. Re-enable the profile, then immediately run the full setup command with the
   same `AWS_ROLES_ANYWHERE_EXPECTED_CERTIFICATE_CN` to prove the STS identity.
   If that fails, disable the profile again.

Keep setting `AWS_ROLES_ANYWHERE_EXPECTED_CERTIFICATE_CN` for later checks while
that CN is active. Without it, the commands require CN `aws-iam`.

Rotating the dedicated CA is the emergency fallback.

### Running against real S3

`pnpm dev:live-s3` adds `docker-compose.roles-anywhere.yml` to the development
stack. It needs `S3_BUCKET`, `AWS_REGION`, and `ADMIN_API_TOKEN` from `.env` or
the shell. It blanks the default `ADMIN_ORIGINS`, so set that too (normally
`http://127.0.0.1:5173`).

`pnpm test:roles-anywhere` and `pnpm test:live-s3` load the optional root
`.env`; exported shell variables take precedence.

- The identity smoke test, `pnpm test:roles-anywhere`, needs `AWS_REGION` and
  `S3_BUCKET`.
- The live S3 tracer, `pnpm test:live-s3`, also needs `ADMIN_API_TOKEN`, the
  configured Roles Anywhere profile, and a Chromium-family browser.

The tracer first runs the typecheck, unit, container-development, integration,
end-to-end, and build checks. Its live portion then:

- uses the production Backend image and its read-only workload-identity mounts;
- migrates an isolated PostgreSQL database and creates a temporary Lesson there;
- drives the Backend over its published HTTP port;
- uploads one unique `smoke/` object to the configured bucket and deletes only
  the exact keys it recorded, using the same container's Roles Anywhere
  credentials.

It doesn't use the host development database or pass static AWS keys to the
container. Run it only when you intend live S3 writes and deletes.

The tracer scans the Backend container's logs. If you have configured extra
file-based audit logs, set `LIVE_S3_TRACER_LOG_FILES` to their comma-separated
absolute paths, and keep those files outside the repo or Git-ignored.

## License

Copyright (C) 2026 Phongsathorn Sreewilai <https://github.com/CannyBoiz>

This project is licensed under [AGPL-3.0-only](LICENSE).

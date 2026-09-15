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
For direct S3 upload authorization, set `AWS_REGION`, `S3_BUCKET`,
`AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY`; the tracked example contains
placeholders only.

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

| Command                 | Purpose                                                                   |
| ----------------------- | ------------------------------------------------------------------------- |
| `pnpm dev`              | Run the complete local stack through Docker Compose Watch.                |
| `pnpm typecheck`        | Type-check every workspace without emitting files.                        |
| `pnpm build`            | Compile every workspace to JavaScript.                                    |
| `pnpm db:generate`      | Generate a Drizzle migration from the schema.                             |
| `pnpm db:migrate`       | Apply committed migrations inside the running development Data container. |
| `pnpm db:up`            | Start local PostgreSQL and wait until it is healthy.                      |
| `pnpm db:down`          | Stop local Compose containers without deleting development data.          |
| `pnpm test`             | Run Docker-free contract and service-boundary tests.                      |
| `pnpm test:dev`         | Smoke-test the isolated merged development Compose topology.              |
| `pnpm test:integration` | Build, migrate, and fully test an isolated PostgreSQL/Data Service stack. |
| `pnpm test:e2e`         | Run the isolated BFF-to-PostgreSQL Stage 2 tracer.                        |

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

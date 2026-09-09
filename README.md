# ez-dk-citizen

The project helps a Thai-speaking learner study for the Danish citizenship
exam.

## Local PostgreSQL

Copy `.env.example` to `.env`, replace the local password placeholder, and keep
the values embedded in `DATABASE_URL` aligned with the PostgreSQL variables.
Real `.env` files are ignored by Git.

Start a healthy PostgreSQL 18 container from the repository root:

```sh
pnpm db:up
```

PostgreSQL is available to host-run tools on `127.0.0.1:5432` by default. Its
data is stored in a Compose-managed named volume and survives `db:down` followed
by `db:up`.

```sh
pnpm db:down
```

The root `docker-compose.yml` is local-development configuration. A future
`docker-compose.prod.yml` will override local-only behavior for deployment.

## Workspace scripts

The root package coordinates the Data Service, BFF, and shared contracts
workspaces. Host development uses port 3000 for the Data Service and port 3001
for the BFF; either service accepts a `PORT` override. The BFF uses
`DATA_SERVICE_URL`, defaulting to `http://127.0.0.1:3000`, and bounds readiness
checks with `DATA_SERVICE_TIMEOUT_MS`, defaulting to two seconds. Service
containers use port 3000 when no host-development argument or `PORT` is set.

| Command                 | Purpose                                                                   |
| ----------------------- | ------------------------------------------------------------------------- |
| `pnpm dev`              | Run the Data Service and BFF concurrently with hot reload.                |
| `pnpm dev:data`         | Run only the Data Service on host port 3000.                              |
| `pnpm dev:bff`          | Run only the BFF on host port 3001.                                       |
| `pnpm typecheck`        | Type-check every workspace without emitting files.                        |
| `pnpm build`            | Compile every workspace to JavaScript.                                    |
| `pnpm start`            | Run both compiled services on their host-default ports.                   |
| `pnpm db:generate`      | Generate a Drizzle migration from the schema.                             |
| `pnpm db:migrate`       | Apply committed Drizzle migrations using `DATABASE_URL`.                  |
| `pnpm db:up`            | Start local PostgreSQL and wait until it is healthy.                      |
| `pnpm db:down`          | Stop local Compose containers without deleting development data.          |
| `pnpm test`             | Run Docker-free contract and service-boundary tests.                      |
| `pnpm test:integration` | Build, migrate, and fully test an isolated PostgreSQL/Data Service stack. |

Both services expose unauthenticated `GET /health` liveness and `GET /ready`
dependency-readiness endpoints. The Data Service readiness check reaches
PostgreSQL; the BFF readiness check reaches the Data Service.

The integration command creates a unique Compose project, selects an available
localhost PostgreSQL port, waits for PostgreSQL health, applies the committed
migration, and waits for the compiled Data Service. It verifies the canonical
Language seed, runs the complete constraint and relational-query suite through
the exported Drizzle layer, reapplies migration to prove idempotency, and proves
that a failed migration prevents its dependent Data Service from starting. Its
containers, network, and project-scoped volume are removed afterward, including
after test failure. The normal development volume belongs to a different
Compose project and is not removed.

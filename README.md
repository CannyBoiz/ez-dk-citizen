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

The root package coordinates the workspace. Scripts that operate on application
code use pnpm's `--filter @ez-dk-citizen/data` selector, which matches the
`name` in `apps/data/package.json` and runs that package's corresponding script.

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Run the Data Service from TypeScript with hot reload. |
| `pnpm typecheck` | Type-check the Data Service without emitting files. |
| `pnpm build` | Compile the Data Service to JavaScript. |
| `pnpm start` | Run the compiled Data Service. |
| `pnpm db:generate` | Generate a Drizzle migration from the schema. |
| `pnpm db:migrate` | Apply committed Drizzle migrations using `DATABASE_URL`. |
| `pnpm db:up` | Start local PostgreSQL and wait until it is healthy. |
| `pnpm db:down` | Stop local Compose containers without deleting development data. |
| `pnpm test` | Run the Data Service test suite. |
| `pnpm test:integration` | Migrate and smoke-test an isolated PostgreSQL/Data Service stack. |

The integration command creates a unique Compose project, selects an available
localhost PostgreSQL port, waits for PostgreSQL health, applies the committed
migration, and waits for the compiled Data Service. It then verifies the
canonical Language rows through the exported Drizzle layer, reapplies migration
to prove the startup path is idempotent, and verifies the seed again. Its
containers, network, and project-scoped volume are removed afterward, including
after test failure. The normal development volume belongs to a different
Compose project and is not removed.

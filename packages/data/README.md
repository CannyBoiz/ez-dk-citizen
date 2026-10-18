# Data Service

Run all workflows from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm typecheck
pnpm test
pnpm build
pnpm db:generate
pnpm db:migrate
```

The container-first development command serves both applications with Compose
Watch. `GET /health` reports Data Service process liveness without querying
PostgreSQL; `GET /ready` verifies the database connection.

The committed migration under `drizzle/` creates the complete PoC schema and
initial Languages. Local Compose applies it with the one-shot `migrate` service
before starting `hono-data`.

`pnpm test` runs the Docker-free HTTP boundary tests. Use root
`pnpm test:integration` for the canonical workflow that provisions, migrates,
tests, and removes an isolated PostgreSQL database automatically.

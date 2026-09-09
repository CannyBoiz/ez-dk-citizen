# Data Service

Run all workflows from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm typecheck
pnpm test
pnpm build
pnpm start
pnpm db:generate
pnpm db:migrate
```

The development and production start commands serve the Hono application at
`http://localhost:3000` by default and accept a `PORT` override. `GET /health`
reports process liveness without querying PostgreSQL; `GET /ready` verifies the
database connection.

The committed migration under `drizzle/` creates the complete PoC schema and
initial Languages. Local Compose applies it with the one-shot `migrate` service
before starting the compiled `hono-data` service.

`pnpm test` runs the Docker-free HTTP boundary tests. Use root
`pnpm test:integration` for the canonical workflow that provisions, migrates,
tests, and removes an isolated PostgreSQL database automatically.

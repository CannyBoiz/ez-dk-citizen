# Data package

The library behind the Backend's data module: the only package that depends on
`drizzle-orm` and `pg`, and the only code that reaches PostgreSQL. Its
`exports` expose only the data module API (`createDataModule` and its result
types) and a test-only `./testing` entry that resets the database between
integration tests; neither hands out Drizzle. Data module operations return
results or named outcome codes and never HTTP responses; the Backend's routes
map those to Problem Details. The package also holds the Drizzle schema and relations, the committed
migrations under `drizzle/`, the Drizzle Kit configuration, and the `migrate`
command.

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

The package is a library, not a server. Compose runs its `migrate` command as
the one-shot `migrate` service from the Backend image before starting
`backend`. `pnpm db:generate` writes a new migration from the schema on the
host; `pnpm db:migrate` rebuilds the image and reruns `migrate`.

`pnpm test` runs the Docker-free tests of the result schemas. Use root `pnpm test:integration`
for the canonical workflow that provisions, migrates, and tests an isolated
PostgreSQL database, including this package's schema, constraint, and
relational-query tests, and then removes it.

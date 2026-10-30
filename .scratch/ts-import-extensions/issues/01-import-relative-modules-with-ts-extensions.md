# 01: Import relative modules with `.ts` extensions

**What to build:** Every relative import in server-side TypeScript names the
`.ts` file it imports, and `tsc` rewrites it to `.js` on emit
(`kanku-typescript-style` R3). Today `apps/backend`, `packages/data` and
`packages/api-contracts` write relative imports as `./x.js`. That is about 150
imports in 52 files, and none of the tsconfigs sets
`rewriteRelativeImportExtensions`. After this ticket there is one convention.

Do it in one PR, so no package mixes `.js` and `.ts` imports.

- Add `"rewriteRelativeImportExtensions": true` to the tsconfigs of
  `apps/backend`, `packages/data` and `packages/api-contracts`.
- Change every relative `from "./x.js"` and `import("./x.js")` to `.ts`.
  Package imports (`@ez-dk-citizen/data`, `hono/body-limit`) stay as they are.
- Add `"allowImportingTsExtensions": true` to `apps/admin/tsconfig.json`.
  The Admin UI type-checks the contracts package's source through its `types`
  condition, so the first `.ts` import between contracts files would otherwise
  fail its typecheck. It already sets `noEmit`, which the flag requires.
- The emitted `dist/` keeps `.js` imports, so the `exports` maps, `start`,
  `test:compiled` and the Docker images need no change.

**Out of scope:**

- Running TypeScript through Node's type stripping instead of `tsx`. This
  ticket makes that possible, but it is a separate convention.
- `erasableSyntaxOnly`, Vitest, and the other tooling differences from the
  skill.
- The Admin UI's own imports, which stay extensionless as Vite resolves them.

**Blocked by:** None

**Status:** needs-triage

- [ ] No relative import in `apps/backend`, `packages/data` or `packages/api-contracts` ends in `.js`
- [ ] The emitted `dist/` files import `.js`, never `.ts`
- [ ] `pnpm db:generate` still loads the Drizzle schema and generates no migration
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:integration`, and `pnpm test:e2e` pass

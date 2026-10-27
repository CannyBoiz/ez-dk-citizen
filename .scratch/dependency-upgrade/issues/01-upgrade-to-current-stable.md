# 01: Upgrade dependencies to current stable

**What to build:** Every dependency is on its current stable release
(`kanku-typescript-style` tooling). On 2026-10-25, `npm view` showed these
behind:

| Package | Repo | Current |
| --- | --- | --- |
| `zod` (every package) | 4.1.12 | 4.6.7 |
| `hono` | 4.13.4 | 4.13.13 |
| `@biomejs/biome` | 2.5.15 | 2.6.3 |
| `drizzle-orm`, `drizzle-kit` | 1.0.0-rc.4 | 1.0.0-rc.5 (`rc` tag) |

Start with `pnpm outdated -r` for the full list, because versions move. Exact
pins stay exact. Drizzle stays on its 1.0 release candidate while npm's
`latest` is 0.x: both packages move together to the same exact version, which
drops the caret `drizzle-orm` has today. Take that version from npm's `rc`
dist-tag (`npm view drizzle-orm dist-tags.rc`), not from `pnpm outdated`, which
reports a commit-suffixed snapshot such as `1.0.0-rc.5-ab785fc`.

pnpm moves to its latest stable release too, in its own commit. `pnpm outdated
-r` doesn't report it: the `packageManager` field and the pnpm install in each
Dockerfile pin it, and all three move together.

**Blocked by:** None

**Status:** ready-for-agent

- [ ] `pnpm outdated -r` lists nothing behind its latest stable release, apart from Drizzle
- [ ] `drizzle-orm` and `drizzle-kit` are pinned, with no caret, to the same newest release candidate, the one npm's `rc` dist-tag names
- [ ] `packageManager` and both Dockerfiles pin the same latest stable pnpm, upgraded in its own commit
- [ ] `pnpm db:generate` produces no new migration from the unchanged schema
- [ ] Biome's config is migrated if the new version asks (`biome migrate`), and `pnpm lint` passes
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:integration`, and `pnpm test:e2e` pass

# 02: One refusal table for the data module's outcome codes

**What to build:** Each data module outcome code is mapped to its status and
`detail` once, in `errors/problem-details.ts` (spec: Ticket 02). A route's
refusal becomes one line, and poc-context §10's "in one place" becomes true.

The table is typed against the outcome codes the Backend derives from
`DataModule`, less `change_kind_required`, so a code without a row fails
typecheck. `refuse` answers from the table, and `refuseWith(overrides)` lays
a route's overrides over it. There are two overrides:
- completion answers `lesson_text_not_found` with 409;
- Draft deletion's `lesson_not_editable` says "Only Draft Lessons can be
  deleted.".

Every route swaps its `if` chain or local table for these. The `patchLesson`
handler keeps `change_kind_required` and `{ missing }`, which carry an
`errors` list. Storage problems stay as they are.

**Blocked by:** 01

**Status:** resolved

- [x] `errors/problem-details.ts` holds one table with a row for every data module outcome code except `change_kind_required`, and typecheck fails when a code lacks a row
- [x] No route maps a data module outcome code in its own `if` branch, except the `patchLesson` handler's `change_kind_required` and `{ missing }`
- [x] The only route-local refusals are the two overrides: completion's `409 lesson_text_not_found` and Draft deletion's "Only Draft Lessons can be deleted."
- [x] Every Admin API and Mobile API status, Problem Details code, and `detail` is unchanged
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:integration`, and `pnpm test:e2e` pass

# 01: Return outcomes as a discriminated union

**What to build:** Every data module operation that can refuse returns an
`Outcome` (`kanku-typescript-style` R9) instead of a result or a bare outcome
code, and the Backend branches on `result.ok`. Today the data module and its
callers tell a refusal from a success in three ways: `typeof x === "string"` in
the routes, `typeof outcome === "number"` in `detailOrOutcome`
(`data-operations.ts`), and `"missing" in outcome` for `patchLesson`. After
this ticket there is one way.

Do it in one PR. The refusal table in `errors/problem-details.ts` derives its
codes from every `DataModule` operation, so a half-migrated module would force
that type to read both shapes.

- `packages/data/src/outcome.ts` exports `Outcome<Value, Code>`, `ok(value)`
  and `fail(code)`, and the package entry re-exports all three. Feature
  functions keep inferred return types and return `ok(...)` / `fail(...)`; the
  `as const` on returned codes goes.
- An operation that returns `void` or a code today returns
  `Outcome<undefined, Code>`.
- Feature mutations that return a Lesson's id or a code return an `Outcome`
  too, and `detailOrOutcome` branches on `ok`.
- Feature helpers that return a value or a code (`lockEditableDraft`,
  `nextVersion`, and `readLesson` where `readPublishedLesson` calls it) return
  `ok(...)` / `fail(...)` too. Their callers pass a refusal through unchanged
  (`if (!locked.ok) return locked;`).
- `patchLesson`'s `{ missing }` becomes one more union member,
  `{ ok: false; code: "lesson_publication_incomplete"; missing }`, built as
  `{ ...fail("lesson_publication_incomplete"), missing }`.
  `change_kind_required` stays a plain code. The `patchLesson` handler keeps
  answering both itself, before `refuse`.
- `OutcomeCode` derives from the `code` of the `{ ok: false }` members, less
  `change_kind_required` and `lesson_publication_incomplete`.
- Routes read `result.value`. Route tests stub with `ok(...)` / `fail(...)`,
  and data integration tests assert on the `Outcome`.

**Blocked by:** None

**Status:** resolved

- [x] Every data module operation that can refuse returns an `Outcome`, plus one data-carrying member for `patchLesson`
- [x] Every route, `data-operations.ts`, and feature function tells a refusal from a success only by `ok`, and no returned code carries `as const`
- [x] `OutcomeCode` derives from the `{ ok: false }` members, and an outcome code without a table row still fails typecheck
- [x] Every Admin API and Mobile API status, Problem Details code, and `detail` is unchanged
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:integration`, and `pnpm test:e2e` pass

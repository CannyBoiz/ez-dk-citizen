# 04: Typed request validation

**What to build:** `validateRequest` in `middleware/validation.ts` returns
the validator's own typed middleware, `sValidator(target, schema, hook)`,
without a cast (spec: Ticket 04). `c.req.valid(...)` then takes each schema's
output type, and the routes drop all 20 `c.req.valid(...) as X` casts and the
request-type imports that only those casts needed.

The original cast probably existed because the contracts package emits
declarations. The Backend emits none. If Hono's inference fights a schema,
such as one that refines or transforms its value, a cast is allowed only
inside `middleware/validation.ts`. If even that fails for a schema, this
ticket's comment log notes it rather than putting a cast back in a route.

**Blocked by:** 01

**Status:** resolved

- [x] No Backend route casts a `c.req.valid(...)` result
- [x] `validateRequest` and `validateJson` keep their behaviour: `422 invalid_content_type` and `422 validation_failed` with field paths, unchanged
- [x] Any cast left in `middleware/validation.ts` has a comment naming the schema that needs it
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:integration`, and `pnpm test:e2e` pass

# 03: Let the data module decide a Media Asset's completion

**What to build:** `completeMediaAsset` takes what Storage found and makes the
READY-or-FAILED decision itself (spec: Ticket 03), so `failMediaAsset` leaves
the data module interface.

The route passes the stored object's content type and size only when it read
the asset as `PENDING`. A mismatch is checked right after the status checks
and before the Language, Lesson, and Lesson Text checks, as today. It marks the
asset `FAILED` in the same transaction and returns the new outcome code
`invalid_uploaded_media`. That code takes a row in ticket 02's table: 422 with
today's detail. A `PENDING` asset with no stored metadata throws.

The route keeps `getMediaAsset`, the inspection, and its storage errors. On
`invalid_uploaded_media` it deletes the object, logs a failed delete, and
refuses. In poc-context §10's Backend list, "object metadata validation"
becomes "stored-object inspection for completion".

**Blocked by:** 02

**Status:** resolved

- [x] Neither the `DataModule` interface nor the data package has a `failMediaAsset`
- [x] For a `PENDING` asset, `completeMediaAsset` takes the stored object's content type and size. A mismatch marks it `FAILED` and returns `invalid_uploaded_media` before any Language, Lesson, or Lesson Text check
- [x] `completeMediaAsset` throws for a `PENDING` asset given no stored metadata
- [x] `invalid_uploaded_media` has a row in the refusal table: 422, "Uploaded object does not match its declared media metadata."
- [x] On `invalid_uploaded_media` the completion route deletes the object, logs a failed delete without failing the request, and answers 422
- [x] The mismatch integration test also proves that a mismatched upload whose target is refused still answers `422 invalid_uploaded_media`, is `FAILED`, and has had its object deleted
- [x] `media.complete.test.ts` has no stubs of `failMediaAsset`, and one case proves the deletion and the 422 on `invalid_uploaded_media`
- [x] poc-context §10's Backend list says "stored-object inspection for completion"
- [x] Every Admin API status, Problem Details code, and `detail` is unchanged
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:integration`, and `pnpm test:e2e` pass

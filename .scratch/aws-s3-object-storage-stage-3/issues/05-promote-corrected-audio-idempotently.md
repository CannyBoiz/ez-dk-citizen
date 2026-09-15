# 05 — Promote corrected audio idempotently

**What to build:** Let administrators complete corrected recordings without
losing history or creating duplicate versions on retries. Distinct valid
uploads receive consecutive versions and the last committed completion becomes
the sole current Lesson Audio, even under concurrency.

**Blocked by:** 03 — Complete the first Lesson Audio.

**Status:** ready-for-agent

- [ ] Return the existing completion representation when the same `READY` Media Asset is completed again for its already-bound Lesson and Language.
- [ ] Make a matching idempotent retry skip S3 metadata inspection, version allocation, writes, and Lesson timestamp advancement.
- [ ] Reject an attempt to complete an already-bound Media Asset for a different Lesson or Language with `409` and preserve the original association.
- [ ] Allocate the next positive audio version for every distinct successfully completed Media Asset targeting the same Lesson and Language.
- [ ] Demote the previous current Lesson Audio and create the new current rendition within the same transaction as the Media Asset transition.
- [ ] Preserve every superseded Lesson Audio and `READY` Media Asset as immutable history.
- [ ] Serialize competing completions for the same Lesson and Language with database locking and retain the existing uniqueness constraints as final safeguards.
- [ ] Define the last successfully committed distinct completion as current and ensure exactly one current row remains.
- [ ] Advance the Lesson aggregate timestamp once per distinct successful promotion, but not for pending creation, rejected completion, or idempotent retry.
- [ ] Keep Draft and Published promotion behavior identical while continuing to reject Archived targets.
- [ ] Roll back the asset transition, version allocation, current flags, inserted Lesson Audio, and Lesson timestamp together if the transaction fails.
- [ ] Test sequential corrections, matching retries, conflicting rebinds, Draft and Published targets, immutable history, monotonic timestamps, forced rollback, and concurrent distinct completions through the public completion behavior and real PostgreSQL.


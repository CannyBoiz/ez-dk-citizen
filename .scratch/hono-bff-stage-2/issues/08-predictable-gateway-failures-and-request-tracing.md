# 08 — Predictable gateway failures and request tracing

**What to build:** Give API consumers safe, consistent, and traceable failures
when requests are invalid or the Data Service misbehaves. Operators can follow
one request across both services without logging secrets, while the BFF bounds
downstream latency and never duplicates requests through hidden retries.

**Blocked by:** 02 — Authenticated Draft Lesson creation and reads.

**Status:** ready-for-agent

- [ ] Every public and internal error response uses `application/problem+json` with RFC 9457 `type`, `title`, `status`, `detail`, and `instance`, plus stable `code` and `requestId` extensions.
- [ ] Validation failures include a structured `errors` collection without exposing schema-library or stack-trace internals.
- [ ] Stable error mappings cover malformed input, authentication, missing resources, conflicts, unsupported content, unavailable dependencies, timeouts, and unexpected failures.
- [ ] The BFF preserves recognized Data Service `404`, `409`, and `422` domain outcomes without parsing free-form error text.
- [ ] An unreachable Data Service maps to `502`, a timeout maps to `504`, and malformed or unexpected downstream responses map to `502` without leaking internal URLs or bodies.
- [ ] The Data Service client uses a configurable timeout with a two-second default and performs no automatic retries for reads or writes.
- [ ] A syntactically safe incoming `X-Request-ID` is retained; otherwise a UUID is generated. The BFF returns the ID and forwards it to the Data Service.
- [ ] Both services emit one structured JSON completion log with request ID, method, matched path template, status, and duration.
- [ ] Authorization headers, bearer tokens, credentials, request bodies, SQL details, stack traces, and unexpected downstream bodies are absent from logs and public errors.
- [ ] Admin CORS uses the exact comma-separated `ADMIN_ORIGINS` allowlist, permits only required methods and headers, and does not enable wildcard origins or credentialed cookies.
- [ ] Safe token comparison and bearer challenge behavior are covered without assertions against private middleware structure.
- [ ] BFF route tests use controlled Data Service client outcomes for `401`, `404`, `409`, `422`, `502`, and `504`; dedicated client tests cover authorization, correlation forwarding, cancellation, no retries, response validation, and malformed responses.
- [ ] Logging tests assert required completion fields, cross-service correlation, and redaction rather than a brittle full serialized log string.
- [ ] Existing success paths remain unchanged.


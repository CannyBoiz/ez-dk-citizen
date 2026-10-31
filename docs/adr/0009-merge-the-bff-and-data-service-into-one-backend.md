---
status: accepted
---

# Merge the BFF and Data Service into one Backend

The BFF and Data Service merge into one Hono application, the Backend, which
serves the Admin API and Mobile API, reaches PostgreSQL in-process, and keeps
the IAM Roles Anywhere identity. The split protected little: the
internet-facing BFF held a Data Service token that could read and change every
record, so the boundary hid only raw SQL and a database password that is
useless off the host, while every feature paid twice: a Data route, a
contract, a client method, and a BFF route. Merging them adds no storage risk,
because the workload key already sat in the internet-facing process.

## Consequences

- Data access is a module boundary, not a process boundary. A `packages/data`
  library is the only package that depends on `drizzle-orm` and `pg`. It holds
  the schema, migrations, and `migrate` command and exports only its module
  API, and pnpm's strict `node_modules` keeps the Backend from importing Drizzle.
- ADR-0006 holds with the BFF workload renamed to the Backend: the same
  certificate CN `aws-iam-app`, Trust Anchor, role, profile, trust policy,
  glibc image, and signing helper.
- The BFF named in ADR-0005 through ADR-0008 is now the Backend, and ADR-0007's
  two listeners are the Backend's.
- Default tests stay offline. Backend route tests stub the data module and use
  `FakeStorage`; real-PostgreSQL tests drive the Backend's HTTP routes.
- Data package tests write rows directly to test the schema, and go below the
  data module interface otherwise only to inject faults, a forced rollback or a
  held lock, through the database handle.

## Considered Options

- **Keep the BFF and Data Service split**: rejected. Every feature costs twice
  and the boundary protects little.
- **Design module interfaces for a later HTTP split**: rejected. No service
  split is planned at this scale, and the data module's interface already
  returns contract-shaped results and outcome codes, so a later split would
  stay cheap.
- **A separate internal Storage Service holding the AWS identity**: rejected
  for simplicity, for the PoC and after it. Its one gain is that code execution
  in the Backend could not copy the workload key and keep using it off the
  host. That risk is accepted and bounded: the role reaches only `audio/*` and
  `smoke/*`, uploads cannot overwrite (`If-None-Match`), deletes stay
  recoverable for 30 days (ADR-0010), the audio is not sensitive, and an alert
  fires when the identity is used from anywhere but the VPS (Stage 6). Revisit
  if the audio becomes paid or sensitive, or users grow.
- **A credential sidecar running `aws_signing_helper serve`**: rejected, as in
  ADR-0006.

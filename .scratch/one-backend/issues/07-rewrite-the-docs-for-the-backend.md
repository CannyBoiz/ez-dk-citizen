# 07: Rewrite the docs for the Backend

**What to build:** Every planning document describes the Backend that now exists, so agents stop planning work for two services (spec: Documentation). In poc-context, rewrite §8.11 and §9 to §18 (architecture, service boundaries, object storage flows, tech stack, repository shape, Drizzle ownership, API boundaries, deployment, security), §24, and §27 for one Backend that reaches PostgreSQL through its data module and holds the AWS identity (ADR-0006, ADR-0009). Then remove the ADR-0009 banners. Update the repository and data package READMEs. Reword Stage 4b tickets 06 and 08: "one Data Service transaction" becomes "one data module transaction", and "the BFF passes X through as 409" becomes "the Backend maps X to 409".

**Blocked by:** 06 — Retire the Data Service

**Status:** ready-for-agent

- [ ] poc-context names no BFF or Data Service outside §4's _Avoid_ note and historical stage records
- [ ] The architecture diagram, deployment layout, and network path show Caddy, the Backend, PostgreSQL, and S3
- [ ] The ADR-0009 banners in §9 and §24 are gone
- [ ] Stage 4b tickets 06 and 08 describe the data module and the Backend
- [ ] Both READMEs describe the current commands and services

# 01: Revisit deferred STRIDE items when the app starts scaling

**What to build:** Nothing yet. The 2026-10-16 STRIDE review of the merged Backend (ADR-0009) deferred these items. Revisit them when the app has real traffic or more than one admin:

- rate limiting on the Mobile API's public listener (denial of service);
- PostgreSQL backups, which matter more now that the Backend can run raw SQL (tampering, denial of service);
- rotating `ADMIN_API_TOKEN`, and per-admin identity if more admins arrive (spoofing, repudiation);
- isolating the AWS identity in a separate internal Storage Service, so code execution in the Backend cannot copy the workload key (elevation of privilege). ADR-0009 rejected it; revisit if the audio becomes paid or sensitive, or users grow.

**Blocked by:** the app starting to scale

**Status:** needs-triage

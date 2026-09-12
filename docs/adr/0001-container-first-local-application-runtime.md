---
status: accepted
---

# Use a container-first local application runtime

Local application services run through Docker Compose Watch, while tests,
typechecking, builds, and migration generation remain host-run. The base
Compose file retains the compiled integration topology and a local override
selects writable development targets with source synchronization. This keeps
local networking and configuration aligned with deployment at the cost of
requiring Docker and occasional image rebuilds during development.

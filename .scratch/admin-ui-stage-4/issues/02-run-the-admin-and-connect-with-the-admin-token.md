# 02: Run the Admin and connect with the admin token

**What to build:** The Admin tracer bullet. `pnpm dev` starts a new React + Vite Admin under Compose Watch at `http://127.0.0.1:5173` alongside the existing services. The admin opens it, types `ADMIN_API_TOKEN` into a password field, and connects. The Admin verifies the token with an authenticated BFF read and shows that it is connected, or rejects an invalid token clearly. The token lives only in memory: refreshing requires re-entry and Disconnect clears it. Any later `401` opens a token re-entry prompt over the current screen instead of resetting the page.

This ticket also establishes what every later Admin ticket builds on:
- the Admin workspace in the pnpm workspace, reusing the shared API contracts without bundling server-only helpers;
- one injected network module for authenticated BFF requests (and later the S3 PUT), passed in when the app is constructed;
- Problem Details error display showing message and request ID;
- the Vitest + Testing Library + jsdom whole-app test harness with a fake network module, wired into the root `pnpm test`.

See the spec sections "Admin application", "Authentication behavior", and "Local runtime".

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `pnpm dev` starts the Admin under Compose Watch on `127.0.0.1:5173`, with source sync and rebuilds on manifest, contract, and lockfile changes, matching the other services
- [ ] The BFF base URL is a non-secret setting defaulting to the local BFF; `ADMIN_API_TOKEN` never appears in Vite configuration or the build output
- [ ] Entering a valid token connects; an invalid token is rejected with a clear message
- [ ] The token is never written to local storage, session storage, IndexedDB, cookies, or the URL; a refresh requires re-entry
- [ ] Disconnect clears the token and returns to the token prompt
- [ ] A `401` on any request opens a re-entry prompt without navigating away or resetting the screen, and the failed operation can then be retried
- [ ] BFF errors show their message and request ID
- [ ] Whole-app tests render the Admin with a fake network module and drive it only through visible, accessible controls
- [ ] Root `pnpm test`, `pnpm typecheck`, and `pnpm build` include the Admin and need no Docker, AWS credentials, or real browser

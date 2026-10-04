# Serve the Admin from a private, same-origin admin site

The Admin UI and `/api/admin/*` are served same-origin from one Caddy admin site
reachable only over a private network (Tailscale for the PoC), instead of the
originally planned public Cloudflare Pages. The mobile API stays public. The
BFF remains one service but opens a separate admin listener that is never
published to the host and is reached only by the admin site; the public
listener does not register admin routes at all. Only Caddy faces the tailnet,
so the BFF has no knowledge of Tailscale.

The network boundary is replaceable and never an authorization input.
`ADMIN_API_TOKEN` bearer auth stays the application-level control: no auth
decision uses tailnet IPs, Tailscale identity headers, or network location, and
no tailnet hostnames or addresses appear in code, tests, or tracers. Origins
and URLs come only from configuration (`ADMIN_ORIGINS`, `VITE_BFF_BASE_URL`,
the Terraform `admin_production_origin`). Keeping the UI and admin API on one
hostname lets a later cookie-based access proxy (Cloudflare Access through a
Cloudflare Tunnel) wrap that hostname without credentialed CORS, which the BFF
keeps rejecting; that move is a deploy-config change plus one small BFF
middleware.

The token never reaches the built bundle: no `VITE_`-prefixed variable holds it,
the Admin build receives no secrets, and the admin types the token at runtime.
When `VITE_BFF_BASE_URL` is unset the Admin calls its own page origin, so the
production build contains no hostname. Local development stays cross-origin
(`127.0.0.1:5173` to the BFF) with an explicit base URL and `ADMIN_ORIGINS`.
MP3 upload and playback still travel directly between the browser and S3
(ADR-0005); the admin site origin is added to the S3 CORS allow-list.

## Considered Options

- **Cloudflare Pages with Cloudflare Access now**: rejected for the PoC; kept
  reachable by the same-origin and configuration-only rules above.
- **One BFF listener with Caddy forwarding only `/api/mobile/*` publicly**:
  rejected because a single proxy misconfiguration exposes the admin API.
- **BFF binding its admin listener to the Tailscale interface**: rejected
  because it couples the BFF to one network boundary.
- **Dropping the bearer token behind the private network**: rejected because it
  makes network location the authorization.

## Agent skills

### Issue tracker

Issues are tracked as local Markdown under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage uses the five default canonical label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Domain docs use the single-context layout. See `docs/agents/domain.md`.

## Infrastructure repo

This project's infrastructure lives in the sibling repo `../cannyboiz-devops-hub`: Terraform for this project under `terraform/ez-dk-citizen/`, plus the Caddy reverse proxy (`Caddyfile`, `docker-compose.yml`) on the VPS. Check it before changing deployment, hosting, or domain/TLS-related code here.

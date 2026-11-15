# 01: Decrypt the Backend's prod secrets in the deploy workflow

**What to build:** When the Stage 6 deploy workflow exists, give it the Backend's production `.env` from the private secrets repo, decrypted inside the runner. The workflow ships that `.env` to the VPS the same way it ships everything else.

**Blocked by:** the Stage 6 deploy workflow itself (none exists yet), and the CI setup in the secrets repo's README (`Setting up CI (Stage 6)`): the CI key, the read-only deploy key, and the `SOPS_AGE_KEY` / `SECRETS_DEPLOY_KEY` / `SECRETS_REPO_NAME` repo secrets.

**Status:** needs-triage

**Acceptance criteria:**

- The secrets repo is checked out with `actions/checkout` (`repository: ${{ secrets.SECRETS_REPO_NAME }}`, `ssh-key: ${{ secrets.SECRETS_DEPLOY_KEY }}`, `path: secrets`).
- The secrets repo's name appears nowhere in this public repo: not in the workflow YAML, and not in its public logs. It comes from the `SECRETS_REPO_NAME` secret, which GitHub masks in log output.
- `sops` is installed at the version used locally (`sops --version`; 3.13.3 at the time of writing), and the download is verified against that release's checksums file.
- `secrets/ez-dk-citizen/backend.prod.sops.env` is decrypted with `SOPS_AGE_KEY`. Only `*.prod.sops.env` is readable by the CI key (the secrets repo's ADR-0001), so this is the only file CI can open.
- Every decrypted value is masked with `::add-mask::` before any later step runs. No step echoes, cats or `set -x`es around secrets.
- `backend.prod.sops.env` exists in the secrets repo and holds every name the prod Compose stack reads (`docker-compose.yml`'s `backend`, `postgres` and `migrate` services).

**Open questions for triage:**

- How does the Backend on the VPS get its Roles Anywhere workload identity (`workload.key` / `workload.crt`)? Those Secret files are laptop-only today and are not `prod` files.

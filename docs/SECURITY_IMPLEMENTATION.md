# Security Implementation Log

Concrete record of what is already in place, how to verify, and how to
rotate. Reads top-to-bottom as a runbook. Companion to `docs/SECURITY.md`
(the roadmap).

When you change anything in this document, also update the date and
summary at the top so auditors can see how the posture has evolved.

- **Last updated:** 2026-04-15
- **Author:** chinonso
- **Summary of most recent change:** Implemented Tier-1 items §A, §B, §C
  (dedicated deploy key, SOPS-encrypted secrets, staging environment).

---

## §A — Dedicated deploy key for `github-runner`

### Why

Before this change, the VPS user `github-runner` shared an SSH key with
`root`. A compromise of the runner would also give an attacker whatever
that key unlocks — including SSH-as-root on other hosts that trusted the
key.

### What changed

- Generated an ed25519 keypair owned by `github-runner` at
  `/home/github-runner/.ssh/deploy_key` (mode 0600).
- Added the corresponding public key to the GitHub repository as a
  **Deploy Key** with **read-only** access (Settings → Deploy keys).
- Wrote `/home/github-runner/.ssh/config` so `git` invocations use the
  new key and only the new key:
  ```
  Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/deploy_key
    IdentitiesOnly yes
  ```
- Deleted the old copy of root's SSH key from
  `/home/github-runner/.ssh/id_ed25519{,.pub}`.

### How to verify

On the VPS:

```bash
sudo -u github-runner ls -la /home/github-runner/.ssh/
# Should show: config, deploy_key, deploy_key.pub, known_hosts
# Should NOT show: id_ed25519 or id_rsa

sudo -u github-runner git -C /opt/kenchi fetch origin main
# Should succeed without prompting and without using root's key
```

On GitHub: Settings → Deploy keys should list `kenchi-vps github-runner`
with "Read access" only (no write).

### A.3 — Rotation procedure (every 180 days)

1. Generate a new keypair on the VPS:
   ```bash
   sudo -u github-runner ssh-keygen -t ed25519 \
     -f /home/github-runner/.ssh/deploy_key.new -N "" \
     -C "github-runner@kenchi-vps (deploy key $(date +%Y-%m-%d))"
   ```
2. Add the new public key to GitHub as a Deploy Key (read-only). Keep
   the old one for now.
3. Update `~/.ssh/config` on the VPS to point `IdentityFile` at
   `deploy_key.new`.
4. Verify `git fetch` still works.
5. Remove the old key on the VPS and from GitHub:
   ```bash
   sudo -u github-runner rm /home/github-runner/.ssh/deploy_key{,.pub}
   sudo -u github-runner mv /home/github-runner/.ssh/deploy_key.new{,} \
     /home/github-runner/.ssh/deploy_key
   sudo -u github-runner mv /home/github-runner/.ssh/deploy_key.new.pub \
     /home/github-runner/.ssh/deploy_key.pub
   ```
   Delete the old key from GitHub Settings → Deploy keys.

If the key is suspected compromised, rotate **immediately**, not on the
180-day schedule.

---

## §B — SOPS-encrypted secrets

### Why

`/etc/kenchi/.env.production` contained ~60 secrets in plaintext. Disk
snapshots, forgotten backups, container bind mounts, `ps eww`, or a
misplaced `scp` would all leak the full set. Now the canonical copy is
encrypted at rest with [SOPS](https://github.com/getsops/sops) using an
[age](https://github.com/FiloSottile/age) key, and only decrypted
ephemerally during deploy.

### What changed

- Installed `sops` (v3.9.2) and `age` (v1.2.1) on the VPS.
- Generated an age keypair:
  - **Private key** at `/etc/kenchi/age.key`, mode 0640 `root:kenchi-deploy`.
    `github-runner` (member of `kenchi-deploy`) can read it to decrypt
    during deploys; nobody else can.
  - **Public key** at `/etc/kenchi/age.pub` for convenience.
  - **Backup:** the full `age.key` file is also stored in the founder's
    password manager (1Password / Bitwarden vault entry titled
    "Kenchi SOPS age key"). **This is the ONLY other copy.**
- Encrypted `.env.production` → `deploy/secrets/production.env.enc` using
  SOPS + the age public key. The encrypted file is committed to the repo
  (safe because it's opaque without the age key).
- Added `.sops.yaml` at the repo root so `sops <file>` on a collaborator
  laptop Just Works if they have the age key configured.
- Updated `deploy/server-deploy.sh` to decrypt on each deploy: post-pull,
  pre-build, via the `decrypt_secrets()` helper function.
- Added `.gitignore` rules so decrypted `.env` files cannot be committed.

### How to verify

```bash
# On the VPS
ls -la /etc/kenchi/
# age.key should be 0640 root:kenchi-deploy
# age.pub should be 0644
# .env.production.enc should be 0640 root:kenchi-deploy
# .env.production (if present) should be 0640 and regenerated on last deploy

# Decryption works
SOPS_AGE_KEY_FILE=/etc/kenchi/age.key sops --decrypt \
  --input-type dotenv --output-type dotenv \
  /opt/kenchi/deploy/secrets/production.env.enc \
  | grep '^LLM_PROVIDER='
# Should print LLM_PROVIDER=openai

# github-runner can decrypt too
sudo -u github-runner bash -c 'SOPS_AGE_KEY_FILE=/etc/kenchi/age.key sops --decrypt \
  --input-type dotenv --output-type dotenv \
  /opt/kenchi/deploy/secrets/production.env.enc | head -1'
```

### B.1 — Editing secrets

**Never decrypt to a plaintext file on your laptop.** Use `sops` to open
an editor with the decrypted content; it re-encrypts on save.

One-time setup on your laptop:

```bash
mkdir -p ~/.config/sops/age
# Paste the age private key from the password manager here, mode 0400
chmod 400 ~/.config/sops/age/keys.txt
```

Then from the repo root:

```bash
sops deploy/secrets/production.env.enc
```

Commit the resulting `.enc` change to git. The next deploy picks up the
new secrets automatically.

### B.2 — Adding a new secret

1. `sops deploy/secrets/production.env.enc`
2. Add the new KEY=VALUE line in the editor
3. Save, exit
4. Commit the `.enc` diff to git
5. Merge to `main` → deploy runs → new secret live

### B.3 — Adding a new person who can decrypt

Each human collaborator should have their own age key, not share the
founder's:

1. Recipient generates: `age-keygen -o ~/.config/sops/age/keys.txt`
2. They share their **public key** (the `# public key: age1...` line) with
   you.
3. Add their age recipient to `.sops.yaml`:
   ```yaml
   creation_rules:
     - path_regex: deploy/secrets/production\.env\.enc$
       age: >-
         age1old...,
         age1new...
   ```
4. Re-encrypt every existing `.enc` file to add the new recipient:
   ```bash
   sops updatekeys deploy/secrets/production.env.enc
   sops updatekeys deploy/secrets/staging.env.enc
   ```
5. Commit the re-encrypted files.

### B.4 — Rotation procedure (every 365 days)

1. Generate a new age keypair on the VPS:
   ```bash
   age-keygen -o /etc/kenchi/age.key.new
   ```
2. Extract the new public key and add it to `.sops.yaml` alongside the
   old one (both as `age:` recipients).
3. Re-encrypt each secret file with both recipients:
   ```bash
   sops updatekeys deploy/secrets/production.env.enc
   sops updatekeys deploy/secrets/staging.env.enc
   ```
4. Commit + deploy. Verify decryption works with both keys.
5. Remove the old age recipient from `.sops.yaml`, re-run `sops updatekeys`,
   commit, and deploy again.
6. Replace `/etc/kenchi/age.key` with `/etc/kenchi/age.key.new`.
7. Update the password manager entry with the new key.

### B.5 — Disaster recovery (lost age key)

If both the VPS and the password manager are lost:

- Secrets are unrecoverable.
- Every third-party credential (LLM API keys, OAuth secrets, DB password,
  GitHub App private key, Slack tokens) must be rotated at each provider.
- Generate a fresh age key, re-encrypt a fresh `.env.production.enc` with
  the new secrets, deploy.

This is why the age key must exist in **two** places (VPS + password
manager) at all times.

---

## §C — Staging environment

### Why

Previously, pushes to `main` deployed directly to production with no
pre-production validation. A bad migration or container misconfig took
the app down for every user.

Now pushes to `develop` deploy to a staging environment on the same VPS
in isolated containers with their own postgres, redis, and subdomain.
Production still requires manual environment approval in GitHub before
deploying.

### What changed

On the repo:

- New file `docker-compose.staging.yml` — mirrors the production stack
  but with:
  - Compose project name `kenchi-staging` (isolates containers, networks,
    volumes)
  - Separate `postgres_data` and `redis_data` volumes (staging never
    touches prod data)
  - Reduced memory limits (staging isn't sized for prod load)
  - Joins the existing prod `kenchi_default` network so prod Caddy can
    reach staging services by container DNS
  - Reads `/etc/kenchi/.env.staging` (separately SOPS-encrypted)
- New file `deploy/staging-deploy.sh` — the staging deploy script.
  Differences from production:
  - Tracks `origin/develop`, not `origin/main`
  - No auto-rollback on failure — staging failures are meant to be
    visible
  - Reloads prod Caddy on successful deploy so Caddyfile changes in the
    deployed SHA are picked up immediately
- Updated `deploy/Caddyfile` to route `staging.kenchiops.app` to staging
  containers (`kenchi-staging-*-1`).
- Updated `.github/workflows/ci.yml` with a `deploy-staging` job that
  triggers on pushes to `develop` and uses the GitHub `staging`
  environment (no approval required).
- Updated the existing `deploy` job comment to reference the manual
  `production` environment approval.

On the VPS (one-time setup — see §C.1 below for step-by-step):

- Created `/opt/kenchi-staging` as a separate git checkout on the
  `develop` branch, owned by `github-runner:kenchi-deploy`.
- Created `/etc/kenchi/.env.staging.enc` (SOPS-encrypted staging secrets).
- Added DNS A record `staging.kenchiops.app → 72.62.211.67`.

### How to verify

From outside the VPS:

```bash
curl -sI https://staging.kenchiops.app | head -3
# Should return 200 OK with valid cert
```

On the VPS:

```bash
docker compose -p kenchi-staging -f /opt/kenchi-staging/docker-compose.staging.yml ps
# All services should be "running (healthy)"

docker network inspect kenchi_default --format '{{range .Containers}}{{.Name}} {{end}}' \
  | tr ' ' '\n' | grep -E 'kenchi-(staging-)?(api|frontend|github-app|slack-bot|caddy)'
# Should list both prod (kenchi-*) and staging (kenchi-staging-*-1) containers
```

### C.1 — One-time VPS setup for staging

Run these commands as `root` on the VPS the first time staging is
deployed. Subsequent deploys are fully automated by the
`deploy-staging` CI job.

```bash
# 1. Clone repo to a separate path on the develop branch
git clone git@github.com:kenchiops/Kenchiops.git /opt/kenchi-staging
cd /opt/kenchi-staging
git checkout develop

# 2. Permissions — match the production setup
chown -R github-runner:kenchi-deploy /opt/kenchi-staging
chmod -R g+w /opt/kenchi-staging
git config --system --add safe.directory /opt/kenchi-staging

# 3. Create the staging secrets file (edit via `sops` on your laptop,
#    commit deploy/secrets/staging.env.enc, then it's pulled on deploy).
#    First deploy: copy the prod secrets as a starting point and adjust
#    staging-specific values (FRONTEND_URL, OAuth callbacks, etc.):
sops --decrypt --input-type dotenv --output-type dotenv \
  /opt/kenchi/deploy/secrets/production.env.enc > /tmp/staging.env
# Edit /tmp/staging.env — change URLs, generate new POSTGRES_PASSWORD, etc.
sops --encrypt --age "$(cat /etc/kenchi/age.pub)" \
  --input-type dotenv --output-type dotenv \
  /tmp/staging.env > /opt/kenchi-staging/deploy/secrets/staging.env.enc
shred -u /tmp/staging.env

# 4. Add DNS A record staging.kenchiops.app → <VPS IP> via your DNS provider.
#    Caddy will auto-issue a cert on first request.

# 5. First deploy (manual)
sudo -u github-runner bash -c 'cd /opt/kenchi-staging && bash deploy/staging-deploy.sh'
```

### C.2 — Branching workflow

```
feat/foo      →  PR  →  develop  →  auto-deploy to staging
                                            ↓
                                       manual testing
                                            ↓
                         PR from develop to main
                                            ↓
                                    main  →  manual approval  →  production
```

Hotfixes:

- Branch from `main`, PR to `main`, merge after review.
- Also cherry-pick or merge back into `develop` so staging stays ahead of
  prod.

Never push directly to `main` or `develop`.

---

## Appendix — Quick audit checklist

Run quarterly:

- [ ] `github-runner` `.ssh/` does NOT contain `id_ed25519` or `id_rsa`
- [ ] `/etc/kenchi/age.key` exists, mode 0640 root:kenchi-deploy
- [ ] Age private key is in the password manager (check the entry exists
      and can decrypt a test value)
- [ ] `.env.production` file on disk is <24h old (gets regenerated on
      each deploy)
- [ ] `deploy/secrets/production.env.enc` in git is opaque (grep for
      known plaintext strings, they must not appear)
- [ ] Branch protection on `main` requires approval
- [ ] GitHub environment "production" has a required reviewer
- [ ] `grep -n 'self-hosted' .github/workflows/*.yml` only shows the two
      deploy jobs
- [ ] `staging.kenchiops.app` responds with 200 and has a valid cert
- [ ] `docker compose -p kenchi-staging ps` shows all healthy
- [ ] Last production deploy logged in `/opt/kenchi/.deploy-history` was
      successful (or intentionally rolled back)

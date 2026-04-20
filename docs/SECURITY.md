# Kenchi Security Roadmap

This document describes the security posture required as Kenchi scales from
solo-founder prototype to production SaaS with paying customers. It is
organized in tiers by risk × effort, so the highest-impact items can be
tackled first.

The `docs/SECURITY_IMPLEMENTATION.md` companion document records which items
are already done, how to verify them, and how to rotate or revoke the
associated secrets.

---

## Threat model (short form)

- **Adversary 1 — random internet scanner.** Port-scans the VPS, brute-forces
  SSH, probes web endpoints. Mitigated by key-only SSH, fail2ban, firewall,
  and strong TLS.
- **Adversary 2 — compromised dependency.** A malicious package gets
  published to npm or Docker Hub. Mitigated by pinned versions, Dependabot,
  lockfile audits, and least-privilege container runtime.
- **Adversary 3 — leaked secret.** `.env` file, API key, or SSH key leaks
  via backup, log line, or stolen laptop. Mitigated by encryption at rest
  (SOPS), short-lived credentials, and rotation procedures.
- **Adversary 4 — malicious PR author.** Opens a PR that, if CI runs on the
  self-hosted runner, could exfiltrate secrets or own the VPS. Mitigated by
  restricting the self-hosted runner to the `deploy` job gated on `main` +
  environment approval.
- **Adversary 5 — insider / compromised maintainer.** A collaborator with
  write access pushes a backdoor. Mitigated by branch protection, required
  reviews, audit logs, and SSO with MFA.

Out of scope for now: nation-state adversaries, side-channel attacks on
shared hardware. Revisit if/when handling regulated data (HIPAA, PCI).

---

## Tier 1 — Implement immediately

High impact, low effort. These are baseline hygiene.

### 1.1 Self-hosted runner is only used for the `deploy` job

The self-hosted runner on the VPS is effectively root (it is in the `docker`
group, which can mount the host filesystem). Any CI step that runs on it
can take over the host.

**Rule:** Only the `deploy` job may use `runs-on: [self-hosted, production]`.
All other jobs (lint, test, build) must use `ubuntu-latest`. The deploy
job must be gated by `if: github.ref == 'refs/heads/main' && github.event_name == 'push'`
and by the `production` environment, which requires manual approval.

**Audit:** `grep -n "self-hosted" .github/workflows/*.yml` should only show
the `deploy` job (and the staging deploy, see 3.1).

### 1.2 Branch protection on `main` and `develop`

`develop` is the default branch (staging auto-deploy). `main` is the
production branch (manual approval required). Both need protection.

Settings → Branches → Branch protection rules:

**Rule for `main` (production):**

- Require a pull request before merging
- Require at least 1 approval
- Require status checks to pass (all CI jobs)
- Require branches to be up to date before merging
- Require conversation resolution before merging
- Include administrators (yes — no exceptions)
- Restrict who can push to matching branches (only admins via PR)
- Disallow force pushes and deletions

**Rule for `develop` (staging):**

- Require a pull request before merging
- Require status checks to pass (all CI jobs)
- Disallow force pushes and deletions
- Approval optional (staging is lower-trust; fast iteration)

### 1.3 Dedicated deploy key for `github-runner`

The VPS `github-runner` user must not share SSH keys with `root`. Use a
repo-scoped deploy key with read-only access.

**Implementation:** see `SECURITY_IMPLEMENTATION.md` §A.

**Rotation:** every 180 days, or immediately if the VPS is suspected
compromised. Keep the old key active for 24h during rotation to avoid
breaking in-flight deploys.

### 1.4 Secrets encrypted at rest with SOPS + age

Plaintext `/etc/kenchi/.env.production` on disk is a liability — it leaks
via backups, snapshots, container mounts, `ps eww`, and logs. Encrypt it
with [SOPS](https://github.com/getsops/sops) using an
[age](https://github.com/FiloSottile/age) key.

**Implementation:** see `SECURITY_IMPLEMENTATION.md` §B.

**Key storage:** the age private key lives in two places only:

1. On the VPS at `/etc/kenchi/age.key` (mode 0400, root-only)
2. In 1Password / Bitwarden vault belonging to the founder

The age key does **not** live in git, on GitHub Secrets, or anywhere else.

**Rotation:** every 365 days, or immediately if the VPS or founder's
password manager is compromised.

### 1.5 Separate staging from production

One bad deploy must not take down paying customers.

**Implementation:** see `SECURITY_IMPLEMENTATION.md` §C.

Staging runs on the same VPS but in isolated containers under a separate
Docker Compose project (`kenchi-staging`), with its own postgres instance,
redis instance, and subdomain (`staging.kenchiops.app`).

Staging auto-deploys from the `develop` branch. Production auto-deploys
from `main` after manual environment approval.

---

## Tier 2 — Within 30 days

### 2.1 Firewall (ufw) with explicit allowlist

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80,443/tcp comment 'HTTP+HTTPS via Caddy'
ufw enable
```

If behind Cloudflare, restrict 80/443 to Cloudflare IP ranges only:
https://www.cloudflare.com/ips/

### 2.2 fail2ban for SSH

```bash
apt install -y fail2ban
# /etc/fail2ban/jail.local:
# [sshd]
# enabled = true
# maxretry = 5
# bantime = 3600
# findtime = 600
```

### 2.3 Postgres not exposed externally

Current `docker-compose.prod.yml` maps postgres to host port 5433. Remove
this mapping. All app services talk to postgres over the docker network;
no external access is needed.

Ops debugging: SSH tunnel instead (`ssh -L 5432:localhost:5432 root@vps`).

### 2.4 Security headers via Caddy

```
header {
  Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
  X-Content-Type-Options "nosniff"
  X-Frame-Options "DENY"
  Referrer-Policy "strict-origin-when-cross-origin"
  Permissions-Policy "geolocation=(), microphone=(), camera=()"
  Content-Security-Policy "default-src 'self'; ..."
  -Server
}
```

### 2.5 Container hardening

For each service in `docker-compose.prod.yml`:

```yaml
security_opt:
  - no-new-privileges:true
cap_drop:
  - ALL
read_only: true # where possible (not for postgres/redis data volumes)
tmpfs:
  - /tmp
```

### 2.6 Split docker networks

```yaml
networks:
  frontend-net:
  backend-net:
  data-net:

services:
  caddy: { networks: [frontend-net] }
  api: { networks: [frontend-net, backend-net, data-net] }
  postgres: { networks: [data-net] }
  redis: { networks: [data-net] }
```

A compromised Caddy container cannot reach postgres.

### 2.7 Offsite encrypted backups

Nightly cron:

```bash
pg_dump -Fc kenchi \
  | age -r "$AGE_RECIPIENT" \
  > "/var/backups/kenchi-$(date -I).pgdump.age"

# Upload to S3/B2/R2 with lifecycle policy (30-day retention)
rclone copy /var/backups/ remote:kenchi-backups/
```

Test restore quarterly. Untested backups are not backups.

### 2.8 External uptime monitoring

UptimeRobot / Better Stack probing `/health` from outside the VPS every 60s.
Alerts page the founder on-call. Confirms outages that Prometheus (running
on the same box) cannot detect.

---

## Tier 3 — Before first 10 paying customers

### 3.1 Dependency security in CI

- Enable Dependabot on the repo (Settings → Security → Dependabot)
- Add `npm audit --audit-level=high` to CI (fails on high/critical)
- Pin Docker base images to SHA256 digests, not `:latest` or `:20`

### 3.2 Rate limiting at the edge

You already have in-app rate limiting on chat and auth. Additionally, add
Caddy-level rate limiting to stop attacks before they hit the app:

```
rate_limit {
  zone auth { key {remote_ip} events 10 window 1m }
  zone api  { key {remote_ip} events 100 window 1m }
}
```

### 3.3 Audit logs

Every admin action (user invited/removed, role changed, connection revoked,
API key created) is written to an append-only `audit_log` table with:
`actor_id`, `action`, `target_id`, `metadata`, `request_id`, `created_at`.

Audit log entries are never updated or deleted.

### 3.4 Secrets rotation schedule

| Secret                     | Rotation cadence          | Procedure                         |
| -------------------------- | ------------------------- | --------------------------------- |
| Age key (SOPS)             | 365 days                  | `SECURITY_IMPLEMENTATION.md` §B.4 |
| `github-runner` deploy key | 180 days                  | `SECURITY_IMPLEMENTATION.md` §A.3 |
| Database password          | 90 days                   | See runbook                       |
| OpenAI / LLM API keys      | 90 days                   | See runbook                       |
| GitHub App private key     | 180 days                  | See runbook                       |
| OAuth client secrets       | 180 days                  | See runbook                       |
| JWT signing secret         | 90 days with grace window | See runbook                       |

### 3.5 SSO + MFA for the app

- Enforce MFA for admin accounts
- SSO (GitHub OAuth) already present — good
- Session revocation on logout / password change

### 3.6 Runtime security

- `auditd` with rules for `/etc/kenchi/`, `/opt/kenchi/`, `/root/.ssh/`,
  sudo commands, and binary exec in `/tmp`
- Optional: Falco for container runtime anomaly detection

---

## Tier 4 — Before 100 paying customers

### 4.1 Move off single VPS

Hostinger single VPS is a single point of failure. Options:

- **Cheap + reliable:** Hetzner + managed Postgres (Neon / Supabase) + managed Redis (Upstash)
- **Full managed:** Render / Railway / Fly.io
- **Infra control:** 2+ app nodes behind a load balancer, managed Postgres, separate Redis

Prerequisites: app containers must be stateless (no local writes to disk
for anything that matters).

### 4.2 Multi-region or DR plan

- At minimum: documented runbook for "the VPS is gone; restore from backup
  onto a new VPS within 4 hours"
- Tested at least once
- Target RTO (time to recover): 4h
- Target RPO (data loss tolerance): 24h (until hourly backups are added)

### 4.3 Compliance groundwork

Triggered when:

- First EU/UK customer → GDPR data map, DPA template, retention policy
- First enterprise customer asks for SOC 2 → start control framework (takes
  6+ months)

### 4.4 Penetration test

Budget $3k–$10k for a reputable firm to do a black-box + authenticated
pentest. Fix critical findings before onboarding first enterprise logo.

---

## Non-goals (for now)

These are deliberately not pursued at this scale. Revisit when justified
by customer contracts:

- ISO 27001, SOC 2 Type 2 (expensive, long certification cycles)
- Hardware security modules (HSMs) for key material
- Air-gapped deployments
- FIPS 140-3 validated cryptography
- Custom WAF (CloudFlare / Caddy rate limiting is sufficient)

---

## Security contact

Report security issues to: `security@kenchiops.app`

Do not open public GitHub issues for security vulnerabilities. Do not post
on Slack, Discord, or social media. Private disclosure first, public
after patch is available.

Response SLA:

- Acknowledge within 24 hours
- Fix or mitigate within 7 days for critical, 30 days for high,
  90 days for medium

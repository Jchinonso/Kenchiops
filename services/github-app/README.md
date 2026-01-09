# GitHub App Service

This service receives GitHub webhooks and orchestrates CI failure analysis for pull requests and check runs.

## Capabilities

- Webhook verification and routing for check_run, pull_request, installation, and push events
- CI failure analysis pipeline (workflow logs, annotations, PR metadata/diff) forwarded to the API service
- PR comments and check run annotations for single failures and consolidated runs
- Redis-backed aggregation and action queue processing (optional)
- Documentation ingestion for RAG on default-branch doc updates
- Background RAG cleanup and drift detection jobs
- Signed feedback links for analysis validation
- Health, liveness, and readiness endpoints

## Key Endpoints

- `POST /webhook/github` (primary webhook endpoint)
- `POST /webhook/check_run` (legacy)
- `POST /webhook/pull_request` (legacy)
- `GET /api/feedback` (signed feedback capture)
- `GET /health`, `GET /live`, `GET /ready`

## Configuration

This service uses the shared config loader from `@kenchi/shared`. See the root `.env.example` for the full list.

Minimum GitHub-specific variables:

- `GITHUB_APP_ID`
- `GITHUB_APP_PRIVATE_KEY`
- `GITHUB_WEBHOOK_SECRET`
- `GITHUB_INSTALLATION_ID`

Service integration variables:

- `API_URL` (analysis service)
- `SLACK_BOT_URL` (Slack notification delivery)

Infrastructure variables:

- `DATABASE_URL` (required)
- `REDIS_URL` (optional; enables aggregation, action queues, and Slack delivery retries)

## Running

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the service:

   ```bash
   npm run dev
   ```

   Or build + run:

   ```bash
   npm run build
   npm start
   ```

## Webhook Setup

Configure the GitHub App webhook URL to `POST /webhook/github` and set the webhook secret to
match `GITHUB_WEBHOOK_SECRET`.

## Safety Notes

**IMPORTANT**: The LLM provides analysis and suggestions only. All actual decisions and side-effects
(like posting comments or rerunning workflows) are handled by deterministic code after validation.
Never execute LLM outputs directly.

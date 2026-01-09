# Slack Bot Service

This service handles Slack interactions and delivers CI analysis notifications.

## Capabilities

- Socket Mode event handling (app_mention, message, channel join/leave, app_home)
- `/kenchi` slash command with modals (repo selection, document ingestion)
- CI failure notification formatting and delivery via HTTP endpoints
- Notification queue worker for consolidated CI analysis (optional)
- OAuth install flow for multi-tenant Slack workspaces (optional)
- Health, liveness, and readiness endpoints

## Key Endpoints

- `POST /slack/message` (single or consolidated CI notifications)
- `POST /slack/broadcast` (broadcast to all joined channels)
- `GET /slack/install`
- `GET /slack/oauth/callback`
- `GET /slack/oauth/status`
- `GET /health`, `GET /live`, `GET /ready`

## Configuration

This service uses the shared config loader from `@kenchi/shared`. See the root `.env.example`.

Required variables:

- `SLACK_BOT_TOKEN`
- `SLACK_SIGNING_SECRET`
- `SLACK_APP_LEVEL_TOKEN` (Socket Mode)

Optional (multi-tenant OAuth):

- `SLACK_CLIENT_ID`
- `SLACK_CLIENT_SECRET`
- `SLACK_REDIRECT_URI`

Infrastructure variables:

- `DATABASE_URL` (required)
- `REDIS_URL` (optional; enables queue worker and retries)

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

## Notes

Socket Mode delivers Slack events over WebSocket, but the HTTP server is still used for
notifications and OAuth flows.

## Safety Notes

**IMPORTANT**: The LLM provides analysis and suggestions only. All actual decisions and side-effects
(like running commands or altering state) are handled by deterministic code after validation.
Never execute LLM outputs directly.

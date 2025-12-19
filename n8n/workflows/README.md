# n8n Workflows

This directory contains n8n workflow definitions for automation tasks.

## Example Workflow: CI Failure Analysis

The `ci-failure-analysis.json` file contains a placeholder workflow that demonstrates the flow:

1. **Webhook Trigger**: Receives CI failure events
2. **OpenAI Analysis**: Calls the API service to analyze the failure using OpenAI
3. **Slack Notification**: Posts the analysis results to Slack
4. **Response**: Returns confirmation to the webhook caller

## Workflow Flow

```
CI Failure Event → Webhook → OpenAI Analysis → Slack Message → Response
```

## Setup

### Using Docker Compose (Recommended)

All services run in Docker Compose, so n8n can communicate with services using Docker service names:

1. Start all services:

   ```bash
   docker compose up -d
   ```

2. Access n8n UI: http://localhost:5678
   - Login: `admin` / `admin123`

3. Import the workflow:
   - Go to "Workflows" → "Import from File"
   - Select: `n8n/workflows/ci-failure-analysis.json`
   - The workflow already has correct URLs:
     - API: `http://api:3000/api/analyze`
     - Slack: `http://slack-bot:3001/slack/message`

4. Activate the workflow (toggle switch ON)

5. Test the workflow:
   - Get webhook URL from "Webhook - CI Failure" node
   - Send POST request to the webhook URL

### Workflow URLs

When running in Docker Compose, workflows use Docker service names:

- **API Service**: `http://api:3000/api/analyze`
- **Slack Bot Service**: `http://slack-bot:3001/slack/message`

These service names resolve automatically within the Docker network.

## Testing

The workflow structure is validated with unit tests:

```bash
npm test -- n8n
```

You can also validate the workflow JSON structure:

```bash
npm run validate-workflow
```

## Required Endpoints

The following endpoints are implemented and available:

1. **API Service** (`http://api:3000/api/analyze` or `http://localhost:3000/api/analyze`)
   - POST endpoint that accepts `failure_log` and `repository`
   - Returns: `{ analysis, repository, confidence }`
   - ✅ Implemented

2. **Slack Bot Service** (`http://slack-bot:3001/slack/message` or `http://localhost:3001/slack/message`)
   - POST endpoint that accepts `channel` and `message`
   - Returns: `{ status: "sent", channel, message }`
   - ✅ Implemented (placeholder - needs real Slack credentials for actual posting)

## TODO

- [x] Implement `/api/analyze` endpoint in API service
- [x] Implement `/slack/message` endpoint in Slack bot service
- [x] Configure workflow to use Docker service names
- [ ] Add error handling and retry logic in workflow
- [ ] Add conditional logic based on confidence scores
- [ ] Create additional workflows for other automation scenarios
- [ ] Add workflow documentation and diagrams
- [ ] Add integration tests for full workflow execution
- [ ] Implement real OpenAI API integration (currently placeholder)
- [ ] Implement real Slack message posting (currently placeholder)

## Safety Notes

**IMPORTANT**: The LLM provides analysis and suggestions only. All actual decisions and side-effects are handled by deterministic code after validation. Never execute LLM outputs directly.

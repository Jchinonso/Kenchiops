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

1. Import the workflow JSON into your n8n instance
2. Configure the webhook URLs to point to your services:
   - API service: `http://localhost:3000` (or your deployment URL)
   - Slack bot service: `http://localhost:3001` (or your deployment URL)
3. Configure authentication tokens in n8n credentials

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

For this workflow to work, the following endpoints need to be implemented:

1. **API Service** (`http://localhost:3000/api/analyze`)
   - POST endpoint that accepts `failure_log` and `repository`
   - Should return analysis result

2. **Slack Bot Service** (`http://localhost:3001/slack/message`)
   - POST endpoint that accepts `channel` and `message`
   - Should post message to Slack channel

## TODO

- [ ] Implement `/api/analyze` endpoint in API service
- [ ] Implement `/slack/message` endpoint in Slack bot service
- [ ] Add error handling and retry logic in workflow
- [ ] Add conditional logic based on confidence scores
- [ ] Create additional workflows for other automation scenarios
- [ ] Add workflow documentation and diagrams
- [ ] Add integration tests for full workflow execution

## Safety Notes

**IMPORTANT**: The LLM provides analysis and suggestions only. All actual decisions and side-effects are handled by deterministic code after validation. Never execute LLM outputs directly.


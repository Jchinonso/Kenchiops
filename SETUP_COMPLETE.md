# Kenchi Setup Complete ✅

## Current Status

All services are running and configured:

- ✅ API Service: http://localhost:3000
- ✅ Slack Bot Service: http://localhost:3001
- ✅ GitHub App Service: http://localhost:3002
- ✅ n8n: http://localhost:5678 (connected to kenchi_default network)

## Workflow Configuration

The workflow file (`n8n/workflows/ci-failure-analysis.json`) is configured with:

- API endpoint: `http://api:3000/api/analyze`
- Slack endpoint: `http://slack-bot:3001/slack/message`

## Next Steps

1. Import workflow in n8n UI
2. Activate the workflow
3. Test with webhook or Execute button
4. Verify execution in n8n Executions tab

## Testing

```bash
curl -X POST "http://localhost:5678/webhook/ci-failure" \
  -H "Content-Type: application/json" \
  -d '{
    "log": "Error: Test failed",
    "repository": "kenchi",
    "branch": "main",
    "commit": "test123"
  }'
```

## Useful Commands

```bash
# View logs
docker compose logs -f

# Restart services
docker compose restart

# Stop all
docker compose down

# Start all
docker compose up -d
```

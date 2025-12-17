#!/bin/bash

echo "🧪 Testing Kenchi Workflow"
echo "=========================="
echo ""

# Check services
echo "1. Checking services..."
docker compose ps --format "table {{.Service}}\t{{.Status}}" | grep -E "SERVICE|api|slack-bot|n8n"

echo ""
echo "2. Testing service health..."
curl -s http://localhost:3000/health | jq -r '.status // "FAILED"' | xargs -I {} echo "   API: {}"
curl -s http://localhost:3001/health | jq -r '.status // "FAILED"' | xargs -I {} echo "   Slack Bot: {}"
curl -s http://localhost:5678/healthz | jq -r '.status // "FAILED"' | xargs -I {} echo "   n8n: {}"

echo ""
echo "3. Testing workflow webhook..."
echo "   Sending test request..."

RESPONSE=$(curl -s -X POST "http://localhost:5678/webhook-test/ci-failure" \
  -H "Content-Type: application/json" \
  -d '{
    "log": "Error: Test failed in CI",
    "repository": "kenchi",
    "branch": "main",
    "commit": "test123"
  }')

echo "   Response: $RESPONSE"

echo ""
echo "4. Check n8n Executions tab to see workflow execution"
echo "   http://localhost:5678 → Executions"

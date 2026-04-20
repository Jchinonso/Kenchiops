#!/usr/bin/env bash
#
# Simulate monitoring alerts for demo and testing.
#
# Sends realistic webhook payloads to the incident triage service.
# Supports Prometheus, Grafana, and Datadog payload formats.
#
# Usage:
#   bash scripts/simulate-alert.sh [provider] [scenario] [target_url]
#
# Examples:
#   bash scripts/simulate-alert.sh prometheus high-cpu
#   bash scripts/simulate-alert.sh prometheus oom https://staging.kenchiops.app
#   bash scripts/simulate-alert.sh grafana deploy-failure
#   bash scripts/simulate-alert.sh datadog error-spike
#   bash scripts/simulate-alert.sh all  # sends one of each provider
#
# Environment:
#   WEBHOOK_SECRET  — shared secret for Prometheus/Datadog (reads from VPS if not set)
#   TARGET_URL      — base URL (default: https://kenchiops.app)
#   TENANT_ID       — tenant ID (optional, uses header fallback)

set -euo pipefail

PROVIDER="${1:-prometheus}"
SCENARIO="${2:-high-cpu}"
TARGET_URL="${3:-${TARGET_URL:-https://kenchiops.app}}"
WEBHOOK_SECRET="${WEBHOOK_SECRET:-}"
TENANT_ID="${TENANT_ID:-}"
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# ==================== Prometheus Payloads ====================

prometheus_high_cpu() {
  cat <<JSON
{
  "version": "4",
  "groupKey": "{}:{alertname=\"HighCPU\"}",
  "status": "firing",
  "receiver": "default",
  "groupLabels": {"alertname": "HighCPU"},
  "commonLabels": {
    "alertname": "HighCPU",
    "severity": "critical",
    "service": "kenchi-api",
    "env": "production",
    "instance": "api:3000",
    "job": "kenchi-api"
  },
  "commonAnnotations": {
    "summary": "API service CPU usage above 95%",
    "description": "kenchi-api CPU utilization has exceeded 95% for the last 5 minutes. Response times are degraded and request queuing is observed. Possible causes: runaway query, LLM call loop, or insufficient resources."
  },
  "externalURL": "http://prometheus:9090",
  "alerts": [
    {
      "status": "firing",
      "labels": {
        "alertname": "HighCPU",
        "severity": "critical",
        "service": "kenchi-api",
        "instance": "api:3000",
        "job": "kenchi-api",
        "env": "production"
      },
      "annotations": {
        "summary": "API service CPU usage above 95%",
        "description": "kenchi-api CPU utilization has exceeded 95% for the last 5 minutes."
      },
      "startsAt": "$NOW",
      "endsAt": "0001-01-01T00:00:00Z",
      "generatorURL": "http://prometheus:9090/graph?g0.expr=rate(process_cpu_seconds_total[5m])>0.95",
      "fingerprint": "cpu-$(date +%s)"
    }
  ]
}
JSON
}

prometheus_oom() {
  cat <<JSON
{
  "version": "4",
  "groupKey": "{}:{alertname=\"OOMKilled\"}",
  "status": "firing",
  "receiver": "critical",
  "groupLabels": {"alertname": "OOMKilled"},
  "commonLabels": {
    "alertname": "OOMKilled",
    "severity": "critical",
    "service": "kenchi-github-app",
    "env": "production",
    "instance": "github-app:3002",
    "job": "kenchi-github-app"
  },
  "commonAnnotations": {
    "summary": "GitHub App service killed by OOM",
    "description": "kenchi-github-app exceeded its 512MB memory limit and was OOM-killed. The service restarted automatically but in-flight webhook processing was lost. Check for memory leaks in PR diff processing or large log payloads."
  },
  "externalURL": "http://prometheus:9090",
  "alerts": [
    {
      "status": "firing",
      "labels": {
        "alertname": "OOMKilled",
        "severity": "critical",
        "service": "kenchi-github-app",
        "instance": "github-app:3002",
        "job": "kenchi-github-app",
        "env": "production"
      },
      "annotations": {
        "summary": "GitHub App service killed by OOM",
        "description": "kenchi-github-app exceeded its 512MB memory limit and was OOM-killed."
      },
      "startsAt": "$NOW",
      "endsAt": "0001-01-01T00:00:00Z",
      "generatorURL": "http://prometheus:9090/graph?g0.expr=process_resident_memory_bytes>536870912",
      "fingerprint": "oom-$(date +%s)"
    }
  ]
}
JSON
}

prometheus_service_down() {
  cat <<JSON
{
  "version": "4",
  "groupKey": "{}:{alertname=\"ServiceDown\"}",
  "status": "firing",
  "receiver": "critical",
  "groupLabels": {"alertname": "ServiceDown"},
  "commonLabels": {
    "alertname": "ServiceDown",
    "severity": "critical",
    "service": "kenchi-slack-bot",
    "env": "production",
    "instance": "slack-bot:3001",
    "job": "kenchi-slack-bot"
  },
  "commonAnnotations": {
    "summary": "Slack Bot service is down",
    "description": "kenchi-slack-bot has been unreachable for over 2 minutes. Slack notifications for CI failures are not being delivered. Health check endpoint /ready returns connection refused."
  },
  "externalURL": "http://prometheus:9090",
  "alerts": [
    {
      "status": "firing",
      "labels": {
        "alertname": "ServiceDown",
        "severity": "critical",
        "service": "kenchi-slack-bot",
        "instance": "slack-bot:3001",
        "job": "kenchi-slack-bot",
        "env": "production"
      },
      "annotations": {
        "summary": "Slack Bot service is down",
        "description": "kenchi-slack-bot has been unreachable for over 2 minutes."
      },
      "startsAt": "$NOW",
      "endsAt": "0001-01-01T00:00:00Z",
      "generatorURL": "http://prometheus:9090/graph?g0.expr=up==0",
      "fingerprint": "down-$(date +%s)"
    }
  ]
}
JSON
}

prometheus_high_latency() {
  cat <<JSON
{
  "version": "4",
  "groupKey": "{}:{alertname=\"HighLatency\"}",
  "status": "firing",
  "receiver": "warning",
  "groupLabels": {"alertname": "HighLatency"},
  "commonLabels": {
    "alertname": "HighLatency",
    "severity": "warning",
    "service": "kenchi-api",
    "env": "production",
    "instance": "api:3000",
    "job": "kenchi-api"
  },
  "commonAnnotations": {
    "summary": "API P95 latency above 8 seconds",
    "description": "kenchi-api P95 response time has exceeded 8 seconds for the past 10 minutes. Analysis endpoints are particularly slow. Likely caused by LLM provider latency or database connection pool exhaustion."
  },
  "externalURL": "http://prometheus:9090",
  "alerts": [
    {
      "status": "firing",
      "labels": {
        "alertname": "HighLatency",
        "severity": "warning",
        "service": "kenchi-api",
        "instance": "api:3000",
        "job": "kenchi-api",
        "env": "production"
      },
      "annotations": {
        "summary": "API P95 latency above 8 seconds",
        "description": "kenchi-api P95 response time has exceeded 8 seconds."
      },
      "startsAt": "$NOW",
      "endsAt": "0001-01-01T00:00:00Z",
      "generatorURL": "http://prometheus:9090/graph?g0.expr=histogram_quantile(0.95,rate(kenchi_api_request_duration_seconds_bucket[5m]))>8",
      "fingerprint": "latency-$(date +%s)"
    }
  ]
}
JSON
}

prometheus_error_spike() {
  cat <<JSON
{
  "version": "4",
  "groupKey": "{}:{alertname=\"ErrorRateHigh\"}",
  "status": "firing",
  "receiver": "warning",
  "groupLabels": {"alertname": "ErrorRateHigh"},
  "commonLabels": {
    "alertname": "ErrorRateHigh",
    "severity": "warning",
    "service": "kenchi-api",
    "env": "production",
    "instance": "api:3000",
    "job": "kenchi-api"
  },
  "commonAnnotations": {
    "summary": "API 5xx error rate above 15%",
    "description": "kenchi-api is returning HTTP 500 errors at a rate of 15% over the last 5 minutes. Most errors originate from the /api/v1/analyses endpoint. Stack traces indicate a null pointer in the chunking pipeline when processing logs larger than 100KB."
  },
  "externalURL": "http://prometheus:9090",
  "alerts": [
    {
      "status": "firing",
      "labels": {
        "alertname": "ErrorRateHigh",
        "severity": "warning",
        "service": "kenchi-api",
        "instance": "api:3000",
        "job": "kenchi-api",
        "env": "production"
      },
      "annotations": {
        "summary": "API 5xx error rate above 15%",
        "description": "kenchi-api is returning HTTP 500 errors at 15% rate."
      },
      "startsAt": "$NOW",
      "endsAt": "0001-01-01T00:00:00Z",
      "generatorURL": "http://prometheus:9090/graph?g0.expr=rate(kenchi_api_requests_total{status_code=~\"5..\"}[5m])/rate(kenchi_api_requests_total[5m])>0.15",
      "fingerprint": "errors-$(date +%s)"
    }
  ]
}
JSON
}

prometheus_disk_full() {
  cat <<JSON
{
  "version": "4",
  "groupKey": "{}:{alertname=\"DiskSpaceCritical\"}",
  "status": "firing",
  "receiver": "critical",
  "groupLabels": {"alertname": "DiskSpaceCritical"},
  "commonLabels": {
    "alertname": "DiskSpaceCritical",
    "severity": "critical",
    "env": "production",
    "instance": "node:9100",
    "job": "node-exporter"
  },
  "commonAnnotations": {
    "summary": "Disk space critically low at 92% usage",
    "description": "Root filesystem is at 92% capacity with only 15GB remaining. Docker images and build cache are consuming excessive space. If disk reaches 100%, postgres will crash and all services will fail to write logs."
  },
  "externalURL": "http://prometheus:9090",
  "alerts": [
    {
      "status": "firing",
      "labels": {
        "alertname": "DiskSpaceCritical",
        "severity": "critical",
        "instance": "node:9100",
        "job": "node-exporter",
        "env": "production"
      },
      "annotations": {
        "summary": "Disk space critically low at 92% usage",
        "description": "Root filesystem at 92% capacity with only 15GB remaining."
      },
      "startsAt": "$NOW",
      "endsAt": "0001-01-01T00:00:00Z",
      "generatorURL": "http://prometheus:9090/graph?g0.expr=node_filesystem_avail_bytes/node_filesystem_size_bytes<0.08",
      "fingerprint": "disk-$(date +%s)"
    }
  ]
}
JSON
}

# ==================== Grafana Payloads ====================

grafana_deploy_failure() {
  cat <<JSON
{
  "receiver": "kenchi",
  "status": "firing",
  "orgId": 1,
  "alerts": [
    {
      "status": "firing",
      "labels": {
        "alertname": "DeploymentFailed",
        "severity": "critical",
        "service": "kenchi-api",
        "environment": "production",
        "grafana_folder": "Infrastructure"
      },
      "annotations": {
        "summary": "Production deployment failed — containers unhealthy",
        "description": "The latest deployment (SHA: abc123def) failed health checks after 180s timeout. API container is in a crash loop with exit code 1. Last log line: 'Error: Cannot find module @kenchi/shared'. Automatic rollback was triggered."
      },
      "startsAt": "$NOW",
      "endsAt": "0001-01-01T00:00:00Z",
      "generatorURL": "https://grafana.local/alerting/grafana/deploy-1/view",
      "fingerprint": "deploy-$(date +%s)",
      "silenceURL": "https://grafana.local/alerting/silence/new",
      "dashboardURL": "https://grafana.local/d/deployments",
      "panelURL": "https://grafana.local/d/deployments?viewPanel=1",
      "values": {"B": 1}
    }
  ],
  "groupLabels": {"alertname": "DeploymentFailed"},
  "commonLabels": {
    "alertname": "DeploymentFailed",
    "severity": "critical",
    "service": "kenchi-api"
  },
  "commonAnnotations": {
    "summary": "Production deployment failed — containers unhealthy",
    "description": "The latest deployment failed health checks after 180s timeout."
  },
  "externalURL": "https://grafana.local",
  "version": "1",
  "groupKey": "{}:{alertname=\"DeploymentFailed\"}",
  "truncatedAlerts": 0,
  "title": "[FIRING:1] DeploymentFailed (critical kenchi-api production)",
  "state": "alerting",
  "message": "Production deployment failed — containers unhealthy"
}
JSON
}

grafana_db_connections() {
  cat <<JSON
{
  "receiver": "kenchi",
  "status": "firing",
  "orgId": 1,
  "alerts": [
    {
      "status": "firing",
      "labels": {
        "alertname": "PostgresConnectionPoolExhausted",
        "severity": "critical",
        "service": "postgres",
        "environment": "production",
        "grafana_folder": "Database"
      },
      "annotations": {
        "summary": "PostgreSQL connection pool at 95% capacity",
        "description": "Active connections: 95 out of 100 max. New requests are queuing and timing out after 30s. The API service has 47 idle connections that may not be properly released. Check for connection leaks in the analysis pipeline."
      },
      "startsAt": "$NOW",
      "endsAt": "0001-01-01T00:00:00Z",
      "generatorURL": "https://grafana.local/alerting/grafana/db-1/view",
      "fingerprint": "pgpool-$(date +%s)",
      "values": {"B": 95}
    }
  ],
  "groupLabels": {"alertname": "PostgresConnectionPoolExhausted"},
  "commonLabels": {
    "alertname": "PostgresConnectionPoolExhausted",
    "severity": "critical",
    "service": "postgres"
  },
  "commonAnnotations": {
    "summary": "PostgreSQL connection pool at 95% capacity",
    "description": "Active connections: 95 out of 100 max."
  },
  "externalURL": "https://grafana.local",
  "version": "1",
  "groupKey": "{}:{alertname=\"PostgresConnectionPoolExhausted\"}",
  "truncatedAlerts": 0,
  "title": "[FIRING:1] PostgresConnectionPoolExhausted (critical postgres production)",
  "state": "alerting",
  "message": "PostgreSQL connection pool at 95% capacity"
}
JSON
}

# ==================== Datadog Payloads ====================

datadog_error_spike() {
  cat <<JSON
{
  "id": "dd-$(date +%s)",
  "title": "High error rate on kenchi-api in production",
  "text": "The error rate on kenchi-api has exceeded the threshold of 5% over the past 10 minutes. Current rate: 12.3%. Most errors are HTTP 502 from the /api/v1/chat/completions endpoint. The LLM provider (Google AI Studio) is returning intermittent 429 rate limit errors, causing the API to return 502 to clients.",
  "date": $(date +%s),
  "priority": "normal",
  "alert_type": "error",
  "host": "kenchi-api",
  "tags": [
    "service:kenchi-api",
    "env:production",
    "severity:high",
    "alert_type:metric",
    "monitor_id:12345"
  ]
}
JSON
}

# ==================== Dispatch ====================

send_webhook() {
  local provider="$1"
  local payload="$2"
  local url=""
  local extra_headers=""

  case "$provider" in
    prometheus)
      url="${TARGET_URL}/webhooks/prometheus"
      if [ -n "$TENANT_ID" ]; then
        url="${TARGET_URL}/webhooks/prometheus/${TENANT_ID}"
      fi
      if [ -n "$WEBHOOK_SECRET" ]; then
        extra_headers="-H x-kenchi-webhook-secret:${WEBHOOK_SECRET}"
      fi
      ;;
    grafana)
      url="${TARGET_URL}/webhooks/grafana"
      if [ -n "$TENANT_ID" ]; then
        url="${TARGET_URL}/webhooks/grafana/${TENANT_ID}"
      fi
      ;;
    datadog)
      url="${TARGET_URL}/webhooks/datadog"
      if [ -n "$TENANT_ID" ]; then
        url="${TARGET_URL}/webhooks/datadog/${TENANT_ID}"
      fi
      if [ -n "$WEBHOOK_SECRET" ]; then
        extra_headers="-H x-kenchi-webhook-secret:${WEBHOOK_SECRET}"
      fi
      ;;
    *)
      echo "Unknown provider: $provider"
      exit 1
      ;;
  esac

  echo "Sending ${provider}/${SCENARIO} alert to ${url}..."
  # shellcheck disable=SC2086
  HTTP_CODE=$(curl -s -o /tmp/webhook-response.json -w "%{http_code}" \
    -X POST "$url" \
    -H "Content-Type: application/json" \
    $extra_headers \
    -d "$payload" \
    --max-time 15)

  if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
    echo "  -> ${HTTP_CODE} OK"
    cat /tmp/webhook-response.json 2>/dev/null | python3 -m json.tool 2>/dev/null || cat /tmp/webhook-response.json 2>/dev/null
  else
    echo "  -> ${HTTP_CODE} FAILED"
    cat /tmp/webhook-response.json 2>/dev/null
  fi
  echo ""
}

# ==================== Scenario Router ====================

get_payload() {
  local provider="$1"
  local scenario="$2"
  local fn="${provider}_${scenario//-/_}"

  if type "$fn" >/dev/null 2>&1; then
    "$fn"
  else
    echo "Unknown scenario: ${provider}/${scenario}" >&2
    echo "Available scenarios:" >&2
    echo "  prometheus: high-cpu, oom, service-down, high-latency, error-spike, disk-full" >&2
    echo "  grafana: deploy-failure, db-connections" >&2
    echo "  datadog: error-spike" >&2
    exit 1
  fi
}

# ==================== Main ====================

if [ "$PROVIDER" = "all" ]; then
  echo "=== Sending one alert from each provider ==="
  echo ""
  PAYLOAD=$(prometheus_high_cpu)
  send_webhook prometheus "$PAYLOAD"
  PAYLOAD=$(prometheus_oom)
  send_webhook prometheus "$PAYLOAD"
  PAYLOAD=$(grafana_deploy_failure)
  send_webhook grafana "$PAYLOAD"
  PAYLOAD=$(grafana_db_connections)
  send_webhook grafana "$PAYLOAD"
  PAYLOAD=$(prometheus_service_down)
  send_webhook prometheus "$PAYLOAD"
  PAYLOAD=$(prometheus_error_spike)
  send_webhook prometheus "$PAYLOAD"
  echo "=== Done: 6 alerts sent ==="
else
  PAYLOAD=$(get_payload "$PROVIDER" "$SCENARIO")
  send_webhook "$PROVIDER" "$PAYLOAD"
fi

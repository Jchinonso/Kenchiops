# Incident Triage Assistant - Implementation Plan

## Overview

The Incident Triage Assistant automatically processes alerts from monitoring tools, enriches them with historical context, classifies severity, suggests relevant runbooks, and delivers actionable summaries to on-call engineers via Slack.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Alert Sources                                    │
├─────────────┬─────────────┬─────────────┬─────────────┬────────────────┤
│ CloudWatch  │  Datadog    │ PagerDuty   │  Prometheus │  Custom Webhook│
└──────┬──────┴──────┬──────┴──────┬──────┴──────┬──────┴───────┬────────┘
       │             │             │             │              │
       └─────────────┴─────────────┴─────────────┴──────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────┐
                    │   Alert Ingestion API    │
                    │  POST /api/alerts/ingest │
                    └────────────┬─────────────┘
                                 │
                                 ▼
                    ┌──────────────────────────┐
                    │   Alert Normalizer       │
                    │  Unified Alert Format    │
                    └────────────┬─────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
              ▼                  ▼                  ▼
    ┌─────────────────┐ ┌───────────────┐ ┌─────────────────┐
    │    Severity     │ │   RAG Search  │ │    Runbook      │
    │  Classifier     │ │  (Historical) │ │    Matcher      │
    └────────┬────────┘ └───────┬───────┘ └────────┬────────┘
             │                  │                  │
             └──────────────────┼──────────────────┘
                                │
                                ▼
                    ┌──────────────────────────┐
                    │   AI Summarizer          │
                    │  (Context + Summary)     │
                    └────────────┬─────────────┘
                                 │
                                 ▼
                    ┌──────────────────────────┐
                    │   Incident Record        │
                    │   (Database)             │
                    └────────────┬─────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
              ▼                  ▼                  ▼
    ┌─────────────────┐ ┌───────────────┐ ┌─────────────────┐
    │  Slack Alert    │ │  PR Comment   │ │   PagerDuty     │
    │  Dispatcher     │ │  (if linked)  │ │   (optional)    │
    └─────────────────┘ └───────────────┘ └─────────────────┘
```

---

## Data Models

### Normalized Alert

| Field         | Type    | Description                                        |
| ------------- | ------- | -------------------------------------------------- |
| id            | string  | Unique alert identifier                            |
| source        | enum    | cloudwatch, datadog, pagerduty, prometheus, custom |
| sourceAlertId | string  | Original alert ID from source system               |
| timestamp     | Date    | When the alert fired                               |
| service       | string  | Affected service name                              |
| environment   | enum    | production, staging, development                   |
| title         | string  | Alert title/name                                   |
| description   | string  | Alert description or reason                        |
| metrics       | object  | Metric name, current value, threshold, unit        |
| labels        | Record  | Key-value labels from source                       |
| rawPayload    | unknown | Original payload for debugging                     |
| tenantId      | string  | Tenant identifier                                  |

### Incident

| Field               | Type     | Description                                                             |
| ------------------- | -------- | ----------------------------------------------------------------------- |
| id                  | string   | Unique incident identifier                                              |
| alertId             | string   | Source alert reference                                                  |
| tenantId            | string   | Tenant identifier                                                       |
| severity            | enum     | P1, P2, P3, P4                                                          |
| status              | enum     | triggered, acknowledged, investigating, identified, mitigated, resolved |
| title               | string   | Incident title                                                          |
| summary             | string   | AI-generated summary                                                    |
| service             | string   | Affected service                                                        |
| environment         | enum     | production, staging, development                                        |
| rootCauseHypothesis | string   | AI-suggested root cause                                                 |
| suggestedActions    | string[] | Recommended next steps                                                  |
| relatedIncidents    | array    | Similar past incidents with similarity scores                           |
| linkedRunbooks      | array    | Matched runbooks with relevance scores                                  |
| timeline            | array    | Chronological event log                                                 |
| metadata            | object   | AI confidence, processing time, etc.                                    |
| createdAt           | Date     | Creation timestamp                                                      |
| resolvedAt          | Date     | Resolution timestamp                                                    |

### Runbook

| Field         | Type     | Description                           |
| ------------- | -------- | ------------------------------------- |
| id            | string   | Unique runbook identifier             |
| tenantId      | string   | Tenant identifier                     |
| title         | string   | Runbook title                         |
| description   | string   | Brief description                     |
| content       | string   | Full runbook content (markdown)       |
| services      | string[] | Associated services                   |
| alertPatterns | string[] | Regex patterns to match alerts        |
| keywords      | string[] | Keywords for matching                 |
| steps         | array    | Ordered steps with commands           |
| effectiveness | number   | 0-1 score based on resolution success |
| usageCount    | number   | Times this runbook was used           |

---

## Database Schema

### Tables

| Table              | Purpose                                    |
| ------------------ | ------------------------------------------ |
| alerts             | Raw ingested alerts from all sources       |
| incidents          | Processed incidents with AI enrichment     |
| runbooks           | Stored runbooks with matching criteria     |
| incident_runbooks  | Many-to-many linking with relevance scores |
| incident_relations | Links between related incidents            |
| incident_timeline  | Chronological event log per incident       |

### Key Indexes

- `alerts(tenant_id, processed)` - Find unprocessed alerts
- `alerts(tenant_id, source, source_alert_id)` - Deduplication
- `incidents(tenant_id, status)` - List open incidents
- `incidents(service, created_at)` - Service-based queries
- `runbooks(services)` - GIN index for service matching
- `runbooks(keywords)` - GIN index for keyword matching

---

## Module Structure

```
packages/shared/src/
├── incidents/
│   ├── index.ts                    # Public exports
│   ├── types.ts                    # Type definitions
│   ├── constants.ts                # Severity config, keywords, thresholds
│   ├── alertNormalizer.ts          # Normalize alerts from different sources
│   ├── severityClassifier.ts       # Classify incident severity
│   ├── incidentSummarizer.ts       # AI-powered summarization
│   ├── runbookMatcher.ts           # Match incidents to runbooks
│   └── incidentService.ts          # Core incident operations
│
├── incidents/integrations/
│   ├── cloudwatch.ts               # AWS CloudWatch adapter
│   ├── datadog.ts                  # Datadog adapter (future)
│   ├── pagerduty.ts                # PagerDuty adapter (future)
│   └── prometheus.ts               # Prometheus/Alertmanager adapter
│
├── database/
│   ├── incidentRepository.ts       # Incident CRUD operations
│   ├── alertRepository.ts          # Alert CRUD operations
│   └── runbookRepository.ts        # Runbook CRUD operations

services/api/src/routes/
└── incidentRoutes.ts               # REST API endpoints

services/slack-bot/src/
├── formatters/
│   └── incidentFormatter.ts        # Slack message formatting
└── handlers/
    └── incidentActionHandler.ts    # Interactive button handlers
```

---

## Severity Classification

### Severity Levels

| Level | Label    | Response SLA | Escalate After | Examples                                          |
| ----- | -------- | ------------ | -------------- | ------------------------------------------------- |
| P1    | Critical | 15 min       | 5 min          | Complete outage, data loss, security breach       |
| P2    | High     | 30 min       | 15 min         | Degraded service, high error rate, partial outage |
| P3    | Medium   | 2 hours      | 1 hour         | Elevated errors, latency, queue backup            |
| P4    | Low      | 8 hours      | 4 hours        | Informational, scheduled, test alerts             |

### Classification Factors

| Factor                         | Weight | Description                                  |
| ------------------------------ | ------ | -------------------------------------------- |
| Explicit severity label        | 1.0    | Alert has severity=critical or priority=P1   |
| Production + critical keywords | 0.9    | Production alert with "outage", "down", etc. |
| Metric threshold exceeded 2x   | 0.85   | Value >= threshold \* 2                      |
| Explicit high label            | 0.8    | Alert has severity=high or priority=P2       |
| Production + high keywords     | 0.75   | Production with "degraded", "timeout", etc.  |
| Metric threshold exceeded 1.5x | 0.7    | Value >= threshold \* 1.5                    |
| Warning label                  | 0.6    | Alert has severity=warning                   |
| Medium keywords                | 0.55   | Contains "elevated", "slow", etc.            |
| Staging environment            | 0.5    | Non-production alert                         |
| Info label                     | 0.4    | Alert has severity=info                      |
| Low keywords                   | 0.3    | Contains "info", "notice", etc.              |
| Development environment        | 0.2    | Development alert                            |

### Historical Adjustment

If similar past incidents were frequently escalated (>50%), automatically bump severity by one level.

---

## AI Summarization

### Input Context

The AI receives:

1. **Alert details** - Service, environment, title, description, metrics
2. **Severity classification** - Level and reasoning
3. **Related incidents** - Similar past incidents with resolutions
4. **Linked runbooks** - Relevant runbooks with descriptions
5. **RAG context** - Retrieved postmortems and troubleshooting docs

### Output Format

| Field               | Description                                         |
| ------------------- | --------------------------------------------------- |
| summary             | 1-2 sentence summary of what's happening and impact |
| rootCauseHypothesis | Best guess at root cause based on available info    |
| suggestedActions    | 3-5 immediate actions or investigation steps        |
| confidence          | 0-1 confidence score                                |

### Prompt Guidelines

- Be concise and actionable
- Focus on what on-call needs to know RIGHT NOW
- Reference similar past incidents if available
- Suggest specific runbook steps when matched
- Include metric values and thresholds

---

## Runbook Matching

### Matching Strategies

| Strategy | Method                                         | Score Weight |
| -------- | ---------------------------------------------- | ------------ |
| Keyword  | Match runbook keywords against alert text      | 0.4          |
| Service  | Match runbook services against alert service   | 0.3          |
| Pattern  | Regex patterns in runbook match alert          | 0.4          |
| Semantic | Embedding similarity between alert and runbook | 0.5          |

### Scoring

- Multiple matches are combined with diminishing returns
- Maximum 3 runbooks linked per incident
- Minimum relevance threshold: 0.5

### Effectiveness Tracking

After incident resolution:

- If runbook was marked helpful → increase effectiveness score
- If runbook was dismissed → decrease effectiveness score
- Higher effectiveness = higher ranking in future matches

---

## Monitoring Source Connection

### When This Happens

1. **Step 1**: User installs GitHub App → selects repos (CI/CD only)
2. **Step 2**: User installs Slack App → picks CI alert channel
3. **Step 3**: User runs `/kenchi setup monitoring` → connects alert sources
4. **Step 4**: User runs `/kenchi setup incidents` → configures incident channels

Step 3 & 4 are **optional** and only needed for Incident Triage feature.

### Webhook URL Structure

Each tenant gets unique webhook URLs:

| Source     | URL Pattern                                           |
| ---------- | ----------------------------------------------------- |
| Generic    | `https://api.kenchi.io/alerts/webhook/{tenant_id}`    |
| CloudWatch | `https://api.kenchi.io/alerts/cloudwatch/{tenant_id}` |
| Datadog    | `https://api.kenchi.io/alerts/datadog/{tenant_id}`    |
| Prometheus | `https://api.kenchi.io/alerts/prometheus/{tenant_id}` |
| PagerDuty  | `https://api.kenchi.io/alerts/pagerduty/{tenant_id}`  |

### Database Schema for Connected Sources

| Table              | Purpose                            |
| ------------------ | ---------------------------------- |
| monitoring_sources | Track connected sources per tenant |

| Field         | Description                                        |
| ------------- | -------------------------------------------------- |
| id            | Unique identifier                                  |
| tenant_id     | Tenant reference                                   |
| source_type   | cloudwatch, datadog, prometheus, pagerduty, custom |
| display_name  | User-friendly name (e.g., "Production AWS")        |
| config        | JSON config (region, credentials ref, etc.)        |
| status        | pending, active, error                             |
| last_alert_at | Last received alert timestamp                      |
| alert_count   | Total alerts received                              |
| created_at    | When connected                                     |

### Connection Verification

When a source is first connected:

1. Generate unique webhook URL with tenant ID
2. Store source config in `monitoring_sources` table
3. Set status to `pending`
4. Wait for first alert OR test webhook
5. On successful receipt → set status to `active`
6. On error → set status to `error` with message

### Slack Command: `/kenchi setup monitoring`

Triggers a modal showing:

- Tenant's unique webhook URLs
- Quick-connect buttons for OAuth-enabled sources (Datadog)
- Setup guides for webhook-based sources (CloudWatch, Prometheus)
- List of currently connected sources with status

---

## CloudWatch Integration

### Setup Requirements

1. Create SNS topic in AWS
2. Add HTTPS subscription pointing to `/api/alerts/cloudwatch/{tenant_id}`
3. Configure CloudWatch alarms to publish to SNS topic
4. KenchiOps confirms subscription automatically

### Payload Processing

1. Validate SNS message signature
2. Handle subscription confirmation requests
3. Parse alarm payload from SNS message
4. Extract service name from dimensions or alarm name
5. Infer environment from alarm name patterns
6. Convert to normalized alert format

### Supported Alarm Types

- EC2 metrics (CPU, memory, disk)
- RDS metrics (connections, latency)
- Lambda metrics (errors, duration)
- ECS/EKS metrics (task health)
- Custom CloudWatch metrics
- Composite alarms

---

## Slack Notifications

### Incident Alert Format

```
🔴 P1 Incident: API Gateway Complete Outage
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Service: api-gateway | Environment: production | ID: abc12345

Summary
All API requests are failing with 503 errors. Customer-facing
services are completely unavailable.

Likely Cause
The database connection pool is exhausted due to a connection
leak introduced in the last deployment.

Suggested Actions
1. Check database connection count
2. Consider rolling back last deployment
3. Scale up database connection pool temporarily

Similar Past Incidents: inc-789, inc-456
Runbooks: Database Connection Issues | API Gateway Troubleshooting

[Acknowledge] [View Details] [Escalate]

AI Confidence: 85% | Response SLA: 15 min
```

### Interactive Actions

| Button       | Action                                             |
| ------------ | -------------------------------------------------- |
| Acknowledge  | Mark incident as acknowledged, record who and when |
| View Details | Link to incident detail page                       |
| Escalate     | Escalate to next level (with confirmation)         |

### Status Updates

Post threaded updates when:

- Status changes (acknowledged, investigating, etc.)
- Severity changes
- Resolution posted

---

## API Endpoints

### Alert Ingestion

| Method | Endpoint               | Description                     |
| ------ | ---------------------- | ------------------------------- |
| POST   | /api/alerts/ingest     | Generic alert ingestion         |
| POST   | /api/alerts/cloudwatch | CloudWatch SNS webhook          |
| POST   | /api/alerts/prometheus | Prometheus Alertmanager webhook |
| POST   | /api/alerts/webhook    | Custom webhook                  |

### Incident Management

| Method | Endpoint                       | Description                   |
| ------ | ------------------------------ | ----------------------------- |
| GET    | /api/incidents                 | List incidents (with filters) |
| GET    | /api/incidents/:id             | Get incident details          |
| PATCH  | /api/incidents/:id/status      | Update status                 |
| POST   | /api/incidents/:id/acknowledge | Acknowledge incident          |
| POST   | /api/incidents/:id/resolve     | Resolve with notes            |

### Query Parameters (List)

| Param    | Type   | Description                                 |
| -------- | ------ | ------------------------------------------- |
| status   | enum   | Filter by status (or "open" for all active) |
| severity | enum   | Filter by severity                          |
| service  | string | Filter by service                           |
| limit    | number | Max results (default 20, max 100)           |
| offset   | number | Pagination offset                           |

---

## Implementation Phases

### Phase 1: Foundation (Week 1)

- [ ] Define types and constants in `incidents/types.ts`
- [ ] Create database schema and migrations
- [ ] Implement alert repository (CRUD operations)
- [ ] Implement incident repository (CRUD operations)
- [ ] Create alert normalizer with custom webhook support

### Phase 2: Classification & Enrichment (Week 2)

- [ ] Implement severity classifier with weighted factors
- [ ] Add historical adjustment based on past incidents
- [ ] Create runbook repository and matching logic
- [ ] Integrate RAG search for historical context
- [ ] Build incident service orchestrator

### Phase 3: AI Summarization (Week 2-3)

- [ ] Design summarization prompt template
- [ ] Implement summarizer with context injection
- [ ] Add confidence scoring
- [ ] Test with sample alerts

### Phase 4: CloudWatch Integration (Week 3)

- [ ] Implement CloudWatch payload parser
- [ ] Add SNS subscription confirmation handler
- [ ] Extract service/environment from alarms
- [ ] End-to-end testing with real alarms

### Phase 5: Slack Integration (Week 4)

- [ ] Create incident formatter for Slack blocks
- [ ] Implement action button handlers
- [ ] Add status update notifications
- [ ] Test interactive flows

### Phase 6: API & Polish (Week 4)

- [ ] Implement REST API endpoints
- [ ] Add request validation
- [ ] Write integration tests
- [ ] Documentation and examples

---

## Success Metrics

| Metric                | Target         | Measurement                          |
| --------------------- | -------------- | ------------------------------------ |
| Alert Processing Time | < 5 seconds    | P95 latency from ingestion to Slack  |
| Severity Accuracy     | > 85%          | Manual review of sample incidents    |
| Summary Helpfulness   | > 75% positive | User feedback on summaries           |
| Runbook Match Rate    | > 60%          | % of incidents with matched runbooks |
| MTTR Reduction        | > 30%          | Compare before/after implementation  |
| False Positive Rate   | < 5%           | % of dismissed/incorrect incidents   |

---

## Future Enhancements

| Feature             | Priority | Description                         |
| ------------------- | -------- | ----------------------------------- |
| Datadog Integration | High     | Parse Datadog webhook format        |
| PagerDuty Sync      | High     | Bidirectional incident sync         |
| Auto-Remediation    | Medium   | Execute runbook steps automatically |
| ML Severity Model   | Medium   | Train on historical data            |
| Anomaly Detection   | Low      | Detect issues before alerts fire    |
| War Room Automation | Low      | Create Slack channels for P1s       |
| Auto-Postmortems    | Low      | Generate postmortem drafts          |

---

## Dependencies

### Required

- PostgreSQL with `pgvector` extension (for semantic search)
- OpenAI API access (for summarization)
- Slack App with interactive components enabled
- AWS credentials (for CloudWatch integration)

### Optional

- PagerDuty API access (for escalation)
- Datadog API access (for future integration)

---

## Configuration

### Environment Variables

| Variable                      | Description                                 |
| ----------------------------- | ------------------------------------------- |
| INCIDENT_DEDUP_WINDOW_MS      | Deduplication window (default: 300000)      |
| INCIDENT_MAX_RELATED          | Max related incidents to fetch (default: 5) |
| INCIDENT_MAX_RUNBOOKS         | Max runbooks to link (default: 3)           |
| INCIDENT_RAG_TOP_K            | RAG search results (default: 10)            |
| INCIDENT_SIMILARITY_THRESHOLD | Min similarity for matching (default: 0.7)  |
| CLOUDWATCH_VALIDATE_SIGNATURE | Validate SNS signatures (default: true)     |

### Tenant Configuration

| Setting               | Description                                |
| --------------------- | ------------------------------------------ |
| defaultSeverity       | Default severity when classification fails |
| escalationPolicy      | Who to escalate to by severity             |
| enableAutoAcknowledge | Auto-ack after Slack view                  |
| runbookRepository     | Git repo for runbooks (optional)           |

### Channel Configuration

Incidents are **service-based** (not repo-based like CI/CD alerts). Channels are configured separately from the GitHub App installation.

**Database Schema for Channel Routing:**

| Table                    | Purpose                                        |
| ------------------------ | ---------------------------------------------- |
| tenant_incident_config   | Default incident channel, severity routing     |
| service_channel_mappings | Service → channel mappings for multi-team orgs |

**Tenant Incident Config Fields:**

| Field                   | Description                              |
| ----------------------- | ---------------------------------------- |
| tenant_id               | Tenant reference                         |
| default_channel_id      | Slack channel for all incidents          |
| critical_channel_id     | Optional separate channel for P1/P2      |
| low_priority_channel_id | Optional channel for P3/P4               |
| enable_war_rooms        | Auto-create channels for P1 escalations  |
| war_room_invite_groups  | Slack user groups to invite to war rooms |

**Service Channel Mapping Fields:**

| Field        | Description                                |
| ------------ | ------------------------------------------ |
| tenant_id    | Tenant reference                           |
| service_name | Service identifier (e.g., "api-gateway")   |
| channel_id   | Slack channel for this service's incidents |
| team_handle  | Team user group (e.g., "@platform-team")   |

### Channel Routing Logic

1. Look up service in `service_channel_mappings`
2. If found → use service-specific channel
3. If not found → check severity:
   - P1/P2 → use `critical_channel_id` if configured
   - P3/P4 → use `low_priority_channel_id` if configured
4. Fallback → use `default_channel_id`

### War Room Creation

When P1 is escalated and `enable_war_rooms = true`:

1. Create channel: `#inc-{service}-{YYYYMMDD}-{short_id}`
2. Set channel topic to incident summary
3. Invite: triggering user + `war_room_invite_groups`
4. Post initial incident details
5. Route all updates to war room instead of main channel
6. Archive channel 24h after resolution

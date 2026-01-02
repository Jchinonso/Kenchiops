# KenchiOps User Experience Flows

## Overview

This document describes how KenchiOps features appear and function from the user's perspective in Slack and GitHub.

---

## Initial Setup Flow

### Step 1: Install GitHub App

User installs KenchiOps GitHub App:

1. Select organization
2. Choose repositories to monitor
3. Grant permissions (read code, write PR comments, read checks)

### Step 2: Install Slack App

User installs KenchiOps Slack App:

1. Authorize workspace access
2. **Select default CI/CD alert channel** (e.g., `#dev-alerts`)
3. This channel receives CI failure notifications for selected repos

### Step 3: Connect Monitoring Sources (For Incident Triage)

This step enables the Incident Triage feature. Without it, only CI/CD features work.

```
/kenchi setup monitoring

┌─────────────────────────────────────────────────────────────┐
│ 🔗 Connect Monitoring Sources                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Your webhook URL (for all sources):                         │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ https://api.kenchi.io/alerts/webhook/t_abc123xyz        │ │
│ └─────────────────────────────────────────────────────────┘ │
│ [Copy URL]                                                  │
│                                                             │
│ Or connect directly:                                        │
│                                                             │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐            │
│ │ ☁️ AWS      │ │ 🐕 Datadog  │ │ 📟 PagerDuty│            │
│ │ CloudWatch  │ │             │ │             │            │
│ │ [Connect]   │ │ [Connect]   │ │ [Connect]   │            │
│ └─────────────┘ └─────────────┘ └─────────────┘            │
│                                                             │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐            │
│ │ 🔥 Prometheus│ │ 📊 Grafana │ │ 🔔 Custom   │            │
│ │ Alertmanager│ │             │ │ Webhook     │            │
│ │ [Setup Guide]│ │ [Connect]  │ │ [View Docs] │            │
│ └─────────────┘ └─────────────┘ └─────────────┘            │
│                                                             │
│ Connected Sources:                                          │
│ ✅ AWS CloudWatch (us-east-1) - 12 alarms                   │
│ ✅ Datadog - 8 monitors                                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Option A: AWS CloudWatch Setup

```
┌─────────────────────────────────────────────────────────────┐
│ ☁️ Connect AWS CloudWatch                                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Step 1: Create SNS Topic                                    │
│ Run in AWS Console or CLI:                                  │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ aws sns create-topic --name kenchi-alerts               │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Step 2: Add HTTPS Subscription                              │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ aws sns subscribe \                                     │ │
│ │   --topic-arn arn:aws:sns:us-east-1:123:kenchi-alerts \ │ │
│ │   --protocol https \                                    │ │
│ │   --endpoint https://api.kenchi.io/alerts/cloudwatch/   │ │
│ │              t_abc123xyz                                │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Step 3: Configure Alarms                                    │
│ Add the SNS topic as an action on your CloudWatch alarms.   │
│                                                             │
│ [Test Connection]  [View Full Guide]                        │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ Status: ⏳ Waiting for first alert...                       │
└─────────────────────────────────────────────────────────────┘
```

#### Option B: Datadog Setup

```
┌─────────────────────────────────────────────────────────────┐
│ 🐕 Connect Datadog                                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Method 1: OAuth (Recommended)                               │
│ [Connect with Datadog]                                      │
│                                                             │
│ Method 2: Webhook                                           │
│ 1. Go to Datadog → Integrations → Webhooks                  │
│ 2. Create new webhook with this URL:                        │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ https://api.kenchi.io/alerts/datadog/t_abc123xyz        │ │
│ └─────────────────────────────────────────────────────────┘ │
│ 3. Add @webhook-kenchi to your monitor notifications        │
│                                                             │
│ [Test Connection]  [View Full Guide]                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Option C: Prometheus/Alertmanager Setup

```
┌─────────────────────────────────────────────────────────────┐
│ 🔥 Connect Prometheus Alertmanager                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Add to your alertmanager.yml:                               │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ receivers:                                              │ │
│ │   - name: 'kenchi'                                      │ │
│ │     webhook_configs:                                    │ │
│ │       - url: 'https://api.kenchi.io/alerts/prometheus/  │ │
│ │               t_abc123xyz'                              │ │
│ │         send_resolved: true                             │ │
│ │                                                         │ │
│ │ route:                                                  │ │
│ │   receiver: 'kenchi'                                    │ │
│ │   # or add as additional receiver in your routes        │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ [Test Connection]  [View Full Guide]                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Option D: Custom Webhook

```
┌─────────────────────────────────────────────────────────────┐
│ 🔔 Custom Webhook Integration                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Send POST requests to:                                      │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ https://api.kenchi.io/alerts/webhook/t_abc123xyz        │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Required JSON payload:                                      │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ {                                                       │ │
│ │   "title": "High CPU on api-server",                    │ │
│ │   "service": "api-server",                              │ │
│ │   "description": "CPU at 95% for 5 minutes",            │ │
│ │   "environment": "production",                          │ │
│ │   "severity": "P2"  // optional                         │ │
│ │ }                                                       │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ [View API Docs]  [Test with Sample]                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Step 4: Configure Incident Channels

Incidents are **service-based**, not repo-based. Configure separately:

```
/kenchi setup incidents

┌─────────────────────────────────────────────────────────────┐
│ ⚙️ Incident Channel Setup                                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Where should incidents be sent?                             │
│ ○ Same channel as CI alerts (#dev-alerts)                   │
│ ● Separate channel: [#incidents          ] [Create]         │
│                                                             │
│ Route by severity?                                          │
│ ☑ P1/P2 → #incidents-critical                               │
│ ☐ P3/P4 → #incidents-low                                    │
│                                                             │
│ Auto-create war room for P1 incidents?                      │
│ ● Yes - create #inc-{service}-{id} channel                  │
│ ○ No - keep discussion in main channel                      │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ [Save Settings]                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Channel Strategy

### Key Distinction

| Alert Type     | Based On   | Channel Selected                      |
| -------------- | ---------- | ------------------------------------- |
| CI/CD Failures | Repository | At GitHub App install                 |
| Incidents      | Service    | In tenant settings or `/kenchi setup` |

### Default Channel Structure

| Channel               | Purpose                        | Created                         |
| --------------------- | ------------------------------ | ------------------------------- |
| `#dev-alerts`         | CI failures for selected repos | User picks at install           |
| `#incidents`          | All incident alerts            | User creates or picks           |
| `#incidents-critical` | P1/P2 only (optional)          | User creates if routing enabled |
| `#inc-{service}-{id}` | War room for specific P1       | Auto-created on escalation      |

### Multi-Team Configuration

For larger orgs, map services to team channels:

```
/kenchi settings services

┌─────────────────────────────────────────────────────────────┐
│ ⚙️ Service → Channel Mapping                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Service              Channel              Team              │
│ ─────────────────────────────────────────────────────────── │
│ api-gateway          #platform-alerts     Platform          │
│ payment-service      #payments-oncall     Payments          │
│ user-service         #backend-alerts      Backend           │
│ * (default)          #incidents           On-call           │
│                                                             │
│ [+ Add Service Mapping]                                     │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ [Save]                                                      │
└─────────────────────────────────────────────────────────────┘
```

### War Room Flow (P1 Incidents)

When a P1 incident is escalated:

1. KenchiOps creates `#inc-api-gateway-20241215`
2. Invites: on-call engineer, escalation contacts, relevant team
3. Posts incident summary as channel topic
4. All updates go to this channel
5. Channel archived after resolution

```
┌─────────────────────────────────────────────────────────────┐
│ 🚨 War Room Created: #inc-api-gateway-20241215              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Invited:                                                    │
│ • @sarah.chen (on-call)                                     │
│ • @mike.jones (engineering manager)                         │
│ • @platform-team                                            │
│                                                             │
│ Incident: API Gateway High Error Rate                       │
│ Severity: P1 • Status: Investigating                        │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ [Join Channel]                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Slack Experience

---

## Feature Flows

### 1. CI/CD Failure Assistant

**Trigger**: GitHub Actions check run fails

**Slack Flow**:

```
┌─────────────────────────────────────────────────────────────┐
│ 🔴 CI Failed: Build & Test                                  │
│ repo: acme/api-server • branch: feature/user-auth           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Summary                                                     │
│ TypeScript compilation failed due to missing type           │
│ definition for the new UserService class.                   │
│                                                             │
│ Root Cause                                                  │
│ src/services/UserService.ts:42 - Property 'email' does      │
│ not exist on type 'User'.                                   │
│                                                             │
│ Suggested Fix                                               │
│ Add 'email: string' to the User interface in                │
│ src/types/user.ts                                           │
│                                                             │
│ Affected Files                                              │
│ • src/services/UserService.ts:42                            │
│ • src/types/user.ts                                         │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ [View Logs]  [View PR #123]  [Re-run Build]                 │
└─────────────────────────────────────────────────────────────┘
```

**GitHub Flow**:

PR Comment posted automatically:

````
## 🔴 CI Failure Analysis

**Build & Test** failed on commit `abc1234`

### Summary
TypeScript compilation failed due to missing type definition.

### Root Cause
`src/services/UserService.ts:42` - Property 'email' does not exist on type 'User'.

### Suggested Fix
```diff
// src/types/user.ts
interface User {
  id: string;
  name: string;
+ email: string;
}
````

### Similar Past Fixes

- PR #98: Added missing field to User type
- PR #67: Fixed type mismatch in UserService

---

🤖 _Analysis by KenchiOps • Confidence: 92%_

```

---

### 2. Incident Triage Assistant

**Trigger**: CloudWatch alarm fires → SNS → KenchiOps webhook

**Slack Flow**:
```

┌─────────────────────────────────────────────────────────────┐
│ 🔴 P1 Incident: API Gateway High Error Rate │
│ Service: api-gateway • Environment: production │
├─────────────────────────────────────────────────────────────┤
│ │
│ Summary │
│ Error rate spiked to 45% (threshold: 5%). All POST │
│ requests to /api/orders are returning 500 errors. │
│ │
│ Likely Cause │
│ Database connection pool exhausted. Last deployment │
│ 15 minutes ago may have introduced a connection leak. │
│ │
│ Suggested Actions │
│ 1. Check DB connection count: `kubectl exec -it             │
│    postgres-0 -- psql -c "SELECT count(*) FROM              │
│    pg_stat_activity"` │
│ 2. Consider rolling back deployment v2.3.1 → v2.3.0 │
│ 3. Scale up DB max_connections temporarily │
│ │
│ Similar Past Incidents │
│ • INC-456 (3 weeks ago): DB pool exhaustion - resolved │
│ by fixing connection leak in OrderService │
│ │
│ Runbooks │
│ 📖 Database Connection Issues │
│ 📖 API Gateway Troubleshooting │
│ │
├─────────────────────────────────────────────────────────────┤
│ [Acknowledge] [View Dashboard] [🚨 Escalate] │
├─────────────────────────────────────────────────────────────┤
│ ⏱️ Response SLA: 15 min • AI Confidence: 87% │
└─────────────────────────────────────────────────────────────┘

```

**Interactive Actions**:

When user clicks **[Acknowledge]**:
```

┌─────────────────────────────────────────────────────────────┐
│ ✅ Incident Acknowledged │
│ @sarah.chen is investigating │
│ Acknowledged at 2:34 PM (2 min after trigger) │
└─────────────────────────────────────────────────────────────┘

```

When user clicks **[Escalate]**:
```

┌─────────────────────────────────────────────────────────────┐
│ 🚨 Escalate Incident? │
│ │
│ This will: │
│ • Page the Engineering Manager (@mike.jones) │
│ • Create a war room channel #inc-api-gateway-1234 │
│ • Notify stakeholders in #engineering-leads │
│ │
│ [Cancel] [Escalate Now] │
└─────────────────────────────────────────────────────────────┘

```

**Resolution Flow**:

User clicks **[Resolve]** or uses `/kenchi resolve`:
```

┌─────────────────────────────────────────────────────────────┐
│ Resolve Incident │
│ │
│ Resolution notes: │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Rolled back to v2.3.0. Connection leak confirmed in │ │
│ │ OrderService.createOrder(). Fix in progress on PR #234. │ │
│ └─────────────────────────────────────────────────────────┘ │
│ │
│ Was the suggested runbook helpful? │
│ [👍 Yes] [👎 No] │
│ │
│ [Cancel] [Resolve Incident] │
└─────────────────────────────────────────────────────────────┘

```

After resolution:
```

┌─────────────────────────────────────────────────────────────┐
│ ✅ Incident Resolved │
│ │
│ API Gateway High Error Rate │
│ │
│ Duration: 23 minutes │
│ Resolved by: @sarah.chen │
│ Root cause: Connection leak in OrderService │
│ │
│ Resolution: Rolled back to v2.3.0. Fix in PR #234. │
└─────────────────────────────────────────────────────────────┘

```

---

### 3. Deployment Confidence Score

**Trigger**: User runs `/kenchi deploy-check` or automated pre-deploy hook

**Slack Flow**:
```

┌─────────────────────────────────────────────────────────────┐
│ 🚀 Deploy Confidence: api-server → production │
│ Branch: main • Commit: abc1234 │
├─────────────────────────────────────────────────────────────┤
│ │
│ Overall Score: 73% ⚠️ Proceed with Caution │
│ ████████████████████░░░░░░░░ │
│ │
│ Risk Factors │
│ ✅ All tests passing +20 │
│ ✅ No P1 incidents in last 24h +15 │
│ ✅ Code reviewed and approved +10 │
│ ⚠️ 2 new dependencies added -10 │
│ ⚠️ Last deploy to prod failed -15 │
│ ⚠️ Test coverage: 72% → 68% -10 │
│ ❌ Rollback not tested recently -7 │
│ │
│ Recommendation │
│ Deploy during business hours with monitoring enabled. │
│ Have rollback ready. Consider testing rollback first. │
│ │
├─────────────────────────────────────────────────────────────┤
│ [Deploy Anyway] [Test Rollback First] [Cancel] │
└─────────────────────────────────────────────────────────────┘

```

**GitHub Flow** (as a Check):
```

Checks
├── ✅ Build & Test (3m 42s)
├── ✅ Lint & Format (1m 12s)
├── ✅ Security Scan (2m 08s)
└── ⚠️ Deploy Confidence: 73%
└── Details: 3 warnings, 1 blocker

```

Clicking "Details" shows:
```

Deploy Confidence Analysis

Score: 73% (Threshold: 50%)
Status: ⚠️ Warning - Review before deploying

✅ Passing Checks
• All 142 tests passing
• No active P1/P2 incidents
• PR approved by 2 reviewers

⚠️ Warnings
• 2 new npm dependencies added (review for security)
• Test coverage decreased by 4%
• Last production deploy failed (5 days ago)

❌ Blockers
• Rollback procedure not tested in 30+ days

Recommendation: Test rollback before deploying

```

---

### 4. IaC PR Review

**Trigger**: PR opened with Terraform/Kubernetes file changes

**GitHub Flow**:

PR Comment posted automatically:
```

## 🏗️ Infrastructure Change Review

KenchiOps analyzed changes to **3 Terraform files**.

### Summary

This PR adds a new RDS instance and modifies security group rules.

### 🔒 Security Findings

| Severity  | Finding                                    | File             |
| --------- | ------------------------------------------ | ---------------- |
| 🔴 High   | Security group allows 0.0.0.0/0 on port 22 | `security.tf:45` |
| 🟡 Medium | RDS instance not encrypted at rest         | `database.tf:23` |
| 🟢 Info   | Consider using aws_db_instance_role        | `database.tf:15` |

### 💰 Cost Estimation

| Resource        | Monthly Cost |
| --------------- | ------------ |
| RDS db.t3.large | ~$98/mo      |
| NAT Gateway     | ~$45/mo      |
| **Total Added** | **~$143/mo** |

### 📋 Best Practices

- ✅ Uses Terraform modules
- ✅ Resources properly tagged
- ⚠️ No lifecycle prevent_destroy on RDS
- ⚠️ Consider multi-AZ for production RDS

### Suggested Changes

```hcl
# security.tf:45 - Restrict SSH access
- cidr_blocks = ["0.0.0.0/0"]
+ cidr_blocks = ["10.0.0.0/8"]  # VPN range only

# database.tf:23 - Enable encryption
resource "aws_db_instance" "main" {
+ storage_encrypted = true
+ kms_key_id       = aws_kms_key.rds.arn
}
```

---

🤖 _Reviewed by KenchiOps • [View Full Report](link)_

```

**Slack Notification** (for high-severity findings):
```

┌─────────────────────────────────────────────────────────────┐
│ 🔒 Security Issue in IaC PR │
│ PR #234: Add production database │
├─────────────────────────────────────────────────────────────┤
│ │
│ 🔴 High Severity Finding │
│ Security group allows SSH from anywhere (0.0.0.0/0) │
│ │
│ File: security.tf:45 │
│ Author: @john.doe │
│ │
├─────────────────────────────────────────────────────────────┤
│ [View PR] [View Full Analysis] │
└─────────────────────────────────────────────────────────────┘

```

---

### 5. On-Call Digest

**Trigger**: Scheduled (daily at 9 AM, or start of on-call shift)

**Slack Flow** (DM to on-call engineer):
```

┌─────────────────────────────────────────────────────────────┐
│ 📊 On-Call Digest │
│ December 15, 2024 • Your shift: 9 AM - 9 PM │
├─────────────────────────────────────────────────────────────┤
│ │
│ Last 24 Hours │
│ ├── 🔴 Incidents: 2 (1 P2, 1 P3) │
│ ├── 🔧 CI Failures: 8 (5 flaky, 3 real) │
│ └── 🚀 Deploys: 4 (all successful) │
│ │
│ Open Items Requiring Attention │
│ • P2 incident INC-789 still investigating (2h old) │
│ • PR #456 has failing checks (assigned to you) │
│ • Scheduled maintenance: DB upgrade at 2 PM │
│ │
│ Trends to Watch │
│ 📈 Redis latency up 23% over last week │
│ 📈 api-server memory usage trending higher │
│ │
│ Handoff Notes from @previous.oncall │
│ "Watch the payment-service - had intermittent │
│ timeouts yesterday, may recur." │
│ │
├─────────────────────────────────────────────────────────────┤
│ [View Dashboard] [See All Incidents] │
└─────────────────────────────────────────────────────────────┘

```

---

### 6. ChatOps Commands

**Slash Commands**:

| Command | Description |
|---------|-------------|
| `/kenchi status` | Current system status overview |
| `/kenchi incidents` | List open incidents |
| `/kenchi analyze <url>` | Analyze a GitHub Actions run |
| `/kenchi deploy-check <repo> <branch>` | Get deployment confidence |
| `/kenchi runbook <search>` | Search runbooks |
| `/kenchi escalate <incident-id>` | Escalate an incident |
| `/kenchi resolve <incident-id>` | Resolve an incident |
| `/kenchi help` | Show all commands |

**Conversational Flow**:
```

User: @kenchi why did the payment-service build fail?

KenchiOps: 🔍 Analyzing last failed build for payment-service...

The build failed 2 hours ago due to a test timeout:

• Test: `PaymentProcessor.processRefund`
• Error: Timeout after 30000ms
• This test has failed 3 times this week (flaky)

This appears to be a flaky test, not a code issue.
The test passed on retry.

Would you like me to:
• Create an issue to fix the flaky test?
• Show historical failure pattern?
• Re-run the build?

```

```

User: create an issue

KenchiOps: ✅ Created issue #567: "Fix flaky test: PaymentProcessor.processRefund"

Assigned to: @test-team
Labels: flaky-test, priority:medium
Link: github.com/acme/payment-service/issues/567

```

---

## GitHub Experience

### PR Checks

KenchiOps adds checks to every PR:

```

Checks (4)
├── ✅ CI / Build & Test
├── ✅ CI / Lint
├── ⚠️ KenchiOps / Code Analysis
│ └── 2 suggestions, 0 blockers
└── ⚠️ KenchiOps / Deploy Confidence: 78%
└── Ready to deploy with minor warnings

```

### PR Comments

KenchiOps comments on PRs for:

| Event | Comment Type |
|-------|--------------|
| CI failure | Root cause analysis + fix suggestion |
| IaC changes | Security review + cost estimate |
| Flaky test | Pattern analysis + fix recommendation |
| PR merged | Links to any related incidents |

### Commit Status

For deployment-related branches:
```

Environments
└── production
├── Last deploy: 2h ago by @jane
├── Deploy confidence: 85% ✅
└── [Deploy] [View History]

```

---

## Notification Preferences

Users can configure in Slack:

```

/kenchi settings

┌─────────────────────────────────────────────────────────────┐
│ ⚙️ Notification Settings │
├─────────────────────────────────────────────────────────────┤
│ │
│ CI Failures │
│ ○ All failures │
│ ● Only my PRs │
│ ○ None │
│ │
│ Incidents │
│ ☑ P1 incidents (always) │
│ ☑ P2 incidents │
│ ☐ P3/P4 incidents │
│ ☑ Incidents for my services │
│ │
│ Deploy Confidence │
│ ○ All deploys │
│ ● Only low-confidence (<70%) │
│ ○ None │
│ │
│ On-Call Digest │
│ ☑ Daily digest at 9 AM │
│ ☑ Shift start summary │
│ │
├─────────────────────────────────────────────────────────────┤
│ [Save Settings] │
└─────────────────────────────────────────────────────────────┘

```

---

## Integration Points Summary

| Feature | Slack | GitHub PR | GitHub Check |
|---------|:-----:|:---------:|:------------:|
| CI Failure Analysis | ✓ | ✓ | - |
| Incident Triage | ✓ | - | - |
| Deploy Confidence | ✓ | - | ✓ |
| IaC Review | ✓ (alerts) | ✓ | ✓ |
| On-Call Digest | ✓ | - | - |
| ChatOps | ✓ | - | - |
| Runbook Search | ✓ | ✓ (links) | - |

---

## Mobile Experience

Slack mobile app provides:
- Push notifications for P1/P2 incidents
- Acknowledge/Escalate buttons work on mobile
- Quick view of incident summary
- Voice: "Hey Siri, tell Slack to acknowledge the incident"

---

## Admin Dashboard (Future)

Web dashboard for configuration:
- Channel routing rules
- Severity thresholds
- Runbook management
- Usage analytics
- Team on-call schedules
- Integration settings
```

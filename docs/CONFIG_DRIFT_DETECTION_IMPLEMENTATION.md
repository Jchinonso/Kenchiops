# Configuration Drift Detection - Implementation Design

## Overview

Configuration Drift Detection continuously compares live production environments against the declared configuration in Git (GitOps approach). The system flags discrepancies caused by manual hot-fixes or unauthorized changes and suggests remediation to bring systems back to the desired state.

---

## Problem Statement

In production environments, configuration can "drift" from the declared state when:

- Engineers make emergency fixes directly via kubectl, AWS console, or SSH
- Automated scaling changes replica counts
- Third-party integrations modify settings
- Configuration is updated but Git isn't synced

This leads to:

- Inconsistencies between environments
- Failed deployments when Git state conflicts with live state
- Security risks from undocumented changes
- Difficulty reproducing production issues locally

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Configuration Sources                         │
├───────────────┬───────────────┬───────────────┬─────────────────┤
│   Git Repo    │  Kubernetes   │     AWS       │   Terraform     │
│   (Desired)   │   (Actual)    │   (Actual)    │    State        │
└───────┬───────┴───────┬───────┴───────┬───────┴────────┬────────┘
        │               │               │                │
        ▼               ▼               ▼                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    State Collectors                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐    │
│  │   Git    │  │   K8s    │  │   AWS    │  │  Terraform   │    │
│  │ Fetcher  │  │  Client  │  │   SDK    │  │ State Reader │    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘    │
└───────┼─────────────┼─────────────┼───────────────┼────────────┘
        │             │             │               │
        ▼             ▼             ▼               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Normalization Layer                           │
│         Convert all configs to comparable format                 │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Drift Engine                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │    Diff      │  │   Classify   │  │   Risk Assessment    │  │
│  │  Calculator  │  │   Changes    │  │   (Security/Cost)    │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Output Layer                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐    │
│  │  Slack   │  │  GitHub  │  │   API    │  │  Dashboard   │    │
│  │  Alert   │  │  Issue   │  │ Endpoint │  │   Widget     │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Supported Configuration Sources

### Desired State (Git)

| Source Type          | File Patterns                             | Description                       |
| -------------------- | ----------------------------------------- | --------------------------------- |
| Kubernetes manifests | `*.yaml`, `*.yml` in `/k8s`, `/manifests` | Deployments, Services, ConfigMaps |
| Helm values          | `values.yaml`, `values-*.yaml`            | Helm chart configurations         |
| Kustomize            | `kustomization.yaml`                      | Overlay configurations            |
| Terraform            | `*.tf`                                    | Infrastructure definitions        |
| Docker Compose       | `docker-compose*.yaml`                    | Container configurations          |
| Ansible              | `*.yml` in `/ansible`, `/playbooks`       | Server configurations             |

### Actual State (Live)

| Platform        | Collection Method        | Refresh Interval  |
| --------------- | ------------------------ | ----------------- |
| Kubernetes      | K8s API (kubectl get)    | 5 minutes         |
| AWS             | AWS SDK (describe calls) | 15 minutes        |
| GCP             | Cloud API                | 15 minutes        |
| Azure           | Azure SDK                | 15 minutes        |
| Terraform Cloud | State API                | On change webhook |

---

## Data Models

### DriftReport

| Field            | Type           | Description                |
| ---------------- | -------------- | -------------------------- |
| id               | UUID           | Unique report identifier   |
| tenantId         | UUID           | Owning organization        |
| scanTimestamp    | DateTime       | When scan was performed    |
| environment      | String         | production, staging, dev   |
| totalResources   | Integer        | Resources checked          |
| driftedResources | Integer        | Resources with drift       |
| driftPercentage  | Float          | Drift ratio (0-100)        |
| status           | Enum           | healthy, warning, critical |
| findings         | DriftFinding[] | Individual drift items     |

### DriftFinding

| Field          | Type     | Description                         |
| -------------- | -------- | ----------------------------------- |
| id             | UUID     | Finding identifier                  |
| reportId       | UUID     | Parent report                       |
| resourceType   | String   | deployment, configmap, secret, etc. |
| resourceName   | String   | Name of the resource                |
| namespace      | String   | K8s namespace (if applicable)       |
| driftType      | Enum     | added, removed, modified            |
| severity       | Enum     | low, medium, high, critical         |
| gitValue       | JSON     | Expected value from Git             |
| liveValue      | JSON     | Actual value in production          |
| diff           | String   | Human-readable diff                 |
| detectedAt     | DateTime | First detection time                |
| lastSeenAt     | DateTime | Most recent detection               |
| acknowledgedBy | String   | User who acknowledged (if any)      |
| remediation    | String   | Suggested fix                       |

### DriftAcknowledgment

| Field     | Type     | Description                 |
| --------- | -------- | --------------------------- |
| findingId | UUID     | Acknowledged finding        |
| userId    | String   | Who acknowledged            |
| reason    | String   | Why drift is acceptable     |
| expiresAt | DateTime | When to re-alert (optional) |

---

## Drift Categories

### By Type

| Category              | Examples                  | Default Severity |
| --------------------- | ------------------------- | ---------------- |
| Replica Count         | Deployment scaled up/down | Low              |
| Resource Limits       | CPU/memory changed        | Medium           |
| Environment Variables | Env vars added/removed    | Medium           |
| Image Version         | Container image differs   | High             |
| ConfigMap Data        | Config values changed     | Medium           |
| Secret References     | Secrets added/removed     | Critical         |
| Service Ports         | Port mappings changed     | High             |
| Labels/Annotations    | Metadata differs          | Low              |
| Network Policies      | Ingress/egress rules      | Critical         |
| RBAC                  | Role bindings changed     | Critical         |

### By Cause

| Cause               | Detection Method      | Common Remediation       |
| ------------------- | --------------------- | ------------------------ |
| Manual kubectl edit | No matching commit    | Revert or commit change  |
| HPA scaling         | Replica count differs | Update Git or adjust HPA |
| Operator mutation   | Webhook-added fields  | Exclude in config        |
| Emergency hotfix    | Recent direct change  | Create PR to formalize   |
| Stale state         | Old version deployed  | Trigger redeploy         |

---

## Severity Classification

### Scoring Factors

| Factor          | Weight | Description                       |
| --------------- | ------ | --------------------------------- |
| Resource Type   | 30%    | Secrets/RBAC = high, labels = low |
| Change Type     | 25%    | Removed > Modified > Added        |
| Security Impact | 25%    | Network/auth changes = high       |
| Environment     | 20%    | Production > Staging > Dev        |

### Severity Matrix

| Score Range | Severity | Response                     |
| ----------- | -------- | ---------------------------- |
| 0-25        | Low      | Weekly digest                |
| 26-50       | Medium   | Daily alert                  |
| 51-75       | High     | Immediate Slack alert        |
| 76-100      | Critical | Page on-call + block deploys |

---

## Detection Schedule

| Environment | Scan Frequency | Full Scan     | Alert Delay |
| ----------- | -------------- | ------------- | ----------- |
| Production  | Every 5 min    | Every hour    | Immediate   |
| Staging     | Every 15 min   | Every 4 hours | 30 min      |
| Development | Every hour     | Daily         | 2 hours     |

---

## Output Formats

### Slack Alert (Critical Drift)

```
----------------------------------------------
|  CONFIGURATION DRIFT DETECTED              |
----------------------------------------------
|                                            |
|  Environment: production                   |
|  Severity: CRITICAL                        |
|                                            |
|  Resource: payment-service (Deployment)    |
|  Namespace: payments                       |
|                                            |
|  Change Detected:                          |
|  - replicas: 3 -> 5                        |
|  - image: v1.4.2 -> v1.4.3-hotfix          |
|  - env.DEBUG: (added) "true"               |
|                                            |
|  Likely Cause:                             |
|  Manual change via kubectl at 14:32 UTC    |
|  by user: alice@company.com                |
|                                            |
|  Recommendation:                           |
|  Create PR to update Git manifest or       |
|  rollback to declared state                |
|                                            |
|  [Acknowledge] [Create PR] [Rollback]      |
|                                            |
----------------------------------------------
```

### Slack Alert (Weekly Digest)

```
----------------------------------------------
|  WEEKLY DRIFT REPORT                       |
----------------------------------------------
|                                            |
|  Period: Dec 25 - Jan 1, 2025              |
|                                            |
|  Production:                               |
|    Scans: 2,016                            |
|    Drift events: 12                        |
|    Resolved: 10                            |
|    Outstanding: 2 (1 acknowledged)         |
|                                            |
|  Top Drift Sources:                        |
|  1. HPA scaling (5 events)                 |
|  2. Manual hotfixes (4 events)             |
|  3. Operator mutations (3 events)          |
|                                            |
|  Recommendations:                          |
|  - Consider committing HPA scaling ranges  |
|  - Review hotfix process for payments svc  |
|                                            |
|  [View Full Report]                        |
|                                            |
----------------------------------------------
```

### GitHub Issue (Auto-Created)

```markdown
## Configuration Drift: payment-service

**Environment:** production
**Detected:** 2025-01-02 14:35 UTC
**Severity:** High

### Changes Detected

| Field     | Git Value | Live Value    |
| --------- | --------- | ------------- |
| replicas  | 3         | 5             |
| image     | v1.4.2    | v1.4.3-hotfix |
| env.DEBUG | (not set) | "true"        |

### Suggested Remediation

**Option 1: Update Git to match production**
Update `k8s/production/payment-service.yaml`:

- Set replicas to 5
- Update image to v1.4.3-hotfix
- Add DEBUG env var if intentional

**Option 2: Revert production to Git state**
Run: `kubectl apply -f k8s/production/payment-service.yaml`

### Context

- Last Git commit: abc123 by @bob (2 days ago)
- Change detected via: kubectl audit log
- Similar drift: 2 occurrences in last 30 days

---

_Auto-generated by KenchiOps Drift Detection_
```

---

## API Endpoints

| Endpoint                              | Method          | Description              |
| ------------------------------------- | --------------- | ------------------------ |
| `/api/drift/scan`                     | POST            | Trigger immediate scan   |
| `/api/drift/reports`                  | GET             | List drift reports       |
| `/api/drift/reports/:id`              | GET             | Get specific report      |
| `/api/drift/findings`                 | GET             | List all findings        |
| `/api/drift/findings/:id/acknowledge` | POST            | Acknowledge finding      |
| `/api/drift/findings/:id/remediate`   | POST            | Trigger remediation      |
| `/api/drift/config`                   | GET/PUT         | Drift detection settings |
| `/api/drift/exclusions`               | GET/POST/DELETE | Manage exclusion rules   |

---

## Configuration Options

### Tenant-Level Settings

| Setting                | Type     | Default        | Description                     |
| ---------------------- | -------- | -------------- | ------------------------------- |
| enabled                | Boolean  | true           | Enable drift detection          |
| scanInterval           | Integer  | 300            | Seconds between scans           |
| environments           | String[] | ["production"] | Environments to monitor         |
| alertThreshold         | Enum     | medium         | Minimum severity to alert       |
| autoCreateIssues       | Boolean  | false          | Auto-create GitHub issues       |
| blockDeploysOnCritical | Boolean  | false          | Block deploys on critical drift |

### Exclusion Rules

| Rule Type        | Example                  | Purpose                            |
| ---------------- | ------------------------ | ---------------------------------- |
| Resource Pattern | `*/hpa-*`                | Exclude HPA-managed resources      |
| Field Path       | `metadata.annotations.*` | Ignore annotation changes          |
| Namespace        | `kube-system`            | Exclude system namespaces          |
| Label Selector   | `managed-by: operator`   | Exclude operator-managed resources |
| Time Window      | `last-deployed < 1h`     | Ignore recently deployed resources |

---

## Remediation Actions

### Automated (with approval)

| Action               | Trigger            | Approval Required  |
| -------------------- | ------------------ | ------------------ |
| Sync to Git state    | Any drift          | Yes (Slack button) |
| Create PR from live  | Intentional change | No                 |
| Scale to Git replica | HPA override       | Yes                |
| Rollback image       | Image drift        | Yes                |

### Manual Guidance

| Drift Type     | Suggested Steps                                                              |
| -------------- | ---------------------------------------------------------------------------- |
| Unknown image  | 1. Check deployment history 2. Verify image exists 3. Update Git or rollback |
| Added env var  | 1. Determine if intentional 2. Add to Git config 3. Document purpose         |
| Missing secret | 1. Check secret exists 2. Verify RBAC 3. Re-apply manifest                   |

---

## Database Schema

### Tables

| Table                   | Purpose                   |
| ----------------------- | ------------------------- |
| `drift_reports`         | Scan results and summary  |
| `drift_findings`        | Individual drift items    |
| `drift_acknowledgments` | User acknowledgments      |
| `drift_exclusions`      | Exclusion rules           |
| `drift_remediations`    | Remediation actions taken |
| `tenant_drift_config`   | Per-tenant settings       |

### Key Indexes

- `drift_findings(tenant_id, severity, status)` - Alert queries
- `drift_findings(resource_name, namespace)` - Resource lookup
- `drift_reports(tenant_id, environment, scan_timestamp)` - Historical queries

---

## Integration Points

### Input Sources

| Source          | Integration Method                 |
| --------------- | ---------------------------------- |
| GitHub          | App webhook + API for file content |
| GitLab          | Webhook + API                      |
| Kubernetes      | In-cluster client or kubeconfig    |
| AWS             | IAM role with describe permissions |
| Terraform Cloud | API token + workspace webhook      |

### Output Destinations

| Destination   | Trigger                 |
| ------------- | ----------------------- |
| Slack         | Severity >= threshold   |
| GitHub Issues | autoCreateIssues = true |
| PagerDuty     | Severity = critical     |
| Webhook       | Custom integrations     |

---

## Implementation Phases

### Phase 1: Kubernetes Drift (Week 1)

- Git manifest parsing (YAML)
- K8s API state collection
- Basic diff calculation
- Slack notifications

### Phase 2: Classification & Severity (Week 1-2)

- Drift type categorization
- Severity scoring
- Exclusion rule engine
- Acknowledgment workflow

### Phase 3: Remediation (Week 2)

- "Sync to Git" action
- "Create PR from live" action
- Audit logging
- Approval workflow

### Phase 4: Expanded Sources (Week 3)

- Terraform state comparison
- AWS resource drift
- Helm release drift
- Multi-cluster support

### Phase 5: Analytics (Week 4)

- Drift trend reporting
- Weekly digests
- Dashboard widgets
- Drift prevention recommendations

---

## Success Metrics

| Metric                   | Target                  |
| ------------------------ | ----------------------- |
| Detection latency        | < 10 min for production |
| False positive rate      | < 5%                    |
| Drift resolution time    | < 4 hours (p50)         |
| Acknowledged drift ratio | < 20% of total          |
| Auto-remediation success | > 95%                   |

---

## Security Considerations

| Concern             | Mitigation                                              |
| ------------------- | ------------------------------------------------------- |
| Cluster credentials | Use service accounts with read-only access              |
| Secret exposure     | Never log or display secret values                      |
| Audit trail         | Log all remediation actions                             |
| RBAC bypass         | Separate read (detection) and write (remediation) roles |

---

## Comparison with Existing Tools

| Feature             | KenchiOps      | ArgoCD    | Flux      | Kustomize |
| ------------------- | -------------- | --------- | --------- | --------- |
| Drift detection     | Real-time      | Yes       | Yes       | No        |
| Multi-platform      | K8s + AWS + TF | K8s only  | K8s only  | K8s only  |
| AI-powered analysis | Yes            | No        | No        | No        |
| Slack integration   | Native         | Webhook   | Webhook   | No        |
| Auto-remediation    | With approval  | Auto-sync | Auto-sync | No        |
| Cause detection     | Yes            | No        | No        | No        |
| Risk scoring        | Yes            | No        | No        | No        |

---

## Changelog

| Date    | Change                        |
| ------- | ----------------------------- |
| 2025-01 | Initial implementation design |

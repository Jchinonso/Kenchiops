# IaC PR Review - Implementation Plan

## Overview

The Infrastructure-as-Code (IaC) PR Reviewer automatically analyzes pull requests containing infrastructure changes (Terraform, Kubernetes, CloudFormation, etc.), identifies security issues, estimates costs, suggests best practices, and posts actionable comments on PRs.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         GitHub PR Event                                  │
│                    (pull_request.opened/synchronize)                     │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
                    ┌──────────────────────────┐
                    │   IaC File Detector      │
                    │   (*.tf, *.yaml, etc.)   │
                    └────────────┬─────────────┘
                                 │
                                 ▼
                    ┌──────────────────────────┐
                    │   Diff Fetcher           │
                    │   (GitHub API)           │
                    └────────────┬─────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
              ▼                  ▼                  ▼
    ┌─────────────────┐ ┌───────────────┐ ┌─────────────────┐
    │  Static         │ │  Cost         │ │  Best Practice  │
    │  Analysis       │ │  Estimator    │ │  Checker        │
    │  (Security)     │ │               │ │                 │
    └────────┬────────┘ └───────┬───────┘ └────────┬────────┘
             │                  │                  │
             └──────────────────┼──────────────────┘
                                │
                                ▼
                    ┌──────────────────────────┐
                    │   AI Summarizer          │
                    │   (Consolidate Findings) │
                    └────────────┬─────────────┘
                                 │
                                 ▼
                    ┌──────────────────────────┐
                    │   Review Record          │
                    │   (Database)             │
                    └────────────┬─────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
              ▼                  ▼                  ▼
    ┌─────────────────┐ ┌───────────────┐ ┌─────────────────┐
    │  PR Comment     │ │  GitHub Check │ │  Slack Alert    │
    │                 │ │  Status       │ │  (High Severity)│
    └─────────────────┘ └───────────────┘ └─────────────────┘
```

---

## Supported IaC Types

| Type           | File Patterns                                       | Priority |
| -------------- | --------------------------------------------------- | -------- |
| Terraform      | `*.tf`, `*.tfvars`                                  | P1 (MVP) |
| Kubernetes     | `*.yaml`, `*.yml` (with k8s markers)                | P1 (MVP) |
| Helm           | `Chart.yaml`, `values.yaml`, `templates/*.yaml`     | P2       |
| CloudFormation | `*.yaml`, `*.json` (with AWSTemplateFormatVersion)  | P2       |
| Pulumi         | `Pulumi.yaml`, `*.ts`, `*.py` (with pulumi imports) | P3       |
| Ansible        | `playbook.yml`, `*.yml` (with ansible markers)      | P3       |
| Docker Compose | `docker-compose*.yml`, `compose*.yaml`              | P3       |

### File Detection Logic

1. Check file extension
2. For ambiguous extensions (`.yaml`, `.yml`), inspect content:
   - Kubernetes: `apiVersion:`, `kind:`
   - CloudFormation: `AWSTemplateFormatVersion`
   - Helm: presence of `Chart.yaml` in directory
   - Ansible: `hosts:`, `tasks:`, `roles:`

---

## Data Models

### IaC Review

| Field         | Type         | Description                                       |
| ------------- | ------------ | ------------------------------------------------- |
| id            | string       | Unique review identifier                          |
| tenantId      | string       | Tenant reference                                  |
| prNumber      | number       | Pull request number                               |
| repository    | string       | Repository full name                              |
| commitSha     | string       | Head commit SHA                                   |
| iacType       | enum         | terraform, kubernetes, helm, cloudformation, etc. |
| filesAnalyzed | string[]     | List of IaC files reviewed                        |
| status        | enum         | pending, analyzing, completed, failed             |
| summary       | string       | AI-generated summary                              |
| findings      | Finding[]    | All findings from analysis                        |
| costEstimate  | CostEstimate | Estimated cost impact                             |
| metadata      | object       | Processing time, tool versions                    |
| createdAt     | Date         | When review started                               |
| completedAt   | Date         | When review finished                              |

### Finding

| Field       | Type   | Description                                |
| ----------- | ------ | ------------------------------------------ |
| id          | string | Unique finding identifier                  |
| severity    | enum   | critical, high, medium, low, info          |
| category    | enum   | security, cost, reliability, best_practice |
| title       | string | Short finding title                        |
| description | string | Detailed explanation                       |
| file        | string | File path                                  |
| line        | number | Line number (if applicable)                |
| resource    | string | Resource identifier                        |
| remediation | string | How to fix                                 |
| source      | enum   | checkov, tflint, tfsec, ai, custom         |
| ruleId      | string | Rule identifier from source tool           |

### Cost Estimate

| Field         | Type       | Description                           |
| ------------- | ---------- | ------------------------------------- |
| currency      | string     | USD                                   |
| monthlyBefore | number     | Estimated monthly cost before changes |
| monthlyAfter  | number     | Estimated monthly cost after changes  |
| monthlyDelta  | number     | Change in monthly cost                |
| breakdown     | CostItem[] | Per-resource cost breakdown           |
| confidence    | enum       | high, medium, low                     |

### Cost Item

| Field        | Type   | Description                          |
| ------------ | ------ | ------------------------------------ |
| resource     | string | Resource identifier                  |
| resourceType | string | e.g., aws_instance, aws_rds_instance |
| action       | enum   | create, modify, delete, no_change    |
| monthlyCost  | number | Estimated monthly cost               |
| details      | string | Pricing details                      |

---

## Database Schema

### Tables

| Table              | Purpose                   |
| ------------------ | ------------------------- |
| iac_reviews        | Review records per PR     |
| iac_findings       | Individual findings       |
| iac_cost_estimates | Cost estimation records   |
| iac_rules          | Custom org rules (future) |

### Key Indexes

- `iac_reviews(tenant_id, repository, pr_number)` - Find reviews for PR
- `iac_reviews(tenant_id, status)` - Find pending reviews
- `iac_findings(review_id, severity)` - Filter findings by severity
- `iac_findings(category)` - Filter by category

---

## Module Structure

```
packages/shared/src/
├── iac/
│   ├── index.ts                    # Public exports
│   ├── types.ts                    # Type definitions
│   ├── constants.ts                # Rules, thresholds, patterns
│   ├── fileDetector.ts             # Detect IaC file types
│   ├── diffParser.ts               # Parse PR diffs
│   ├── reviewOrchestrator.ts       # Main review coordinator
│   └── reviewSummarizer.ts         # AI summary generation
│
├── iac/analyzers/
│   ├── terraformAnalyzer.ts        # Terraform-specific analysis
│   ├── kubernetesAnalyzer.ts       # Kubernetes-specific analysis
│   ├── securityAnalyzer.ts         # Security checks (wraps external tools)
│   └── costEstimator.ts            # Cost estimation
│
├── iac/rules/
│   ├── securityRules.ts            # Built-in security rules
│   ├── bestPracticeRules.ts        # Best practice rules
│   └── customRules.ts              # User-defined rules (future)
│
├── database/
│   └── iacReviewRepository.ts      # CRUD operations

services/github-app/src/
├── handlers/
│   └── iacPrHandler.ts             # PR event handler for IaC

services/slack-bot/src/
├── formatters/
│   └── iacReviewFormatter.ts       # Slack message formatting
```

---

## Analysis Components

### 1. Security Analysis

#### Built-in Rules

| Rule ID | Severity | Description                                |
| ------- | -------- | ------------------------------------------ |
| SEC001  | Critical | S3 bucket publicly accessible              |
| SEC002  | Critical | Security group allows 0.0.0.0/0 on SSH/RDP |
| SEC003  | High     | RDS instance publicly accessible           |
| SEC004  | High     | Storage not encrypted at rest              |
| SEC005  | High     | No VPC flow logs enabled                   |
| SEC006  | Medium   | IAM policy too permissive (\*)             |
| SEC007  | Medium   | Missing resource tagging                   |
| SEC008  | Low      | Using default VPC                          |
| SEC009  | Low      | Deprecated resource type                   |

#### External Tool Integration

| Tool       | Purpose                   | IaC Types                      |
| ---------- | ------------------------- | ------------------------------ |
| Checkov    | Security & compliance     | Terraform, K8s, CloudFormation |
| tfsec      | Terraform security        | Terraform                      |
| tflint     | Terraform linting         | Terraform                      |
| kube-score | Kubernetes best practices | Kubernetes                     |
| Infracost  | Cost estimation           | Terraform                      |

**Integration approach**:

- Run tools in Docker containers
- Parse JSON/SARIF output
- Normalize to common Finding format

### 2. Cost Estimation

#### Supported Resources (MVP)

| Provider | Resources                                       |
| -------- | ----------------------------------------------- |
| AWS      | EC2, RDS, S3, Lambda, ELB, NAT Gateway, EBS     |
| GCP      | Compute Engine, Cloud SQL, GCS, Cloud Functions |
| Azure    | Virtual Machines, Azure SQL, Storage Accounts   |

#### Estimation Method

1. Parse Terraform plan or diff to identify resources
2. Map resource types to pricing API
3. Estimate based on:
   - Instance type/size
   - Region
   - Storage amounts
   - Expected usage (default assumptions)
4. Calculate delta (new - existing)

#### Confidence Levels

| Level  | Criteria                                          |
| ------ | ------------------------------------------------- |
| High   | Exact resource specs known, pricing API available |
| Medium | Some assumptions made (usage patterns)            |
| Low    | Significant unknowns, rough estimate              |

### 3. Best Practice Checks

| Category        | Examples                                     |
| --------------- | -------------------------------------------- |
| Reliability     | Multi-AZ not enabled, no auto-scaling        |
| Maintainability | No resource naming convention, missing tags  |
| Performance     | Undersized instances, no caching             |
| Compliance      | Missing required tags, non-compliant regions |

---

## PR Comment Format

### Full Review Comment

````markdown
## 🏗️ Infrastructure Change Review

KenchiOps analyzed **5 Terraform files** in this PR.

### Summary

This PR provisions a new production database cluster and updates security group rules.
**2 security issues** require attention before merge.

---

### 🔒 Security Findings

| Severity | Finding                                 | Location         |
| :------: | --------------------------------------- | ---------------- |
|    🔴    | Security group allows SSH from anywhere | `security.tf:45` |
|    🔴    | RDS instance publicly accessible        | `database.tf:23` |
|    🟡    | S3 bucket logging not enabled           | `storage.tf:12`  |
|    🟢    | Consider enabling deletion protection   | `database.tf:30` |

<details>
<summary>View Details</summary>

#### 🔴 Security group allows SSH from anywhere

**File:** `security.tf:45`
**Resource:** `aws_security_group.bastion`

SSH access (port 22) is open to `0.0.0.0/0`. This exposes the instance to potential brute-force attacks.

**Remediation:**

```hcl
ingress {
  from_port   = 22
  to_port     = 22
  protocol    = "tcp"
  cidr_blocks = ["10.0.0.0/8"]  # VPN range only
}
```
````

</details>

---

### 💰 Cost Estimate

| Resource         | Type             |    Monthly Cost |
| ---------------- | ---------------- | --------------: |
| db-primary       | aws_rds_instance |        +$156.00 |
| db-replica       | aws_rds_instance |        +$156.00 |
| nat-gateway      | aws_nat_gateway  |         +$45.00 |
| **Total Change** |                  | **+$357.00/mo** |

_Confidence: Medium (usage assumptions applied)_

---

### ✅ Best Practices

- ✅ Resources properly tagged
- ✅ Using Terraform modules
- ⚠️ Consider enabling Multi-AZ for RDS
- ⚠️ No lifecycle `prevent_destroy` on database

---

🤖 _Reviewed by KenchiOps • [View Full Report](link) • Powered by Checkov, Infracost_

````

### Inline Comments (for specific issues)

Posted as PR review comments on specific lines:

```markdown
⚠️ **Security Issue**: This security group rule allows SSH access from any IP address.

**Risk**: Exposes the bastion host to potential brute-force attacks from the internet.

**Suggested Fix**:
```hcl
cidr_blocks = ["10.0.0.0/8"]  # Restrict to VPN range
````

_Rule: SEC002 • [Learn More](docs-link)_

```

---

## GitHub Check Integration

### Check Run

```

Name: KenchiOps / IaC Review
Status: completed
Conclusion: action_required (or success, failure, neutral)

Summary:

- 2 security issues found
- Estimated cost impact: +$357/mo
- 4 best practice suggestions

Annotations:

- security.tf:45 - warning - Security group allows 0.0.0.0/0
- database.tf:23 - warning - RDS publicly accessible

```

### Check Conclusions

| Conclusion | Criteria |
|------------|----------|
| success | No critical/high findings |
| action_required | High severity findings (can merge with override) |
| failure | Critical findings (blocked, needs fix) |
| neutral | Only info/low findings |

### Blocking Rules (Configurable)

| Setting | Default |
|---------|---------|
| Block on critical | Yes |
| Block on high | No (warning only) |
| Block on cost increase > $X | No |
| Require IaC review before merge | Yes |

---

## Slack Notifications

### When to Notify

| Condition | Action |
|-----------|--------|
| Critical security finding | Alert to security channel |
| Cost increase > threshold | Alert to cost channel |
| Review completed | Optional summary to PR channel |

### Alert Format

```

┌─────────────────────────────────────────────────────────────┐
│ 🔒 Security Issue in IaC PR │
│ PR #234: Add production database │
├─────────────────────────────────────────────────────────────┤
│ │
│ 🔴 Critical Finding │
│ Security group allows SSH from anywhere (0.0.0.0/0) │
│ │
│ File: security.tf:45 │
│ Author: @john.doe │
│ Repository: acme/infrastructure │
│ │
├─────────────────────────────────────────────────────────────┤
│ [View PR] [View Full Analysis] │
└─────────────────────────────────────────────────────────────┘

````

---

## Configuration

### Tenant Settings

| Setting | Description | Default |
|---------|-------------|---------|
| enableIacReview | Enable IaC analysis | true |
| iacFilePatterns | Custom file patterns | (default list) |
| blockOnCritical | Block PR merge on critical | true |
| blockOnHigh | Block PR merge on high | false |
| costAlertThreshold | Alert if cost delta > X | $100 |
| securityAlertChannel | Slack channel for security alerts | null |
| enableCostEstimate | Show cost estimates | true |
| enableInlineComments | Post inline PR comments | true |
| maxFilesToAnalyze | Skip if too many files | 50 |

### Repository-Level Overrides

`.kenchi/iac-review.yaml` in repo root:

```yaml
# Override tenant defaults for this repo
enabled: true

# File patterns to analyze
include:
  - "terraform/**/*.tf"
  - "k8s/**/*.yaml"

exclude:
  - "**/*_test.tf"
  - "**/examples/**"

# Severity thresholds
block_on:
  - critical
  # - high  # uncomment to block on high

# Cost settings
cost:
  enabled: true
  alert_threshold: 500  # USD/month

# Ignore specific rules
ignore_rules:
  - SEC008  # We intentionally use default VPC in dev
````

---

## Processing Flow

### Step 1: PR Event Received

1. GitHub webhook: `pull_request.opened` or `pull_request.synchronize`
2. Filter: Does PR contain IaC files?
3. If no IaC files → skip, exit
4. If yes → create `iac_review` record with status `pending`

### Step 2: Fetch and Parse Diff

1. Fetch PR diff via GitHub API
2. Extract changed files matching IaC patterns
3. Download full file content for changed files
4. Detect IaC type for each file

### Step 3: Run Analysis

1. **Security Analysis** (parallel):
   - Run Checkov on Terraform files
   - Run tfsec on Terraform files
   - Run kube-score on Kubernetes files
   - Run built-in rules

2. **Cost Estimation** (if Terraform):
   - Generate Terraform plan (or parse diff)
   - Call Infracost API
   - Parse cost breakdown

3. **Best Practice Checks**:
   - Apply built-in rules
   - Check naming conventions
   - Verify required tags

### Step 4: Consolidate and Summarize

1. Normalize all findings to common format
2. Deduplicate overlapping findings
3. Sort by severity
4. Generate AI summary

### Step 5: Post Results

1. Create/update GitHub Check Run
2. Post main PR comment
3. Post inline comments for specific issues
4. Send Slack alert if critical findings
5. Update `iac_review` record with status `completed`

---

## External Tool Execution

### Approach: Containerized Execution

Run security tools in isolated containers:

```
┌─────────────────────────────────────────┐
│            KenchiOps API                │
├─────────────────────────────────────────┤
│                                         │
│  1. Clone/download changed files        │
│  2. Spin up tool container              │
│  3. Mount files into container          │
│  4. Execute tool with JSON output       │
│  5. Parse results                       │
│  6. Cleanup container                   │
│                                         │
└─────────────────────────────────────────┘

Container: checkov/checkov:latest
Command: checkov -d /code --output json
Timeout: 60 seconds
```

### Tool Output Parsing

Each tool has a parser that normalizes output:

| Tool       | Output Format     | Parser                   |
| ---------- | ----------------- | ------------------------ |
| Checkov    | JSON (SARIF-like) | `parseCheckovOutput()`   |
| tfsec      | JSON/SARIF        | `parseTfsecOutput()`     |
| tflint     | JSON              | `parseTflintOutput()`    |
| kube-score | JSON              | `parseKubeScoreOutput()` |
| Infracost  | JSON              | `parseInfracostOutput()` |

---

## Implementation Phases

### Phase 1: Foundation (Week 1)

- [ ] Define types and constants
- [ ] Create database schema and migrations
- [ ] Implement file detector (identify IaC types)
- [ ] Implement diff fetcher (GitHub API)
- [ ] Create review repository (CRUD)

### Phase 2: Security Analysis (Week 2)

- [ ] Integrate Checkov (Docker execution)
- [ ] Integrate tfsec
- [ ] Build output parsers
- [ ] Implement built-in security rules
- [ ] Normalize findings to common format

### Phase 3: Cost Estimation (Week 2-3)

- [ ] Integrate Infracost API
- [ ] Parse Terraform resource changes
- [ ] Map to cost estimates
- [ ] Generate cost breakdown

### Phase 4: Best Practices (Week 3)

- [ ] Implement best practice rules
- [ ] Add Kubernetes analysis (kube-score)
- [ ] Create rule configuration system

### Phase 5: Output & Integration (Week 3-4)

- [ ] Generate AI summary
- [ ] Post PR comments (main + inline)
- [ ] Create GitHub Check Run
- [ ] Implement Slack alerts

### Phase 6: Configuration & Polish (Week 4)

- [ ] Add tenant settings
- [ ] Support repo-level overrides (.kenchi/iac-review.yaml)
- [ ] Add ignore/skip functionality
- [ ] Write tests
- [ ] Documentation

---

## Success Metrics

| Metric                   | Target       | Measurement                  |
| ------------------------ | ------------ | ---------------------------- |
| Analysis Time            | < 60 seconds | P95 from PR event to comment |
| Security Issue Detection | > 90%        | Compare to manual review     |
| False Positive Rate      | < 10%        | User dismissals              |
| Cost Estimate Accuracy   | ±20%         | Compare to actual bills      |
| Developer Satisfaction   | > 4/5        | Survey rating                |

---

## Future Enhancements

| Feature                    | Priority | Description                      |
| -------------------------- | -------- | -------------------------------- |
| CloudFormation Support     | High     | Parse CFN templates              |
| Helm Chart Analysis        | High     | Analyze rendered templates       |
| Custom Rules Engine        | Medium   | User-defined security rules      |
| Policy as Code             | Medium   | OPA/Rego integration             |
| Drift Detection            | Medium   | Compare live state to IaC        |
| Auto-Fix PRs               | Low      | Generate fix PRs automatically   |
| Terraform Plan Integration | Low      | Require plan output for accuracy |

---

## Dependencies

### Required

- GitHub App with PR read/write permissions
- Docker (for running analysis tools)
- PostgreSQL database

### External Tools (Containerized)

- Checkov (`bridgecrew/checkov`)
- tfsec (`aquasec/tfsec`)
- tflint (`ghcr.io/terraform-linters/tflint`)
- kube-score (`zegl/kube-score`)

### Optional

- Infracost API key (for cost estimation)
- Custom container registry (for self-hosted tools)

---

## API Endpoints

### Trigger Review (Manual)

| Method | Endpoint        | Description             |
| ------ | --------------- | ----------------------- |
| POST   | /api/iac/review | Trigger review for a PR |

Request:

```json
{
  "repository": "acme/infrastructure",
  "prNumber": 234
}
```

### Get Review Results

| Method | Endpoint             | Description                 |
| ------ | -------------------- | --------------------------- |
| GET    | /api/iac/reviews/:id | Get review by ID            |
| GET    | /api/iac/reviews     | List reviews (with filters) |

### Configure Settings

| Method | Endpoint          | Description             |
| ------ | ----------------- | ----------------------- |
| GET    | /api/iac/settings | Get tenant IaC settings |
| PATCH  | /api/iac/settings | Update settings         |

---

## Error Handling

| Scenario               | Behavior                                     |
| ---------------------- | -------------------------------------------- |
| Tool execution timeout | Report partial results, note timeout         |
| Tool not available     | Skip that tool, continue with others         |
| Too many files         | Skip analysis, post comment explaining limit |
| Private dependencies   | Note limitation, suggest local analysis      |
| Invalid IaC syntax     | Report parse error as finding                |
| API rate limits        | Queue and retry with backoff                 |

# KenchiOps Product Roadmap

## Overview

This document outlines the KenchiOps development roadmap, tracking completed features, current work, and future plans. The roadmap is organized into phases aligned with the 12-week MVP plan and beyond.

---

## Status Legend

| Status         | Meaning                       |
| -------------- | ----------------------------- |
| ✅ Complete    | Fully implemented and tested  |
| 🚧 In Progress | Currently being developed     |
| 📋 Planned     | Scheduled for upcoming sprint |
| 💡 Future      | Post-MVP consideration        |
| ❌ Blocked     | Waiting on dependency         |

---

## Phase 1: Foundation (Weeks 1-4) ✅

### Architecture & Infrastructure

| Feature                   | Status      | Description                                   |
| ------------------------- | ----------- | --------------------------------------------- |
| Monorepo Structure        | ✅ Complete | TypeScript monorepo with shared package       |
| GitHub App Integration    | ✅ Complete | Webhook handlers, PR comments, check runs     |
| Slack Bot Integration     | ✅ Complete | Event handlers, rich message formatting       |
| Multi-Tenant Architecture | ✅ Complete | Tenant isolation, per-org configuration       |
| Database Schema           | ✅ Complete | PostgreSQL with tenant-aware tables           |
| Error Handling            | ✅ Complete | Centralized error classes, structured logging |

### CI/CD Failure Assistant

| Feature                | Status      | Description                                 |
| ---------------------- | ----------- | ------------------------------------------- |
| Webhook Ingestion      | ✅ Complete | GitHub check_run events processing          |
| Log Parsing            | ✅ Complete | Extract errors, test failures, stack traces |
| AI Analysis            | ✅ Complete | OpenAI-powered root cause analysis          |
| PR Comments            | ✅ Complete | Post fix suggestions on pull requests       |
| Slack Notifications    | ✅ Complete | Alert channels on CI failures               |
| Multi-Language Support | ✅ Complete | TypeScript, Python, Rust, Go, Java          |

---

## Phase 2: Intelligence Layer (Weeks 5-8) 🚧

### RAG System

| Feature                | Status         | Description                              |
| ---------------------- | -------------- | ---------------------------------------- |
| Document Ingestion     | ✅ Complete    | Ingest PRs, postmortems, runbooks        |
| Vector Search          | ✅ Complete    | Semantic search across knowledge base    |
| Embedding Tiers        | ✅ Complete    | LIGHT/STANDARD/PREMIUM cost optimization |
| Cost Tracking          | ✅ Complete    | Per-tenant usage and budget management   |
| Query Caching          | ✅ Complete    | Reduce redundant embedding calls         |
| Relationship Detection | 🚧 In Progress | Auto-link related documents              |
| Multi-Hop Retrieval    | 🚧 In Progress | Graph traversal for complex queries      |
| Drift Detection        | 📋 Planned     | Monitor RAG quality over time            |
| Streaming Updates      | 📋 Planned     | Real-time doc updates on PR merge        |

### Incident Triage Assistant

See [INCIDENT_TRIAGE_IMPLEMENTATION.md](./INCIDENT_TRIAGE_IMPLEMENTATION.md) for detailed implementation plan.

| Feature                 | Status     | Description                          |
| ----------------------- | ---------- | ------------------------------------ |
| Alert Ingestion         | 📋 Planned | Receive alerts from monitoring tools |
| CloudWatch Integration  | 📋 Planned | AWS CloudWatch alarms                |
| Datadog Integration     | 💡 Future  | Datadog alerts and metrics           |
| PagerDuty Integration   | 💡 Future  | Incident lifecycle management        |
| AI Summarization        | 📋 Planned | Generate incident summaries          |
| Historical Context      | 📋 Planned | RAG-powered similar incident lookup  |
| Severity Classification | 📋 Planned | Auto-classify P1/P2/P3               |
| Runbook Linking         | 📋 Planned | Suggest relevant runbooks            |

### IaC PR Reviewer

See [IAC_REVIEW_IMPLEMENTATION.md](./IAC_REVIEW_IMPLEMENTATION.md) for detailed implementation plan.

| Feature             | Status     | Description                               |
| ------------------- | ---------- | ----------------------------------------- |
| Terraform Detection | 📋 Planned | Identify IaC changes in PRs               |
| Diff Analysis       | 📋 Planned | Parse and understand Terraform diffs      |
| AI Review           | 📋 Planned | Security, cost, best practice suggestions |
| Static Analysis     | 📋 Planned | Integrate tflint, checkov                 |
| Cost Estimation     | 💡 Future  | Estimate infrastructure cost changes      |
| Policy Enforcement  | 💡 Future  | Custom org policies                       |

### Configuration Drift Detection

See [CONFIG_DRIFT_DETECTION_IMPLEMENTATION.md](./CONFIG_DRIFT_DETECTION_IMPLEMENTATION.md) for detailed implementation plan.

| Feature                 | Status     | Description                             |
| ----------------------- | ---------- | --------------------------------------- |
| Kubernetes Drift        | 📋 Planned | Compare live K8s state vs Git manifests |
| Terraform Drift         | 📋 Planned | Compare live infra vs Terraform state   |
| AWS Resource Drift      | 💡 Future  | Detect AWS console changes              |
| Severity Classification | 📋 Planned | Score drift by security/cost impact     |
| Exclusion Rules         | 📋 Planned | Ignore HPA, operator-managed resources  |
| Auto-Remediation        | 📋 Planned | Sync to Git with approval               |
| Drift Digests           | 📋 Planned | Weekly summary reports                  |

---

## Phase 3: Safety & Automation (Weeks 9-10) 📋

### Human-in-the-Loop Workflow

| Feature               | Status     | Description                           |
| --------------------- | ---------- | ------------------------------------- |
| Approval Buttons      | 📋 Planned | Slack interactive buttons for actions |
| Action Audit Trail    | 📋 Planned | Log all approved/rejected actions     |
| Permission Controls   | 📋 Planned | Role-based action authorization       |
| Confidence Thresholds | 📋 Planned | Auto-approve only high-confidence     |

### Deployment Confidence Score

| Feature              | Status     | Description                                 |
| -------------------- | ---------- | ------------------------------------------- |
| Risk Factor Analysis | 📋 Planned | Analyze test status, coverage, dependencies |
| Historical Context   | 📋 Planned | Recent deploys, incidents, failure patterns |
| Score Calculation    | 📋 Planned | Weighted confidence score (0-100%)          |
| Slack Report         | 📋 Planned | Pre-deploy confidence summary               |
| GitHub Check         | 📋 Planned | Block deploys below threshold               |

#### How It Works

Before deploying, KenchiOps calculates a confidence score based on multiple risk factors:

```
🚀 Deploy Confidence: 73% (Proceed with caution)

Risk Factors:
✅ All tests passing (+20)
✅ No P1 incidents in last 24h (+15)
✅ Code reviewed and approved (+10)
⚠️ 2 new dependencies added (-10)
⚠️ Last deploy to this env failed (-15)
⚠️ Test coverage decreased 72% → 68% (-10)
❌ No rollback tested recently (-7)

Recommendation: Deploy with monitoring enabled
```

#### Risk Factors Evaluated

| Factor              | Weight  | Description                     |
| ------------------- | ------- | ------------------------------- |
| Test Status         | +20/-30 | All passing vs failures         |
| Test Coverage Delta | +10/-15 | Coverage increased vs decreased |
| Recent Incidents    | +15/-25 | No P1s vs active incidents      |
| Deploy History      | +10/-15 | Recent success vs failure       |
| Dependency Changes  | +5/-10  | No changes vs new deps added    |
| Code Review         | +10/-20 | Approved vs pending/none        |
| Rollback Tested     | +5/-10  | Recently tested vs not          |
| Time of Day         | +5/-10  | Business hours vs off-hours     |

#### Integration Points

- **GitHub Actions**: Run as a check before deploy step
- **Slack**: Post report to deploy channel
- **API**: `GET /api/deploy/confidence?repo=X&branch=Y`
- **Threshold**: Configurable per-tenant (default: block below 50%)

### Self-Healing Actions

| Feature           | Status    | Description                                |
| ----------------- | --------- | ------------------------------------------ |
| Retry Flaky Tests | 💡 Future | Auto-retry known flaky tests               |
| Cache Clearing    | 💡 Future | Clear caches on memory errors              |
| Service Restart   | 💡 Future | Restart unhealthy services (with approval) |
| Rollback Trigger  | 💡 Future | Initiate rollback on error spike           |

### Testing & Hardening

| Feature            | Status         | Description                         |
| ------------------ | -------------- | ----------------------------------- |
| Unit Test Coverage | 🚧 In Progress | Target 80% coverage                 |
| Integration Tests  | 🚧 In Progress | End-to-end flow testing             |
| Load Testing       | 📋 Planned     | Verify performance under load       |
| Security Audit     | 📋 Planned     | Input sanitization, secret handling |
| Rate Limiting      | 📋 Planned     | Prevent abuse and control costs     |

---

## Phase 4: Pilot & Launch (Weeks 11-12) 📋

### Deployment

| Feature            | Status     | Description                   |
| ------------------ | ---------- | ----------------------------- |
| Docker Packaging   | 📋 Planned | Production-ready containers   |
| Environment Config | 📋 Planned | Easy deployment configuration |
| Health Checks      | 📋 Planned | Kubernetes-ready probes       |
| Monitoring Setup   | 📋 Planned | Prometheus metrics, alerting  |

### Documentation

| Feature               | Status     | Description                 |
| --------------------- | ---------- | --------------------------- |
| User Guide            | 📋 Planned | How to use KenchiOps        |
| Installation Guide    | 📋 Planned | Deployment instructions     |
| API Documentation     | 📋 Planned | REST API reference          |
| Troubleshooting Guide | 📋 Planned | Common issues and solutions |

---

## Post-MVP Enhancements 💡

### Intelligence Improvements

| Feature                       | Priority | Description                  |
| ----------------------------- | -------- | ---------------------------- |
| Test Failure Clustering       | High     | Group failures by root cause |
| Learning from Corrections     | High     | Improve from user feedback   |
| PR Impact Prediction          | Medium   | Risk scoring before merge    |
| Cross-Repository Intelligence | Medium   | Detect cross-repo impacts    |

#### Test Failure Clustering

Instead of reporting each test failure individually, cluster them by root cause:

```
❌ 47 tests failed (3 root causes detected)

Cluster 1: Database connection (38 tests)
└── Cause: DB migration failed in setup

Cluster 2: API timeout (7 tests)
└── Cause: Mock server not started

Cluster 3: Assertion error (2 tests)
└── Cause: Actual bugs - needs investigation
```

#### Learning from Corrections

Capture user feedback when AI suggestions are wrong:

- Track dismissed/corrected suggestions
- Build per-repository pattern database
- Improve prompts based on feedback
- Report accuracy metrics over time

#### PR Impact Prediction

Before merge, analyze:

- Risk score based on files changed
- Test coverage delta
- Historical bug rate in affected areas
- Suggested reviewers by code familiarity

### Proactive Features

| Feature              | Priority | Description                        |
| -------------------- | -------- | ---------------------------------- |
| On-Call Digest       | High     | Daily/weekly summary for on-call   |
| Trend Detection      | Medium   | Identify increasing error patterns |
| Capacity Forecasting | Low      | Predict resource needs             |

#### On-Call Digest

Automated summary for on-call engineers:

```
📊 On-Call Digest (Last 24h)
├── 3 incidents (2 P2, 1 P3)
├── 12 CI failures (8 flaky, 4 real)
├── Top issue: Redis timeouts (3 occurrences)
├── Trending: Memory usage up 15%
└── Action needed: 2 PRs awaiting review
```

### Automation Capabilities

| Feature            | Priority | Description                         |
| ------------------ | -------- | ----------------------------------- |
| Runbook Automation | High     | Execute runbook steps with approval |
| Custom Workflows   | Medium   | User-defined automation rules       |
| Scheduled Actions  | Medium   | Time-based automation triggers      |
| ChatOps Commands   | Medium   | Conversational Slack interface      |

#### Runbook Automation

Parse markdown runbooks and make them executable:

```markdown
## Redis Connection Issues

1. Check Redis pod status: `kubectl get pods -l app=redis`
2. If CrashLoopBackOff, restart: `kubectl rollout restart`
3. Verify connections: `redis-cli ping`
```

KenchiOps offers to execute each step with approval.

#### ChatOps Interface

Conversational interaction beyond notifications:

```
User: @kenchi why did the build fail yesterday at 3pm?
KenchiOps: The build at 3:14 PM failed due to a flaky test
in auth.test.ts. It passed on retry. This test has failed
7 times this month. Want me to create an issue?

User: yes, assign to @alice
KenchiOps: Created issue #234 and assigned to @alice.
```

### Security Features

| Feature             | Priority | Description                         |
| ------------------- | -------- | ----------------------------------- |
| Dependency Scanning | High     | Summarize CVEs from Dependabot/Snyk |
| Secret Detection    | High     | Alert on leaked credentials         |
| Security PR Review  | Medium   | OWASP-aware code review             |
| SBOM Generation     | Low      | Software bill of materials          |
| Compliance Reports  | Low      | SOC2/HIPAA audit trails             |

### Multi-LLM Support

| Feature          | Priority | Description                  |
| ---------------- | -------- | ---------------------------- |
| LLM Router       | High     | Route tasks to optimal model |
| Fallback Chains  | High     | Retry with different models  |
| Model Comparison | Medium   | A/B test model performance   |
| Custom Models    | Low      | Support fine-tuned models    |

See [MULTI_LLM_IMPLEMENTATION_PLAN.md](./MULTI_LLM_IMPLEMENTATION_PLAN.md) for details.

### Platform Expansion

| Feature           | Priority | Description                     |
| ----------------- | -------- | ------------------------------- |
| GitLab Support    | Medium   | GitLab CI/MR integration        |
| Bitbucket Support | Low      | Bitbucket Pipelines integration |
| Microsoft Teams   | Medium   | Teams bot alternative to Slack  |
| Discord           | Low      | Discord integration for OSS     |
| IDE Extension     | Medium   | VS Code extension               |
| Mobile App        | Low      | On-call mobile alerts           |
| Web Dashboard     | Medium   | Analytics and configuration UI  |

---

## Pricing Tier Features

See [PRICING_TIERS.md](./PRICING_TIERS.md) for detailed tier breakdown.

| Feature                 |  Free   | Starter | Team | Enterprise |
| ----------------------- | :-----: | :-----: | :--: | :--------: |
| CI Failure Analysis     |    ✓    |    ✓    |  ✓   |     ✓      |
| Basic Slack Alerts      |    ✓    |    ✓    |  ✓   |     ✓      |
| RAG-Enhanced Analysis   | Limited |    ✓    |  ✓   |     ✓      |
| IaC Review              |    -    |    ✓    |  ✓   |     ✓      |
| Incident Triage         |    -    |    ✓    |  ✓   |     ✓      |
| Config Drift Detection  |    -    |  Basic  |  ✓   |     ✓      |
| Deploy Confidence Score |    -    |  Basic  |  ✓   |     ✓      |
| Multi-Hop RAG           |    -    |    -    |  ✓   |     ✓      |
| Test Clustering         |    -    |    -    |  ✓   |     ✓      |
| On-Call Digest          |    -    |    -    |  ✓   |     ✓      |
| Self-Healing Actions    |    -    |    -    |  -   |     ✓      |
| Custom Workflows        |    -    |    -    |  -   |     ✓      |
| SSO/SAML                |    -    |    -    |  -   |     ✓      |

---

## Technical Debt & Improvements

| Item                   | Priority       | Description                       |
| ---------------------- | -------------- | --------------------------------- |
| Module Size Compliance | 🚧 In Progress | Keep all modules under 500 lines  |
| Test Coverage          | 🚧 In Progress | Achieve 80% coverage              |
| API Versioning         | 📋 Planned     | Version API endpoints             |
| Database Migrations    | 📋 Planned     | Formalize migration process       |
| Structured Logging     | 📋 Planned     | Consistent log format for parsing |
| Metrics Collection     | 📋 Planned     | Prometheus/StatsD metrics         |
| Error Tracking         | 📋 Planned     | Sentry integration                |

---

## Release Schedule

| Version | Target    | Focus                        |
| ------- | --------- | ---------------------------- |
| v0.1.0  | Week 4    | CI Failure Assistant MVP     |
| v0.2.0  | Week 6    | Incident Triage + RAG        |
| v0.3.0  | Week 8    | IaC Review + Polish          |
| v0.4.0  | Week 10   | Safety + Hardening           |
| v1.0.0  | Week 12   | Pilot Launch                 |
| v1.1.0  | +4 weeks  | Test Clustering, Corrections |
| v1.2.0  | +8 weeks  | ChatOps, On-Call Digest      |
| v2.0.0  | +12 weeks | Multi-LLM, Self-Healing      |

---

## Success Metrics

### MVP Success Criteria

- [ ] CI assistant correctly explains 80%+ of failures
- [ ] Incident summaries rated helpful by 75%+ of users
- [ ] IaC reviews catch 50%+ of issues before human review
- [ ] <5 second response time for Slack notifications
- [ ] Zero security incidents in pilot

### Post-MVP Goals

- [ ] 50% reduction in mean-time-to-resolution (MTTR)
- [ ] 30% reduction in on-call escalations
- [ ] 90% user satisfaction score
- [ ] <1% false positive rate on suggestions

---

## Contributing

To propose new features:

1. Create an issue with the `enhancement` label
2. Include user story, acceptance criteria, and priority suggestion
3. Discuss in weekly planning meeting

---

## Changelog

| Date    | Change                                                      |
| ------- | ----------------------------------------------------------- |
| 2024-01 | Initial roadmap created                                     |
| 2024-01 | Added post-MVP enhancements section                         |
| 2024-01 | Added pricing tier feature matrix                           |
| 2024-01 | Moved Deployment Confidence Score to Phase 3 (MVP)          |
| 2024-01 | Added comprehensive Incident Triage implementation doc      |
| 2024-01 | Added User Experience Flows doc (Slack/GitHub interactions) |
| 2024-01 | Added IaC PR Review implementation doc                      |
| 2025-01 | Added Configuration Drift Detection implementation doc      |
| 2025-01 | Aligned roadmap with full investor vision document          |

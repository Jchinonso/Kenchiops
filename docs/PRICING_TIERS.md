# Pricing Tiers

## Overview

Kenchi uses a tiered pricing model that balances accessibility with sustainable costs. Each tier provides progressively more capabilities, higher limits, and better AI model access.

---

## Tier Summary

| Feature                  | Free   | Starter  | Team      | Enterprise |
| ------------------------ | ------ | -------- | --------- | ---------- |
| **Price**                | $0     | $29/mo   | $99/mo    | Custom     |
| **CI Failures Analyzed** | 50/mo  | 500/mo   | 2,500/mo  | Custom     |
| **RAG Queries**          | 100/mo | 2,000/mo | 10,000/mo | Custom     |
| **Repositories**         | 1      | 5        | 25        | Unlimited  |
| **Team Members**         | 1      | 5        | 25        | Unlimited  |
| **Data Retention**       | 7 days | 30 days  | 90 days   | Custom     |

---

## Tier Details

### Free Tier

**Target**: Individual developers, small OSS projects, evaluation

**Limits**:

- 50 CI failure analyses per month
- 100 RAG queries per month
- 1 repository
- 7-day data retention

**AI Capabilities**:

- Embedding tier: LIGHT only (1536 dimensions)
- LLM model: Fast/cheap models only (e.g., gpt-4o-mini)
- Basic failure analysis
- Simple fix suggestions

**Features**:

- GitHub App integration
- Slack notifications
- Basic CI failure analysis
- Community support (GitHub issues)

**Not Included**:

- Multi-hop RAG
- Historical pattern matching
- Advanced root cause analysis
- Priority support

---

### Starter Tier ($29/month)

**Target**: Small teams, early-stage startups

**Limits**:

- 500 CI failure analyses per month
- 2,000 RAG queries per month
- 5 repositories
- 5 team members
- 30-day data retention

**AI Capabilities**:

- Embedding tier: STANDARD (3072 dimensions)
- LLM models: Standard tier (gpt-4o-mini, gpt-4o)
- Enhanced failure analysis
- Root cause suggestions
- Fix recommendations with code snippets

**Features**:

- Everything in Free
- Historical failure patterns (30 days)
- Email support
- Usage analytics dashboard
- Deploy Confidence Score (basic - 4 risk factors)

**Not Included**:

- Multi-hop RAG
- Premium LLM models
- Custom integrations
- Full Deploy Confidence (all risk factors)

---

### Team Tier ($99/month)

**Target**: Growing teams, mid-size companies

**Limits**:

- 2,500 CI failure analyses per month
- 10,000 RAG queries per month
- 25 repositories
- 25 team members
- 90-day data retention

**AI Capabilities**:

- Embedding tier: STANDARD + PREMIUM access
- LLM models: All available models
- Multi-hop RAG for complex queries
- Advanced root cause analysis
- Cross-repository pattern detection

**Features**:

- Everything in Starter
- Multi-hop RAG (graph-based retrieval)
- Priority email support
- Custom Slack channel routing
- Drift detection alerts
- API access
- Full Deploy Confidence Score (all 8 risk factors)
- Deploy blocking threshold configuration

**Not Included**:

- Self-hosted deployment
- SSO/SAML
- Custom SLAs

---

### Enterprise (Custom Pricing)

**Target**: Large organizations with specific requirements

**Limits**:

- Custom analysis limits
- Custom RAG query limits
- Unlimited repositories
- Unlimited team members
- Custom data retention

**AI Capabilities**:

- All embedding tiers
- All LLM models
- Custom model integration
- Fine-tuned models (planned)

**Features**:

- Everything in Team
- Self-hosted deployment option
- SSO/SAML authentication
- Custom SLA (up to 99.9%)
- Dedicated support
- Custom integrations
- Audit logs
- Compliance certifications (planned)

---

## Feature Availability Matrix

### Current Features

| Feature                   |  Free   | Starter |  Team   | Enterprise |
| ------------------------- | :-----: | :-----: | :-----: | :--------: |
| GitHub App Integration    |    ✓    |    ✓    |    ✓    |     ✓      |
| Slack Notifications       |    ✓    |    ✓    |    ✓    |     ✓      |
| Basic CI Failure Analysis |    ✓    |    ✓    |    ✓    |     ✓      |
| Fix Suggestions           |    ✓    |    ✓    |    ✓    |     ✓      |
| PR Comments               |    ✓    |    ✓    |    ✓    |     ✓      |
| RAG-Enhanced Analysis     | Limited |    ✓    |    ✓    |     ✓      |
| Historical Patterns       |    -    | 30 days | 90 days |   Custom   |
| Multi-hop RAG             |    -    |    -    |    ✓    |     ✓      |
| RAG Drift Detection       |    -    |    -    |    ✓    |     ✓      |
| API Access                |    -    |    -    |    ✓    |     ✓      |

### Planned Features

| Feature                 | Free | Starter | Team | Enterprise | Status      |
| ----------------------- | :--: | :-----: | :--: | :--------: | ----------- |
| Deploy Confidence Score |  -   |  Basic  | Full |    Full    | Planned     |
| IaC PR Review           |  -   |    ✓    |  ✓   |     ✓      | Planned     |
| Incident Triage         |  -   |    ✓    |  ✓   |     ✓      | Planned     |
| Config Drift Detection  |  -   |  Basic  | Full |    Full    | Planned     |
| Custom Webhooks         |  -   |    -    |  ✓   |     ✓      | Planned     |
| Scheduled Reports       |  -   |    ✓    |  ✓   |     ✓      | Planned     |
| Custom Alert Rules      |  -   |    -    |  ✓   |     ✓      | Planned     |
| Multi-LLM Orchestration |  -   |    -    |  ✓   |     ✓      | In Progress |
| Fine-tuned Models       |  -   |    -    |  -   |     ✓      | Planned     |
| Self-hosted Option      |  -   |    -    |  -   |     ✓      | Planned     |
| SSO/SAML                |  -   |    -    |  -   |     ✓      | Planned     |
| Compliance Certs        |  -   |    -    |  -   |     ✓      | Planned     |
| Custom Integrations     |  -   |    -    |  -   |     ✓      | Planned     |

---

## AI Model Access by Tier

### Embedding Models

| Tier     | Model                  | Dimensions | Cost/1k tokens | Access   |
| -------- | ---------------------- | ---------- | -------------- | -------- |
| LIGHT    | text-embedding-3-small | 1536       | $0.02          | Free+    |
| STANDARD | text-embedding-3-large | 3072       | $0.13          | Starter+ |
| PREMIUM  | text-embedding-3-large | 3072       | $0.13          | Team+    |

### LLM Models (Planned)

| Model             | Use Case                          | Access     |
| ----------------- | --------------------------------- | ---------- |
| gpt-4o-mini       | Fast analysis, simple tasks       | Free+      |
| gpt-4o            | Complex analysis, code generation | Starter+   |
| claude-3-5-sonnet | Code-heavy tasks                  | Team+      |
| claude-3-opus     | Most complex reasoning            | Enterprise |

---

## Usage-Based Pricing (Future)

For high-volume users who exceed tier limits:

| Resource                | Overage Rate   |
| ----------------------- | -------------- |
| Additional CI analyses  | $0.10/analysis |
| Additional RAG queries  | $0.01/query    |
| Additional storage (GB) | $0.50/GB/month |

---

## Implementation Notes

### Database Schema

Tier configuration is stored per-tenant:

```sql
-- In tenants table
rag_monthly_budget_usd DECIMAL(10,2),
rag_preferred_tier VARCHAR(20),
rag_allow_premium BOOLEAN,
rag_degrade_on_budget_warning BOOLEAN
```

### Tier Enforcement

Limits are enforced via:

1. `costControls.ts` - Embedding tier selection and budget tracking
2. `costTrackingRepository.ts` - Usage recording and budget status
3. `tenantRagConfig.ts` - Per-tenant configuration

### Tier Degradation

When approaching limits:

- **Warning (80%)**: Log warnings, consider tier degradation
- **Critical (95%)**: Degrade to lower tier automatically
- **Exceeded (100%)**: Block operations or use LIGHT tier only

---

## Changelog

| Date    | Change                                                           |
| ------- | ---------------------------------------------------------------- |
| 2024-01 | Initial tier structure defined                                   |
| 2024-01 | Added Deploy Confidence Score to Starter (basic) and Team (full) |

---

## Open Questions

- [ ] Should we offer annual billing discounts?
- [ ] What's the right free tier limit to balance adoption vs. abuse?
- [ ] Should overage be automatic or require approval?
- [ ] How to handle OSS project discounts?

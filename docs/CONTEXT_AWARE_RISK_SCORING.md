# Context-Aware Risk Scoring System

## Overview

The Context-Aware Risk Scoring system enhances Kenchi's safety infrastructure by providing dynamic risk assessment that considers execution context, custom tenant rules, and integration with the restrictions system. This document provides a comprehensive guide to the architecture, usage, and configuration of the system.

## Table of Contents

1. [Architecture](#architecture)
2. [Core Concepts](#core-concepts)
3. [Technical Contracts](#technical-contracts)
4. [Database Schema](#database-schema)
5. [API Reference](#api-reference)
6. [Configuration](#configuration)
7. [Integration Guide](#integration-guide)
8. [Security Considerations](#security-considerations)
9. [Monitoring and Audit Trail](#monitoring-and-audit-trail)
10. [Best Practices](#best-practices)
11. [Related: Confidence Scoring](#related-confidence-scoring)

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────────────┐
│                         API Service                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │
│  │  Risk Rules     │  │  Risk           │  │  Combined       │     │
│  │  Routes         │  │  Assessments    │  │  Safety Check   │     │
│  │  (CRUD API)     │  │  Query          │  │  Endpoint       │     │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘     │
└───────────┼─────────────────────┼─────────────────────┼─────────────┘
            │                     │                     │
            ▼                     ▼                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Shared Package (@kenchi/shared)                │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Safety Module                             │   │
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐   │   │
│  │  │ Risk Scoring  │  │ Restrictions  │  │ Audit Trail   │   │   │
│  │  │ (contextual)  │  │               │  │               │   │   │
│  │  └───────┬───────┘  └───────┬───────┘  └───────┬───────┘   │   │
│  │          │                  │                  │           │   │
│  │          └──────────────────┼──────────────────┘           │   │
│  │                             │                               │   │
│  │  ┌──────────────────────────▼──────────────────────────┐   │   │
│  │  │           Combined Safety Check                      │   │   │
│  │  │  performCombinedSafetyCheck(action, context)        │   │   │
│  │  └─────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                   Database Module                            │   │
│  │  ┌───────────────┐  ┌───────────────┐                       │   │
│  │  │ custom_risk_  │  │ risk_         │                       │   │
│  │  │ rules         │  │ assessments   │                       │   │
│  │  └───────────────┘  └───────────────┘                       │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
            │                                      │
            ▼                                      ▼
┌─────────────────────┐                ┌─────────────────────┐
│    PostgreSQL       │                │   Redis (optional)  │
│    Database         │                │   (in-memory store) │
└─────────────────────┘                └─────────────────────┘
```

### Data Flow

1. **Action Proposed** → Handler receives action proposal
2. **Context Resolution** → System resolves execution context (environment, incident mode, off-hours)
3. **Rule Lookup** → Queries custom tenant rules and base hardcoded rules
4. **Score Calculation** → Computes base score + context adjustments
5. **Restriction Check** → Validates against time-based restrictions
6. **Decision** → Returns allow/block decision with approval requirements
7. **Audit Recording** → Records assessment in audit trail (non-blocking)

---

## Core Concepts

### Risk Factors

Every action is assessed on three fundamental risk dimensions:

| Factor            | Description                         | Values                                                  |
| ----------------- | ----------------------------------- | ------------------------------------------------------- |
| **Blast Radius**  | How many systems are affected       | `single_service`, `multiple_services`, `infrastructure` |
| **Reversibility** | How easily the action can be undone | `instant`, `minutes`, `manual_only`, `irreversible`     |
| **Data Impact**   | Effect on data integrity            | `none`, `read_only`, `write`, `destructive`             |

### Context Multipliers

Context-aware scoring applies multipliers based on execution conditions:

| Context           | Default Multiplier | Description                               |
| ----------------- | ------------------ | ----------------------------------------- |
| **Production**    | 1.3x               | Actions in production environment         |
| **Incident Mode** | 1.5x               | During active incident response           |
| **Off-Hours**     | 1.2x               | Weekends or night hours (22:00-06:00 UTC) |

### Risk Levels

Final scores map to risk levels:

| Level        | Score Range | Typical Action        |
| ------------ | ----------- | --------------------- |
| **Low**      | 0.00 - 0.29 | Auto-approve          |
| **Moderate** | 0.30 - 0.49 | Standard approval     |
| **High**     | 0.50 - 0.69 | Senior approval       |
| **Critical** | 0.70 - 1.00 | Manual review / Block |

**Boundary rule:** Thresholds are evaluated with `>=` on the lower bound.

- Score `0.70` → **Critical** (0.70 >= 0.70)
- Score `0.69` → **High** (0.69 < 0.70, but >= 0.50)

---

## Technical Contracts

### Scoring Math Contract

The risk scoring follows a deterministic, auditable formula:

```
1. compositeScore = Σ(factor_score × factor_weight)
   - blast_radius_score × 0.40
   - reversibility_score × 0.35
   - data_impact_score × 0.25

2. preContextScore = clamp(compositeScore + scoreModifier, 0, 1)
   - scoreModifier comes from matched custom rules (SUM of all)

3. contextMultiplier = clamp(Π(applicable_multipliers), CONTEXT_MULTIPLIER_BOUNDS.MIN, CONTEXT_MULTIPLIER_BOUNDS.MAX)
   - production × incident_mode × off_hours, then clamped to [1.0, 3.0]
   - e.g., 1.3 × 1.5 × 1.2 = 2.34x (within bounds)
   - Guard rail prevents saturation from extreme combinations

4. finalScore = clamp(preContextScore × contextMultiplier, 0, 1)

5. contextAdjustment = finalScore - preContextScore
   - This is the NET EFFECT stored in audit, not raw multipliers
```

**Key Invariants:**

- Scores are ALWAYS in [0, 1] range
- `contextAdjustment` represents the net effect of context, never raw multipliers
- Multipliers compound multiplicatively
- `scorePercent` (0-100) is provided for human readability

**Field naming:** `baseScore` (stored as `base_score` in DB) is the same as `preContextScore` in the formula — the score after modifiers but before context multipliers. Not to be confused with the raw composite score before modifiers.

**Numeric Precision:**

- All intermediate math uses IEEE-754 double precision
- `finalScore` is stored with 4 decimal places (DECIMAL(5,4))
- Risk level is computed from the **unrounded** `finalScore`
- This avoids "0.69995 became 0.7000 and got blocked" edge cases

### Rule Resolution Model

When multiple custom rules match an action:

| Field Type                                   | Resolution Strategy                       |
| -------------------------------------------- | ----------------------------------------- |
| `scoreModifier`                              | **SUM** across all matched rules          |
| `blastRadius`, `reversibility`, `dataImpact` | **Highest-priority rule wins**            |
| `requireApprovalThreshold`, `blockThreshold` | **Highest-priority rule wins**            |
| Multipliers (`productionMultiplier`, etc.)   | **Highest value wins** (most restrictive) |

**Example:**

- Rule A (priority 10): `scoreModifier: +0.1`, `blockThreshold: 0.8`
- Rule B (priority 50): `scoreModifier: +0.15`, `blockThreshold: 0.6`
- Both match
- Result: `scoreModifier = +0.25` (summed), `blockThreshold = 0.8` (priority 10 wins)

### Threshold Precedence

The system implements **Model B**: Rules may impose hard gates.

**Evaluation Order:**

1. Final score is calculated (deterministic math)
2. Risk level is determined (for observability/reporting)
3. Rule-defined thresholds are evaluated
4. Rule thresholds may force approval/block **regardless of risk level**

```typescript
// A rule with blockThreshold: 0.5 will block actions at 50%
// even though risk level "moderate" normally allows them
if (finalScore >= customRule.blockThreshold) {
  decision = "block"; // Rule threshold overrides risk level semantics
}
```

**Implication:** Tenants can define rules that are MORE restrictive than global defaults, but rule thresholds cannot make the system LESS restrictive than platform baselines.

**Platform Baseline Enforcement:**

Platform thresholds are CEILINGS on leniency, not floors on strictness.
Tenants can only move thresholds DOWN (more strict), never UP (more lenient).

```typescript
// Default to platform max when rule doesn't specify (not 1.0, which would mean "never block")
// Rule wants 0.95 block threshold, but platform max is 0.9 → effective is 0.9
effectiveBlockThreshold = min(
  rule.blockThreshold ?? PLATFORM_MAX_BLOCK_THRESHOLD,
  PLATFORM_MAX_BLOCK_THRESHOLD
);
effectiveApprovalThreshold = min(
  rule.requireApprovalThreshold ?? PLATFORM_MAX_APPROVAL_THRESHOLD,
  PLATFORM_MAX_APPROVAL_THRESHOLD
);
```

Platform constants (defined in `constants/safety.ts`):

- `PLATFORM_MAX_BLOCK_THRESHOLD = 0.9` — maximum leniency for blocking
- `PLATFORM_MAX_APPROVAL_THRESHOLD = 0.5` — maximum leniency for approval

### Decision Precedence

When multiple systems contribute to a decision, precedence is evaluated top-to-bottom (highest wins):

| Priority | Source                            | Decision           | Notes                                                                 |
| -------- | --------------------------------- | ------------------ | --------------------------------------------------------------------- |
| 1        | **Restrictions block**            | `block`            | Time-based, incident mode, manual blocks (unless authorized override) |
| 2        | **Rule blockThreshold**           | `block`            | `finalScore >= effectiveBlockThreshold`                               |
| 3        | **Rule requireApprovalThreshold** | `require_approval` | `finalScore >= effectiveApprovalThreshold`                            |
| 4        | **Global risk level mapping**     | varies             | Platform defaults based on risk level                                 |
| 5        | **Default**                       | `allow`            | No restrictions or thresholds triggered                               |

**Implementation:**

```typescript
function determineDecision(
  restrictionCheck: RestrictionCheckResult,
  finalScore: number,
  effectiveBlockThreshold: number,
  effectiveApprovalThreshold: number
): Decision {
  // 1. Restrictions take absolute precedence
  if (!restrictionCheck.isAllowed) return "block";

  // 2. Rule block threshold
  if (finalScore >= effectiveBlockThreshold) return "block";

  // 3. Rule approval threshold
  if (finalScore >= effectiveApprovalThreshold) return "require_approval";

  // 4. Global risk level mapping (platform defaults)
  // ... risk level based logic

  // 5. Default allow
  return "allow";
}
```

### Context Trust Boundaries

**Security Model:**

Context fields are classified by trust level:

| Field              | Trust Level | Resolution                                  |
| ------------------ | ----------- | ------------------------------------------- |
| `environment`      | **TRUSTED** | Caller knows their target                   |
| `tenantId`         | **TRUSTED** | Validated against authenticated principal   |
| `incidentModeHint` | **HINT**    | System verifies via `isInIncidentMode()`    |
| `offHoursHint`     | **HINT**    | System verifies via `isCurrentlyOffHours()` |

**Field Naming Convention:**

Input fields use `*Hint` suffix to signal they are not authoritative:

```typescript
// Input context (caller-provided hints)
interface RiskAssessmentContext {
  environment?: RiskEnvironment; // TRUSTED
  tenantId?: string; // TRUSTED (validated against auth)
  incidentModeHint?: boolean; // HINT - system will verify
  offHoursHint?: boolean; // HINT - system will verify
}

// Resolved context (authoritative)
interface ResolvedRiskContext {
  environment: RiskEnvironment;
  tenantId: string;
  incidentModeActive: boolean; // MAX(hint, detected)
  isOffHours: boolean; // MAX(hint, detected)
}
```

**Security Rule:** For hints, system uses `MAX(caller_hint, system_detected)`:

```typescript
// Callers can ELEVATE risk but never REDUCE it
incidentModeActive = (incidentModeHint ?? false) || isInIncidentMode();
isOffHours = (offHoursHint ?? false) || isCurrentlyOffHours();
```

**Why this matters:**

- Malicious caller claims `incidentModeHint: false` → System overrides with `true`
- Buggy caller omits hint → System detects and applies
- Legitimate caller provides `true` during known incident → Respected

**tenantId Validation:**

The `tenantId` field is validated against the authenticated principal:

- API routes extract `tenantId` from the authentication token/session
- If caller-provided `tenantId` mismatches authenticated principal → request rejected
- This prevents cross-tenant data access via parameter manipulation

### Audit Durability Boundary

**Fire-and-Forget Model:**

The system prioritizes evaluation latency over synchronous audit writes:

```
┌─────────────────┐    ┌─────────────────┐
│  Evaluation     │───▶│  Return Result  │  (< 100ms)
│  (synchronous)  │    │  to Caller      │
└────────┬────────┘    └─────────────────┘
         │
         │ async (non-blocking)
         ▼
┌─────────────────┐
│  Audit Write    │
│  (fire-forget)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  PostgreSQL     │
│  risk_assess... │
└─────────────────┘
```

**Durability Contract:**

- Assessment is considered "recorded" when `recordAssessmentAsync()` is called
- Actual persistence is async and may fail
- Failures are **LOGGED** (not silent) for monitoring
- Persistent audit failures should trigger P1 alerts

**Production Hardening Options:**

- Lightweight outbox table for guaranteed delivery
- Redis-backed retry queue
- In-process buffer with backpressure

---

## Database Schema

### custom_risk_rules Table

Stores tenant-configurable risk rules that override default behavior.

| Column                       | Type         | Description                                |
| ---------------------------- | ------------ | ------------------------------------------ |
| `id`                         | UUID         | Primary key                                |
| `tenant_id`                  | VARCHAR(255) | Tenant isolation                           |
| `name`                       | VARCHAR(255) | Rule name                                  |
| `description`                | TEXT         | Optional description                       |
| `action_types`               | TEXT[]       | Array of action types this rule matches    |
| `environment`                | VARCHAR(50)  | Target environment (NULL = all)            |
| `blast_radius`               | VARCHAR(50)  | Override blast radius                      |
| `reversibility`              | VARCHAR(50)  | Override reversibility                     |
| `data_impact`                | VARCHAR(50)  | Override data impact                       |
| `score_modifier`             | DECIMAL(3,2) | Add/subtract from base score (-1.0 to 1.0) |
| `production_multiplier`      | DECIMAL(3,2) | Custom production multiplier               |
| `incident_mode_multiplier`   | DECIMAL(3,2) | Custom incident mode multiplier            |
| `off_hours_multiplier`       | DECIMAL(3,2) | Custom off-hours multiplier                |
| `require_approval_threshold` | DECIMAL(3,2) | Score threshold for approval               |
| `block_threshold`            | DECIMAL(3,2) | Score threshold for blocking               |
| `enabled`                    | BOOLEAN      | Whether rule is active                     |
| `priority`                   | INTEGER      | Lower = higher priority                    |
| `created_by`                 | VARCHAR(255) | User who created the rule                  |
| `created_at`                 | TIMESTAMPTZ  | Creation timestamp                         |
| `updated_at`                 | TIMESTAMPTZ  | Last update timestamp                      |

### risk_assessments Table

Audit trail of all risk assessments performed.

| Column                   | Type         | Description                                                                               |
| ------------------------ | ------------ | ----------------------------------------------------------------------------------------- |
| `id`                     | UUID         | Primary key                                                                               |
| `tenant_id`              | VARCHAR(255) | Tenant isolation                                                                          |
| `action_proposal_id`     | VARCHAR(255) | Linked action proposal                                                                    |
| `action_type`            | VARCHAR(100) | Type of action assessed                                                                   |
| `blast_radius`           | VARCHAR(50)  | Assessed blast radius                                                                     |
| `reversibility`          | VARCHAR(50)  | Assessed reversibility                                                                    |
| `data_impact`            | VARCHAR(50)  | Assessed data impact                                                                      |
| `base_score`             | DECIMAL(5,4) | Score after composite + scoreModifier, before context multipliers (aka `preContextScore`) |
| `context_adjustment`     | DECIMAL(5,4) | Context-based adjustment (net effect)                                                     |
| `final_score`            | DECIMAL(5,4) | Final computed score                                                                      |
| `risk_level`             | VARCHAR(20)  | Categorized level                                                                         |
| `environment`            | VARCHAR(50)  | Execution environment                                                                     |
| `incident_mode_active`   | BOOLEAN      | Was incident mode active                                                                  |
| `is_off_hours`           | BOOLEAN      | Was it off-hours                                                                          |
| `matched_rule_id`        | UUID         | Primary custom rule (deprecated, use matched_rule_ids)                                    |
| `matched_rule_ids`       | UUID[]       | All matched rule IDs, ordered by priority asc                                             |
| `matched_rule_summaries` | JSONB        | Rule details: `[{id, name, priority, modifier, overrides}]`                               |
| `matched_rule_category`  | VARCHAR(50)  | Category of the **primary** rule (index 0)                                                |
| `context_factors`        | JSONB        | Context breakdown: `{production, incidentMode, offHours, multiplier}`                     |
| `summary`                | TEXT         | Human-readable summary                                                                    |
| `request_id`             | VARCHAR(255) | Correlation ID                                                                            |
| `scoring_version`        | VARCHAR(20)  | Scoring algorithm version (e.g., "risk_v1")                                               |
| `assessed_at`            | TIMESTAMPTZ  | Assessment timestamp                                                                      |

**Note on multi-rule support:** When multiple rules match:

- `matched_rule_id` stores the primary (highest priority) rule for backward compatibility
- `matched_rule_ids` stores all matched rules in priority order (index 0 = primary)
- `matched_rule_summaries` provides full audit trail of each rule's contribution

**Primary rule definition:** The primary rule is the one with the lowest `priority` value.
Ties are broken by `created_at` ascending (oldest wins), then by `id` ascending (deterministic).

---

## API Reference

**Authentication & tenantId:**

- When auth token/session provides `tenantId`, the query param is **ignored**
- When auth token is absent (internal tools), query param `tenantId` is used
- Mismatches between param and auth token are rejected with 403
- This prevents cross-tenant access via parameter manipulation

### Risk Rules Endpoints

#### List Rules

```
GET /api/risk-rules?tenantId=<tenant_id>
```

Query Parameters:

- `tenantId` (required*): Tenant ID (*ignored when derived from auth token; required for internal tools)
- `actionType` (optional): Filter by action type
- `environment` (optional): Filter by environment
- `enabledOnly` (optional): Only return enabled rules (default: true)
- `limit` (optional): Max results (default: 100, max: 1000)
- `offset` (optional): Pagination offset

Response:

```json
{
  "rules": [...],
  "count": 5,
  "tenantId": "acme-corp"
}
```

#### Get Rule

```
GET /api/risk-rules/:ruleId?tenantId=<tenant_id>
```

#### Create Rule

```
POST /api/risk-rules
```

Request Body:

```json
{
  "tenantId": "acme-corp",
  "name": "High-risk deployments",
  "description": "Extra scrutiny for production deployments",
  "actionTypes": ["deploy", "release"],
  "environment": "production",
  "scoreModifier": 0.2,
  "productionMultiplier": 1.5,
  "requireApprovalThreshold": 0.4,
  "enabled": true,
  "priority": 50
}
```

#### Update Rule

```
PATCH /api/risk-rules/:ruleId
```

Request Body: Any subset of create fields (except `tenantId`)

#### Delete Rule

```
DELETE /api/risk-rules/:ruleId?tenantId=<tenant_id>
```

### Risk Assessments Endpoint

#### Query Assessments

```
GET /api/risk-assessments?tenantId=<tenant_id>
```

Query Parameters:

- `tenantId` (required): Tenant ID
- `actionProposalId` (optional): Filter by action proposal
- `actionType` (optional): Filter by action type
- `fromDate` (optional): Start of time range (ISO 8601)
- `toDate` (optional): End of time range (ISO 8601)
- `limit` (optional): Max results (default: 100)
- `offset` (optional): Pagination offset

---

## Configuration

### Environment Variables

No additional environment variables are required. The system uses existing database and logging configuration.

### Context Multipliers

Default multipliers are defined in `packages/shared/src/constants/safety.ts`:

```typescript
export const CONTEXT_MULTIPLIERS = {
  PRODUCTION: 1.3,
  INCIDENT_MODE: 1.5,
  OFF_HOURS: 1.2,
} as const;

export const OFF_HOURS_CONFIG = {
  NIGHT_START_HOUR: 22, // UTC
  NIGHT_END_HOUR: 6, // UTC
  WEEKEND_DAYS: [0, 6], // Sunday, Saturday
} as const;

export const CONTEXT_MULTIPLIER_BOUNDS = {
  MIN: 1.0, // No context should reduce risk
  MAX: 3.0, // Guard rail prevents saturation
} as const;
```

### Store Configuration

The system supports pluggable stores:

**In-Memory Store (Default)**

- Used for development and testing
- Automatically configured
- No persistence

**Database Store (Production)**

- Requires PostgreSQL migration
- Set via `setRiskRulesStore()` at service initialization

---

## Integration Guide

### Basic Usage

```typescript
import {
  assessActionRiskWithContext,
  performCombinedSafetyCheck,
  type RiskAssessmentContext,
} from "@kenchi/shared";

// Simple assessment
const assessment = await assessActionRiskWithContext(actionProposal, {
  environment: "production",
  tenantId: "acme-corp",
  requestId: "req_123",
});

console.log(assessment.score); // 0.65 (internal: 0-1)
console.log(assessment.scorePercent); // 65   (human-readable: 0-100)
console.log(assessment.riskLevel); // "high"
console.log(assessment.contextMultiplier); // 1.3 (production multiplier applied)
console.log(assessment.baseScore); // 0.50 (before context)
console.log(assessment.contextAdjustment); // 0.15 (net effect of context)
console.log(assessment.approvalRequirements.requiresApproval); // true
```

### Combined Safety Check

```typescript
// Full safety check with restrictions
const result = await performCombinedSafetyCheck(actionProposal, {
  environment: "production",
  tenantId: "acme-corp",
  incidentModeHint: true, // Hint only; system verifies against incident service
});

if (!result.isAllowed) {
  console.log("Action blocked:", result.blockedReason);
  return;
}

if (result.requiresAdditionalApproval) {
  // Require senior approval during incident mode
  await requestSeniorApproval(actionProposal);
}
```

### Store Initialization (Production)

```typescript
import {
  setRiskRulesStore,
  createCustomRiskRule,
  getCustomRiskRules,
  // ... other repository functions
} from "@kenchi/shared";

// Create database-backed store
const databaseStore: RiskRulesStore = {
  async getCustomRules(options) {
    return getCustomRiskRules(options);
  },
  async getRuleById(ruleId, tenantId) {
    return getCustomRiskRuleById(ruleId, tenantId);
  },
  async addRule(input) {
    return createCustomRiskRule(input);
  },
  // ... other methods
};

// Set at service initialization
setRiskRulesStore(databaseStore);
```

---

## Security Considerations

### Tenant Isolation

- All queries require `tenantId` parameter
- Database queries enforce tenant matching
- Cross-tenant access is prevented at the repository level

### Context Trust Boundaries

**Critical Security Feature:** The system prevents callers from lowering risk:

```typescript
// Caller CANNOT claim "no incident" to bypass elevated risk
// System uses: MAX(caller_hint, system_detected)

// Example: Caller passes incidentModeActive: false
// System detects active incident → resolved incidentModeActive: true (system wins)

// Example: Caller passes incidentModeHint: true
// System detects no incident → resolved incidentModeActive: true (caller hint respected)
```

**Rationale:** Callers can elevate risk context (conservative) but never reduce it (dangerous).

### Input Validation

- All inputs validated before processing
- Score modifiers bounded: -1.0 to 1.0
- Multipliers bounded: 0 to 3.0
- Thresholds bounded: 0 to 1.0
- SQL injection prevented via parameterized queries

### Audit Trail

- All assessments recorded to `risk_assessments` table
- Immutable records for compliance
- Request correlation via `requestId`
- Fire-and-forget recording with **logged failures** (not silent)
- `contextAdjustment` stores NET EFFECT, not raw multipliers

### Threshold Security

- Rule thresholds can only make system MORE restrictive
- Platform baselines cannot be bypassed by custom rules
- Block threshold defaults to 0.9 (90%) if not specified

### Rate Limiting

- API routes should use standard rate limiting
- Consider per-tenant limits for rule creation

---

## Monitoring and Audit Trail

### Key Metrics to Monitor

1. **Assessment Volume**: Assessments per minute/hour
2. **Risk Distribution**: Distribution across risk levels
3. **Block Rate**: Percentage of blocked actions
4. **Custom Rule Usage**: Which custom rules are being triggered
5. **Context Impact**: How often context multipliers elevate risk

### Audit Queries

**High-risk assessments in last 24 hours:**

```sql
SELECT * FROM risk_assessments
WHERE tenant_id = 'acme-corp'
  AND final_score >= 0.7
  AND assessed_at >= NOW() - INTERVAL '24 hours'
ORDER BY assessed_at DESC;
```

**Actions blocked by custom rules (primary rule only):**

```sql
-- Uses matched_rule_ids[1] (primary rule, PostgreSQL 1-indexed)
SELECT r.name, COUNT(*) as block_count
FROM risk_assessments a
JOIN custom_risk_rules r ON r.id = a.matched_rule_ids[1]
WHERE a.final_score >= r.block_threshold
  AND a.assessed_at >= NOW() - INTERVAL '7 days'
GROUP BY r.name
ORDER BY block_count DESC;
```

**Actions blocked with any matched rule attribution:**

```sql
-- Counts each rule that was part of any blocking assessment
-- Useful for understanding cumulative rule impact
SELECT r.name, COUNT(*) as contribution_count
FROM risk_assessments a
CROSS JOIN LATERAL unnest(a.matched_rule_ids) AS rule_id
JOIN custom_risk_rules r ON r.id = rule_id
WHERE a.final_score >= 0.9  -- or use r.block_threshold for rule-specific
  AND a.assessed_at >= NOW() - INTERVAL '7 days'
GROUP BY r.name
ORDER BY contribution_count DESC;
```

**Incident mode impact:**

```sql
SELECT
  incident_mode_active,
  AVG(final_score) as avg_score,
  COUNT(*) as count
FROM risk_assessments
WHERE tenant_id = 'acme-corp'
  AND assessed_at >= NOW() - INTERVAL '30 days'
GROUP BY incident_mode_active;
```

---

## Best Practices

### Rule Design

1. **Start conservative**: Begin with higher thresholds, adjust based on data
2. **Use priorities**: Lower priority numbers = higher precedence
3. **Test in staging**: Validate rules in non-production first
4. **Document rules**: Use description field to explain rationale
5. **Regular review**: Audit rule effectiveness quarterly

### Context Handling

1. **Always pass context**: Even partial context improves accuracy
2. **Use request IDs**: Enable end-to-end correlation
3. **Set tenant ID**: Required for custom rule lookup
4. **Consider environment**: Production should always have higher scrutiny

### Performance

1. **Cache rule lookups**: Rules change infrequently
2. **Batch assessments**: When processing multiple actions
3. **Async audit recording**: Don't block on audit writes
4. **Index appropriately**: Ensure database indexes are maintained

### Migration

1. **Run migration first**: Database schema must exist before using database store
2. **Test with in-memory**: Validate logic before production deployment
3. **Gradual rollout**: Enable for specific tenants first
4. **Monitor closely**: Watch for unexpected blocks during rollout

---

## Appendix: Type Reference

### RiskAssessmentContext

```typescript
interface RiskAssessmentContext {
  environment?: "production" | "staging" | "development";
  incidentModeHint?: boolean; // HINT: system verifies, uses MAX(hint, detected)
  offHoursHint?: boolean; // HINT: system verifies, uses MAX(hint, detected)
  tenantId?: string; // TRUSTED: validated against auth principal
  requestId?: string;
  actionProposalId?: string;
}
```

### ContextualActionRiskAssessment

```typescript
interface ContextualActionRiskAssessment {
  blastRadius: BlastRadius;
  reversibility: Reversibility;
  dataImpact: DataImpact;
  score: number; // Internal: 0-1 range
  scorePercent: number; // Human-readable: 0-100 range
  riskLevel: RiskLevel;
  summary: string;
  matchedRule: RiskRuleCategory;
  baseScore: number; // Score before context adjustments
  contextAdjustment: number; // Net effect (finalScore - baseScore)
  contextMultiplier: number; // Combined multiplier applied
  context: ResolvedRiskContext;
  contextFactors: {
    // Breakdown for forensics
    production: boolean;
    incidentMode: boolean;
    offHours: boolean;
    multiplier: number;
  };
  appliedCustomRule?: { id: string; name: string }; // Deprecated
  appliedCustomRules: AppliedRuleSummary[]; // All matched rules
  approvalRequirements: {
    requiresApproval: boolean;
    requiresAdditionalApproval: boolean;
    reason: string;
  };
  scoringVersion: string; // e.g., "risk_v1"
}

interface AppliedRuleSummary {
  id: string;
  name: string;
  priority: number;
  scoreModifier: number;
  overridesApplied?: {
    blastRadius?: boolean;
    reversibility?: boolean;
    dataImpact?: boolean;
    thresholds?: boolean;
  };
}
```

### CombinedSafetyCheckResult

```typescript
interface CombinedSafetyCheckResult {
  isAllowed: boolean;
  riskAssessment: ContextualActionRiskAssessment;
  restrictionCheck: RestrictionCheckResult;
  blockedReason?: string;
  requiresApproval: boolean;
  requiresAdditionalApproval: boolean;
}
```

---

## Comprehensive Integration Map

This section documents how all components of the enhanced risk scoring system integrate across the codebase.

### Package Structure

```
packages/shared/src/
├── constants/
│   └── safety.ts                    # CONTEXT_MULTIPLIERS, OFF_HOURS_CONFIG
├── database/
│   ├── index.ts                     # Exports riskRules module
│   ├── riskRules/
│   │   ├── types.ts                 # Domain types, row types, store interface
│   │   ├── validation.ts            # Declarative validation rules
│   │   ├── mappers.ts               # Row-to-domain mappers
│   │   ├── helpers.ts               # Utility functions
│   │   ├── repository.ts            # CRUD operations
│   │   └── index.ts                 # Barrel exports
│   └── migrations/
│       └── 011_risk_rules.sql       # Database schema
├── safety/
│   ├── index.ts                     # Main safety exports
│   ├── combinedSafetyCheck.ts       # performCombinedSafetyCheck
│   └── scoring/
│       └── riskScoring/
│           ├── types.ts             # Context types, assessment types
│           ├── scoring.ts           # Basic assessActionRisk
│           ├── contextualScoring.ts # assessActionRiskWithContext
│           ├── store.ts             # Store management
│           ├── inMemoryStore.ts     # In-memory implementation
│           ├── storeValidation.ts   # Store input validation
│           └── index.ts             # Barrel exports
└── index.ts                         # Package barrel exports

services/api/src/
└── routes/
    ├── index.ts                     # Route registration
    └── riskRulesRoutes.ts           # Risk rules API endpoints
```

### Integration Points

#### 1. Constants → Scoring

The `CONTEXT_MULTIPLIERS` and `OFF_HOURS_CONFIG` constants in `constants/safety.ts` are used by `contextualScoring.ts` to calculate context adjustments:

```
constants/safety.ts
    │
    └──▶ safety/scoring/riskScoring/contextualScoring.ts
         • isCurrentlyOffHours() uses OFF_HOURS_CONFIG
         • calculateContextAdjustment() uses CONTEXT_MULTIPLIERS
```

#### 2. Database Types → Store Interface

The `RiskRulesStore` interface defined in `database/riskRules/types.ts` is implemented by both in-memory and database-backed stores:

```
database/riskRules/types.ts (RiskRulesStore interface)
    │
    ├──▶ safety/scoring/riskScoring/inMemoryStore.ts (InMemoryRiskRulesStore)
    │
    └──▶ [Production] Database store using repository.ts functions
```

#### 3. Store → Contextual Scoring

The scoring module uses the store for custom rule lookup and audit recording:

```
safety/scoring/riskScoring/store.ts
    │
    └──▶ safety/scoring/riskScoring/contextualScoring.ts
         • getRiskRulesStore() to get custom rules
         • store.recordAssessment() for audit trail
```

#### 4. Scoring + Restrictions → Combined Safety Check

The combined safety check integrates both risk scoring and restrictions:

```
safety/scoring/riskScoring/contextualScoring.ts ──┐
                                                  │
safety/gating/restrictions.ts ────────────────────┼──▶ safety/combinedSafetyCheck.ts
                                                  │     • performCombinedSafetyCheck()
                                                  │     • isActionSafetyBlocked()
```

#### 5. Safety Module → Package Exports

All safety functionality is exported through the package barrel:

```
safety/index.ts ──▶ packages/shared/src/index.ts ──▶ @kenchi/shared
```

#### 6. Repository → API Routes

The API routes use the database repository for CRUD operations:

```
database/riskRules/repository.ts
    │
    └──▶ services/api/src/routes/riskRulesRoutes.ts
         • createCustomRiskRule()
         • getCustomRiskRules()
         • updateCustomRiskRule()
         • deleteCustomRiskRule()
         • queryRiskAssessments()
```

### Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              API Request                                  │
│                    POST /api/risk-rules (create rule)                     │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         riskRulesRoutes.ts                                │
│  1. Extract tenantId                                                      │
│  2. Validate input                                                        │
│  3. Call repository                                                       │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                           repository.ts                                   │
│  1. Validate with declarative rules (validation.ts)                       │
│  2. Execute parameterized SQL query                                       │
│  3. Map row to domain object (mappers.ts)                                │
│  4. Return immutable result                                               │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                            PostgreSQL                                     │
│  custom_risk_rules table with tenant isolation                            │
└──────────────────────────────────────────────────────────────────────────┘


┌──────────────────────────────────────────────────────────────────────────┐
│                          Action Execution                                 │
│                  (e.g., Slack bot approve button)                         │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    performCombinedSafetyCheck()                           │
│  Input: ActionProposal + RiskAssessmentContext                            │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │
            ┌────────────────────┴────────────────────┐
            │                                         │
            ▼                                         ▼
┌───────────────────────────┐           ┌───────────────────────────┐
│    checkRestrictions()    │           │ assessActionRiskWithContext() │
│                           │           │                           │
│ • Incident mode check     │           │ 1. Resolve context        │
│ • Deployment freeze check │           │ 2. Get base rule          │
│ • Manual blocks check     │           │ 3. Lookup custom rules    │
│ • Schedule-based blocks   │           │ 4. Calculate base score   │
└───────────────┬───────────┘           │ 5. Apply score modifier   │
                │                       │ 6. Apply context adj.     │
                │                       │ 7. Determine risk level   │
                │                       │ 8. Record audit (async)   │
                │                       └───────────────┬───────────┘
                │                                       │
                └───────────────────┬───────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                      CombinedSafetyCheckResult                            │
│  • isAllowed: boolean                                                     │
│  • riskAssessment: ContextualActionRiskAssessment                         │
│  • restrictionCheck: RestrictionCheckResult                               │
│  • blockedReason?: string                                                 │
│  • requiresApproval: boolean                                              │
│  • requiresAdditionalApproval: boolean                                    │
└──────────────────────────────────────────────────────────────────────────┘
```

### Type Flow

```typescript
// 1. External input → CreateCustomRiskRuleInput (validated)
CreateCustomRiskRuleInput
    │
    ▼
// 2. Repository inserts → CustomRiskRuleRow (snake_case)
CustomRiskRuleRow
    │
    ▼
// 3. Mapper converts → CustomRiskRule (camelCase, immutable)
CustomRiskRule
    │
    ▼
// 4. Store interface uses → RiskRulesStore methods
RiskRulesStore.getCustomRules() → readonly CustomRiskRule[]
    │
    ▼
// 5. Scoring uses rules → ContextualActionRiskAssessment
ContextualActionRiskAssessment
    │
    ▼
// 6. Combined check produces → CombinedSafetyCheckResult
CombinedSafetyCheckResult
```

### Module Dependencies

```
@kenchi/shared (main export)
    │
    ├── core/errors (ValidationError, NotFoundError)
    ├── core/types (ActionProposal)
    │
    ├── constants/safety (CONTEXT_MULTIPLIERS, weights, thresholds)
    │
    ├── database/riskRules
    │   ├── types ◄───────── safety/types (BlastRadius, etc.)
    │   ├── validation ◄──── types
    │   ├── mappers ◄─────── types
    │   ├── helpers ◄─────── types
    │   └── repository ◄──── validation, mappers, helpers
    │
    └── safety
        ├── types (BlastRadius, Reversibility, DataImpact)
        ├── gating/restrictions
        ├── scoring/riskScoring
        │   ├── types ◄─────── database/riskRules/types
        │   ├── rules
        │   ├── scoring ◄───── rules, types
        │   ├── storeValidation
        │   ├── inMemoryStore ◄── storeValidation
        │   ├── store ◄──────── inMemoryStore
        │   └── contextualScoring ◄── rules, store, types
        └── combinedSafetyCheck ◄── scoring, restrictions
```

---

## Related: Confidence Scoring

The codebase includes a companion **Confidence Scoring** system (`safety/scoring/confidenceScoring/`) for assessing LLM analysis quality. While risk scoring evaluates _action danger_, confidence scoring evaluates _analysis reliability_.

### Comparison

| Aspect          | Risk Scoring                                 | Confidence Scoring                                              |
| --------------- | -------------------------------------------- | --------------------------------------------------------------- |
| **Purpose**     | Assess action danger                         | Assess LLM analysis reliability                                 |
| **Score Range** | 0-1 (higher = more risky)                    | 0-1 (higher = more confident)                                   |
| **Factors**     | 3 (blast radius, reversibility, data impact) | 5 (uncertainty, evidence, completeness, knowledge, consistency) |
| **Weighting**   | `Σ(factor × weight)`                         | `Σ(factor × weight)`                                            |
| **Context**     | Environment, incident mode, off-hours        | Evidence quality, LLM stated confidence                         |
| **Output**      | Risk level + approval requirements           | Gating decision + reasoning                                     |

### Shared Patterns

Both systems share important design patterns:

#### 1. Scoring Math Contract (Documented)

Both systems document their math contracts explicitly for auditability:

```
Risk:       compositeScore → preContextScore → contextMultiplier → finalScore
Confidence: baseScore → boundedFactors → weightedFactors → finalScore
```

#### 2. Factor Bounding

Confidence scoring implements explicit bounds on each factor:

```typescript
// packages/shared/src/constants/confidence.ts
export const FACTOR_BOUNDS = {
  uncertainty: { min: -0.3, max: 0 },
  evidenceAlignment: { min: -0.4, max: 0.4 },
  // ...
};
```

Risk scoring could adopt similar explicit bounds for transparency.

#### 3. Guard Rails

Confidence scoring has `MAX_WEIGHTED_ADJUSTMENT` as a guard rail:

```typescript
export const MAX_WEIGHTED_ADJUSTMENT = {
  min: -0.5,
  max: 0.5,
} as const;
```

This prevents configuration mistakes from producing extreme scores.

#### 4. Versioning

Confidence scoring includes version tracking:

```typescript
export const SCORING_VERSION = "confidence_v2" as const;
```

Risk scoring should adopt similar versioning for audit traceability.

#### 5. Safety Helpers

Confidence scoring includes safety helpers that prevent NaN/Infinity propagation:

```typescript
// safeNumber: converts NaN/Infinity to fallback
// clamp: bounds values to range (also handles NaN)
// sanitizeForLog: prevents log injection from untrusted input
```

#### 6. Detailed Breakdown

Confidence scoring returns comprehensive breakdowns for debugging:

```typescript
return {
  finalScore,
  breakdown: {
    baseScore,
    raw: { uncertainty: -0.15, ... },
    bounded: { uncertainty: -0.15, ... },
    weighted: { uncertainty: -0.0225, ... },
    totals: { weightedAdjustment, rawScore, cappedScore, finalScore },
  },
  reasoning: [...], // Human-readable explanation per step
  scoringVersion: SCORING_VERSION,
};
```

### Cross-System Integration

When assessing an action proposal:

```typescript
// 1. Confidence scoring: How reliable is the LLM's analysis?
const confidence = calculateConfidenceScore(analysis, evidence);

// 2. Risk scoring: How dangerous is the proposed action?
const risk = await assessActionRiskWithContext(action, context);

// 3. Combined decision
// High risk + low confidence = block
// Low risk + high confidence = auto-approve
// Mixed = require approval
```

### Enhancement Opportunities

Based on confidence scoring patterns, risk scoring could add:

1. **RISK_SCORING_VERSION constant** for audit traceability
2. **Explicit factor bounds** in constants (currently implicit in scoring logic)
3. **safeNumber() calls** for defensive programming against NaN
4. **Human-readable reasoning array** explaining each step
5. **Guard rails** on context multiplier products

---

## Version History

| Version | Date       | Description                                                                                                                                                 |
| ------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.4.0   | 2026-01-27 | CONTEXT_MULTIPLIER_BOUNDS constant referenced in spec, base_score clarified as preContextScore, any-rule attribution query added                            |
| 1.3.0   | 2026-01-26 | Platform baseline naming fix (MAX not MIN), multiplier guard rail [1.0-3.0], risk level >= boundary, primary rule tie-breaking, tenantId auth clarification |
| 1.2.0   | 2026-01-26 | Decision precedence, platform baselines, multi-rule support, context factors, hint field naming                                                             |
| 1.1.0   | 2026-01-25 | Added Technical Contracts section, context trust boundaries, confidence scoring cross-reference                                                             |
| 1.0.0   | 2026-01-24 | Initial implementation with context-aware scoring                                                                                                           |

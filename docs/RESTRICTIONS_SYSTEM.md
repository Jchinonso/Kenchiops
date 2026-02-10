# User-Configurable Restrictions System

## Technical Design Document

**Version:** 3.1  
**Status:** Draft  
**Last Updated:** January 2025  
**Document Owner:** Engineering Team  
**Stakeholders:** Platform Engineering, SRE, DevOps, Security, Compliance

---

## Table of Contents

1. Executive Summary
2. Problem Statement and Business Context
3. Design Goals and Non-Goals
4. System Architecture
5. Action Context Contract
6. Scope Matching Semantics
7. Data Model
8. Database Design
9. Store Interface Design
10. Restriction Evaluation Logic
11. User Interfaces
12. Override Mechanism
13. Override Policy Configuration
14. Integration Points
15. Concurrency and Idempotency
16. Caching and Cache Invalidation
17. Security Considerations
18. Performance Considerations
19. Error Handling and Failure Modes
20. Observability and Monitoring
21. Data Lifecycle and Governance
22. Testing Strategy
23. Migration Strategy
24. Rollout Plan
25. Operational Runbook
26. Future Enhancements
27. Risks and Mitigations
28. Glossary
29. Appendices

---

## 1. Executive Summary

This document describes the design for making Kenchi's action restriction system user-configurable. Currently, restrictions are hardcoded and stored in memory. This design introduces database persistence, user interfaces (Slack commands and REST API), granular scope targeting with deterministic matching semantics, and an override mechanism with tamper-evident audit trails.

### 1.1 Current State

The restrictions module uses in-memory state with hardcoded default rules. Rules are lost on service restart, users have no way to configure restrictions, there is no mechanism to bypass them during emergencies, and restrictions apply globally without environment or repository targeting.

### 1.2 Proposed Solution

Implement a persistent, user-configurable restriction system that:

- Stores rules and state in PostgreSQL with tamper-evident audit trails
- Provides granular scope targeting (environments, repositories, services, tags) with well-defined matching semantics
- Defines a canonical Action Context contract for consistent evaluation across all entry points
- Offers Slack commands and REST API for management
- Enables controlled overrides with mandatory categorized justification and configurable policy constraints
- Maintains complete, immutable audit trails with hash chaining for compliance
- Supports configurable failure modes based on action risk level with break-glass emergency procedures
- Preserves backward compatibility with existing integrations

### 1.3 Key Benefits

| Benefit             | Description                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------- |
| Granular Control    | Target restrictions to specific environments, repos, or services with deterministic matching |
| Operational Control | Teams can manage freezes and incident modes without engineering intervention                 |
| Emergency Response  | Documented path to bypass restrictions including break-glass for critical emergencies        |
| Compliance Support  | Tamper-evident audit trail with hash chaining satisfies SOC 2 requirements                   |
| Reliability         | Restriction state survives restarts and remains consistent across instances                  |
| Flexibility         | Custom rules with minute-level scheduling and date exclusions                                |
| Explainability      | Clear reasoning for why actions are blocked with traceable decision IDs                      |
| Consistency         | Single Action Context contract ensures identical behavior across Slack, API, and CI          |

### 1.4 Success Metrics

| Metric                        | Target                                                 | Measurement Method                         |
| ----------------------------- | ------------------------------------------------------ | ------------------------------------------ |
| Restriction state persistence | Zero rules lost due to service restarts                | Automated verification after deployments   |
| Freeze activation time        | Under 30 seconds via Slack                             | P95 measured from command to confirmation  |
| Override audit completeness   | 100% of overrides captured with justification          | Comparison of override attempts vs records |
| Scope accuracy                | Zero cross-environment blocking incidents              | User-reported issues                       |
| Performance impact            | Less than 50ms total budget for restriction checks     | P99 latency monitoring                     |
| Cache consistency             | Less than 5 second propagation for rule changes        | Cross-instance timing tests                |
| Hash chain integrity          | 100% verifiable chain with zero breaks                 | Daily automated verification               |
| User adoption                 | 80% of freezes managed via self-service within 30 days | Usage analytics                            |

---

## 2. Problem Statement and Business Context

### 2.1 Current Limitations

**No Persistence**
Restriction state is stored in memory and lost when services restart. This means carefully configured restrictions disappear during deployments, infrastructure updates, or unexpected service restarts.

**No Scope Targeting**
Current restrictions are global. A deployment freeze blocks ALL deployments across ALL environments. There is no way to freeze production while allowing staging deployments.

**No Consistent Action Context**
Different entry points (Slack, API, CI) may construct action context differently, leading to inconsistent restriction evaluation.

**No User Control**
Users cannot configure when restrictions apply or what actions are affected. Any change requires code modifications.

**No Override Capability**
When an action is blocked, there is no way to bypass it even for legitimate emergencies.

**No Audit Trail**
No structured record exists of when restrictions were applied or bypassed. No tamper-evident storage for compliance.

**Coarse Scheduling**
Current hardcoded rules use hour-level granularity with no support for specific dates or holidays.

**No Failure Mode Control**
System errors result in a single behavior regardless of action risk.

### 2.2 Business Drivers

**Risk Reduction**
Prevent accidental deployments during high-risk periods. Target restrictions precisely to avoid blocking unrelated work.

**Compliance Requirements**
SOC 2 and similar frameworks require documented change management controls with tamper-evident audit trails.

**Operational Efficiency**
Self-service management reduces engineering toil. Faster incident response through targeted lockdown.

**Visibility and Accountability**
Clear documentation of restrictions and overrides with categorized justifications.

---

## 3. Design Goals and Non-Goals

### 3.1 Primary Goals

| Goal                         | Description                                                         | Success Criteria                                     |
| ---------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------- |
| Persistence                  | Store all restriction data in PostgreSQL with tamper-evident audit  | Zero data loss; hash chain verifiable                |
| Action Context Contract      | Single canonical shape for all restriction checks                   | Zero "blocked in Slack but not API" bugs             |
| Scope Targeting              | Deterministic environment, repository, service, tag-based targeting | Explicit AND/OR semantics documented                 |
| User Control                 | Allow users to manage restrictions through Slack and API            | Users can activate scoped freeze in under 30 seconds |
| Override with Accountability | Mandatory categorized reason with policy constraints                | 100% of overrides recorded with category             |
| Explainability               | Clear reasoning for blocked actions                                 | Users understand why blocked without support         |
| Configurable Failure Modes   | Risk-appropriate behavior on system errors                          | High-risk fail closed; low-risk fail open            |
| Break-Glass Emergency        | Escape hatch even for "deny" failure modes                          | Documented emergency procedure                       |
| Audit Integrity              | Tamper-evident with deterministic hash chain                        | Chain verifiable with explicit ordering              |
| Testability                  | Support in-memory storage for unit tests                            | All tests pass without database dependency           |

### 3.2 Explicit Non-Goals

**Per-Tenant Rule Isolation** - Full multi-tenant isolation deferred. Basic tenant scoping included.

**Role-Based Access Control** - All authenticated users have equal capabilities. Policy constraints (not roles) enforce guardrails.

**External System Integration** - Automatic activation from PagerDuty/Opsgenie not included.

**Scheduled Freezes** - Pre-scheduling future freezes not supported.

**Multi-User Approval Workflows** - Single-user override with documentation is the model.

### 3.3 Design Principles

**Safety First, But Not Absolute**
Restrictions are safety guardrails with documented bypass paths including break-glass for true emergencies.

**Accountability Over Prevention**
Focus on ensuring all overrides are documented with categorized justifications.

**Precise Targeting Over Broad Blocking**
Restrictions affect only what they need to with deterministic matching semantics.

**Explainability**
Every blocking decision is traceable with decision ID and match reasons.

**Consistency**
Single Action Context contract ensures identical behavior across all entry points.

**Risk-Appropriate Failure Modes**
System errors trigger different behavior based on action risk level.

---

## 4. System Architecture

### 4.1 Component Overview

**User Interface Layer**
Slack commands and REST API for user interaction.

**Action Context Builder**
Constructs canonical RestrictionActionContext from various sources (Slack, API, CI).

**Business Logic Layer**
Restriction evaluation with scope matching, schedule matching, and override processing.

**Storage Abstraction Layer**
RestrictionsStore interface with in-memory and database implementations.

**Cache Layer**
Cross-instance cache invalidation using PostgreSQL LISTEN/NOTIFY.

**Persistence Layer**
PostgreSQL tables including restriction_events for comprehensive audit.

### 4.2 Data Flow

When a user attempts to execute an action:

1. Entry point (Slack/API/CI) constructs RestrictionActionContext
2. Context passed to restriction evaluator
3. Evaluator generates decision_id (UUID)
4. Evaluator queries enabled rules matching scope
5. Evaluator queries active restrictions matching scope
6. Evaluator evaluates schedules with deterministic matching
7. Evaluator returns result with match reasons and explain text
8. If blocked, user sees override option (unless deny mode)
9. If override, policy constraints validated
10. Override recorded with hash chain
11. restriction_events record created
12. Action proceeds

---

## 5. Action Context Contract

### 5.1 Overview

The RestrictionActionContext is the **single canonical shape** that every restriction check uses. All entry points (Slack action, API call, CI event) must construct this context identically.

### 5.2 RestrictionActionContext Fields

| Field         | Type      | Required | Description                                                |
| ------------- | --------- | -------- | ---------------------------------------------------------- |
| action_type   | string    | Yes      | Type of action being performed                             |
| environment   | string    | Yes      | Target environment (prod, staging, dev, etc.)              |
| repository    | string    | No       | Target repository (format: org/repo)                       |
| service       | string    | No       | Target service name                                        |
| tenant_id     | string    | No       | Tenant or organization ID                                  |
| tags          | string[]  | No       | Labels/tags associated with action                         |
| action_id     | string    | No       | Unique identifier for this specific action instance        |
| risk_level    | enum      | Yes      | Derived from action_type: low, medium, high, critical      |
| initiator     | object    | Yes      | Who initiated: { user_id, source: slack/api/ci/system }    |
| change_target | object    | No       | Specific target: { type, id } (e.g., cluster, resource_id) |
| request_id    | string    | Yes      | Request ID for tracing                                     |
| trace_id      | string    | No       | Distributed trace ID                                       |
| timestamp     | timestamp | Yes      | When action was initiated                                  |

### 5.3 Risk Level Mapping

Risk level is derived from action_type (not user-provided):

| Risk Level | Action Types                                        |
| ---------- | --------------------------------------------------- |
| critical   | update_dns, delete_resource, modify_network         |
| high       | deploy (prod), run_migration, modify_infrastructure |
| medium     | deploy (staging), execute_query, backup_restore     |
| low        | deploy (dev), scale_resources, rollback_deployment  |

### 5.4 Context Construction

**From Slack Action:**

```
environment: extracted from action payload or modal selection
repository: extracted from action context
service: extracted from action context or inferred from repository
tenant_id: from workspace/org context
tags: from repository metadata or explicit selection
action_type: from action identifier
risk_level: derived from action_type + environment
initiator: { user_id: slack_user_internal_id, source: "slack" }
request_id: generated UUID
timestamp: current time
```

**From API Request:**

```
environment: from request body (required)
repository: from request body
service: from request body
tenant_id: from auth context
tags: from request body
action_type: from endpoint + method
risk_level: derived from action_type + environment
initiator: { user_id: auth_user_id, source: "api" }
request_id: from X-Request-ID header or generated
trace_id: from X-Trace-ID header
timestamp: current time
```

**From CI Event:**

```
environment: from CI context/config
repository: from CI context (always present)
service: from CI config or inferred
tenant_id: from CI org context
tags: from repository labels or CI config
action_type: from CI event type
risk_level: derived from action_type + environment
initiator: { user_id: ci_actor or "ci-system", source: "ci" }
request_id: from CI run ID
trace_id: from CI trace context
timestamp: event timestamp
```

### 5.5 Shared Context Builder

A single shared helper function constructs RestrictionActionContext:

**Function:** buildActionContext(source, params) → RestrictionActionContext

**Responsibilities:**

- Validates required fields
- Normalizes field values (lowercase, trim)
- Derives risk_level from action_type + environment
- Generates request_id if not provided
- Sets timestamp to current time
- Returns frozen/immutable context object

**Usage:**
All entry points MUST use this helper. Direct context construction is prohibited.

### 5.6 Validation Rules

| Field            | Validation                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| action_type      | Must be in allowed action types list                                                            |
| environment      | Must match pattern: ^[a-z][a-z0-9-]\*$ and be in allowed set: prod, staging, dev, sandbox, test |
| repository       | If provided, must match pattern: ^[a-z0-9_-]+/[a-z0-9_.-]+$                                     |
| service          | If provided, must match pattern: ^[a-z][a-z0-9-]\*$                                             |
| tenant_id        | If provided, must be valid UUID or identifier format                                            |
| tags             | Each tag must match pattern: ^[a-z0-9_-]+$, max 20 tags                                         |
| initiator.source | Must be one of: slack, api, ci, system                                                          |

**Allowed Environment Set (configurable):**
Default: prod, staging, dev, sandbox, test. Custom environments can be added via restriction_config.

### 5.7 Tag Source of Truth

Tags should be sourced in the following priority order:

1. **Repository metadata service** (when available) - canonical source for repo-level tags
2. **CI/CD pipeline labels** - for build/deploy context tags
3. **Explicit action input** - user-provided tags in API/Slack

When multiple sources provide tags, they are **merged** (union). The `buildActionContext()` helper handles this merge and deduplication.

**Tag Governance:**

- Tags are normalized (lowercase, trimmed) regardless of source
- Unknown tags are allowed (no strict allowlist) to support organic adoption
- Consider a tag registry service for large organizations (future enhancement)

---

## 6. Scope Matching Semantics

### 6.1 Overview

Scope matching determines whether a restriction applies to an action. This section defines the **exact matching semantics** to ensure deterministic, auditable decisions.

### 6.2 Matching Rules

**Cross-Dimension Matching: AND**
All non-empty scope dimensions must match. If a rule specifies environments AND repositories, both must match.

**Within-Dimension Matching: OR**
If a dimension has multiple values, matching ANY value satisfies that dimension.

**Empty List: Match All**
An empty array means "no restriction on this dimension" (matches all values).

### 6.3 Dimension-Specific Rules

**Environments:**

- Exact match required
- Case-insensitive (normalized to lowercase)
- Example: rule.environments = ["prod", "staging"] matches action.environment = "prod"

**Repositories:**

- Supports exact match OR wildcard prefix
- Wildcard format: "org/\*" matches any repo in org
- Case-insensitive
- Example: rule.repositories = ["org/*"] matches action.repository = "org/payments"

**Services:**

- Supports exact match OR wildcard suffix
- Wildcard format: "payments-\*" matches "payments-api", "payments-worker"
- Case-insensitive
- Example: rule.services = ["payments-*"] matches action.service = "payments-api"

**Tenant/Org:**

- Exact match required
- Case-sensitive (IDs are typically UUIDs or specific formats)
- **Semantics clarification:** `tenant_id` participates fully in scope matching but does not imply authorization boundaries. All authenticated users can create rules scoped to any tenant. Per-tenant authorization is a future RBAC enhancement.

**Tags:**

- **ANY overlap** - if action has ANY tag that matches ANY rule tag, dimension matches
- This is the permissive choice; stricter "ALL required" is a future option
- Case-insensitive
- Example: rule.tags = ["critical", "pci"], action.tags = ["pci", "frontend"] → MATCH (overlap on "pci")

**Future: Tags ALL Mode (v4.0)**
Optional stricter mode where action must have ALL tags specified in rule. Configured per-rule via `tags_match_mode: "any" | "all"`. Default remains "any" for backward compatibility.

### 6.4 Wildcard Specification

**Supported Wildcards:**

- Trailing asterisk only: `org/*`, `payments-*`
- No regex, no complex patterns
- Asterisk must be at end of string
- At least one character before asterisk required

**Wildcard Matching:**

- `org/*` matches `org/anything` but NOT `org` alone
- `payments-*` matches `payments-api` but NOT `payments` alone

**No Wildcards (explicit):**

- environments: NO wildcards (explicit list only)
- tenant_id: NO wildcards (explicit list only)
- tags: NO wildcards (explicit list only)

### 6.5 Matching Algorithm

```
function matchesScope(rule, context):
    // All non-empty dimensions must match (AND across dimensions)

    if rule.environments is not empty:
        if context.environment not in rule.environments:
            return { matched: false, reason: "environment mismatch" }

    if rule.repositories is not empty:
        if not matchesWithWildcard(context.repository, rule.repositories):
            return { matched: false, reason: "repository mismatch" }

    if rule.services is not empty:
        if not matchesWithWildcard(context.service, rule.services):
            return { matched: false, reason: "service mismatch" }

    if rule.tenants is not empty:
        if context.tenant_id not in rule.tenants:
            return { matched: false, reason: "tenant mismatch" }

    if rule.tags is not empty:
        if not hasAnyOverlap(context.tags, rule.tags):
            return { matched: false, reason: "tags mismatch" }

    return {
        matched: true,
        reasons: [dimensions that matched with values]
    }
```

### 6.6 Match Result Structure

Every scope match returns detailed information:

| Field             | Description                                |
| ----------------- | ------------------------------------------ |
| matched           | boolean - did scope match?                 |
| dimension_results | object - per-dimension match details       |
| match_reasons     | string[] - human-readable reasons          |
| rule_scope        | object - the rule's scope for reference    |
| context_values    | object - the action's values for reference |

### 6.7 Ambiguity Resolution

**Multiple Rules Match:**
All matching rules contribute to blocking decision. Priority determines display order.

**Priority Definition:**

- Lower numeric priority = higher precedence (priority 10 displays before priority 100)
- Ties are resolved by `created_at` (older first)
- This ensures deterministic, reproducible ordering

**Overlapping Scopes:**
If multiple rules have overlapping scopes, all are evaluated. Most specific (most non-empty dimensions) shown first as secondary sort.

**Conflicting Rules:**
No conflict resolution needed - if ANY rule blocks, action is blocked.

---

## 7. Data Model

### 7.1 Entity Overview

**Restriction Rules** - Schedule-based policies with scope targeting
**Active Restrictions** - Manual restrictions (freezes, incidents) with scope targeting
**Restriction Overrides** - Tamper-evident audit trail with hash chain
**Restriction Events** - Append-only log of all restriction-related events
**Restriction Config** - Versioned system configuration

### 7.2 Restriction Rules

| Field                 | Type         | Required | Description                                 |
| --------------------- | ------------ | -------- | ------------------------------------------- |
| id                    | UUID         | Yes      | Unique identifier                           |
| type                  | Enum         | Yes      | off_hours, maintenance_window, custom       |
| name                  | VARCHAR(255) | Yes      | Human-readable name                         |
| description           | TEXT         | No       | Optional description                        |
| enabled               | BOOLEAN      | Yes      | Active flag (default: true)                 |
| priority              | INTEGER      | Yes      | Display ordering (default: 100)             |
| **Scope Fields**      |              |          |                                             |
| environments          | TEXT[]       | Yes      | Target environments (empty = all)           |
| repositories          | TEXT[]       | Yes      | Target repositories with optional wildcards |
| services              | TEXT[]       | Yes      | Target services with optional wildcards     |
| tenants               | TEXT[]       | Yes      | Target tenants (empty = all)                |
| tags                  | TEXT[]       | Yes      | Target tags (empty = all)                   |
| **Schedule Fields**   |              |          |                                             |
| schedule_days_of_week | INTEGER[]    | Yes      | Days 0-6 (empty = all)                      |
| schedule_start_time   | TIME         | Yes      | Start time (HH:MM:SS)                       |
| schedule_end_time     | TIME         | Yes      | End time (HH:MM:SS)                         |
| schedule_timezone     | VARCHAR(100) | Yes      | IANA timezone (default: UTC)                |
| effective_start_date  | DATE         | No       | When rule becomes active                    |
| effective_end_date    | DATE         | No       | When rule expires                           |
| exclude_dates         | DATE[]       | Yes      | Dates to skip                               |
| include_dates         | DATE[]       | Yes      | Force-on dates                              |
| **Action Fields**     |              |          |                                             |
| affected_actions      | TEXT[]       | Yes      | Blocked action types (empty = all)          |
| **Metadata**          |              |          |                                             |
| is_system_default     | BOOLEAN      | Yes      | Built-in flag                               |
| created_by            | VARCHAR(255) | No       | Creator                                     |
| created_via           | Enum         | Yes      | slack, api, system                          |
| created_at            | TIMESTAMPTZ  | Yes      | Creation time                               |
| updated_at            | TIMESTAMPTZ  | Yes      | Last update                                 |

### 7.3 Active Restrictions

| Field | Type | Required | Description                                                         |
| ----- | ---- | -------- | ------------------------------------------------------------------- |
| id    | UUID | Yes      | Unique identifier                                                   |
| type  | Enum | Yes      | freeze_period, incident_mode, maintenance_window, manual_override\* |

\*Note: `manual_override` refers to a manually-activated restriction (not to be confused with override records in `restriction_overrides`). Consider renaming to `manual_restriction` in v4.0 for clarity.
| name | VARCHAR(255) | Yes | Human-readable name |
| reason | TEXT | No | Activation reason |
| severity | Enum | Yes | info, warn, block (default: block) |
| priority | INTEGER | Yes | Display ordering (default: 100) |
| **Scope Fields** | | | |
| environments | TEXT[] | Yes | Target environments |
| repositories | TEXT[] | Yes | Target repositories |
| services | TEXT[] | Yes | Target services |
| tenants | TEXT[] | Yes | Target tenants |
| tags | TEXT[] | Yes | Target tags |
| **Action Fields** | | | |
| affected_actions | TEXT[] | Yes | Blocked actions (empty = all) |
| **Lifecycle** | | | |
| started_at | TIMESTAMPTZ | Yes | Start time |
| ends_at | TIMESTAMPTZ | No | End time (NULL = indefinite) |
| activated_by | VARCHAR(255) | Yes | Who activated |
| deactivated_at | TIMESTAMPTZ | No | Deactivation time |
| deactivated_by | VARCHAR(255) | No | Who deactivated |
| **Reference** | | | |
| incident_id | VARCHAR(100) | No | External incident ID |
| idempotency_key | VARCHAR(255) | No | Prevents duplicates |
| created_via | Enum | Yes | slack, api, system |
| metadata | JSONB | No | Additional context |

### 7.4 Restriction Overrides

| Field                   | Type         | Required | Description                                     |
| ----------------------- | ------------ | -------- | ----------------------------------------------- |
| id                      | UUID         | Yes      | Unique identifier                               |
| **Chain Fields**        |              |          |                                                 |
| prev_id                 | UUID         | No       | Previous override ID (explicit chain)           |
| entry_hash              | VARCHAR(64)  | Yes      | SHA-256 hash of record                          |
| prev_hash               | VARCHAR(64)  | No       | Previous record hash                            |
| chain_partition         | DATE         | Yes      | Partition key (date of creation)                |
| **Restriction Context** |              |          |                                                 |
| restriction_id          | UUID         | No       | Reference to active restriction                 |
| restriction_type        | VARCHAR(50)  | Yes      | Type at override time                           |
| restriction_name        | VARCHAR(255) | Yes      | Name at override time                           |
| decision_id             | UUID         | Yes      | Links to evaluation that was overridden         |
| **Action Context**      |              |          |                                                 |
| action_type             | VARCHAR(100) | Yes      | Action allowed                                  |
| action_id               | VARCHAR(255) | No       | Specific action ID                              |
| environment             | VARCHAR(100) | Yes      | Environment                                     |
| repository              | VARCHAR(255) | No       | Repository                                      |
| service                 | VARCHAR(100) | No       | Service                                         |
| risk_level              | VARCHAR(20)  | Yes      | Risk level at time of override                  |
| **Override Details**    |              |          |                                                 |
| override_reason         | TEXT         | Yes      | Justification (max 16KB)                        |
| justification_category  | Enum         | Yes      | Category (required)                             |
| ticket_ref              | VARCHAR(255) | No       | Ticket reference (required for some categories) |
| is_break_glass          | BOOLEAN      | Yes      | Whether break-glass was used (default: false)   |
| **User Context**        |              |          |                                                 |
| overridden_by           | VARCHAR(255) | Yes      | User identifier                                 |
| slack_user_id           | VARCHAR(50)  | No       | Slack user                                      |
| slack_channel_id        | VARCHAR(50)  | No       | Slack channel                                   |
| **Request Context**     |              |          |                                                 |
| request_id              | VARCHAR(100) | Yes      | Request ID                                      |
| trace_id                | VARCHAR(100) | No       | Trace ID                                        |
| client_ip               | VARCHAR(45)  | No       | Client IP                                       |
| user_agent              | VARCHAR(500) | No       | User agent                                      |
| created_via             | Enum         | Yes      | slack, api                                      |
| metadata                | JSONB        | No       | Additional context                              |
| created_at              | TIMESTAMPTZ  | Yes      | Override time (from DB, not app)                |

### 7.5 Restriction Events (NEW)

Append-only table for comprehensive audit trail:

| Field           | Type         | Required | Description                                |
| --------------- | ------------ | -------- | ------------------------------------------ |
| id              | UUID         | Yes      | Unique identifier                          |
| event_type      | Enum         | Yes      | See event types below                      |
| event_timestamp | TIMESTAMPTZ  | Yes      | When event occurred (from DB)              |
| **Actor**       |              |          |                                            |
| actor_id        | VARCHAR(255) | Yes      | Who caused the event                       |
| actor_source    | Enum         | Yes      | slack, api, ci, system                     |
| **Context**     |              |          |                                            |
| request_id      | VARCHAR(100) | No       | Request ID                                 |
| trace_id        | VARCHAR(100) | No       | Trace ID                                   |
| **Payload**     |              |          |                                            |
| entity_type     | VARCHAR(50)  | Yes      | rule, active_restriction, override, config |
| entity_id       | UUID         | No       | ID of affected entity                      |
| before_state    | JSONB        | No       | State before change                        |
| after_state     | JSONB        | No       | State after change                         |
| metadata        | JSONB        | No       | Additional context                         |

**Event Types:**

- rule_created
- rule_updated
- rule_enabled
- rule_disabled
- rule_deleted
- restriction_activated
- restriction_deactivated
- restriction_expired
- override_recorded
- override_break_glass
- evaluation_blocked
- evaluation_allowed
- fail_mode_triggered
- cache_invalidated
- config_updated
- hash_chain_verified
- hash_chain_break_detected

### 7.6 Restriction Config (NEW)

Versioned configuration for policy settings:

| Field      | Type         | Required | Description           |
| ---------- | ------------ | -------- | --------------------- |
| id         | INTEGER      | Yes      | Always 1 (single row) |
| version    | INTEGER      | Yes      | Incrementing version  |
| config     | JSONB        | Yes      | Configuration object  |
| updated_by | VARCHAR(255) | Yes      | Who updated           |
| updated_at | TIMESTAMPTZ  | Yes      | When updated          |

**Config Structure:**

```json
{
  "failure_modes": {
    "default": "allow",
    "by_action_type": { "update_dns": "deny", ... },
    "by_risk_level": { "critical": "deny", "high": "require_override", ... }
  },
  "override_policy": {
    "reason_min_length": 20,
    "reason_max_length": 16384,
    "require_ticket_for_categories": ["security", "scheduled_exception"],
    "blocked_overrides": [
      { "restriction_type": "incident_mode", "action_type": "delete_resource" }
    ],
    "break_glass_reason_min_length": 50
  },
  "timeouts": {
    "check_total_budget_ms": 50,
    "db_query_budget_ms": 20
  },
  "hash_chain": {
    "partition_by": "day"
  },
  "validation": {
    "allowed_environments": ["prod", "staging", "dev", "sandbox", "test"],
    "allowed_action_types": ["deploy", "rollback_deployment", "run_migration", ...]
  }
}
```

**Config Change Process:**

1. API call to PUT /api/restrictions/config
2. Version incremented automatically
3. restriction_event recorded with type = config_updated, before/after state
4. NOTIFY sent to invalidate caches
5. All instances pick up new config within cache TTL

---

## 8. Database Design

### 8.1 Schema Overview

Five PostgreSQL tables implement the data model:

- **restriction_rules**: Schedule-based rules with scope
- **active_restrictions**: Manual restrictions with scope
- **restriction_overrides**: Tamper-evident audit with hash chain
- **restriction_events**: Append-only event log
- **restriction_config**: Versioned configuration

### 8.2 Constraints and Validation

**Normalization Constraints:**

- All text fields trimmed and lowercased at application level
- Environment values validated against allowed set
- Repository format validated: ^[a-z0-9_-]+/[a-z0-9_.-]+$

**Array Constraints:**

```sql
CHECK (array_length(environments, 1) <= 20 OR environments = '{}')
CHECK (array_length(repositories, 1) <= 50 OR repositories = '{}')
CHECK (array_length(services, 1) <= 20 OR services = '{}')
CHECK (array_length(tags, 1) <= 50 OR tags = '{}')
CHECK (array_length(affected_actions, 1) <= 50 OR affected_actions = '{}')
```

**Override Constraints:**

```sql
CHECK (length(override_reason) >= 20)
CHECK (length(override_reason) <= 16384)
CHECK (justification_category IS NOT NULL)
CHECK (
  NOT (justification_category IN ('security', 'scheduled_exception'))
  OR ticket_ref IS NOT NULL
)
CHECK (NOT is_break_glass OR length(override_reason) >= 50)
```

### 8.3 Indexes

**GIN Indexes for Scope Arrays:**

```sql
CREATE INDEX idx_rules_environments ON restriction_rules USING GIN (environments);
CREATE INDEX idx_rules_repositories ON restriction_rules USING GIN (repositories);
CREATE INDEX idx_rules_services ON restriction_rules USING GIN (services);
CREATE INDEX idx_rules_tags ON restriction_rules USING GIN (tags);
CREATE INDEX idx_active_environments ON active_restrictions USING GIN (environments);
CREATE INDEX idx_active_repositories ON active_restrictions USING GIN (repositories);
```

**B-Tree Indexes:**

```sql
CREATE INDEX idx_rules_enabled ON restriction_rules (enabled) WHERE enabled = true;
CREATE INDEX idx_active_not_deactivated ON active_restrictions (deactivated_at) WHERE deactivated_at IS NULL;
CREATE INDEX idx_overrides_chain ON restriction_overrides (chain_partition, created_at, id);
CREATE INDEX idx_events_timestamp ON restriction_events (event_timestamp DESC);
```

### 8.4 Immutability Triggers

**Overrides Table:**

```sql
CREATE OR REPLACE FUNCTION reject_override_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Override records are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER override_no_update
  BEFORE UPDATE ON restriction_overrides
  FOR EACH ROW EXECUTE FUNCTION reject_override_mutation();

CREATE TRIGGER override_no_delete
  BEFORE DELETE ON restriction_overrides
  FOR EACH ROW EXECUTE FUNCTION reject_override_mutation();
```

**Events Table:**

```sql
CREATE TRIGGER events_no_update
  BEFORE UPDATE ON restriction_events
  FOR EACH ROW EXECUTE FUNCTION reject_override_mutation();

CREATE TRIGGER events_no_delete
  BEFORE DELETE ON restriction_events
  FOR EACH ROW EXECUTE FUNCTION reject_override_mutation();
```

### 8.5 NOTIFY Triggers

```sql
CREATE OR REPLACE FUNCTION notify_restriction_change()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('restriction_changes', json_build_object(
    'table', TG_TABLE_NAME,
    'op', TG_OP,
    'id', COALESCE(NEW.id, OLD.id)
  )::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER rules_notify AFTER INSERT OR UPDATE OR DELETE
  ON restriction_rules FOR EACH ROW EXECUTE FUNCTION notify_restriction_change();

CREATE TRIGGER active_notify AFTER INSERT OR UPDATE
  ON active_restrictions FOR EACH ROW EXECUTE FUNCTION notify_restriction_change();
```

### 8.6 Hash Chain Implementation

**Chain Ordering:**
Hash chain is ordered by (chain_partition, created_at, id) to handle concurrency deterministically.

**Partition Strategy:**
Chain partitioned by day (chain_partition = DATE(created_at)). Each day starts fresh with prev_hash = "GENESIS".

**Hash Computation:**

```
entry_hash = SHA256(
  id +
  restriction_type +
  restriction_name +
  action_type +
  environment +
  override_reason +
  justification_category +
  overridden_by +
  created_at (ISO 8601 from DB) +
  prev_id (or "NULL") +
  prev_hash (or "GENESIS")
)
```

**created_at Source:**
CRITICAL: created_at must come from DB (DEFAULT CURRENT_TIMESTAMP), not application. This ensures consistent ordering.

**Chain Break Handling:**
If prev record lookup fails:

1. Set prev_hash = "CHAIN_BREAK"
2. Set prev_id = NULL
3. Record restriction_event with type = hash_chain_break_detected
4. Alert fires immediately
5. Recording continues (audit more important than perfect chain)

---

## 9. Store Interface Design

### 9.1 Rule Operations

| Operation                   | Description                             |
| --------------------------- | --------------------------------------- |
| getRules(filters?)          | Get all rules                           |
| getEnabledRules()           | Get only enabled rules                  |
| getRulesForContext(context) | Get rules matching action context       |
| getRuleById(id)             | Get single rule                         |
| createRule(input)           | Create new rule                         |
| updateRule(id, updates)     | Update rule (creates event)             |
| deleteRule(id)              | Delete rule (fails for system defaults) |

### 9.2 Active Restriction Operations

| Operation                                  | Description                        |
| ------------------------------------------ | ---------------------------------- |
| getActiveRestrictions(filters?)            | Get all active                     |
| getActiveForContext(context)               | Get active matching action context |
| activateRestriction(input, idempotencyKey) | Create restriction                 |
| deactivateRestriction(id, user)            | Deactivate                         |

### 9.3 Override Operations

| Operation                                    | Description                   |
| -------------------------------------------- | ----------------------------- |
| recordOverride(input)                        | Create with hash chain        |
| getRecentOverrides(limit, filters)           | Get recent                    |
| getOverridesForExport(filters)               | For compliance export         |
| verifyHashChain(partition, startId?, endId?) | Verify chain integrity        |
| getChainHead(partition)                      | Get latest hash for partition |

### 9.4 Event Operations

| Operation                   | Description      |
| --------------------------- | ---------------- |
| recordEvent(event)          | Append event     |
| getEvents(filters)          | Query events     |
| getEventsForExport(filters) | For audit export |

### 9.5 Config Operations

| Operation                             | Description                                |
| ------------------------------------- | ------------------------------------------ |
| getConfig()                           | Get current config                         |
| updateConfig(config, user)            | Update (increments version, creates event) |
| getFailureMode(actionType, riskLevel) | Get failure mode for action                |
| getOverridePolicy()                   | Get override policy settings               |

---

## 10. Restriction Evaluation Logic

### 10.1 Severity vs Failure Mode Interaction

**Clarification of Precedence:**

- **Severity** (info/warn/block) applies only when restriction evaluation succeeds
- **Failure mode** (allow/require_override/deny) applies only when system errors occur (DB unavailable, timeout)
- Failure mode **always supersedes** severity when triggered
- A `warn` severity rule will hard-block if a DB outage triggers `deny` failure mode

**Example:**

- Rule with `severity: warn` normally allows action with warning
- During DB outage, if action has `failure_mode: deny`, action is blocked regardless of rule severity
- This is intentional: system uncertainty → conservative behavior for high-risk actions

### 10.2 Evaluation Principles

**Side-Effect Free Evaluation:**
Restriction evaluation is a pure read operation and MUST NOT mutate state. The only exception is emitting `restriction_events` for observability.

**Evaluation Event Emission:**
Emit exactly ONE evaluation event per `checkRestrictions()` call:

- Event type: `evaluation_blocked` or `evaluation_allowed`
- Include: `decision_id`, `is_allowed`, `failure_mode_applied` (if any), `matched_count`, `evaluation_latency_ms`
- This enables downstream analytics without event fan-out

### 10.3 Evaluation Algorithm

```
function checkRestrictions(context: RestrictionActionContext):
    // Generate decision ID
    decision_id = UUID()
    start_time = now()

    // Get config for timeouts and failure modes
    config = store.getConfig()

    try:
        // Query with timeout
        with timeout(config.timeouts.db_query_budget_ms):
            rules = store.getRulesForContext(context)
            active = store.getActiveForContext(context)

        // Evaluate schedule rules
        matched_rules = []
        for rule in rules:
            if matchesSchedule(rule, context.timestamp):
                matched_rules.push({
                    rule,
                    match_result: matchesScope(rule, context)
                })

        // Evaluate active restrictions
        matched_active = []
        for restriction in active:
            match_result = matchesScope(restriction, context)
            if match_result.matched:
                matched_active.push({ restriction, match_result })

        // Determine blocking
        blockers = [
            ...matched_rules.filter(r => r.rule.severity == 'block'),
            ...matched_active.filter(r => r.restriction.severity == 'block')
        ]

        // Sort by priority
        blockers.sort(by priority ascending)

        // Build result
        return {
            decision_id,
            is_allowed: blockers.length == 0,
            matched_rules: matched_rules.map(formatMatchResult),
            matched_active: matched_active.map(formatMatchResult),
            blockers: blockers.map(formatBlocker),
            explain_text: buildExplainText(blockers),
            evaluation_latency_ms: now() - start_time,
            context_snapshot: context
        }

    catch TimeoutError:
        return applyFailureMode(context, config, decision_id, "timeout")
    catch DatabaseError:
        return applyFailureMode(context, config, decision_id, "db_error")
```

### 10.2 Failure Mode Application

```
function applyFailureMode(context, config, decision_id, error_type):
    // Determine mode from config
    mode = config.failure_modes.by_action_type[context.action_type]
          ?? config.failure_modes.by_risk_level[context.risk_level]
          ?? config.failure_modes.default

    // Record event
    store.recordEvent({
        event_type: 'fail_mode_triggered',
        actor_id: context.initiator.user_id,
        metadata: { mode, error_type, action_type: context.action_type }
    })

    if mode == "allow":
        return {
            decision_id,
            is_allowed: true,
            failure_mode_applied: "allow",
            explain_text: "Restriction check unavailable, action allowed by policy"
        }

    if mode == "require_override":
        return {
            decision_id,
            is_allowed: false,
            requires_override: true,
            failure_mode_applied: "require_override",
            explain_text: "Restriction system unavailable. Override required to proceed."
        }

    if mode == "deny":
        return {
            decision_id,
            is_allowed: false,
            requires_override: false,
            can_break_glass: true,  // Always allow break-glass for deny
            failure_mode_applied: "deny",
            explain_text: "Action blocked due to system unavailability. Break-glass override available for emergencies."
        }
```

### 10.3 SLA/Timeout Configuration

| Budget                | Default | Description                      |
| --------------------- | ------- | -------------------------------- |
| check_total_budget_ms | 50ms    | Total time for restriction check |
| db_query_budget_ms    | 20ms    | Per-query budget                 |

If exceeded, failure mode logic applies.

---

## 11. User Interfaces

### 11.1 Slack Commands

| Command                                              | Purpose                |
| ---------------------------------------------------- | ---------------------- |
| /kenchi freeze start "reason" --env=X                | Activate scoped freeze |
| /kenchi freeze stop --id=X                           | End freeze             |
| /kenchi incident start ID "desc" --env=X --service=X | Activate incident mode |
| /kenchi incident end ID                              | End incident mode      |
| /kenchi restrictions --env=X                         | View scoped status     |

### 11.2 Override Modal

**Category Selector (required):**

- Hotfix
- Security (requires ticket_ref)
- Incident Mitigation
- Rollback
- Scheduled Exception (requires ticket_ref)
- Other

**Reason Field:**

- Minimum 20 characters (50 for break-glass)
- Maximum 16KB
- Template provided based on category

**Ticket Reference:**

- Required for Security and Scheduled Exception categories
- Format validated

**Break-Glass Option:**

- Shown only when failure_mode = "deny"
- Additional warning
- Longer minimum reason

### 11.3 API Endpoints

| Method | Path                                   | Description                   |
| ------ | -------------------------------------- | ----------------------------- |
| GET    | /api/restrictions                      | Full status                   |
| GET    | /api/restrictions/rules                | List rules (paginated)        |
| POST   | /api/restrictions/rules                | Create rule                   |
| PUT    | /api/restrictions/rules/:id            | Update rule                   |
| DELETE | /api/restrictions/rules/:id            | Delete rule                   |
| GET    | /api/restrictions/active               | Active restrictions           |
| POST   | /api/restrictions/freeze               | Activate freeze               |
| DELETE | /api/restrictions/freeze/:id           | Deactivate freeze             |
| POST   | /api/restrictions/incident             | Activate incident             |
| DELETE | /api/restrictions/incident/:id         | End incident                  |
| GET    | /api/restrictions/overrides            | Audit log (cursor pagination) |
| GET    | /api/restrictions/overrides/export     | Export (CSV/JSON)             |
| GET    | /api/restrictions/overrides/:id/verify | Verify hash                   |
| GET    | /api/restrictions/events               | Event log                     |
| GET    | /api/restrictions/events/export        | Export events                 |
| POST   | /api/restrictions/check                | Test action blocking          |
| GET    | /api/restrictions/config               | Get config                    |
| PUT    | /api/restrictions/config               | Update config                 |

### 11.4 API Validation

**Override Endpoint Validation:**

- justification_category required (enforced, not just UI)
- override_reason required, min length enforced
- ticket_ref required for certain categories
- is_break_glass flag honored with longer reason requirement

---

## 12. Override Mechanism

### 12.1 Override Flow

1. Action blocked, user sees override option
2. User opens override modal
3. User selects category (required)
4. User enters ticket_ref (if required for category)
5. User enters reason (min 20 chars, max 16KB)
6. System validates against override policy
7. System checks override constraints (see below)
8. If valid, system computes hash chain
9. Override recorded
10. Event recorded
11. Action proceeds

### 12.2 Override Policy Constraints

**Reason Length:**

- Minimum: 20 characters (configurable)
- Maximum: 16KB (to prevent abuse)
- Break-glass minimum: 50 characters

**Category Requirements:**

- security: requires ticket_ref
- scheduled_exception: requires ticket_ref
- other: allowed but monitored

**Blocked Overrides:**
Certain combinations cannot be overridden even with justification:

- incident_mode + delete_resource (configurable)
- Any combination listed in config.override_policy.blocked_overrides

**Time-Based Override Restrictions (optional):**
Configure restrictions that cannot be overridden within a time window:

```json
{
  "override_time_restrictions": [
    {
      "restriction_type": "incident_mode",
      "min_age_minutes": 5,
      "reason": "Wait for incident assessment before overriding"
    }
  ]
}
```

**Override Allowed by Failure Mode:**

- allow: N/A (action proceeds without override)
- require_override: override allowed
- deny: only break-glass override allowed

### 12.3 Break-Glass Override

For "deny" failure mode, a special break-glass option is available:

**Requirements:**

- Category must be incident_mitigation
- Reason minimum 50 characters
- is_break_glass flag set to true
- Separate event recorded: override_break_glass

**Alerts:**

- Immediate high-severity alert on break-glass use
- Automatic incident ticket created (future)

---

## 13. Override Policy Configuration

### 13.1 Policy Settings

| Setting                       | Type     | Default                             | Description                                         |
| ----------------------------- | -------- | ----------------------------------- | --------------------------------------------------- |
| reason_min_length             | integer  | 20                                  | Minimum characters for reason                       |
| reason_max_length             | integer  | 16384                               | Maximum characters for reason                       |
| break_glass_reason_min_length | integer  | 50                                  | Minimum for break-glass                             |
| require_ticket_for_categories | string[] | ["security", "scheduled_exception"] | Categories requiring ticket_ref                     |
| blocked_overrides             | object[] | []                                  | Restriction+action combos that cannot be overridden |

### 13.2 Blocked Override Configuration

```json
{
  "blocked_overrides": [
    {
      "restriction_type": "incident_mode",
      "action_types": ["delete_resource"],
      "reason": "Cannot delete resources during active incident"
    }
  ]
}
```

### 13.3 Updating Policy

Policy changes require:

1. API call to PUT /api/restrictions/config
2. Actor recorded
3. Version incremented
4. Event recorded: config_updated
5. Cache invalidated

---

## 14. Integration Points

### 14.1 Required Changes

**Action Handler:**

- Use shared buildActionContext helper
- Pass full RestrictionActionContext to evaluator
- Handle break-glass UI option

**Service Initialization:**

- Initialize database store
- Subscribe to NOTIFY
- Load config

**All Entry Points:**

- MUST use buildActionContext helper
- MUST NOT construct context directly

---

## 15. Concurrency and Idempotency

### 15.1 Idempotency Keys

**API:**

- Idempotency-Key header
- Unique constraint: (key, user_id, endpoint)
- TTL: 24 hours

**Slack:**

- trigger_id deduplication
- interaction_id for buttons/modals

### 15.2 Transaction Handling

**Atomic Operations:**

- Activate restriction + event in one transaction
- Override + hash chain + event in one transaction
- Config update + event in one transaction

---

## 16. Caching and Cache Invalidation

### 16.1 LISTEN/NOTIFY

Channels:

- restriction_changes: rules and active restrictions

On receive:

- Invalidate relevant cache keys
- Version check as fallback

### 16.2 Version Fallback

restriction_config.version incremented on any data change. Cache checks version every 5 seconds.

---

## 17. Security Considerations

### 17.1 Audit Integrity

- DB triggers reject UPDATE/DELETE on overrides and events
- Hash chain with deterministic ordering
- Daily automated chain verification
- Alert on chain breaks

### 17.2 Input Validation

- All scope values normalized (lowercase, trim)
- Format validation with regex
- Array length limits enforced

---

## 18. Performance Considerations

### 18.1 SLA Requirements

| Operation               | Budget |
| ----------------------- | ------ |
| Restriction check total | 50ms   |
| Single DB query         | 20ms   |
| Cache hit check         | 5ms    |

### 18.2 Optimization

- GIN indexes on scope arrays
- Partial indexes on common filters
- Connection pooling
- Query result caching with NOTIFY invalidation

---

## 19. Error Handling and Failure Modes

### 19.1 Failure Mode Configuration

| Risk Level | Default Mode     |
| ---------- | ---------------- |
| critical   | deny             |
| high       | require_override |
| medium     | require_override |
| low        | allow            |

### 19.2 Break-Glass for Deny Mode

Even "deny" mode has escape hatch via break-glass override with:

- Extended reason requirement
- Mandatory incident_mitigation category
- Immediate alerting

---

## 20. Observability and Monitoring

### 20.1 Metrics

- restriction_checks_total (by result, scope)
- override_total (by category)
- break_glass_total
- fail_mode_triggered_total (by mode)
- hash_chain_breaks_total
- evaluation_latency_seconds (histogram)

### 20.2 Alerts

**Immediate:**

- Break-glass override used
- Hash chain break detected
- DB errors > 1 minute

**Urgent:**

- Latency P99 > 100ms
- Override volume > 20/hour

---

## 21. Data Lifecycle and Governance

### 21.1 Retention

- Overrides: Indefinite
- Events: Indefinite
- Rules: Change history in events table
- Config: Version history in events table

### 21.2 restriction_events Benefits

Single source of truth for "what happened":

- No log stitching required
- Queryable via API
- Exportable for compliance
- Includes before/after state for changes

---

## 22. Testing Strategy

### 22.1 Unit Tests

- Action context builder
- Scope matching (all combinations)
- Wildcard matching
- Hash chain computation
- Policy constraint validation

### 22.2 Integration Tests

- Cross-entry-point consistency (Slack vs API vs CI)
- Hash chain verification
- Event recording
- Config updates

---

## 23. Migration Strategy

### 23.1 Phases

1. Database setup (tables, triggers, indexes)
2. Dual write
3. Read cutover
4. Cleanup

---

## 24. Rollout Plan

### 24.1 Phases

1. Foundation (Week 1): Database, store, action context
2. User Interfaces (Week 2): Slack, API
3. Override Flow (Week 3): Hash chain, events
4. Polish (Week 4): Config UI, dashboards
5. Deployment (Week 5): Staging, production

---

## 25. Operational Runbook

### 25.1 Hash Chain Verification

Daily automated verification:

```
GET /api/restrictions/overrides/verify?partition=2025-01-20
```

On failure: Alert fires, investigate for tampering.

### 25.2 Break-Glass Usage

When break-glass is used:

1. Alert fires
2. Investigate justification
3. Document in incident log
4. Review if policy change needed

---

## 26. Future Enhancements

### v3.2 Candidates (Near-Term)

**Scope Specificity Scoring:**
Compute specificity as count of non-empty scope dimensions. Display "Blocked by most specific rule first" for improved explainability.

**Soft-Deny Mode:**
Between `require_override` and `deny`: allow action but with loud alert + mandatory post-hoc justification within N hours. Useful for "we trust you but we're watching" scenarios.

**Event Correlation:**
Add `decision_id` to `restriction_events` for evaluation events, enabling full trace from check → block → override → action.

### v4.0 Candidates (Medium-Term)

- RBAC for rule management (who can create/edit/delete rules)
- Multi-user approval for overrides (second approver required)
- External integrations (PagerDuty auto-incident-mode, calendar-based freezes)
- Scheduled freezes (pre-schedule freeze for known events)
- "ALL tags required" matching mode (`tags_match_mode: "all"`)
- Per-tenant authorization boundaries
- Tag registry service for governance

---

## 27. Risks and Mitigations

| Risk                                     | Mitigation                           |
| ---------------------------------------- | ------------------------------------ |
| Inconsistent context across entry points | Shared buildActionContext helper     |
| Scope matching ambiguity                 | Explicit AND/OR semantics documented |
| Hash chain breaks                        | Alert + continue recording           |
| Deny mode blocks emergencies             | Break-glass override                 |
| Policy drift                             | Versioned config with events         |

---

## 28. Glossary

| Term            | Definition                                   |
| --------------- | -------------------------------------------- |
| Action Context  | Canonical shape for restriction checks       |
| Break-Glass     | Emergency override for deny mode             |
| Chain Partition | Day-based grouping for hash chain            |
| Scope Matching  | Determining if restriction applies to action |

---

## 29. Appendices

### Appendix A: TypeScript Type Definitions

**RestrictionActionContext:**

```typescript
interface RestrictionActionContext {
  // Required
  action_type: ActionType;
  environment: string;
  risk_level: "low" | "medium" | "high" | "critical";
  initiator: {
    user_id: string;
    source: "slack" | "api" | "ci" | "system";
  };
  request_id: string;
  timestamp: Date;

  // Optional
  repository?: string;
  service?: string;
  tenant_id?: string;
  tags?: string[];
  action_id?: string;
  change_target?: {
    type: string;
    id: string;
  };
  trace_id?: string;
}
```

**CheckRestrictionsResult:**

```typescript
interface CheckRestrictionsResult {
  decision_id: string;
  is_allowed: boolean;

  // What matched
  matched_rules: MatchedRule[];
  matched_active: MatchedActiveRestriction[];
  blockers: Blocker[];

  // Explainability
  explain_text: string;
  evaluation_latency_ms: number;

  // Context snapshot for audit
  // IMPORTANT: Stored verbatim, MUST NOT be recomputed or normalized post-evaluation
  // This preserves forensic integrity for compliance investigations
  context_snapshot: RestrictionActionContext;

  // Failure mode info (if applicable)
  failure_mode_applied?: "allow" | "require_override" | "deny";
  requires_override?: boolean;
  can_break_glass?: boolean;
}

interface MatchedRule {
  rule: RestrictionRule;
  match_result: ScopeMatchResult;
  schedule_match: ScheduleMatchResult;
}

interface ScopeMatchResult {
  matched: boolean;
  dimension_results: {
    environments: { matched: boolean; values: string[] };
    repositories: { matched: boolean; values: string[]; wildcard_used: boolean };
    services: { matched: boolean; values: string[]; wildcard_used: boolean };
    tenants: { matched: boolean; values: string[] };
    tags: { matched: boolean; overlapping: string[] };
  };
  match_reasons: string[];
}

interface Blocker {
  type: "rule" | "active_restriction";
  id: string;
  name: string;
  priority: number;
  severity: "info" | "warn" | "block";
  match_reasons: string[];
  activated_by?: string;
  expires_at?: Date;
}
```

**Override Input:**

```typescript
interface RecordOverrideInput {
  // From evaluation
  decision_id: string;
  restriction_id?: string;
  restriction_type: string;
  restriction_name: string;

  // Action context
  action_type: string;
  action_id?: string;
  environment: string;
  repository?: string;
  service?: string;
  risk_level: string;

  // Override details
  override_reason: string; // min 20 chars, max 16KB
  justification_category: JustificationCategory;
  ticket_ref?: string; // required for security, scheduled_exception
  is_break_glass: boolean;

  // User context
  overridden_by: string;
  slack_user_id?: string;
  slack_channel_id?: string;

  // Request context
  request_id: string;
  trace_id?: string;
  client_ip?: string;
  user_agent?: string;
  created_via: "slack" | "api";
}

type JustificationCategory =
  | "hotfix"
  | "security"
  | "incident_mitigation"
  | "rollback"
  | "scheduled_exception"
  | "other";
```

**Restriction Event:**

```typescript
interface RestrictionEvent {
  id: string;
  event_type: RestrictionEventType;
  event_timestamp: Date;

  actor_id: string;
  actor_source: "slack" | "api" | "ci" | "system";

  request_id?: string;
  trace_id?: string;

  entity_type: "rule" | "active_restriction" | "override" | "config";
  entity_id?: string;
  before_state?: Record<string, unknown>;
  after_state?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

type RestrictionEventType =
  | "rule_created"
  | "rule_updated"
  | "rule_enabled"
  | "rule_disabled"
  | "rule_deleted"
  | "restriction_activated"
  | "restriction_deactivated"
  | "restriction_expired"
  | "override_recorded"
  | "override_break_glass"
  | "evaluation_blocked"
  | "evaluation_allowed"
  | "fail_mode_triggered"
  | "cache_invalidated"
  | "config_updated"
  | "hash_chain_verified"
  | "hash_chain_break_detected";
```

### Appendix B: Scope Matching Examples

**Example 1: Production-Only Freeze**

- Rule: environments=["prod"], repositories=[]
- Action: environment="staging"
- Result: NO MATCH

**Example 2: Wildcard Repository**

- Rule: repositories=["org/*"]
- Action: repository="org/payments"
- Result: MATCH

**Example 3: Tag Overlap**

- Rule: tags=["critical", "pci"]
- Action: tags=["pci", "frontend"]
- Result: MATCH (overlap on "pci")

**Example 4: Multi-Dimension AND**

- Rule: environments=["prod"], services=["payments-*"]
- Action: environment="prod", service="billing-api"
- Result: NO MATCH (service doesn't match)

### Appendix C: Hash Chain Verification

```
For partition 2025-01-20:
1. Get all overrides ordered by (created_at, id)
2. First record: verify prev_hash = "GENESIS"
3. Each subsequent: verify prev_hash = previous.entry_hash
4. Verify prev_id chain matches ordering
5. Recompute each entry_hash and compare
6. Return: { valid: boolean, breaks: [], records_checked: N }
```

### Appendix D: Decision Log

| Decision                         | Rationale                                  | Version |
| -------------------------------- | ------------------------------------------ | ------- |
| Single Action Context            | Consistency across entry points            | v3.1    |
| AND across dimensions, OR within | Intuitive, auditable                       | v3.1    |
| Tags use ANY overlap             | Permissive default, stricter future option | v3.1    |
| Wildcards for repo/service only  | Environments need explicit control         | v3.1    |
| Break-glass for deny mode        | True emergencies need escape hatch         | v3.1    |
| Hash chain by day partition      | Balance chain length vs integrity          | v3.1    |
| restriction_events table         | Single audit source, no log stitching      | v3.1    |
| Versioned config                 | Safe policy changes                        | v3.1    |
| created_at from DB               | Deterministic ordering                     | v3.1    |

---

## Document History

| Version | Date     | Author      | Changes                                                                                                                                                                                                                                    |
| ------- | -------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1.0     | Jan 2025 | Engineering | Initial draft                                                                                                                                                                                                                              |
| 2.0     | Jan 2025 | Engineering | Comprehensive expansion                                                                                                                                                                                                                    |
| 3.0     | Jan 2025 | Engineering | Production hardening                                                                                                                                                                                                                       |
| 3.1     | Jan 2025 | Engineering | Action Context contract, scope semantics, restriction_events, hash chain determinism, policy constraints, break-glass, complete TypeScript types, allowed environments config, time-based override restrictions, tags ALL mode future spec |

---

## v3.1 Change Summary

**Action Context Contract:**

- Single canonical RestrictionActionContext shape
- Shared buildActionContext() helper mandatory for all entry points
- Risk level derived from action_type + environment
- Validation rules with allowed environment set

**Scope Matching Semantics:**

- Explicit AND/OR rules documented
- Tags: ANY overlap (with ALL mode as future option)
- Wildcards for repositories and services only
- Match result includes per-dimension details

**Restriction Events Table:**

- Append-only audit log
- Captures all events with before/after state
- No log stitching required for compliance

**Hash Chain Determinism:**

- Ordering by (chain_partition, created_at, id)
- Explicit prev_id field
- created_at from DB, not application
- Day-based partitioning

**Override Policy Enhancements:**

- Time-based override restrictions
- Configurable blocked override combinations
- Break-glass for deny mode
- Ticket reference required for security/scheduled_exception categories

**Configuration:**

- Versioned config with event tracking
- Allowed environments configurable
- Config changes produce restriction_events

**TypeScript Types:**

- Complete type definitions for all interfaces
- CheckRestrictionsResult with full explainability
- Override input with all constraints
- Event types enumeration

**Clarifications Added (Review Feedback):**

- Severity vs failure mode precedence (failure mode supersedes during system errors)
- Priority definition: lower numeric = higher precedence, ties by created_at
- Tag source of truth hierarchy (repo metadata → CI labels → explicit input)
- tenant_id semantics: participates in scope matching but no authorization boundaries
- checkRestrictions() is side-effect free (except event emission)
- Evaluation events: exactly one per check with decision_id
- context_snapshot immutability for forensic integrity
- Naming note: manual_override vs override records clarification

---

**Document Status: FROZEN**

This document is implementation-ready. Further design changes should target v3.2 or later.

---

_End of Document_

# KenchiOps Voice Guide (Canonical)

This document defines the reference style for KenchiOps CI failure analysis messages.
Use it for both Slack notifications and GitHub PR comments.

---

## Goals

- Calm, confident, non-alarmist.
- Skimmable first, deep on demand.
- Evidence-backed, not speculative.
- Opinionated prioritization, but no arrogance.
- Safe for enterprise audiences.

---

## Voice Principles

1. **Evidence first**: every claim must be anchored to observed evidence.
2. **One primary blocker**: identify the single top cause when possible.
3. **Secondary failures are optional**: cap to 1-2 clusters max.
4. **Be precise**: avoid generic "tests failed" unless no specifics exist.
5. **Be actionable**: fix order, not just a list.

---

## Evidence Rules (Non-Negotiable)

- No causal claim without evidence in the incident data.
- No new files, functions, or modules unless they appear verbatim in evidence.
- Do not claim "cascading failures" unless evidence explicitly shows dependency flow (see Cascading Evidence Requirements below).
- If evidence lists N failing suites/files, do not claim more than N.
- If evidence is weak or missing, explicitly say so and lower confidence.

### Cascading Evidence Requirements

Use "cascading" or "downstream" language ONLY when ONE of these conditions is met:

- Import chain visible in error (e.g., "Cannot find module X imported by Y")
- Same root error appearing in multiple test files with clear dependency
- Explicit stack trace showing call flow between modules
- Shared mock/fixture failure causing multiple test suites to fail

Otherwise, use "Related failures" or "Secondary clusters" instead.

---

## Evidence ID Format

Evidence IDs provide traceability from claims to source data. Use these formats:

| Format      | Source                      | Example     |
| ----------- | --------------------------- | ----------- |
| `[test#N]`  | Test failure from CI output | `[test#1]`  |
| `[anno#N]`  | GitHub check annotation     | `[anno#3]`  |
| `[log#N]`   | Workflow log excerpt        | `[log#2]`   |
| `[diff#N]`  | PR diff chunk               | `[diff#1]`  |
| `[check#N]` | Check run identifier        | `[check#2]` |

### When to Include Evidence IDs

**Always include:**

- Root cause claims
- First occurrence of each affected file
- Specific error quotes

**Omit when:**

- Listing files in "Affected Files" section (already grouped by evidence)
- Recommended actions (unless directly tied to specific evidence)

**Example usage:**

```
Issue: Mock not initialized [test#3]
Evidence: `actionHandler.test.ts:101` [test#3]
Error: "jest.useFakeTimers was not called" [test#3]
```

---

## Confidence Scoring

### Calculation

Base confidence = weighted average of:

- LLM analysis confidence (40%)
- Evidence quality score (30%)
- Action specificity score (30%)

### Adjustments

| Condition                               | Adjustment |
| --------------------------------------- | ---------- |
| Clear primary blocker identified        | +10%       |
| Single service affected                 | +5%        |
| Multi-service spread (3+ services)      | -15%       |
| Missing file/line info                  | -15%       |
| Generic error messages only             | -20%       |
| Infrastructure failures mixed with code | -10%       |

### Thresholds

| Score  | Label  | Phrase to Use        |
| ------ | ------ | -------------------- |
| >= 70% | High   | "high certainty"     |
| 40-69% | Medium | "moderate certainty" |
| < 40%  | Low    | "low certainty"      |

### When to Downgrade Confidence

Set confidence to "low certainty" when:

- Evidence is generic or missing ("tests failed" only)
- File paths or line numbers are missing
- Multiple unrelated failures with no clear primary blocker
- Infrastructure failures obscure root cause
- Flaky test history detected

---

## Failure Classification

Separate infrastructure failures from code failures in analysis.

### Infrastructure Failures

Display separately at the top when detected:

```
!! Infrastructure Issues (2)
- Runner OOM killed after 15min [log#1]
- Connection timeout to test database [log#3]
```

**Infrastructure patterns:**

- OOM killed, memory exhaustion
- Timeout exceeded, deadline exceeded
- Runner crash, worker terminated
- Network/DNS failures
- Resource exhaustion (disk, CPU)
- Docker/container failures

### Code Failures

Main analysis focuses on code failures:

- Assertion failures
- Type errors
- Missing mocks/imports
- Test logic errors

**Do not mix** infrastructure issues into root cause analysis. If infra issues exist, note them separately and adjust confidence accordingly.

---

## Flaky Test Detection

When the same test fails intermittently across recent runs, flag it:

```
!! Possibly Flaky
- `integrationTest.test.ts:42` - failed 2/5 recent runs
- Consider: retry logic, async race condition, or external dependency
```

### Flaky Test Rules

- Do NOT attribute as primary blocker unless fails consistently (3+ consecutive runs)
- Do NOT attribute if error message varies between runs
- DO mention in secondary findings with context
- DO suggest investigation if pattern is unclear

---

## Service Naming Convention

Use consistent naming across all contexts:

| Context        | Format             | Example                      |
| -------------- | ------------------ | ---------------------------- |
| Headers/labels | kebab-case         | `slack-bot`                  |
| Prose text     | Title Case         | "Slack Bot"                  |
| File paths     | Full relative path | `services/slack-bot/src/...` |
| Grouping keys  | kebab-case         | `slack-bot (3 files)`        |

**Service extraction from paths:**

- `services/slack-bot/...` -> `slack-bot`
- `services/github-app/...` -> `github-app`
- `services/api/...` -> `api`
- `packages/shared/...` -> `shared`

---

## Error Message Normalization

Clean up error messages before display.

### Strip from output

- "FAIL" / "PASS" prefixes
- ANSI color codes
- Absolute file paths (convert to relative)
- Stack frame numbers and repetitive frames
- "at Object.<anonymous>" lines (keep first only)
- Code frame line numbers (e.g., `> 42 |`)
- Jest diff markers (`- Expected`, `+ Received` headers)

### Keep intact

- Assertion text ("Expected X, received Y")
- First meaningful stack frame with file:line
- Error type (TypeError, AssertionError, etc.)
- Actual vs expected values (truncated if >100 chars)

### Example transformation

**Before:**

```
FAIL src/__tests__/handler.test.ts
  - Test suite failed to run
    TypeError: Cannot read property 'mock' of undefined
      at Object.<anonymous> (/home/user/project/src/__tests__/handler.test.ts:42:15)
      at Object.<anonymous> (/home/user/project/node_modules/jest/build/index.js:123:45)
```

**After:**

```
TypeError: Cannot read property 'mock' of undefined
  at handler.test.ts:42
```

---

## Truncation & Length Limits

### Section Limits

| Section           | Limit          | Overflow handling          |
| ----------------- | -------------- | -------------------------- |
| At a Glance       | 3 bullets max  | Prioritize by severity     |
| Root causes       | 3 clusters max | Show top 3 by file count   |
| Files per service | 5 files max    | "...and N more"            |
| Total files shown | 15 files max   | Prioritize by service size |
| Recommended steps | 5 steps max    | Combine related steps      |
| Error message     | 150 chars max  | Truncate with "..."        |

### Message Length Variants

**Compact** (5 or fewer failures, single service):

- Skip "At a Glance" section
- Inline root cause with affected files
- Target: 20 lines or fewer

**Standard** (6-20 failures, 2-3 services):

- Full template as documented
- Target: 50 lines or fewer

**Expanded** (20+ failures, 4+ services):

- Add "View Full Report" link
- Main message shows top 3 services only
- Target: 60 lines or fewer

---

## Action Specificity Guidelines

### Include code snippets when

- Fix is a single line or small block
- Pattern is clear and repeatable
- File path and location are known
- No ambiguity in implementation

**Example (specific):**

```
Step 1 - Enable fake timers
// services/slack-bot/src/__tests__/actionHandler.test.ts
beforeEach(() => {
  jest.useFakeTimers();
});
```

### Use prose when

- Fix requires investigation or judgment
- Multiple valid approaches exist
- Context-dependent decision needed
- File/location unknown

**Example (prose):**

```
Step 2 - Review AI prompt changes
Check recent modifications to prompt templates and update test
fixtures to match new output format, or revert if unintended.
```

### Action priority markers

Use these consistently:

- **Critical** - Blocks all other fixes
- **High** - Should fix before re-running CI
- **Medium** - Can fix after primary issues resolved

---

## Recommended Areas to Review (Format)

Use this section name instead of "Recommended Actions" when presenting review-oriented guidance.

**Rules:**

- No checkboxes.
- Each item has a short **title** line and a **detail** line.
- Prefix the title with the priority emoji.
- Include the service prefix in the title when available (e.g., `[api]`).
- Detail line should use the full action sentence and append reasoning when provided.
- Keep the list to 5 items max. Slack may truncate long lines; GitHub should show full text.

**GitHub example:**

```
## 🛠️ Recommended Areas to Review

1. **🟠 [api] Dependency changes in auth flow**
   Review dependency changes for auth flow. Conflicts appeared after the lockfile update.
```

**Slack example:**

```
*🛠️ Recommended Areas to Review*
1. *🟠 [api] Dependency changes in auth flow*
   Review dependency changes for auth flow. Conflicts appeared after the lockfile update.
```

---

## PR Context Integration

When PR context is available, incorporate:

### Changed Files Correlation

```
PR Context
- 3 of 12 failing files were modified in this PR
- Modified: `handler.ts`, `service.ts` (both have failing tests)
```

### Base Branch Comparison

```
Note: 2 failures also exist on `main` branch (not introduced by this PR)
```

### Related Issues

If commit message references issues:

```
Related: #123, #456
```

---

## Canonical Structure

1. **Header** (commit, branch, checks, suites, services, confidence)
2. **Infrastructure Issues** (if any - displayed first)
3. **At a Glance** (1-3 bullets, primary + secondary)
4. **Root Cause Analysis** (primary + 1-2 secondary clusters)
5. **Affected Files** (grouped by service, top N per service)
6. **Recommended Fix Order** (opinionated, prioritized steps)
7. **Learning Loop** (feedback buttons + fix follow-up prompt)

---

## Slack Template (Canonical)

````
KenchiOps CI Failure Analysis

**Commit:** `{{short_sha}}`
**Branch:** `{{branch}}` -> `{{base_branch}}`
**Failed Checks:** {{check_count}}
**Test Suites Failed:** {{suite_count}}
**Services Affected:** {{service_count}}
**Overall Confidence:** {{confidence_percent}}% ({{confidence_label}})

{{#if infra_issues}}
!! *Infrastructure Issues ({{infra_count}})*
{{#each infra_issues}}
- {{this.summary}} [{{this.evidence_id}}]
{{/each}}

---
{{/if}}

## What Failed (At a Glance)
- *Primary:* {{primary_blocker_summary}}
{{#if secondary_1}}
- *Secondary:* {{secondary_summary_1}}
{{/if}}
{{#if secondary_2}}
- *Secondary:* {{secondary_summary_2}}
{{/if}}

## Root Cause Analysis

*1. Primary Root Cause (Fix First)*
**Service:** `{{primary.service}}`
**Issue:** {{primary.issue_summary}}
**Evidence:** `{{primary.file}}:{{primary.line}}` [{{primary.evidence_id}}]
**Error:** "{{primary.error_snippet}}"

{{#if secondary_cluster}}
*2. Secondary Cluster*
**Service:** `{{secondary.service}}`
**Issue:** {{secondary.issue_summary}}
**Evidence:** `{{secondary.file}}:{{secondary.line}}` [{{secondary.evidence_id}}]
{{/if}}

## Affected Files (Grouped)

{{#each services}}
*{{this.name}}* ({{this.file_count}} files)
{{#each this.files}}
- x `{{this.path}}`
{{/each}}
{{#if this.remaining}}
- ...and {{this.remaining}} more
{{/if}}

{{/each}}

## Recommended Fix Order

{{#each actions}}
{{this.index}}. {{this.priority}} {{this.description}}
{{#if this.code_snippet}}
```{{this.language}}
{{this.code_snippet}}
````

{{/if}}
{{/each}}

---

_Learning Loop_
Was this analysis helpful? Yes | No

_When you resolve this, reply with what worked. KenchiOps learns from confirmed fixes._

````

---

## GitHub PR Comment Template (Canonical)

```markdown
## KenchiOps CI Failure Analysis

| Field | Value |
|-------|-------|
| **Commit** | `{{short_sha}}` |
| **Branch** | `{{branch}}` -> `{{base_branch}}` |
| **Failed Checks** | {{check_count}} |
| **Test Suites Failed** | {{suite_count}} |
| **Services Affected** | {{service_count}} |
| **Overall Confidence** | {{confidence_percent}}% ({{confidence_label}}) |

{{#if infra_issues}}
> !! **Infrastructure Issues Detected**
> {{#each infra_issues}}
> - {{this.summary}} `[{{this.evidence_id}}]`
> {{/each}}
{{/if}}

### What Failed (At a Glance)

- **Primary:** {{primary_blocker_summary}}
{{#if secondary_1}}
- **Secondary:** {{secondary_summary_1}}
{{/if}}
{{#if secondary_2}}
- **Secondary:** {{secondary_summary_2}}
{{/if}}

### Root Cause Analysis

#### 1. Primary Root Cause (Fix First)

| | |
|---|---|
| **Service** | `{{primary.service}}` |
| **Issue** | {{primary.issue_summary}} |
| **Evidence** | `{{primary.file}}:{{primary.line}}` `[{{primary.evidence_id}}]` |
| **Error** | `{{primary.error_snippet}}` |

{{#if secondary_cluster}}
#### 2. Secondary Cluster

| | |
|---|---|
| **Service** | `{{secondary.service}}` |
| **Issue** | {{secondary.issue_summary}} |
| **Evidence** | `{{secondary.file}}:{{secondary.line}}` `[{{secondary.evidence_id}}]` |
{{/if}}

### Affected Files (Grouped)

{{#each services}}
<details>
<summary><strong>{{this.name}}</strong> ({{this.file_count}} files)</summary>

{{#each this.files}}
- x `{{this.path}}`
{{/each}}
{{#if this.remaining}}
- ...and {{this.remaining}} more
{{/if}}

</details>
{{/each}}

### Recommended Fix Order

{{#each actions}}
{{this.index}}. {{this.priority}} **{{this.title}}**
   {{this.description}}
{{#if this.code_snippet}}
   ```{{this.language}}
   {{this.code_snippet}}
````

{{/if}}
{{/each}}

---

<sub>**Learning Loop** - Was this helpful? React with thumbs up or down | Reply with your fix to help KenchiOps learn</sub>

```

---

## Reference Example (Standard Format)

This example demonstrates the canonical format with a real-world scenario.

```

KenchiOps CI Failure Analysis

**Commit:** `abfe675`
**Branch:** `feat/rag-implementation` -> `main`
**Failed Checks:** 2
**Test Suites Failed:** 12
**Services Affected:** 4
**Overall Confidence:** 49% (moderate certainty)

## What Failed (At a Glance)

- _Primary:_ Slack Bot tests failing due to missing fake timers setup
- _Secondary:_ AI prompt/extraction tests failing due to contract drift
- _Secondary:_ Downstream service tests asserting against outdated outputs

## Root Cause Analysis

_1. Primary Root Cause (Fix First)_
**Service:** `slack-bot`
**Issue:** Jest fake timers not enabled before timer-dependent tests
**Evidence:** `actionHandler.test.ts:101` [test#1]
**Error:** "A function to advance timers was called but the timers APIs are not replaced with fake timers"

This is a hard blocker. Enabling fake timers in the Slack Bot test setup should resolve these errors and unblock dependent tests.

_2. AI Contract Drift_
**Service:** `shared`
**Issue:** AI behavior or prompt contracts changed without updating test fixtures
**Evidence:** `multiLanguageFixtures.test.ts:45` [test#12]

Affected areas:

- `openaiClient/multiLanguageFixtures.test.ts`
- `integrations/prompts.test.ts`
- `rag/costControls.test.ts`

Common patterns: expected fields missing/renamed, prompt output text mismatches.

_3. Related Failures (Resolve After Above)_
**Services:** `github-app`, `api`
**Issue:** Downstream assertions on outdated AI outputs or log formats

These should resolve after fixing the primary blocker and AI contract issues.

## Affected Files (Grouped)

_slack-bot_ (3 files)

- x `actionHandler.test.ts`
- x `index.test.ts`
- x `feedbackHandler.test.ts`

_shared_ (4 files)

- x `openaiClient/multiLanguageFixtures.test.ts`
- x `integrations/prompts.test.ts`
- x `rag/costControls.test.ts`
- x `rag/search.test.ts`

_github-app_ (4 files)

- x `logParser.test.ts`
- x `apiRoutes.test.ts`
- x `webhookRoutes.test.ts`
- x `pullRequestHandler.test.ts`

_api_ (1 file)

- x `analysisService.test.ts`

## Recommended Fix Order

1. **Critical** **Enable fake timers in Slack Bot tests**

   ```typescript
   // services/slack-bot/src/__tests__/actionHandler.test.ts
   beforeEach(() => {
     jest.useFakeTimers();
   });
   ```

2. **High** **Align AI test fixtures with current behavior**
   Review recent changes to prompts and extraction logic. Update test fixtures to match new AI output format, or revert changes if drift was unintended.

3. **High** **Re-run CI before fixing downstream tests**
   Many failures in `github-app` and `api` will likely resolve once the above issues are fixed.

4. **Medium** **Address remaining failures**
   After re-run, fix any tests still failing in downstream services.

---

_Learning Loop_
Was this analysis helpful? Yes | No

_When you resolve this, reply with what worked. KenchiOps learns from confirmed fixes._

```

---

## Compact Format Example

Use when 5 or fewer failures in a single service.

```

KenchiOps CI Failure Analysis

**Commit:** `abc1234` | **Branch:** `fix/auth-bug` -> `main`
**Failed:** 1 check, 2 tests | **Confidence:** 85% (high certainty)

**Root Cause:** Missing mock for `AuthService` in handler tests

x `authHandler.test.ts:42` - "Cannot read property 'verify' of undefined" [test#1]
x `authHandler.test.ts:67` - "Expected mock to be called" [test#2]

**Fix:**

```typescript
// services/api/src/__tests__/authHandler.test.ts
jest.mock("../services/AuthService");
```

---

Helpful? | Reply with your fix

```

---

## Do / Do Not

### Do

- Lead with the primary blocker
- Keep each section short and structured
- Tie every claim to evidence with IDs
- Use confidence language consistently
- Separate infrastructure from code failures
- Provide specific code snippets when fix is clear
- Group files by service consistently

### Do Not

- Invent causes, files, or functions not in evidence
- Claim "cascading" without dependency evidence
- Overload output with raw logs or stack traces
- List more services/files than evidence supports
- Mix infrastructure issues into root cause
- Use vague actions ("fix the tests")
- Exceed section length limits

---

## Symbol Reference

Use consistently across all messages:

| Symbol | Usage |
|--------|-------|
| !! | Infrastructure issues / Warnings |
| x | Failed file/test |
| (checkmark) | Passed / Fixed |
| **Critical** | Critical priority |
| **High** | High priority |
| **Medium** | Medium priority |

---

## Optional: Deep Dive Link

For complex failures exceeding message limits, add a link to full details:

```

[View Full Report]({{report_url}}) - Complete analysis with all {{total_failures}} failures

```

Keep the main message compact and focused on actionable items.
```

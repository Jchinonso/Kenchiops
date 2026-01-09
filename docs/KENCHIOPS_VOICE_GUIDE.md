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
- Do not claim "cascading failures" unless evidence explicitly shows dependency flow.
- If evidence lists N failing suites/files, do not claim more than N.
- If evidence is weak or missing, explicitly say so and lower confidence.

---

## Confidence Language

Use these exact phrases:

- **High**: "high certainty"
- **Medium**: "moderate certainty"
- **Low**: "low certainty"

Never overstate. If evidence is partial, say so.

---

## Canonical Structure

1. **Header** (commit, branch, checks, suites, services, confidence)
2. **At a Glance** (1-3 bullets)
3. **Root Cause** (primary + 1-2 secondary clusters)
4. **Affected Files** (grouped, top N per service)
5. **Recommended Fix Order** (opinionated steps)
6. **Learning Loop** (feedback + fix follow-up)

---

## Formatting Rules

- Always lead with the single most important blocker.
- Prefer short paragraphs + bullets over long prose.
- Cap root cause entries to 3-5 lines total.
- Use service grouping labels consistently.
- Do not include stack traces or full logs in the main message.
- Keep assertions intact, but strip boilerplate ("FAIL", "PASS", code-frame numbers).
- Use evidence IDs only where they add trust (root cause + first occurrence per file).

---

## Slack Template (Canonical)

```
🤖 KenchiOps CI Failure Analysis

Commit: `{{short_sha}}`
Branch: `{{branch}}` → `{{base_branch}}`
Failed Checks: {{check_count}}
Test Suites Failed: {{suite_count}}
Services Affected: {{service_count}}
Overall Confidence: {{confidence_percent}}% ({{confidence_label}})

> KenchiOps analyzed the failed CI run using test output and evidence.
> Below is a prioritized diagnosis with recommended next steps.

## 🔍 What Failed (At a Glance)
- Primary blocker: {{primary_blocker_summary}}
- Secondary: {{secondary_summary_1}}
- Secondary: {{secondary_summary_2}}

## 🧠 Root Cause Analysis
### 1) Primary Root Cause (Fix First)
Service: `{{service}}`
Issue: {{issue_summary}}
Evidence: {{file_line}}
Error: "{{error_line}}"

### 2) Secondary Cluster (If Evidence Exists)
Service: `{{service}}`
Issue: {{issue_summary}}
Evidence: {{file_line}}

## 📂 Affected Files (Grouped)
### `{{service}}` ({{file_count}} files)
- {{file_1}}
- {{file_2}}
- ...and {{remaining_count}} more

## 🛠️ Recommended Fix Order
1. {{step_1}}
2. {{step_2}}
3. {{step_3}}

## 🔄 Learning Loop
Was this analysis helpful? 👍 Yes | 👎 No
When you resolve this, reply with what worked.
```

---

## GitHub PR Comment Template (Canonical)

```
## 🤖 KenchiOps CI Failure Analysis

**Commit:** `{{short_sha}}`
**Branch:** `{{branch}}` → `{{base_branch}}`
**Failed Checks:** {{check_count}}
**Test Suites Failed:** {{suite_count}}
**Services Affected:** {{service_count}}
**Overall Confidence:** {{confidence_percent}}% ({{confidence_label}})

> KenchiOps analyzed the failed CI run using test output and evidence.
> Below is a prioritized diagnosis with recommended next steps.

### 🔍 What Failed (At a Glance)
- Primary blocker: {{primary_blocker_summary}}
- Secondary: {{secondary_summary_1}}
- Secondary: {{secondary_summary_2}}

### 🧠 Root Cause Analysis
**1) Primary Root Cause (Fix First)**
- **Service:** `{{service}}`
- **Issue:** {{issue_summary}}
- **Evidence:** {{file_line}}
- **Error:** "{{error_line}}"

**2) Secondary Cluster (If Evidence Exists)**
- **Service:** `{{service}}`
- **Issue:** {{issue_summary}}
- **Evidence:** {{file_line}}

### 📍 Affected Files (Grouped)
**{{service}}** ({{file_count}} files)
- `{{file_1}}`
- `{{file_2}}`
- ...and {{remaining_count}} more

### 🛠️ Recommended Fix Order
1. {{step_1}}
2. {{step_2}}
3. {{step_3}}

---
Was this analysis helpful? 👍 Yes | 👎 No

💡 *When you resolve this, reply with what worked. KenchiOps learns from confirmed fixes.*
```

---

## Reference Example (Narrative Style)

Use this when evidence supports a single primary blocker with secondary clusters.
Keep the tone calm, opinionated, and evidence-backed.

```
🤖 KenchiOps CI Failure Analysis

Commit: abfe675
Branch: feat/rag-implementation → main
Failed Checks: 2
Test Suites Failed: 12
Services Affected: 4
Overall Confidence: 49% (moderate certainty)

KenchiOps analyzed the failed CI run by correlating test output, recent code changes,
and known failure patterns. This approach surfaces the real cause behind symptomatic
failures, giving KenchiOps a distinct advantage beyond a typical test report.
Below is a prioritized diagnosis with recommended next steps.

🔍 What Failed (At a Glance)
This CI failure is driven by one primary blocker with multiple cascading test failures
across shared AI logic and downstream services.

Primary Blocker
- Slack Bot tests are advancing timers without fake timers enabled.

Cascading Effects
- AI prompt and extraction tests failing due to contract drift.
- Downstream services asserting against outdated AI outputs.
- API and GitHub App tests failing as a result.

🧠 Root Cause Analysis
1️⃣ Primary Root Cause (Fix First)
Service: services/slack-bot
Issue: Jest fake timers not enabled
Evidence:
- actionHandler.test.ts:101
Error:
"A function to advance timers was called but the timers APIs are not replaced with fake timers"

This is a hard failure and blocks multiple dependent tests. Enabling fake timers in the
Slack Bot test setup should resolve these errors and prevent others from cascading.

2️⃣ AI Contract Drift Detected
Package: packages/shared

Several tests indicate that AI behavior or prompt contracts have changed, but fixtures and
expectations were not updated to match the new behavior.

Affected areas:
- openaiClient/multiLanguageFixtures.test.ts
- integrations/prompts.test.ts
- rag/costControls.test.ts
- rag/search.test.ts

Common patterns:
- Expected structured fields missing or renamed
- Prompt output text no longer matching strict substrings
- Cost tier logic returning STANDARD instead of LIGHT

This strongly suggests an intentional AI logic change (or prompt update) that has not been
reflected in test fixtures. It is causing multiple tests to fail due to mismatched expectations.

3️⃣ Downstream Assertion Failures
These failures are likely secondary and should not be addressed until the above issues are resolved.

Affected services:
- services/github-app
- services/api

Symptoms:
- Log parser expectations mismatched
- API analysis assertions failing
- Webhook and PR handler tests failing

Once the primary blocker and AI contract issues are fixed, many of these downstream errors
should resolve on their own. They mostly indicate that downstream code was asserting on
outdated AI outputs or log formats.

📂 Affected Files (Grouped)
services/slack-bot (3 files)
- ❌ actionHandler.test.ts
- ❌ index.test.ts
- ❌ feedbackHandler.test.ts

packages/shared (4 files)
- ❌ openaiClient/multiLanguageFixtures.test.ts
- ❌ integrations/prompts.test.ts
- ❌ rag/costControls.test.ts
- ❌ rag/search.test.ts

services/github-app (4 files)
- ❌ logParser.test.ts
- ❌ apiRoutes.test.ts
- ❌ webhookRoutes.test.ts
- ❌ pullRequestHandler.test.ts

services/api (1 file)
- ❌ analysisService.test.ts

🛠️ Recommended Fix Order (Opinionated)

Step 1 — Fix the Hard Blocker
// services/slack-bot/src/tests/actionHandler.test.ts
jest.useFakeTimers();

Enable fake timers in the Slack Bot test setup. This should immediately reduce noise and
unblock timer-dependent tests.

Step 2 — Decide on AI Contract Intent
Review recent changes to:
- Prompts (output format or wording)
- Extraction logic (fields extracted from AI responses)
- Cost tier selection logic

Then choose one:
- ✅ Update test fixtures and expectations to match the new AI behavior
- ❌ Revert the AI-related changes if the drift was unintended or premature

Either way, ensure tests and code are in sync regarding AI outputs.

Step 3 — Re-run CI
Run the test suite again before fixing anything in downstream services. Many failing
tests will likely pass once the Slack Bot timer issue and AI contract mismatches are addressed.

Step 4 — Address Remaining Failures (If Any)
After the above fixes, focus on any tests still failing in downstream areas:
- services/github-app (log parser, webhook tests)
- services/api (analysis service tests)

🤖 KenchiOps Summary (Human Take)
If this were my PR, I would:
- Enable fake timers in Slack Bot tests
- Confirm whether AI output changes were intentional
- Update shared test fixtures (or revert changes) accordingly
- Re-run CI before touching GitHub App or API tests

Most likely, this will clear up the majority of failures. Any stragglers can be fixed next.

🔄 Learning Loop
Was this analysis helpful?
👍 Yes    👎 No

💡 When you resolve this, reply with what worked. KenchiOps learns from confirmed fixes.
```

---

## Do / Do Not

**Do**

- Lead with the primary blocker.
- Keep each section short and structured.
- Tie actions to evidence.
- Use confidence language consistently.

**Do Not**

- Invent causes, files, or functions.
- Claim dependencies without evidence.
- Overload output with raw logs.
- List more services/files than the evidence supports.

---

## When to Downgrade Confidence

Set confidence to "low certainty" when:

- Evidence is generic or missing ("tests failed" only).
- File paths or line numbers are missing.
- Multiple unrelated failures with no clear primary blocker.

---

## Optional Deep Dive (Future)

If a deeper view is needed, add a "Details" link to a full log view.
Keep the main message compact and focused.

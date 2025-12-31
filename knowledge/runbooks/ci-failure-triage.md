# CI Failure Triage Runbook

## Overview

This runbook provides step-by-step guidance for triaging CI/CD pipeline failures detected by Kenchi.

## Prerequisites

- Access to GitHub repository
- Access to CI logs (GitHub Actions, CircleCI, etc.)
- Slack channel notifications enabled

## Triage Steps

### Step 1: Identify Failure Type

Check the failure category from Kenchi's analysis:

| Category        | Common Causes                                   | Priority |
| --------------- | ----------------------------------------------- | -------- |
| Test Failure    | Code logic error, flaky test, environment issue | High     |
| Build Failure   | Syntax error, missing dependency, config issue  | Critical |
| Lint/Type Error | Code style violation, type mismatch             | Medium   |
| Timeout         | Resource exhaustion, infinite loop, slow tests  | High     |

### Step 2: Review Kenchi Analysis

1. Check the confidence score:
   - **>85%**: High confidence - likely accurate root cause
   - **70-85%**: Medium confidence - verify before acting
   - **<70%**: Low confidence - manual investigation needed

2. Review suggested actions and their safety levels:
   - **Safe**: Can be executed automatically
   - **Needs Review**: Requires human approval
   - **Manual Only**: Must be done by engineer

### Step 3: Examine the Diff

1. Navigate to the PR or commit that triggered the failure
2. Review files changed, focusing on:
   - Test files modified
   - Configuration changes
   - Dependency updates
   - New code paths

### Step 4: Check CI Logs

1. Download or view raw CI logs
2. Search for error patterns:
   - Stack traces
   - Assertion failures
   - Timeout messages
   - Memory/resource errors

### Step 5: Determine Root Cause

Common root causes by failure type:

**Test Failures:**

- Assertion mismatch due to code change
- Missing mock or fixture
- Race condition in async tests
- Environment variable not set

**Build Failures:**

- TypeScript/compilation errors
- Missing imports
- Circular dependencies
- Incompatible dependency versions

**Timeout Failures:**

- Infinite loops in new code
- Database connection issues
- External API slowness
- Resource contention

### Step 6: Take Action

Based on root cause:

1. **Code Bug**: Create fix PR, link to original failure
2. **Flaky Test**: Mark as flaky, create ticket for stabilization
3. **Infrastructure**: Escalate to platform team
4. **Configuration**: Update CI config, re-run pipeline

## Escalation Path

| Severity                      | Response Time | Escalate To      |
| ----------------------------- | ------------- | ---------------- |
| Critical (production blocked) | 15 minutes    | On-call engineer |
| High (main branch broken)     | 1 hour        | Team lead        |
| Medium (feature branch)       | 4 hours       | PR author        |
| Low (non-blocking)            | 24 hours      | Backlog          |

## Related Documents

- [Flaky Test Investigation](./flaky-test-investigation.md)
- [Build Failure Recovery](./build-failure-recovery.md)
- [CI Timeout Troubleshooting](../troubleshooting/ci-timeout.md)

## Revision History

| Date       | Author        | Changes               |
| ---------- | ------------- | --------------------- |
| 2024-01-15 | DevOps Team   | Initial version       |
| 2024-03-01 | Platform Team | Added timeout section |

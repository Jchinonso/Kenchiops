# Flaky Test Investigation Runbook

## Overview

Flaky tests are tests that pass and fail intermittently without code changes. This runbook helps identify and resolve flaky tests detected through CI monitoring.

## Identification

### Signs of Flaky Tests

1. Same test fails on retry without code changes
2. Test passes locally but fails in CI
3. Test fails only on specific CI runners
4. Inconsistent failure messages

### Kenchi Detection

Kenchi identifies potential flaky tests by:

- Tracking test failure history across runs
- Detecting retry-success patterns
- Analyzing timing variations
- Correlating with infrastructure metrics

## Investigation Steps

### Step 1: Gather Evidence

```bash
# Check test history (last 10 runs)
gh run list --workflow=test.yml --limit=10

# Get failure rate
grep -r "FAILED" ci-logs/ | wc -l
```

### Step 2: Categorize the Flakiness

| Category        | Symptoms                 | Root Cause                    |
| --------------- | ------------------------ | ----------------------------- |
| Timing          | Fails under load         | Race conditions, timeouts     |
| Order Dependent | Fails in full suite      | Shared state, missing cleanup |
| Resource        | Fails on specific runner | Memory, disk, network         |
| External        | Intermittent API calls   | External service instability  |

### Step 3: Reproduce Locally

```bash
# Run test in isolation
npm test -- --testPathPattern="flaky-test-name"

# Run multiple times
for i in {1..10}; do npm test -- --testPathPattern="flaky-test-name"; done

# Run with timing stress
npm test -- --testPathPattern="flaky-test-name" --runInBand
```

### Step 4: Apply Fix

**For Race Conditions:**

```typescript
// Bad: No wait
expect(element).toBeVisible();

// Good: Wait for condition
await waitFor(() => expect(element).toBeVisible());
```

**For Shared State:**

```typescript
// Add proper cleanup
afterEach(() => {
  jest.clearAllMocks();
  cleanup();
});
```

**For Timeouts:**

```typescript
// Increase timeout for slow operations
it("should complete async operation", async () => {
  // ...
}, 30000); // 30 second timeout
```

## Resolution Workflow

1. **Quarantine**: Mark test as flaky in CI config
2. **Investigate**: Follow steps above
3. **Fix**: Apply appropriate solution
4. **Validate**: Run 50+ times to confirm stability
5. **Restore**: Remove quarantine flag

## Metrics to Track

- Flaky test count per repository
- Mean time to resolution
- Flakiness rate trend
- CI reliability score

## Related Documents

- [CI Failure Triage](./ci-failure-triage.md)
- [Test Best Practices](../internal/testing-guidelines.md)

# Known Issue: Jest Memory Leak in Large Test Suites

## Issue ID

KI-2024-001

## Status

**Open** - Workaround Available

## Summary

Jest test suites with more than 500 tests may experience memory exhaustion, causing CI failures with `JavaScript heap out of memory` errors.

## Symptoms

- CI job fails with exit code 137 (OOM killed)
- Error message: `FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed - JavaScript heap out of memory`
- Memory usage grows linearly during test run
- Tests pass when run in smaller batches

## Affected Versions

- Jest 29.x
- Node.js 18.x, 20.x
- Primarily affects: `services/api`, `packages/shared`

## Root Cause

Jest's default test isolation creates new VM contexts for each test file. Combined with:

1. Large test suites (500+ tests)
2. Heavy mock usage
3. Snapshot testing
4. React component rendering

This leads to memory not being properly garbage collected between tests.

## Workarounds

### Option 1: Increase Node Memory (Quick Fix)

```yaml
# In CI workflow
- run: NODE_OPTIONS="--max-old-space-size=4096" npm test
```

### Option 2: Run Tests in Batches

```yaml
# Split test runs
- run: npm test -- --shard=1/3
- run: npm test -- --shard=2/3
- run: npm test -- --shard=3/3
```

### Option 3: Use --runInBand for Large Suites

```bash
# Slower but more memory efficient
npm test -- --runInBand
```

### Option 4: Worker Pool Configuration

```javascript
// jest.config.js
module.exports = {
  maxWorkers: 2, // Reduce parallel workers
  workerIdleMemoryLimit: "512MB", // Jest 29+
};
```

## Detection by Kenchi

Kenchi identifies this issue when:

- Exit code is 137 or 134
- Logs contain "heap out of memory"
- Test count exceeds 400
- Memory metrics show linear growth

## Permanent Fix Status

Waiting for Jest team to address in v30:

- GitHub Issue: jest-community/jest#12345
- Expected in: Jest 30.0 (Q2 2024)

## Impact Assessment

| Metric                   | Value                    |
| ------------------------ | ------------------------ |
| Frequency                | ~5% of large test suites |
| Severity                 | Medium                   |
| Workaround Effectiveness | 95%                      |

## Related Issues

- [Jest GitHub Issue #12345](https://github.com/facebook/jest/issues/12345)
- [Node.js Memory Management](https://nodejs.org/docs/latest/api/cli.html#--max-old-space-sizesize-in-megabytes)

## Revision History

| Date       | Update                        |
| ---------- | ----------------------------- |
| 2024-01-10 | Issue documented              |
| 2024-01-20 | Added workaround options      |
| 2024-02-15 | Updated with Kenchi detection |

## Tags

`jest` `memory-leak` `oom` `testing` `ci-failure`

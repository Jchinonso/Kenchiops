/**
 * Unit tests for formatting/testSummaryParser.ts
 *
 * Tests deterministic regex-based test summary parsing from CI runner output.
 * Covers Jest/Vitest, pytest, Rust/cargo, Go, and generic patterns.
 */
import { describe, it, expect } from "@jest/globals";
import { parseTestSummary } from "../../formatting/testSummaryParser.js";
import type { ParsedTestSummary } from "../../formatting/extraction/types.js";

describe("parseTestSummary", () => {
  // ==================== Jest/Vitest Parser ====================

  describe("Jest/Vitest parser", () => {
    it("should parse standard Jest output with failed and passed counts", () => {
      const log = `
FAIL src/components/Button.test.tsx
  Button
    ✕ should render correctly (15 ms)
    ✕ should handle click events (8 ms)

PASS src/utils/helpers.test.ts

Test Suites:  1 failed, 1 passed, 2 total
Tests:        2 failed, 5 passed, 7 total
Snapshots:    0 total
Time:         4.523 s
`;
      const result = parseTestSummary(log);

      expect(result).not.toBeNull();
      expect(result!.framework).toBe("jest");
      expect(result!.failed).toBe(2);
      expect(result!.passed).toBe(5);
      expect(result!.total).toBe(7);
    });

    it("should extract failedSuites when Test Suites line is present", () => {
      const log = `
Test Suites:  12 failed, 88 passed, 100 total
Tests:        44 failed, 3712 passed, 3756 total
Snapshots:    5 passed, 5 total
Time:         132.4 s
`;
      const result = parseTestSummary(log);

      expect(result).not.toBeNull();
      expect(result!.framework).toBe("jest");
      expect(result!.failed).toBe(44);
      expect(result!.passed).toBe(3712);
      expect(result!.total).toBe(3756);
      expect(result!.failedSuites).toBe(12);
    });

    it("should not include failedSuites when Test Suites line is absent", () => {
      const log = `
Tests:        3 failed, 10 passed, 13 total
Time:         2.1 s
`;
      const result = parseTestSummary(log);

      expect(result).not.toBeNull();
      expect(result!.framework).toBe("jest");
      expect(result!.failedSuites).toBeUndefined();
    });

    it("should use the LAST Tests line when multiple summary lines exist", () => {
      const log = `
=== First run (retry attempt 1) ===
Test Suites:  5 failed, 10 passed, 15 total
Tests:        20 failed, 80 passed, 100 total

=== Second run (retry attempt 2) ===
Test Suites:  2 failed, 13 passed, 15 total
Tests:        8 failed, 92 passed, 100 total
`;
      const result = parseTestSummary(log);

      expect(result).not.toBeNull();
      expect(result!.failed).toBe(8);
      expect(result!.passed).toBe(92);
      expect(result!.total).toBe(100);
      expect(result!.failedSuites).toBe(2);
    });

    it("should parse case-insensitively", () => {
      const log = `
tests:        7 FAILED, 3 passed, 10 total
`;
      const result = parseTestSummary(log);

      expect(result).not.toBeNull();
      expect(result!.framework).toBe("jest");
      expect(result!.failed).toBe(7);
      expect(result!.passed).toBe(3);
      expect(result!.total).toBe(10);
    });

    it("should handle Jest output with skipped/pending tests in the summary", () => {
      const log = `
Test Suites:  3 failed, 2 skipped, 45 passed, 50 total
Tests:        10 failed, 5 skipped, 85 passed, 100 total
Time:         45.2 s
`;
      const result = parseTestSummary(log);

      expect(result).not.toBeNull();
      expect(result!.framework).toBe("jest");
      expect(result!.failed).toBe(10);
      expect(result!.passed).toBe(85);
      expect(result!.total).toBe(100);
      expect(result!.failedSuites).toBe(3);
    });

    it("should parse Jest output embedded in verbose CI log", () => {
      const log = `
[2026-02-09T10:15:30Z] Running test suite...
[2026-02-09T10:15:30Z] > jest --ci --coverage
[2026-02-09T10:15:31Z] FAIL src/api/routes.test.ts
[2026-02-09T10:15:31Z]   ● POST /analysis › should validate input
[2026-02-09T10:15:31Z]     ValidationError: missing required field
[2026-02-09T10:15:35Z] Tests:        1 failed, 42 passed, 43 total
[2026-02-09T10:15:35Z] Time:         5.023 s
[2026-02-09T10:15:35Z] Process exited with code 1
`;
      const result = parseTestSummary(log);

      expect(result).not.toBeNull();
      expect(result!.framework).toBe("jest");
      expect(result!.failed).toBe(1);
      expect(result!.passed).toBe(42);
      expect(result!.total).toBe(43);
    });
  });

  // ==================== pytest Parser ====================

  describe("pytest parser", () => {
    it("should parse standard pytest output with failed and passed", () => {
      const log = `
collected 15 items

tests/test_api.py::test_login FAILED
tests/test_api.py::test_logout FAILED
tests/test_api.py::test_register PASSED

============================= 5 failed, 10 passed in 3.21s ==============================
`;
      const result = parseTestSummary(log);

      expect(result).not.toBeNull();
      expect(result!.framework).toBe("pytest");
      expect(result!.failed).toBe(5);
      expect(result!.passed).toBe(10);
      expect(result!.total).toBe(15);
    });

    it("should parse pytest output with only failed tests (no passed count)", () => {
      const log = `
collected 3 items

tests/test_critical.py::test_one FAILED
tests/test_critical.py::test_two FAILED
tests/test_critical.py::test_three FAILED

===== 3 failed in 1.5s =====
`;
      const result = parseTestSummary(log);

      expect(result).not.toBeNull();
      expect(result!.framework).toBe("pytest");
      expect(result!.failed).toBe(3);
      expect(result!.passed).toBe(0);
      expect(result!.total).toBe(3);
    });

    it("should handle various separator lengths", () => {
      const log = `=== 2 failed, 8 passed in 0.5s ===`;
      const result = parseTestSummary(log);

      expect(result).not.toBeNull();
      expect(result!.framework).toBe("pytest");
      expect(result!.failed).toBe(2);
      expect(result!.passed).toBe(8);
      expect(result!.total).toBe(10);
    });

    it("should handle very long separator lines", () => {
      const log = `
================================================================= 1 failed, 99 passed in 45.3s =================================================================
`;
      const result = parseTestSummary(log);

      expect(result).not.toBeNull();
      expect(result!.framework).toBe("pytest");
      expect(result!.failed).toBe(1);
      expect(result!.passed).toBe(99);
      expect(result!.total).toBe(100);
    });

    it("should use last match when multiple pytest summaries appear", () => {
      const log = `
===== 10 failed, 5 passed in 2.0s =====

Re-running failed tests...

===== 3 failed, 12 passed in 1.5s =====
`;
      const result = parseTestSummary(log);

      expect(result).not.toBeNull();
      expect(result!.framework).toBe("pytest");
      expect(result!.failed).toBe(3);
      expect(result!.passed).toBe(12);
    });

    it("should parse pytest output with additional info in summary line", () => {
      const log = `
======= 2 failed, 18 passed, 1 warning in 5.67s =======
`;
      const result = parseTestSummary(log);

      expect(result).not.toBeNull();
      expect(result!.framework).toBe("pytest");
      expect(result!.failed).toBe(2);
      expect(result!.passed).toBe(18);
    });
  });

  // ==================== Rust/cargo Parser ====================

  describe("Rust/cargo parser", () => {
    it("should parse standard Rust test result output", () => {
      const log = `
running 5 tests
test my_module::test_parse_input ... ok
test my_module::test_validate ... ok
test my_module::test_transform ... ok
test my_module::test_edge_case ... FAILED
test my_module::test_boundary ... FAILED

failures:

---- my_module::test_edge_case stdout ----
thread 'my_module::test_edge_case' panicked at 'assertion failed: result.is_ok()'

test result: FAILED. 3 passed; 2 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.42s
`;
      const result = parseTestSummary(log);

      expect(result).not.toBeNull();
      expect(result!.framework).toBe("rust");
      expect(result!.failed).toBe(2);
      expect(result!.passed).toBe(3);
      expect(result!.total).toBe(5);
    });

    it("should use the last test result line when multiple exist", () => {
      const log = `
running 10 tests
test result: FAILED. 8 passed; 2 failed; 0 ignored; 0 measured

running 5 tests
test result: FAILED. 4 passed; 1 failed; 0 ignored; 0 measured
`;
      const result = parseTestSummary(log);

      expect(result).not.toBeNull();
      expect(result!.framework).toBe("rust");
      expect(result!.failed).toBe(1);
      expect(result!.passed).toBe(4);
      expect(result!.total).toBe(5);
    });

    it("should parse case-insensitively for Rust output", () => {
      const log = `
TEST RESULT: FAILED. 10 passed; 3 failed; 0 ignored; 0 measured
`;
      const result = parseTestSummary(log);

      expect(result).not.toBeNull();
      expect(result!.framework).toBe("rust");
      expect(result!.failed).toBe(3);
      expect(result!.passed).toBe(10);
    });

    it("should parse Rust output embedded in CI context", () => {
      const log = `
Step 4/6: Running tests
  Compiling my_crate v0.1.0 (/workspace/my_crate)
    Finished test [unoptimized + debuginfo] target(s) in 12.34s
     Running unittests src/lib.rs (target/debug/deps/my_crate-abc123)

running 20 tests
test tests::test_alpha ... ok
test tests::test_beta ... FAILED

failures:
    tests::test_beta

test result: FAILED. 19 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.23s

error: test failed, to rerun pass \`--lib\`
`;
      const result = parseTestSummary(log);

      expect(result).not.toBeNull();
      expect(result!.framework).toBe("rust");
      expect(result!.failed).toBe(1);
      expect(result!.passed).toBe(19);
      expect(result!.total).toBe(20);
    });
  });

  // ==================== Go Parser ====================

  describe("Go parser", () => {
    it("should count FAIL lines for Go test output", () => {
      const log = `
=== RUN   TestHandler
--- FAIL: TestHandler (0.00s)
    handler_test.go:42: got "error", want "success"
=== RUN   TestService
--- FAIL: TestService (0.01s)
    service_test.go:15: unexpected nil result
FAIL
exit status 1
FAIL	example.com/pkg	0.012s
`;
      const result = parseTestSummary(log);

      expect(result).not.toBeNull();
      expect(result!.framework).toBe("go");
      expect(result!.failed).toBe(2);
      expect(result!.passed).toBe(0);
      expect(result!.total).toBe(2);
    });

    it("should count both PASS and FAIL lines", () => {
      const log = `
=== RUN   TestAdd
--- PASS: TestAdd (0.00s)
=== RUN   TestSubtract
--- PASS: TestSubtract (0.00s)
=== RUN   TestMultiply
--- FAIL: TestMultiply (0.00s)
    math_test.go:30: expected 6, got 0
=== RUN   TestDivide
--- PASS: TestDivide (0.00s)
=== RUN   TestDivideByZero
--- FAIL: TestDivideByZero (0.00s)
    math_test.go:45: expected error, got nil
FAIL
exit status 1
FAIL	example.com/math	0.005s
`;
      const result = parseTestSummary(log);

      expect(result).not.toBeNull();
      expect(result!.framework).toBe("go");
      expect(result!.failed).toBe(2);
      expect(result!.passed).toBe(3);
      expect(result!.total).toBe(5);
    });

    it("should handle Go subtests with nested FAIL lines", () => {
      const log = `
=== RUN   TestAPI
=== RUN   TestAPI/GET_users
--- PASS: TestAPI/GET_users (0.01s)
=== RUN   TestAPI/POST_users
--- FAIL: TestAPI/POST_users (0.00s)
    api_test.go:55: status 500, want 201
--- FAIL: TestAPI (0.01s)
FAIL
`;
      const result = parseTestSummary(log);

      expect(result).not.toBeNull();
      expect(result!.framework).toBe("go");
      expect(result!.failed).toBe(2);
      expect(result!.passed).toBe(1);
      expect(result!.total).toBe(3);
    });

    it("should only count lines starting with --- FAIL: (not mid-line)", () => {
      const log = `
The test reported --- FAIL: but this is just a log message
--- FAIL: TestActual (0.00s)
    test.go:10: assertion failed
--- PASS: TestPassing (0.00s)
`;
      // The regex uses ^--- FAIL: with 'm' flag, so only line-start matches count
      const result = parseTestSummary(log);

      expect(result).not.toBeNull();
      expect(result!.framework).toBe("go");
      expect(result!.failed).toBe(1);
      expect(result!.passed).toBe(1);
      expect(result!.total).toBe(2);
    });
  });

  // ==================== Generic Parser ====================

  describe("Generic parser", () => {
    it("should parse 'X failed, Y passed' format", () => {
      const log = `
Running test suite...
Results: 3 failed, 47 passed
Build finished with errors.
`;
      const result = parseTestSummary(log);

      expect(result).not.toBeNull();
      expect(result!.framework).toBe("generic");
      expect(result!.failed).toBe(3);
      expect(result!.passed).toBe(47);
      expect(result!.total).toBe(50);
    });

    it("should parse 'X failures, Y successes' format", () => {
      const log = `
Test run completed.
Summary: 2 failures, 18 successes
`;
      const result = parseTestSummary(log);

      expect(result).not.toBeNull();
      expect(result!.framework).toBe("generic");
      expect(result!.failed).toBe(2);
      expect(result!.passed).toBe(18);
      expect(result!.total).toBe(20);
    });

    it("should parse singular 'failure' and 'success'", () => {
      const log = `
1 failure, 9 success
`;
      const result = parseTestSummary(log);

      expect(result).not.toBeNull();
      expect(result!.framework).toBe("generic");
      expect(result!.failed).toBe(1);
      expect(result!.passed).toBe(9);
      expect(result!.total).toBe(10);
    });

    it("should use the last match when multiple generic summaries exist", () => {
      const log = `
Attempt 1: 5 failed, 15 passed
Attempt 2: 2 failed, 18 passed
`;
      const result = parseTestSummary(log);

      expect(result).not.toBeNull();
      expect(result!.framework).toBe("generic");
      expect(result!.failed).toBe(2);
      expect(result!.passed).toBe(18);
    });

    it("should handle 'failures' with comma separator", () => {
      const log = `
Test Report: 4 failures, 96 successes
`;
      const result = parseTestSummary(log);

      expect(result).not.toBeNull();
      expect(result!.framework).toBe("generic");
      expect(result!.failed).toBe(4);
      expect(result!.passed).toBe(96);
    });
  });

  // ==================== Edge Cases ====================

  describe("Edge cases", () => {
    it("should return null for empty string", () => {
      const result = parseTestSummary("");

      expect(result).toBeNull();
    });

    it("should return null for whitespace-only input", () => {
      // Empty string is falsy; whitespace is truthy but has no matches
      const result = parseTestSummary("   \n\t  \n  ");

      expect(result).toBeNull();
    });

    it("should return null when no test summary is found in build logs", () => {
      const log = `
Step 1/4: Checkout code
Step 2/4: Install dependencies
  npm ci --production
Step 3/4: Build project
  tsc --build
Step 4/4: Deploy
  Successfully deployed to staging
`;
      const result = parseTestSummary(log);

      expect(result).toBeNull();
    });

    it("should return null when log contains zero failures (Jest)", () => {
      const log = `
Test Suites:  0 failed, 10 passed, 10 total
Tests:        0 failed, 150 passed, 150 total
`;
      // The regex requires the "failed" keyword with a number, and parseTestSummary
      // filters results where failed > 0. The Jest regex requires at least one failed.
      // "0 failed" will match the regex, but the main function checks result.failed > 0.
      const result = parseTestSummary(log);

      expect(result).toBeNull();
    });

    it("should return null when log contains zero failures (pytest)", () => {
      const log = `
===== 0 failed, 20 passed in 2.1s =====
`;
      const result = parseTestSummary(log);

      expect(result).toBeNull();
    });

    it("should return null when log contains zero failures (Rust)", () => {
      const log = `
test result: FAILED. 10 passed; 0 failed; 0 ignored; 0 measured
`;
      const result = parseTestSummary(log);

      expect(result).toBeNull();
    });

    it("should return null when Go output has only PASS lines", () => {
      const log = `
=== RUN   TestAdd
--- PASS: TestAdd (0.00s)
=== RUN   TestSubtract
--- PASS: TestSubtract (0.00s)
ok	example.com/math	0.003s
`;
      const result = parseTestSummary(log);

      expect(result).toBeNull();
    });

    it("should return null when generic output has zero failures", () => {
      const log = `
0 failed, 50 passed
`;
      const result = parseTestSummary(log);

      expect(result).toBeNull();
    });

    it("should handle very large log with summary at the end", () => {
      // Simulate a large CI log with many lines before the summary
      const logLines: string[] = [];
      for (let i = 0; i < 5000; i++) {
        logLines.push(
          `[2026-02-09T10:00:${String(i % 60).padStart(2, "0")}Z] Step ${i}: processing module_${i}`
        );
      }
      logLines.push("");
      logLines.push("Tests:        3 failed, 4997 passed, 5000 total");
      logLines.push("Time:         312.5 s");

      const log = logLines.join("\n");
      const result = parseTestSummary(log);

      expect(result).not.toBeNull();
      expect(result!.framework).toBe("jest");
      expect(result!.failed).toBe(3);
      expect(result!.passed).toBe(4997);
      expect(result!.total).toBe(5000);
    });

    it("should return null for undefined-like falsy input", () => {
      // The function signature accepts string, but the guard checks !log
      // which catches empty string. TypeScript prevents actual undefined,
      // but we test the empty string path.
      const result = parseTestSummary("");

      expect(result).toBeNull();
    });
  });

  // ==================== Framework Priority ====================

  describe("Framework priority", () => {
    it("should prefer Jest match over generic match in the same log", () => {
      const log = `
FAIL src/app.test.ts
  App
    should render correctly

3 failed, 47 passed

Tests:        3 failed, 97 passed, 100 total
Time:         8.2 s
`;
      const result = parseTestSummary(log);

      expect(result).not.toBeNull();
      expect(result!.framework).toBe("jest");
      expect(result!.failed).toBe(3);
      expect(result!.passed).toBe(97);
      expect(result!.total).toBe(100);
    });

    it("should prefer pytest match over generic match in the same log", () => {
      const log = `
collected 15 items

5 failed, 10 passed

===== 5 failed, 10 passed in 3.2s =====
`;
      const result = parseTestSummary(log);

      expect(result).not.toBeNull();
      expect(result!.framework).toBe("pytest");
      expect(result!.failed).toBe(5);
      expect(result!.passed).toBe(10);
    });

    it("should prefer Rust match over generic match in the same log", () => {
      const log = `
2 failed, 8 passed

test result: FAILED. 8 passed; 2 failed; 0 ignored; 0 measured
`;
      const result = parseTestSummary(log);

      // Rust parser is checked before generic, but Jest and pytest are checked first.
      // Neither Jest nor pytest patterns match here, so Rust should win.
      expect(result).not.toBeNull();
      expect(result!.framework).toBe("rust");
      expect(result!.failed).toBe(2);
      expect(result!.passed).toBe(8);
    });

    it("should prefer Go match over generic match in the same log", () => {
      const log = `
--- FAIL: TestSomething (0.00s)
    test.go:10: nope
--- PASS: TestOther (0.00s)

1 failed, 1 passed
`;
      const result = parseTestSummary(log);

      // Go is checked before generic
      expect(result).not.toBeNull();
      expect(result!.framework).toBe("go");
      expect(result!.failed).toBe(1);
      expect(result!.passed).toBe(1);
    });

    it("should fall back to generic when no specific framework matches", () => {
      const log = `
Custom test runner output:
=============================
7 failed, 93 passed
=============================
`;
      const result = parseTestSummary(log);

      expect(result).not.toBeNull();
      expect(result!.framework).toBe("generic");
      expect(result!.failed).toBe(7);
      expect(result!.passed).toBe(93);
    });

    it("should return null when no framework matches at all", () => {
      const log = `
Build completed successfully.
All checks passed.
Deployment to production: OK
`;
      const result = parseTestSummary(log);

      expect(result).toBeNull();
    });
  });

  // ==================== Return Type Conformance ====================

  describe("Return type conformance", () => {
    it("should return a ParsedTestSummary with all required fields for Jest", () => {
      const log = "Tests:  5 failed, 95 passed, 100 total";
      const result = parseTestSummary(log);

      expect(result).not.toBeNull();
      const summary: ParsedTestSummary = result!;
      expect(typeof summary.failed).toBe("number");
      expect(typeof summary.passed).toBe("number");
      expect(typeof summary.total).toBe("number");
      expect(typeof summary.framework).toBe("string");
    });

    it("should return a ParsedTestSummary with all required fields for pytest", () => {
      const log = "===== 1 failed, 9 passed in 1.0s =====";
      const result = parseTestSummary(log);

      expect(result).not.toBeNull();
      const summary: ParsedTestSummary = result!;
      expect(typeof summary.failed).toBe("number");
      expect(typeof summary.passed).toBe("number");
      expect(typeof summary.total).toBe("number");
      expect(summary.framework).toBe("pytest");
      expect(summary.failedSuites).toBeUndefined();
    });

    it("should return numeric values (not strings) for all count fields", () => {
      const log = "Tests:  12 failed, 88 passed, 100 total";
      const result = parseTestSummary(log);

      expect(result).not.toBeNull();
      // Verify these are actual numbers, not strings that look like numbers
      expect(result!.failed).toStrictEqual(12);
      expect(result!.passed).toStrictEqual(88);
      expect(result!.total).toStrictEqual(100);
    });
  });

  // ==================== Realistic CI Log Scenarios ====================

  describe("Realistic CI log scenarios", () => {
    it("should parse Jest from a GitHub Actions log", () => {
      const log = `
2026-02-09T08:30:00Z ##[group]Run npm test
2026-02-09T08:30:00Z > kenchi-api@1.0.0 test
2026-02-09T08:30:00Z > jest --ci --coverage --forceExit

2026-02-09T08:30:01Z PASS packages/shared/src/__tests__/core/errors.test.ts
2026-02-09T08:30:01Z PASS packages/shared/src/__tests__/core/logger.test.ts
2026-02-09T08:30:02Z FAIL packages/shared/src/__tests__/formatting/chunkExtractor.test.ts
2026-02-09T08:30:02Z   ● Chunk Extractor › extractArtifactsFromChunk › should handle timeout
2026-02-09T08:30:02Z
2026-02-09T08:30:02Z     Timeout - Async callback was not invoked within 30000 ms
2026-02-09T08:30:02Z
2026-02-09T08:30:05Z ----------|---------|----------|---------|---------|---
2026-02-09T08:30:05Z File      | % Stmts | % Branch | % Funcs | % Lines |
2026-02-09T08:30:05Z ----------|---------|----------|---------|---------|---
2026-02-09T08:30:05Z All files |   85.23 |    78.45 |   92.10 |   84.99 |
2026-02-09T08:30:05Z ----------|---------|----------|---------|---------|---
2026-02-09T08:30:05Z Test Suites:  1 failed, 49 passed, 50 total
2026-02-09T08:30:05Z Tests:        1 failed, 312 passed, 313 total
2026-02-09T08:30:05Z Snapshots:    0 total
2026-02-09T08:30:05Z Time:         35.123 s
2026-02-09T08:30:05Z ##[endgroup]
2026-02-09T08:30:05Z ##[error]Process completed with exit code 1.
`;
      const result = parseTestSummary(log);

      expect(result).not.toBeNull();
      expect(result!.framework).toBe("jest");
      expect(result!.failed).toBe(1);
      expect(result!.passed).toBe(312);
      expect(result!.total).toBe(313);
      expect(result!.failedSuites).toBe(1);
    });

    it("should parse pytest from a GitLab CI log", () => {
      const log = `
$ python -m pytest tests/ -v --tb=short
============================= test session starts ==============================
platform linux -- Python 3.11.5, pytest-7.4.0
collecting ... collected 25 items

tests/test_auth.py::test_login_success PASSED                           [  4%]
tests/test_auth.py::test_login_invalid_password PASSED                  [  8%]
tests/test_api.py::test_create_resource FAILED                          [ 12%]
tests/test_api.py::test_delete_resource FAILED                          [ 16%]
tests/test_api.py::test_list_resources PASSED                           [ 20%]

=========================== short test summary info ============================
FAILED tests/test_api.py::test_create_resource - AssertionError: 500 != 201
FAILED tests/test_api.py::test_delete_resource - AssertionError: 403 != 204

============================== 2 failed, 23 passed in 4.56s ===============================
`;
      const result = parseTestSummary(log);

      expect(result).not.toBeNull();
      expect(result!.framework).toBe("pytest");
      expect(result!.failed).toBe(2);
      expect(result!.passed).toBe(23);
      expect(result!.total).toBe(25);
    });

    it("should parse Go from a CircleCI log", () => {
      const log = `
#!/bin/bash -eo pipefail
go test ./... -v -count=1

=== RUN   TestCreateUser
--- PASS: TestCreateUser (0.02s)
=== RUN   TestDeleteUser
--- PASS: TestDeleteUser (0.01s)
=== RUN   TestUpdateUser
--- FAIL: TestUpdateUser (0.03s)
    user_test.go:78: expected status 200, got 500
=== RUN   TestGetUser
--- PASS: TestGetUser (0.01s)
=== RUN   TestListUsers
--- PASS: TestListUsers (0.02s)
FAIL
exit status 1
FAIL	github.com/org/repo/pkg/users	0.145s

Exited with code exit status 1
CircleCI received exit code 1
`;
      const result = parseTestSummary(log);

      expect(result).not.toBeNull();
      expect(result!.framework).toBe("go");
      expect(result!.failed).toBe(1);
      expect(result!.passed).toBe(4);
      expect(result!.total).toBe(5);
    });

    it("should parse Rust from a cargo test CI run", () => {
      const log = `
   Compiling my_crate v0.5.0 (/home/runner/work/repo/my_crate)
    Finished \`test\` profile [unoptimized + debuginfo] target(s) in 23.45s
     Running unittests src/lib.rs (target/debug/deps/my_crate-a1b2c3d4)

running 15 tests
test parser::tests::test_parse_empty ... ok
test parser::tests::test_parse_valid ... ok
test parser::tests::test_parse_invalid ... FAILED
test serializer::tests::test_serialize ... ok
test serializer::tests::test_round_trip ... ok

failures:

---- parser::tests::test_parse_invalid stdout ----
thread 'parser::tests::test_parse_invalid' panicked at src/parser.rs:142:5:
assertion \`left == right\` failed
  left: Err(ParseError)
 right: Ok(Value(42))
note: run with \`RUST_BACKTRACE=1\` environment variable to display a backtrace

failures:
    parser::tests::test_parse_invalid

test result: FAILED. 14 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.89s

error: test failed, to rerun pass \`--lib\`
Error: Process completed with exit code 101.
`;
      const result = parseTestSummary(log);

      expect(result).not.toBeNull();
      expect(result!.framework).toBe("rust");
      expect(result!.failed).toBe(1);
      expect(result!.passed).toBe(14);
      expect(result!.total).toBe(15);
    });
  });
});

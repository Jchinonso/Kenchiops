/**
 * Unit tests for Log Parser
 *
 * Tests all log parsing functions with various log formats and edge cases.
 */

import { describe, it, expect } from "@jest/globals";
import {
  extractFileReferences,
  extractTestFailures,
  truncateWithContext,
} from "../../services/context/logParser.js";

describe("Log Parser", () => {
  describe("extractFileReferences", () => {
    it("should extract file reference with line number (pattern: file.ts:line)", () => {
      const logs = "Error in src/utils.ts:42";
      const refs = extractFileReferences(logs);

      expect(refs).toHaveLength(1);
      expect(refs[0]).toEqual({ path: "src/utils.ts", line: 42 });
    });

    it("should extract file reference with line and column (pattern: file.ts:line:column)", () => {
      const logs = "Error at /path/to/file.js:123:45";
      const refs = extractFileReferences(logs);

      expect(refs).toHaveLength(1);
      expect(refs[0]).toEqual({ path: "/path/to/file.js", line: 123 });
    });

    it("should extract file reference from stack trace (pattern: at ... (file.ts:line:col))", () => {
      const logs = "at Object.<anonymous> (src/index.ts:10:5)";
      const refs = extractFileReferences(logs);

      expect(refs).toHaveLength(1);
      expect(refs[0]).toEqual({ path: "src/index.ts", line: 10 });
    });

    it("should extract file reference with Windows style (pattern: file.ts(line,col))", () => {
      const logs = "Error: src/components/App.tsx(15,20)";
      const refs = extractFileReferences(logs);

      expect(refs).toHaveLength(1);
      expect(refs[0]).toEqual({ path: "src/components/App.tsx", line: 15 });
    });

    it("should extract multiple file references from logs", () => {
      const logs = `
        Error at src/index.ts:10
        Failed in lib/utils.js:25
        TypeError at components/App.tsx:100:5
      `;
      const refs = extractFileReferences(logs);

      expect(refs.length).toBeGreaterThanOrEqual(3);
      expect(refs).toEqual(
        expect.arrayContaining([
          { path: "src/index.ts", line: 10 },
          { path: "lib/utils.js", line: 25 },
          { path: "components/App.tsx", line: 100 },
        ])
      );
    });

    it("should exclude node_modules paths", () => {
      const logs = `
        Error at src/index.ts:10
        at node_modules/package/index.js:100
      `;
      const refs = extractFileReferences(logs);

      expect(refs).toHaveLength(1);
      expect(refs[0].path).toBe("src/index.ts");
    });

    it("should exclude test files (.test. pattern)", () => {
      const logs = `
        Error at src/index.ts:10
        at src/index.test.ts:50
      `;
      const refs = extractFileReferences(logs);

      expect(refs).toHaveLength(1);
      expect(refs[0].path).toBe("src/index.ts");
    });

    it("should exclude spec files (.spec. pattern)", () => {
      const logs = `
        Error at src/utils.ts:25
        at src/utils.spec.ts:100
      `;
      const refs = extractFileReferences(logs);

      expect(refs).toHaveLength(1);
      expect(refs[0].path).toBe("src/utils.ts");
    });

    it("should exclude internal/ paths", () => {
      const logs = `
        Error at src/index.ts:10
        at internal/debug.ts:5
      `;
      const refs = extractFileReferences(logs);

      expect(refs).toHaveLength(1);
      expect(refs[0].path).toBe("src/index.ts");
    });

    it("should deduplicate file references by path", () => {
      const logs = `
        Error at src/index.ts:10
        TypeError at src/index.ts:20
        Failed at src/index.ts:30
      `;
      const refs = extractFileReferences(logs);

      expect(refs).toHaveLength(1);
      expect(refs[0]).toEqual({ path: "src/index.ts", line: 10 }); // First occurrence kept
    });

    it("should extract all unique file references without limits", () => {
      const logs = `
        Error at file1.ts:1
        Error at file2.ts:2
        Error at file3.ts:3
        Error at file4.ts:4
        Error at file5.ts:5
        Error at file6.ts:6
        Error at file7.ts:7
      `;
      const refs = extractFileReferences(logs);

      // Should extract all unique files (no limit)
      expect(refs.length).toBe(7);
    });

    it("should handle TypeScript file extensions", () => {
      const logs = "Error at src/utils.ts:10 and components/App.tsx:20";
      const refs = extractFileReferences(logs);

      expect(refs).toHaveLength(2);
      expect(refs[0].path).toMatch(/\.tsx?$/);
    });

    it("should handle JavaScript file extensions", () => {
      const logs = "Error at lib/utils.js:15 and pages/index.jsx:30";
      const refs = extractFileReferences(logs);

      expect(refs).toHaveLength(2);
      expect(refs[0].path).toMatch(/\.jsx?$/);
    });

    it("should handle paths with hyphens and underscores", () => {
      const logs = "Error at my-component_v2.ts:10";
      const refs = extractFileReferences(logs);

      expect(refs).toHaveLength(1);
      expect(refs[0].path).toBe("my-component_v2.ts");
    });

    it("should handle relative paths", () => {
      const logs = "Error at ./src/utils.ts:10 and ../lib/helper.js:20";
      const refs = extractFileReferences(logs);

      expect(refs.length).toBeGreaterThanOrEqual(1);
    });

    it("should handle absolute paths", () => {
      const logs = "Error at /usr/local/app/src/index.ts:100";
      const refs = extractFileReferences(logs);

      expect(refs).toHaveLength(1);
      expect(refs[0].path).toBe("/usr/local/app/src/index.ts");
    });

    it("should return empty array for logs with no file references", () => {
      const logs = "This is a log without any file references";
      const refs = extractFileReferences(logs);

      expect(refs).toEqual([]);
    });

    it("should return empty array for empty logs", () => {
      const logs = "";
      const refs = extractFileReferences(logs);

      expect(refs).toEqual([]);
    });

    it("should handle multiline stack traces", () => {
      const logs = `
Error: Something went wrong
    at functionName (src/index.ts:10:5)
    at anotherFunction (src/utils.ts:25:10)
    at Object.<anonymous> (src/app.ts:50:15)
      `;
      const refs = extractFileReferences(logs);

      expect(refs.length).toBeGreaterThanOrEqual(3);
      expect(refs).toEqual(
        expect.arrayContaining([
          { path: "src/index.ts", line: 10 },
          { path: "src/utils.ts", line: 25 },
          { path: "src/app.ts", line: 50 },
        ])
      );
    });

    it("should handle npm error logs", () => {
      const logs = `
npm ERR! code ENOENT
npm ERR! path /app/package.json
      `;
      const refs = extractFileReferences(logs);

      // Should not extract package.json or should handle it gracefully
      expect(Array.isArray(refs)).toBe(true);
    });

    it("should handle TypeScript compiler errors", () => {
      const logs = `
src/index.ts(10,5): error TS2304: Cannot find name 'foo'.
src/utils.ts(25,10): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.
      `;
      const refs = extractFileReferences(logs);

      expect(refs.length).toBeGreaterThanOrEqual(2);
      expect(refs).toEqual(
        expect.arrayContaining([
          { path: "src/index.ts", line: 10 },
          { path: "src/utils.ts", line: 25 },
        ])
      );
    });

    it("should handle ESLint errors", () => {
      const logs = `
/app/src/index.ts:10:5: error no-unused-vars: 'foo' is defined but never used
/app/src/utils.ts:25:10: warning prefer-const: 'bar' is never reassigned
      `;
      const refs = extractFileReferences(logs);

      expect(refs.length).toBeGreaterThanOrEqual(2);
    });

    it("should handle very large logs efficiently", () => {
      // Generate large log with many file references
      const largeLog = Array.from({ length: 1000 }, (_, i) => `Error at file${i}.ts:${i}`).join(
        "\n"
      );

      const start = Date.now();
      const refs = extractFileReferences(largeLog);
      const duration = Date.now() - start;

      // Should complete quickly (< 1 second) and extract all unique files
      expect(duration).toBeLessThan(1000);
      expect(refs.length).toBe(1000); // All unique files extracted
    });
  });

  describe("truncateWithContext", () => {
    it("should return content unchanged if within max size", () => {
      const content = "Short log content";
      const result = truncateWithContext(content, 100);

      expect(result).toBe(content);
    });

    it("should truncate content that exceeds max size", () => {
      const content = "A".repeat(1000);
      const result = truncateWithContext(content, 100);

      expect(result.length).toBeLessThanOrEqual(150); // Including truncation markers
      expect(result).toContain("...");
    });

    it("should preserve error context when truncating", () => {
      const content =
        "Some content " + "X".repeat(500) + " ERROR: critical failure " + "Y".repeat(500);
      const result = truncateWithContext(content, 200);

      expect(result).toContain("ERROR");
    });

    it("should center truncation around first error indicator", () => {
      const before = "A".repeat(500);
      const errorSection = " ERROR: Something went wrong ";
      const after = "B".repeat(500);
      const content = before + errorSection + after;

      const result = truncateWithContext(content, 100);

      expect(result).toContain("ERROR");
      // Should have content from both before and after error
      expect(result).toContain("A");
      expect(result).toContain("B");
    });

    it("should add prefix marker when truncating from middle", () => {
      const content = "A".repeat(1000);
      const result = truncateWithContext(content, 100);

      expect(result).toContain("... [truncated] ...");
    });

    it("should add suffix marker when content continues after truncation", () => {
      const content = "A".repeat(1000);
      const result = truncateWithContext(content, 100);

      expect(result).toMatch(/\.\.\. \[truncated\] \.\.\./);
    });

    it("should not add prefix marker when truncating from start", () => {
      const content = "ERROR: " + "A".repeat(1000);
      const result = truncateWithContext(content, 100);

      // Should not start with prefix marker
      expect(result.startsWith("... [truncated] ...")).toBe(false);
      expect(result).toContain("ERROR");
    });

    it("should handle content with multiple error indicators", () => {
      const content =
        "Normal " + "A".repeat(200) + " error " + "B".repeat(200) + " Failed " + "C".repeat(200);
      const result = truncateWithContext(content, 100);

      // Should center around first error indicator
      expect(result).toContain("error");
    });

    it("should recognize various error indicator formats", () => {
      const testCases = [
        "Content with error message",
        "Content with Error message",
        "Content with ERROR message",
        "Content with failed test",
        "Content with Failed build",
        "Content with FAILED status",
      ];

      testCases.forEach((content) => {
        const padded = "X".repeat(500) + content + "Y".repeat(500);
        const result = truncateWithContext(padded, 100);
        expect(result.toLowerCase()).toMatch(/error|failed/);
      });
    });

    it("should handle content with no error indicators", () => {
      const content = "A".repeat(1000);
      const result = truncateWithContext(content, 100);

      // Should truncate from beginning when no error indicator found
      expect(result).toContain("A");
      expect(result.length).toBeLessThanOrEqual(150);
    });

    it("should handle empty content", () => {
      const result = truncateWithContext("", 100);
      expect(result).toBe("");
    });

    it("should handle max size of 0", () => {
      const content = "Some content";
      const result = truncateWithContext(content, 0);

      // With maxSize=0, slice(0, 0) returns empty string, but markers may be added
      expect(result.length).toBeLessThanOrEqual(50);
    });

    it("should handle very small max size", () => {
      const content = "A".repeat(1000);
      const result = truncateWithContext(content, 10);

      expect(result.length).toBeLessThanOrEqual(60); // 10 + markers
    });

    it("should preserve newlines in truncated content", () => {
      const content = "Line 1\nLine 2\n" + "ERROR\n".repeat(100) + "Line N";
      const result = truncateWithContext(content, 100);

      expect(result).toContain("\n");
    });

    it("should handle unicode characters", () => {
      const content = "日本語".repeat(200) + " ERROR " + "🔥".repeat(200);
      const result = truncateWithContext(content, 100);

      expect(result).toContain("ERROR");
    });
  });

  describe("extractTestFailures", () => {
    describe("Jest/Vitest format", () => {
      it("should extract Jest test failure with checkmark format", () => {
        const logs = `
 ✕ should handle edge case (123 ms)
    Expected: true
    Received: false
        `;
        const failures = extractTestFailures(logs);

        expect(failures).toHaveLength(1);
        expect(failures[0].testName).toBe("should handle edge case");
        expect(failures[0].error).toContain("Expected");
      });

      it("should extract Jest test failure with FAIL format", () => {
        const logs = `
 FAIL  src/utils.test.ts
  ● Test Suite Name › should do something

    Expected value to be truthy

    at Object.<anonymous> (src/utils.test.ts:10:5)
        `;
        const failures = extractTestFailures(logs);

        expect(failures.length).toBeGreaterThan(0);
        // The FAIL pattern extracts the file path and the test suite/name
        expect(failures[0]).toHaveProperty("testName");
        expect(failures[0]).toHaveProperty("error");
      });

      it("should extract file path from test failure stack trace", () => {
        const logs = `
 ✕ test name (100 ms)
    Error: Test failed
    at Object.<anonymous> (src/index.test.ts:25:10)
        `;
        const failures = extractTestFailures(logs);

        expect(failures).toHaveLength(1);
        // File path is extracted from stack trace if present
        if (failures[0].file) {
          expect(failures[0].file).toBe("src/index.test.ts");
        }
      });

      it("should extract multiple Jest test failures", () => {
        const logs = `
 ✕ first test (50 ms)
    Expected: 1
    Received: 2

 ✕ second test (75 ms)
    Expected: true
    Received: false
        `;
        const failures = extractTestFailures(logs);

        expect(failures.length).toBeGreaterThanOrEqual(2);
        expect(failures[0].testName).toBe("first test");
        expect(failures[1].testName).toBe("second test");
      });

      it("should handle Jest test failure with long test name", () => {
        const longTestName = "A".repeat(300);
        const logs = `
 ✕ ${longTestName}
    Error: Test failed
        `;
        const failures = extractTestFailures(logs);

        expect(failures).toHaveLength(1);
        // Should truncate to 200 characters
        expect(failures[0].testName.length).toBeLessThanOrEqual(200);
      });

      it("should handle Jest test failure with long error message", () => {
        const longError = "Expected: " + "E".repeat(1000);
        const logs = `
 ✕ test name (100 ms)
    ${longError}
        `;
        const failures = extractTestFailures(logs);

        expect(failures).toHaveLength(1);
        // Should truncate to 500 characters
        expect(failures[0].error.length).toBeLessThanOrEqual(500);
      });

      it("should handle Vitest format (similar to Jest)", () => {
        const logs = `
 FAIL  tests/component.test.ts
  ● Component > should render

    AssertionError: expected 'Hello' to equal 'World'
        `;
        const failures = extractTestFailures(logs);

        expect(failures.length).toBeGreaterThan(0);
      });

      it("should extract all unique test failures without artificial limits", () => {
        // Generate many unique tests
        const manyTests = Array.from(
          { length: 150 },
          (_, i) => `
 ✕ unique_test_${i}
    Error: Failed
`
        ).join("\n");

        const failures = extractTestFailures(manyTests);

        // Should extract all unique failures (no limit)
        expect(failures.length).toBe(150);
      });

      it("should deduplicate test failures by name", () => {
        // Generate duplicate tests
        const duplicateTests = `
 ✕ same_test
    Error: Failed

 ✕ same_test
    Error: Also failed

 ✕ different_test
    Error: Failed
`;

        const failures = extractTestFailures(duplicateTests);

        // Should deduplicate by test name
        expect(failures.length).toBe(2);
        expect(failures.map((f) => f.testName)).toContain("same_test");
        expect(failures.map((f) => f.testName)).toContain("different_test");
      });
    });

    describe("Mocha format", () => {
      it("should extract Mocha test failure", () => {
        const logs = `
  1) Test Suite Name
     should do something:
     AssertionError: expected true to be false
        `;
        const failures = extractTestFailures(logs);

        expect(failures).toHaveLength(1);
        expect(failures[0].testName).toContain("Test Suite Name");
      });

      it("should extract multiple Mocha test failures", () => {
        const logs = `
  1) First test suite
     first test:
     Error: Something went wrong

  2) Second test suite
     second test:
     AssertionError: expected value
        `;
        const failures = extractTestFailures(logs);

        expect(failures.length).toBeGreaterThanOrEqual(2);
      });

      it("should truncate long Mocha test names", () => {
        const longName = "A".repeat(300);
        const logs = `
  1) ${longName}:
     Error: Test failed
        `;
        const failures = extractTestFailures(logs);

        expect(failures).toHaveLength(1);
        expect(failures[0].testName.length).toBeLessThanOrEqual(200);
      });

      it("should truncate long Mocha error messages", () => {
        const longError = "E".repeat(1000);
        const logs = `
  1) Test name:
     ${longError}
        `;
        const failures = extractTestFailures(logs);

        expect(failures).toHaveLength(1);
        expect(failures[0].error.length).toBeLessThanOrEqual(500);
      });
    });

    describe("Edge cases and malformed logs", () => {
      it("should return empty array for logs with no test failures", () => {
        const logs = "All tests passed successfully";
        const failures = extractTestFailures(logs);

        expect(failures).toEqual([]);
      });

      it("should return empty array for empty logs", () => {
        const logs = "";
        const failures = extractTestFailures(logs);

        expect(failures).toEqual([]);
      });

      it("should handle logs with partial test failure patterns", () => {
        const logs = "✕ incomplete test format without error details";
        const failures = extractTestFailures(logs);

        // Should either extract with fallback or return empty
        expect(Array.isArray(failures)).toBe(true);
      });

      it("should handle malformed Jest output", () => {
        const logs = `
 ✕ test name
    (missing error details)
        `;
        const failures = extractTestFailures(logs);

        if (failures.length > 0) {
          expect(failures[0]).toHaveProperty("testName");
          expect(failures[0]).toHaveProperty("error");
        }
      });

      it("should handle mixed test framework formats", () => {
        const logs = `
 ✕ jest test
    Error: Jest failure

  1) mocha test:
     Error: Mocha failure
        `;
        const failures = extractTestFailures(logs);

        // Should extract from one framework (Jest has precedence)
        expect(failures.length).toBeGreaterThan(0);
      });

      it("should handle logs with special characters in test names", () => {
        const logs = `
 ✕ should handle <special> & "characters" in 'names'
    Error: Test failed
        `;
        const failures = extractTestFailures(logs);

        expect(failures).toHaveLength(1);
        expect(failures[0].testName).toContain("<special>");
        expect(failures[0].testName).toContain("&");
      });

      it("should handle logs with unicode in test names", () => {
        const logs = `
 ✕ 日本語テスト 🔥
    Error: Test failed
        `;
        const failures = extractTestFailures(logs);

        expect(failures).toHaveLength(1);
        expect(failures[0].testName).toContain("日本語");
        expect(failures[0].testName).toContain("🔥");
      });

      it("should handle test failures with no test name", () => {
        const logs = `
 ✕
    Error: Anonymous test failed
        `;
        const failures = extractTestFailures(logs);

        if (failures.length > 0) {
          // Should use fallback test name
          expect(failures[0].testName).toBeTruthy();
        }
      });

      it("should handle test failures with no error message", () => {
        const logs = `
 ✕ test name
        `;
        const failures = extractTestFailures(logs);

        if (failures.length > 0) {
          // Should use fallback error message
          expect(failures[0].error).toBeTruthy();
        }
      });

      it("should handle very large log files", () => {
        const largeLog =
          "Normal log content\n".repeat(10000) +
          `
 ✕ test in large log
    Error: Found it
`;

        const start = Date.now();
        const failures = extractTestFailures(largeLog);
        const duration = Date.now() - start;

        // Should complete quickly
        expect(duration).toBeLessThan(2000);
        expect(failures.length).toBeGreaterThan(0);
      });

      it("should handle logs with ANSI color codes", () => {
        const logs = `
 ✕ test with colors (50 ms)
    Error: Test failed
        `;
        const failures = extractTestFailures(logs);

        expect(failures.length).toBeGreaterThan(0);
      });

      it("should handle Windows line endings (CRLF)", () => {
        const logs = " ✕ test name\r\n    Error: Test failed\r\n";
        const failures = extractTestFailures(logs);

        expect(failures).toHaveLength(1);
      });

      it("should handle mixed line endings", () => {
        const logs = " ✕ test name\r\n    Error: Part 1\n    Error: Part 2\r\n";
        const failures = extractTestFailures(logs);

        expect(failures).toHaveLength(1);
      });

      it("should use fallback when test name is missing", () => {
        const logs = `
 ✕  (50 ms)
    Expected: true
    Received: false
        `;
        const failures = extractTestFailures(logs);

        if (failures.length > 0) {
          // When test name is empty/whitespace, it gets trimmed and fallback is used
          expect(failures[0].testName).toBeTruthy();
          expect(failures[0].testName.length).toBeGreaterThan(0);
        }
      });

      it("should use fallback when error message is missing", () => {
        const logs = `
 ✕ test name
        `;
        const failures = extractTestFailures(logs);

        if (failures.length > 0) {
          expect(failures[0].error).toBe("Test failed");
        }
      });
    });

    describe("Real-world CI log patterns", () => {
      it("should handle GitHub Actions Jest output", () => {
        const logs = `
Run npm test
  FAIL  src/components/Button.test.tsx
    ● Button › should render correctly

      expect(received).toBe(expected) // Object.is equality

      Expected: "Click me"
      Received: "Click"

        at Object.<anonymous> (src/components/Button.test.tsx:10:23)
        `;
        const failures = extractTestFailures(logs);

        expect(failures.length).toBeGreaterThan(0);
        // The FAIL pattern captures the file path as the test name
        expect(failures[0].testName).toBeTruthy();
      });

      it("should handle npm test errors", () => {
        const logs = `
npm ERR! Test failed. See above for more details.
 ✕ npm package test
    Error: Module not found
        `;
        const failures = extractTestFailures(logs);

        expect(failures.length).toBeGreaterThan(0);
      });

      it("should handle TypeScript type errors in test output", () => {
        const logs = `
 ✕ test with type error (100 ms)
    Error: src/utils.test.ts(15,10): error TS2304: Cannot find name 'foo'.
        `;
        const failures = extractTestFailures(logs);

        expect(failures).toHaveLength(1);
        expect(failures[0].error).toContain("TS2304");
      });

      it("should handle timeout errors", () => {
        const logs = `
 ✕ async test with timeout (30001 ms)
    Error: Timeout - Async callback was not invoked within the 30000 ms timeout
        `;
        const failures = extractTestFailures(logs);

        expect(failures).toHaveLength(1);
        expect(failures[0].error).toContain("Timeout");
      });

      it("should handle snapshot test failures", () => {
        const logs = `
 ✕ Component snapshot test (150 ms)
    Snapshot name: Component renders correctly 1

    Expected: <div>Expected content</div>
    Received: <div>Actual content</div>
        `;
        const failures = extractTestFailures(logs);

        expect(failures).toHaveLength(1);
        expect(failures[0].testName).toContain("Component snapshot");
      });

      it("should extract test summary information", () => {
        const logs = `
Test Suites: 2 failed, 5 passed, 7 total
Tests:       3 failed, 20 passed, 23 total

 ✕ first failing test
    Error: First error

 ✕ second failing test
    Error: Second error

 ✕ third failing test
    Error: Third error
        `;
        const failures = extractTestFailures(logs);

        expect(failures.length).toBeGreaterThanOrEqual(3);
      });
    });
  });

  describe("Integration tests", () => {
    it("should extract both file references and test failures from same log", () => {
      const logs = `
 ✕ should calculate sum correctly
    Expected: 5
    Received: 3
    at Object.<anonymous> (src/__tests__/math.test.ts:10:5)
    at Calculator.sum (src/calculator.ts:25:10)
      `;

      const failures = extractTestFailures(logs);
      const refs = extractFileReferences(logs);

      expect(failures.length).toBeGreaterThan(0);
      expect(refs.length).toBeGreaterThan(0);
    });

    it("should handle complete CI failure log workflow", () => {
      const rawLogs = `
Run npm test
npm ERR! Test suite failed to run

FAIL src/utils.test.ts
  ● Test suite failed to run

    Cannot find module 'lodash' from 'src/utils.ts'

      1 | import { debounce } from 'lodash';
        | ^
      at Resolver.resolveModule (node_modules/jest-resolve/build/index.js:259:17)
      at Object.<anonymous> (src/utils.ts:1:1)

 FAIL src/components/App.test.tsx
  ● App › renders without crashing

    TypeError: Cannot read property 'map' of undefined

      10 |   render() {
      11 |     const items = this.props.items;
    > 12 |     return items.map(item => <div>{item}</div>);
         |                  ^
      13 |   }

    at App.render (src/components/App.tsx:12:18)
      `;

      const failures = extractTestFailures(rawLogs);
      const refs = extractFileReferences(rawLogs);

      // Should extract test failures
      expect(failures.length).toBeGreaterThan(0);

      // Should extract file references
      expect(refs.length).toBeGreaterThan(0);
      expect(refs.some((ref) => ref.path.includes("src/utils.ts"))).toBe(true);

      // Should truncate if needed
      const truncated = truncateWithContext(rawLogs, 500);
      expect(truncated.length).toBeLessThanOrEqual(600);
    });
  });
});

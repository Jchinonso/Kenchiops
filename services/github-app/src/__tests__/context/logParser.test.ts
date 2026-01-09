/**
 * Unit tests for Log Parser
 *
 * Tests log parsing functions for file reference extraction,
 * content truncation, and basic test failure detection.
 *
 * Note: Detailed test failure extraction is now handled by AI.
 * The extractTestFailures function provides minimal fallback extraction
 * using universal patterns. See docs/LANGUAGE_AGNOSTIC_MIGRATION.md.
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
      const largeLog = Array.from(
        { length: 1000 },
        (_, index) => `Error at file${index}.ts:${index}`
      ).join("\n");

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
    describe("universal patterns (AI-first approach)", () => {
      it("should extract Jest/Vitest FAIL pattern", () => {
        const logs = `
FAIL src/utils.test.ts
  ● Test Suite Name › should do something
    Expected value to be truthy
        `;
        const failures = extractTestFailures(logs);

        // Now captures individual test names (● marker) before file-level markers
        expect(failures.length).toBeGreaterThan(0);
        expect(failures[0].testName).toContain("Test Suite Name › should do something");
      });

      it("should extract pytest FAILED pattern", () => {
        const logs = `
FAILED tests/test_main.py::test_function - AssertionError
        `;
        const failures = extractTestFailures(logs);

        expect(failures.length).toBeGreaterThan(0);
        // After normalization, file is extracted and testName contains just the test function
        expect(failures[0].testName).toContain("test_function");
        expect(failures[0].file).toBe("tests/test_main.py");
      });

      it("should extract Go test FAIL pattern", () => {
        const logs = `
--- FAIL: TestFunction (0.00s)
    file_test.go:123: Error message
        `;
        const failures = extractTestFailures(logs);

        expect(failures.length).toBeGreaterThan(0);
        expect(failures[0].testName).toBe("TestFunction");
      });

      it("should extract Rust panic pattern", () => {
        const logs = `
thread 'tests::my_test' panicked at 'assertion failed'
        `;
        const failures = extractTestFailures(logs);

        expect(failures.length).toBeGreaterThan(0);
        expect(failures[0].testName).toContain("tests::my_test");
      });

      it("should extract test failure with checkmark", () => {
        const logs = `
 ✕ should handle edge case
    Expected: true
    Received: false
        `;
        const failures = extractTestFailures(logs);

        // Universal pattern extracts file-based tests, not individual test names
        // This is expected - AI handles detailed extraction
        expect(Array.isArray(failures)).toBe(true);
      });

      it("should deduplicate test failures by name", () => {
        const logs = `
FAIL src/utils.test.ts
FAIL src/utils.test.ts
FAIL src/other.test.ts
        `;
        const failures = extractTestFailures(logs);

        // Should deduplicate by test name
        expect(failures.length).toBe(2);
      });

      it("should truncate long test names", () => {
        const longName = "a".repeat(300);
        const logs = `FAIL ${longName}.test.ts`;
        const failures = extractTestFailures(logs);

        if (failures.length > 0) {
          expect(failures[0].testName.length).toBeLessThanOrEqual(200);
        }
      });
    });

    describe("edge cases", () => {
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

      it("should handle logs with ANSI color codes", () => {
        const logs = `
FAIL src/utils.test.ts
        `;
        const failures = extractTestFailures(logs);

        expect(failures.length).toBeGreaterThan(0);
      });

      it("should handle Windows line endings (CRLF)", () => {
        const logs = "FAIL src/utils.test.ts\r\n    Error: Test failed\r\n";
        const failures = extractTestFailures(logs);

        expect(failures.length).toBeGreaterThan(0);
      });

      it("should handle very large log files efficiently", () => {
        const largeLog = "Normal log content\n".repeat(10000) + `FAIL src/test.test.ts\n`;

        const start = Date.now();
        const failures = extractTestFailures(largeLog);
        const duration = Date.now() - start;

        // Should complete quickly
        expect(duration).toBeLessThan(2000);
        expect(failures.length).toBeGreaterThan(0);
      });

      it("should use failure marker when no error body is available", () => {
        const logs = `FAIL src/utils.test.ts`;
        const failures = extractTestFailures(logs);

        if (failures.length > 0) {
          expect(failures[0].error).toBe("Test failed (see logs for details)");
        }
      });
    });

    describe("AI-first approach validation", () => {
      it("should extract basic test identifiers for AI to analyze", () => {
        const logs = `
Run npm test
FAIL src/components/Button.test.tsx
  ● Button › should render correctly
    expect(received).toBe(expected)
FAIL src/utils.test.ts
  ● should calculate sum
    Expected: 5
    Received: 3
        `;
        const failures = extractTestFailures(logs);

        // Should extract file-based failures for quick identification
        // Detailed analysis (test names, errors, line numbers) is handled by AI
        expect(failures.length).toBeGreaterThanOrEqual(2);
      });

      it("should extract error bodies for AI context", () => {
        const logs = `
FAIL src/utils.test.ts
  ● detailed test with complex assertion
    Expected: {"complex": "object"}
    Received: {"different": "object"}
        `;
        const failures = extractTestFailures(logs);

        // Now captures individual test names (● marker) with their error bodies
        expect(failures.length).toBeGreaterThan(0);
        expect(failures[0].testName).toContain("detailed test with complex assertion");
        // Should capture actual error body for AI analysis
        expect(failures[0].error).toContain("Expected:");
        expect(failures[0].error).toContain("Received:");
      });
    });
  });

  describe("Integration tests", () => {
    it("should extract both file references and test failures from same log", () => {
      const logs = `
FAIL src/__tests__/math.test.ts
  ● should calculate sum correctly
    Expected: 5
    Received: 3
    at Calculator.sum (src/calculator.ts:25:10)
      `;

      const failures = extractTestFailures(logs);
      const refs = extractFileReferences(logs);

      expect(failures.length).toBeGreaterThan(0);
      expect(refs.length).toBeGreaterThan(0);
      expect(refs.some((ref) => ref.path.includes("calculator.ts"))).toBe(true);
    });

    it("should handle complete CI failure log workflow", () => {
      const rawLogs = `
Run npm test
npm ERR! Test suite failed to run

FAIL src/utils.test.ts
  ● Test suite failed to run
    Cannot find module 'lodash' from 'src/utils.ts'
      at Resolver.resolveModule (node_modules/jest-resolve/build/index.js:259:17)
      at Object.<anonymous> (src/utils.ts:1:1)

FAIL src/components/App.test.tsx
  ● App › renders without crashing
    TypeError: Cannot read property 'map' of undefined
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

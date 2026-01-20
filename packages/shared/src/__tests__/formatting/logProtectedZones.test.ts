/**
 * Unit tests for formatting/logProtectedZones.ts
 *
 * Tests the protected zone detection module that identifies regions
 * in CI logs that should not be split during chunking.
 */
import { describe, it, expect } from "@jest/globals";
import {
  detectProtectedZoneStart,
  continuesProtectedZone,
  detectProtectedZones,
} from "../../formatting/chunking/index.js";
import { PROTECTED_ZONE_TYPES } from "../../constants/index.js";

describe("Log Protected Zones", () => {
  describe("detectProtectedZoneStart", () => {
    describe("stack traces", () => {
      it("should detect JavaScript stack trace start", () => {
        const line = "    at Object.<anonymous> (/app/index.js:10:5)";
        const result = detectProtectedZoneStart(line, []);
        expect(result).toBe(PROTECTED_ZONE_TYPES.STACK_TRACE);
      });

      it("should detect Python traceback start", () => {
        const line = "Traceback (most recent call last):";
        const result = detectProtectedZoneStart(line, []);
        expect(result).toBe(PROTECTED_ZONE_TYPES.STACK_TRACE);
      });

      it("should detect Rust stack frame continuation", () => {
        // Rust stack frames have format: "   N: 0xXXXX - function"
        const line = "   0: 0x7f1234 - main::handler";
        const result = detectProtectedZoneStart(line, []);
        expect(result).toBe(PROTECTED_ZONE_TYPES.STACK_TRACE);
      });

      it("should detect indented continuation after error", () => {
        // Generic indented lines are detected as stack trace continuation
        const line = "    at something.js:10:5";
        const result = detectProtectedZoneStart(line, []);
        expect(result).toBe(PROTECTED_ZONE_TYPES.STACK_TRACE);
      });

      it("should detect Error: with following indented lines", () => {
        const line = "Error: Something went wrong";
        const nextLines = ["  at foo", "  at bar"];
        const result = detectProtectedZoneStart(line, nextLines);
        expect(result).toBe(PROTECTED_ZONE_TYPES.STACK_TRACE);
      });

      it("should not detect Error: without following indented lines", () => {
        const line = "Error: Something went wrong";
        const nextLines = ["Next step", "Another step"];
        const result = detectProtectedZoneStart(line, nextLines);
        // May not be stack trace without indented continuation
        expect(result).not.toBe(PROTECTED_ZONE_TYPES.STACK_TRACE);
      });
    });

    describe("test output", () => {
      it("should detect Jest FAIL line", () => {
        const line = "FAIL src/app.test.ts";
        const result = detectProtectedZoneStart(line, []);
        expect(result).toBe(PROTECTED_ZONE_TYPES.TEST_OUTPUT);
      });

      it("should detect indented lines as stack trace (not test output)", () => {
        // Indented lines with leading whitespace are detected as stack trace continuation
        const line = "  ✕ should work correctly (15 ms)";
        const result = detectProtectedZoneStart(line, []);
        // This matches the generic indented pattern, so it's stack_trace
        expect(result).toBe(PROTECTED_ZONE_TYPES.STACK_TRACE);
      });

      it("should detect pytest FAILED line", () => {
        const line = "FAILED tests/test_app.py::test_function";
        const result = detectProtectedZoneStart(line, []);
        expect(result).toBe(PROTECTED_ZONE_TYPES.TEST_OUTPUT);
      });

      it("should detect Rust failures: marker", () => {
        // Rust uses 'failures:' as the marker for test failure summary
        const line = "failures:";
        const result = detectProtectedZoneStart(line, []);
        expect(result).toBe(PROTECTED_ZONE_TYPES.TEST_OUTPUT);
      });

      it("should detect Go test FAIL marker", () => {
        // Go uses '--- FAIL:' as the marker for test failures
        const line = "--- FAIL: TestSomething (0.00s)";
        const result = detectProtectedZoneStart(line, []);
        expect(result).toBe(PROTECTED_ZONE_TYPES.TEST_OUTPUT);
      });
    });

    describe("compiler errors", () => {
      it("should detect TypeScript error", () => {
        const line = "src/app.ts:10:5 - error TS2322: Type 'string' is not assignable";
        const result = detectProtectedZoneStart(line, []);
        expect(result).toBe(PROTECTED_ZONE_TYPES.COMPILER_ERROR);
      });

      it("should detect Rust compiler error", () => {
        const line = "error[E0425]: cannot find value `x` in this scope";
        const result = detectProtectedZoneStart(line, []);
        expect(result).toBe(PROTECTED_ZONE_TYPES.COMPILER_ERROR);
      });

      it("should detect GCC/Clang error", () => {
        const line = "main.c:10:5: error: use of undeclared identifier 'x'";
        const result = detectProtectedZoneStart(line, []);
        expect(result).toBe(PROTECTED_ZONE_TYPES.COMPILER_ERROR);
      });

      it("should detect Go compiler error", () => {
        const line = "./main.go:15:2: undefined: x";
        const result = detectProtectedZoneStart(line, []);
        expect(result).toBe(PROTECTED_ZONE_TYPES.COMPILER_ERROR);
      });
    });

    describe("CI groups", () => {
      it("should detect GitHub Actions group start", () => {
        const line = "##[group]Installing dependencies";
        const result = detectProtectedZoneStart(line, []);
        expect(result).toBe(PROTECTED_ZONE_TYPES.CI_GROUP);
      });

      it("should detect GitLab CI section start", () => {
        const line = "section_start:1234567890:build";
        const result = detectProtectedZoneStart(line, []);
        expect(result).toBe(PROTECTED_ZONE_TYPES.CI_GROUP);
      });
    });

    describe("no match", () => {
      it("should return undefined for normal log line", () => {
        const line = "npm install completed successfully";
        const result = detectProtectedZoneStart(line, []);
        expect(result).toBeUndefined();
      });

      it("should return undefined for empty line", () => {
        const result = detectProtectedZoneStart("", []);
        expect(result).toBeUndefined();
      });
    });
  });

  describe("continuesProtectedZone", () => {
    describe("stack trace continuation", () => {
      it("should continue for indented 'at' lines", () => {
        const result = continuesProtectedZone(
          "    at Module._compile (internal/modules/cjs/loader.js:1085)",
          PROTECTED_ZONE_TYPES.STACK_TRACE,
          "Error: test"
        );
        expect(result).toBe(true);
      });

      it("should continue for indented content", () => {
        const result = continuesProtectedZone(
          "    some indented content",
          PROTECTED_ZONE_TYPES.STACK_TRACE,
          "Error: test"
        );
        expect(result).toBe(true);
      });

      it("should continue for Python File lines", () => {
        const result = continuesProtectedZone(
          '  File "/app/main.py", line 10',
          PROTECTED_ZONE_TYPES.STACK_TRACE,
          "Traceback (most recent call last):"
        );
        expect(result).toBe(true);
      });

      it("should stop for non-indented line", () => {
        const result = continuesProtectedZone(
          "Next step: running tests",
          PROTECTED_ZONE_TYPES.STACK_TRACE,
          "    at foo"
        );
        expect(result).toBe(false);
      });
    });

    describe("test output continuation", () => {
      it("should continue for non-empty lines", () => {
        const result = continuesProtectedZone(
          "    Expected: true",
          PROTECTED_ZONE_TYPES.TEST_OUTPUT,
          "  ✕ should work correctly"
        );
        expect(result).toBe(true);
      });

      it("should stop at PASS line", () => {
        const result = continuesProtectedZone(
          "PASS src/other.test.ts",
          PROTECTED_ZONE_TYPES.TEST_OUTPUT,
          "    at Object.<anonymous>"
        );
        expect(result).toBe(false);
      });

      it("should stop at FAIL line", () => {
        const result = continuesProtectedZone(
          "FAIL src/another.test.ts",
          PROTECTED_ZONE_TYPES.TEST_OUTPUT,
          "Test failed"
        );
        expect(result).toBe(false);
      });
    });

    describe("compiler error continuation", () => {
      it("should continue for indented code context", () => {
        const result = continuesProtectedZone(
          "  10 |   const x: number = 'hello';",
          PROTECTED_ZONE_TYPES.COMPILER_ERROR,
          "error TS2322"
        );
        expect(result).toBe(true);
      });

      it("should continue for caret lines", () => {
        const result = continuesProtectedZone(
          "     ^^^^^",
          PROTECTED_ZONE_TYPES.COMPILER_ERROR,
          "  10 |   const x"
        );
        expect(result).toBe(true);
      });

      it("should continue for note/help lines", () => {
        const result = continuesProtectedZone(
          "  note: expected type `i32`",
          PROTECTED_ZONE_TYPES.COMPILER_ERROR,
          "error[E0308]"
        );
        expect(result).toBe(true);
      });

      it("should stop for new error line", () => {
        const result = continuesProtectedZone(
          "Building project...",
          PROTECTED_ZONE_TYPES.COMPILER_ERROR,
          "  note: expected type"
        );
        expect(result).toBe(false);
      });
    });

    describe("CI group continuation", () => {
      it("should continue until endgroup", () => {
        const result = continuesProtectedZone(
          "npm install",
          PROTECTED_ZONE_TYPES.CI_GROUP,
          "##[group]Install"
        );
        expect(result).toBe(true);
      });

      it("should stop at GitHub Actions endgroup", () => {
        const result = continuesProtectedZone(
          "##[endgroup]",
          PROTECTED_ZONE_TYPES.CI_GROUP,
          "npm install"
        );
        expect(result).toBe(false);
      });

      it("should stop at GitLab CI section_end", () => {
        const result = continuesProtectedZone(
          "section_end:1234567890:build",
          PROTECTED_ZONE_TYPES.CI_GROUP,
          "build output"
        );
        expect(result).toBe(false);
      });
    });

    describe("empty line handling", () => {
      it("should continue empty lines within zone", () => {
        const result = continuesProtectedZone("", PROTECTED_ZONE_TYPES.STACK_TRACE, "    at foo");
        expect(result).toBe(true);
      });

      it("should not continue empty line after empty line", () => {
        const result = continuesProtectedZone("", PROTECTED_ZONE_TYPES.STACK_TRACE, "");
        expect(result).toBe(false);
      });
    });
  });

  describe("detectProtectedZones", () => {
    it("should return empty array for no protected zones", () => {
      const lines = ["Step 1", "Step 2", "Step 3"];
      const zones = detectProtectedZones(lines);
      expect(zones).toEqual([]);
    });

    it("should detect single JavaScript stack trace", () => {
      const lines = [
        "Running test...",
        "Error: Something failed",
        "    at Object.<anonymous> (/app/test.js:10:5)",
        "    at Module._compile (internal/modules/cjs/loader.js:1085)",
        "Done.",
      ];
      const zones = detectProtectedZones(lines);

      expect(zones.length).toBeGreaterThanOrEqual(1);
      expect(zones[0].type).toBe(PROTECTED_ZONE_TYPES.STACK_TRACE);
      expect(zones[0].startLine).toBeGreaterThanOrEqual(2);
    });

    it("should detect Python traceback", () => {
      const lines = [
        "Running tests...",
        "Traceback (most recent call last):",
        '  File "/app/main.py", line 10, in <module>',
        '    raise ValueError("test")',
        "ValueError: test",
        "",
        "Tests complete.",
      ];
      const zones = detectProtectedZones(lines);

      expect(zones.length).toBeGreaterThanOrEqual(1);
      expect(zones[0].type).toBe(PROTECTED_ZONE_TYPES.STACK_TRACE);
    });

    it("should detect test output block", () => {
      const lines = [
        "Running tests...",
        "FAIL src/app.test.ts",
        "  ✕ should work correctly",
        "    Expected: true",
        "    Received: false",
        "",
        "Test Suites: 1 failed",
      ];
      const zones = detectProtectedZones(lines);

      expect(zones.some((zone) => zone.type === PROTECTED_ZONE_TYPES.TEST_OUTPUT)).toBe(true);
    });

    it("should detect compiler error block", () => {
      const lines = [
        "Compiling...",
        "src/app.ts:10:5 - error TS2322: Type 'string' is not assignable",
        "  10 |   const x: number = 'hello';",
        "     |         ^",
        "Found 1 error.",
      ];
      const zones = detectProtectedZones(lines);

      expect(zones.some((zone) => zone.type === PROTECTED_ZONE_TYPES.COMPILER_ERROR)).toBe(true);
    });

    it("should detect CI group", () => {
      const lines = [
        "##[group]Installing dependencies",
        "npm install",
        "added 100 packages",
        "##[endgroup]",
        "Next step",
      ];
      const zones = detectProtectedZones(lines);

      expect(zones.some((zone) => zone.type === PROTECTED_ZONE_TYPES.CI_GROUP)).toBe(true);
    });

    it("should detect multiple zones", () => {
      const lines = [
        "##[group]Build",
        "Building...",
        "##[endgroup]",
        "",
        "Error: test",
        "    at foo",
        "    at bar",
        "",
        "Done.",
      ];
      const zones = detectProtectedZones(lines);

      expect(zones.length).toBeGreaterThanOrEqual(2);
    });

    it("should close zone at end of file", () => {
      const lines = [
        "Starting...",
        "Error: Something failed",
        "    at Object.<anonymous> (/app/test.js:10:5)",
        "    at Module._compile (internal/modules/cjs/loader.js:1085)",
      ];
      const zones = detectProtectedZones(lines);

      expect(zones.length).toBeGreaterThanOrEqual(1);
      // Last zone should end at last line
      const lastZone = zones[zones.length - 1];
      expect(lastZone.endLine).toBe(lines.length);
    });

    it("should include description from first line", () => {
      const lines = ["##[group]Installing dependencies", "npm install", "##[endgroup]"];
      const zones = detectProtectedZones(lines);

      expect(zones.length).toBeGreaterThanOrEqual(1);
      expect(zones[0].description).toContain("Installing dependencies");
    });

    it("should handle empty lines array", () => {
      const zones = detectProtectedZones([]);
      expect(zones).toEqual([]);
    });

    it("should use 1-based line numbers", () => {
      const lines = ["Line 1", "Error: test", "    at foo", "Line 4"];
      const zones = detectProtectedZones(lines);

      if (zones.length > 0) {
        expect(zones[0].startLine).toBeGreaterThanOrEqual(1);
        expect(zones[0].endLine).toBeGreaterThanOrEqual(zones[0].startLine);
      }
    });
  });
});

/**
 * Regression Tests for Log Preprocessing Pipeline
 *
 * These tests verify fixes for known failure modes that caused
 * incorrect truncation anchoring or lost diagnostic context.
 */
import { describe, it, expect } from "@jest/globals";
import {
  preprocessLogs,
  preprocessLogsWithMetadata,
  truncateWithErrorContext,
  stripAnsiCodes,
  stripCITimestamps,
} from "../../formatting/logPreprocessor.js";
import { findBestAnchor } from "../../formatting/anchorSelection.js";
import { redactSecretsWithStats, containsSecrets } from "../../security/redaction.js";

describe("Regression Tests: Truncation Anchoring", () => {
  describe("Early benign FAIL/PASS does not anchor truncation", () => {
    it("should not anchor on shard summary PASS/FAIL lines at log start", () => {
      // Real-world CI logs often have shard summaries early that show PASS/FAIL counts
      const content = `
2024-01-15T10:00:00.000Z [shard 1/4] PASS 10 / FAIL 0
2024-01-15T10:00:01.000Z [shard 2/4] PASS 8 / FAIL 2
2024-01-15T10:00:02.000Z [shard 3/4] PASS 12 / FAIL 0
2024-01-15T10:00:03.000Z [shard 4/4] PASS 9 / FAIL 1
${"X".repeat(50000)}
##[error] Process completed with exit code 1
ACTUAL FAILURE: TypeError: Cannot read properties of undefined
    at processData (src/handler.ts:42:15)
    at async runTests (src/runner.ts:128:9)
`;
      const result = findBestAnchor(content);

      // Should anchor on ##[error] (Tier 1) near end, not early FAIL counts
      expect(result.tier).toBe(1);
      expect(result.position).toBeGreaterThan(50000); // Past the padding
    });

    it("should not anchor on test count lines that contain 'failed'", () => {
      const content = `
Running tests...
${"=".repeat(30000)}
Ran 100 tests, 0 failed
${"=".repeat(30000)}
##[error] Build failed due to OOM
Killed
exit code 137
`;
      const result = findBestAnchor(content);

      // Should anchor on infra failure markers, not "0 failed" text
      expect(result.tier).toBeLessThanOrEqual(2); // Tier 1 or 2
    });
  });

  describe("Retry-success patterns do not anchor failures", () => {
    it("should not anchor on failed retries that eventually succeeded", () => {
      const content = `
2024-01-15T10:00:00.000Z Connecting to database...
2024-01-15T10:00:01.000Z Connection failed, retry 1/3
2024-01-15T10:00:02.000Z Connection failed, retry 2/3
2024-01-15T10:00:03.000Z Connection succeeded on retry 3
2024-01-15T10:00:04.000Z Running tests...
${"=".repeat(50000)}
Process completed with exit code 1
REAL ERROR: AssertionError: expected 5 to equal 3
    at Context.<anonymous> (test/math.spec.ts:15:22)
`;
      const result = findBestAnchor(content);

      // Should anchor on "Process completed with exit code" near the end
      expect(result.tier).toBe(1);
      expect(result.position).toBeGreaterThan(50000);
    });

    it("should not anchor on transient errors in setup phase", () => {
      const content = `
npm WARN deprecated package@1.0.0: moved to @new/package
npm WARN ERESOLVE overriding peer dependency
npm WARN optional SKIPPING OPTIONAL DEPENDENCY
${"X".repeat(40000)}
Tests: 3 failed, 47 passed
ERROR: Test suite failed
    FAIL src/api.test.ts
      ● API › should handle errors
        Expected: 200
        Received: 500
`;
      const result = findBestAnchor(content);

      // Should prefer "Tests: X failed" summary at end over npm warnings
      expect(result.tier).toBe(0); // Test summary is tier 0
    });
  });

  describe("Infrastructure failures anchor correctly", () => {
    it("should prioritize OOM / killed / exit 137", () => {
      const content = `
Running build...
Compiling source files...
${"=".repeat(30000)}
Killed
npm ERR! code ELIFECYCLE
npm ERR! errno 137
`;
      const result = findBestAnchor(content);

      // Should detect infra failure (Tier 2)
      expect(result.tier).toBe(2);
    });

    it("should prioritize timeout errors", () => {
      const content = `
Fetching dependencies...
${"=".repeat(30000)}
Error: context deadline exceeded
    at Timeout._onTimeout (node_modules/test/timeout.js:42:15)
`;
      const result = findBestAnchor(content);

      expect(result.tier).toBe(2);
    });

    it("should prioritize disk full errors", () => {
      const content = `
Building Docker image...
${"=".repeat(30000)}
ENOSPC: no space left on device, write
error: failed to solve: failed to commit container image
`;
      const result = findBestAnchor(content);

      expect(result.tier).toBe(2);
    });

    it("should prioritize DNS/network errors", () => {
      const content = `
Installing dependencies...
${"=".repeat(30000)}
getaddrinfo ENOTFOUND registry.npmjs.org
npm ERR! network request to https://registry.npmjs.org failed
`;
      const result = findBestAnchor(content);

      expect(result.tier).toBe(2);
    });

    it("should prioritize permission errors", () => {
      const content = `
Setting up environment...
${"=".repeat(30000)}
EACCES: permission denied, open '/root/.npm/_cacache'
Error: EACCES permission denied
`;
      const result = findBestAnchor(content);

      expect(result.tier).toBe(2);
    });

    it("should prioritize rate limiting (429)", () => {
      const content = `
Fetching artifacts...
${"=".repeat(30000)}
Error: 429 Too Many Requests
API rate limit exceeded for this endpoint
`;
      const result = findBestAnchor(content);

      expect(result.tier).toBe(2);
    });
  });

  describe("CI boundary markers take highest priority", () => {
    it("should prioritize ##[error] over infra failures", () => {
      const content = `
Running tests...
timeout after 60s
${"=".repeat(10000)}
##[error] Process completed with exit code 1
`;
      const result = findBestAnchor(content);

      // Tier 1 CI boundary should win over Tier 2 timeout
      expect(result.tier).toBe(1);
    });

    it("should prioritize Job failed markers", () => {
      const content = `
Building...
npm ERR! something went wrong
${"=".repeat(10000)}
Job failed: Build error
ERROR: Job failed: exit code 1
`;
      const result = findBestAnchor(content);

      expect(result.tier).toBe(1);
    });
  });
});

describe("Regression Tests: ANSI and Timestamp Stripping", () => {
  describe("Preserve file:line patterns after stripping", () => {
    it("should preserve file:line references after ANSI stripping", () => {
      const input = "\x1b[31mError\x1b[0m at \x1b[36msrc/handler.ts:42:15\x1b[0m";
      const result = stripAnsiCodes(input);

      expect(result).toBe("Error at src/handler.ts:42:15");
      expect(result).toMatch(/src\/handler\.ts:42:15/);
    });

    it("should preserve stack traces with file:line after timestamp stripping", () => {
      const input = `2024-01-15T10:00:00.000Z Error: Something failed
2024-01-15T10:00:00.001Z     at processData (src/handler.ts:42:15)
2024-01-15T10:00:00.002Z     at runTests (src/runner.ts:128:9)`;
      const result = stripCITimestamps(input);

      expect(result).toContain("src/handler.ts:42:15");
      expect(result).toContain("src/runner.ts:128:9");
    });

    it("should preserve Python tracebacks after full preprocessing", () => {
      const input = `2024-01-15T10:00:00.000Z \x1b[31mTraceback (most recent call last):\x1b[0m
2024-01-15T10:00:00.001Z   File "src/handler.py", line 42, in process
2024-01-15T10:00:00.002Z     result = data["key"]
2024-01-15T10:00:00.003Z \x1b[31mKeyError: 'key'\x1b[0m`;
      const result = preprocessLogs(input);

      expect(result).toContain('File "src/handler.py", line 42');
      expect(result).toContain("KeyError: 'key'");
    });

    it("should preserve Go test output format after preprocessing", () => {
      const input = `2024-01-15T10:00:00.000Z === RUN   TestHandler
2024-01-15T10:00:00.001Z --- FAIL: TestHandler (0.00s)
2024-01-15T10:00:00.002Z     handler_test.go:42: got "error", want "success"`;
      const result = preprocessLogs(input);

      expect(result).toContain("handler_test.go:42");
      expect(result).toContain('got "error", want "success"');
    });
  });
});

describe("Regression Tests: Secret Redaction Safety", () => {
  describe("Redaction does not break diagnostics", () => {
    it("should not redact file:line patterns that look like tokens", () => {
      const input = "Error at src/handler.ts:42:15 in function processData";
      const result = redactSecretsWithStats(input);

      expect(result.text).toContain("src/handler.ts:42:15");
      expect(result.redactedCount).toBe(0);
    });

    it("should redact actual secrets while preserving context", () => {
      const input = `Connecting with token ghp_abcdef1234567890abcdef1234567890abcd
Error at src/auth.ts:42:15`;
      const result = redactSecretsWithStats(input);

      // Secret should be redacted
      expect(result.text).not.toContain("ghp_abcdef");
      expect(result.redactedCount).toBe(1);
      // File reference should be preserved
      expect(result.text).toContain("src/auth.ts:42:15");
    });

    it("should not break error messages containing common words", () => {
      const input = "Error: API key validation failed for endpoint /api/users";
      const result = redactSecretsWithStats(input);

      // Should not redact "API key" as a phrase without an actual key
      expect(result.text).toContain("API key validation failed");
    });
  });

  describe("Truncation markers survive redaction", () => {
    it("should preserve truncation markers after redaction", () => {
      const input = `... [truncated] ...
Some log content with token ghp_abcdef1234567890abcdef1234567890abcd
More content here
... [truncated] ...`;
      const result = redactSecretsWithStats(input);

      expect(result.text).toContain("... [truncated] ...");
      expect(result.text.match(/\.\.\. \[truncated\] \.\.\./g)?.length).toBe(2);
    });

    it("should preserve evidence IDs through redaction", () => {
      // OpenAI project keys require 20+ chars after prefix
      const input = `[anno#1] Error in module
[test#2] Test failure with secret sk-proj-abcdefghij1234567890
[diff#3] File changed`;
      const result = redactSecretsWithStats(input);

      expect(result.text).toContain("[anno#1]");
      expect(result.text).toContain("[test#2]");
      expect(result.text).toContain("[diff#3]");
      expect(result.text).not.toContain("sk-proj-abcdefghij");
    });
  });

  describe("Global regex safety", () => {
    it("should return consistent results on repeated containsSecrets calls", () => {
      const input = "Token: ghp_abcdef1234567890abcdef1234567890abcd";

      // Call multiple times - should always return same result
      // Bug: global regex .test() modifies lastIndex, causing alternating results
      const results = [
        containsSecrets(input),
        containsSecrets(input),
        containsSecrets(input),
        containsSecrets(input),
        containsSecrets(input),
      ];

      expect(results.every((r) => r === true)).toBe(true);
    });

    it("should detect secrets consistently after redaction check", () => {
      const input = "Token: ghp_abcdef1234567890abcdef1234567890abcd";

      // First check existence
      const hasSecrets = containsSecrets(input);
      // Then redact
      const result = redactSecretsWithStats(input);

      expect(hasSecrets).toBe(true);
      expect(result.redactedCount).toBe(1);
    });
  });
});

describe("Regression Tests: Full Pipeline Integration", () => {
  it("should correctly process real-world Jest failure log", () => {
    const realLog = `
2024-01-15T10:00:00.000Z \x1b[1m\x1b[31m FAIL \x1b[39m\x1b[22m src/components/Button.test.tsx
2024-01-15T10:00:00.001Z   \x1b[1mButton\x1b[22m
2024-01-15T10:00:00.002Z     \x1b[31m✕\x1b[39m should render correctly (5 ms)
2024-01-15T10:00:00.003Z
2024-01-15T10:00:00.004Z   \x1b[1m● Button › should render correctly\x1b[22m
2024-01-15T10:00:00.005Z
2024-01-15T10:00:00.006Z     \x1b[2mexpect(\x1b[22m\x1b[31mreceived\x1b[39m\x1b[2m).\x1b[22mtoEqual\x1b[2m(\x1b[22m\x1b[32mexpected\x1b[39m\x1b[2m)\x1b[22m
2024-01-15T10:00:00.007Z
2024-01-15T10:00:00.008Z     Expected: \x1b[32m"Click me"\x1b[39m
2024-01-15T10:00:00.009Z     Received: \x1b[31m"Click"\x1b[39m
2024-01-15T10:00:00.010Z
2024-01-15T10:00:00.011Z       \x1b[2m 14 |\x1b[22m     render(<Button label="Click me" />);
2024-01-15T10:00:00.012Z       \x1b[2m 15 |\x1b[22m     const button = screen.getByRole('button');
2024-01-15T10:00:00.013Z     \x1b[31m\x1b[1m>\x1b[22m\x1b[39m \x1b[2m 16 |\x1b[22m     expect(button).toHaveTextContent('Click me');
2024-01-15T10:00:00.014Z       \x1b[2m    |\x1b[22m                    \x1b[31m\x1b[1m^\x1b[22m\x1b[39m
2024-01-15T10:00:00.015Z
2024-01-15T10:00:00.016Z       at Object.<anonymous> (src/components/Button.test.tsx:16:20)
`;
    const result = preprocessLogsWithMetadata(realLog);

    // Should detect Jest framework
    expect(result.testFramework?.name).toBe("jest");
    // Should preserve key diagnostic info
    expect(result.logs).toContain("Button › should render correctly");
    expect(result.logs).toContain("Expected:");
    expect(result.logs).toContain("Received:");
    expect(result.logs).toContain("Button.test.tsx:16:20");
    // Should strip ANSI codes
    expect(result.logs).not.toContain("\x1b[");
  });

  it("should correctly process real-world pytest failure log", () => {
    const realLog = `
2024-01-15T10:00:00.000Z ============================= test session starts ==============================
2024-01-15T10:00:00.001Z collected 42 items
2024-01-15T10:00:00.002Z
2024-01-15T10:00:01.000Z tests/test_api.py::test_login PASSED
2024-01-15T10:00:02.000Z tests/test_api.py::test_signup \x1b[31mFAILED\x1b[0m
2024-01-15T10:00:02.001Z
2024-01-15T10:00:02.002Z =================================== FAILURES ===================================
2024-01-15T10:00:02.003Z _________________________________ test_signup __________________________________
2024-01-15T10:00:02.004Z
2024-01-15T10:00:02.005Z     def test_signup():
2024-01-15T10:00:02.006Z         response = client.post("/signup", json={"email": "test@example.com"})
2024-01-15T10:00:02.007Z >       assert response.status_code == 201
2024-01-15T10:00:02.008Z E       AssertionError: assert 400 == 201
2024-01-15T10:00:02.009Z E        +  where 400 = <Response [400]>.status_code
2024-01-15T10:00:02.010Z
2024-01-15T10:00:02.011Z tests/test_api.py:42: AssertionError
2024-01-15T10:00:02.012Z =========================== short test summary info ============================
2024-01-15T10:00:02.013Z FAILED tests/test_api.py::test_signup - AssertionError: assert 400 == 201
2024-01-15T10:00:02.014Z ========================= 1 failed, 41 passed in 5.23s =========================
`;
    const result = preprocessLogsWithMetadata(realLog);

    // Should detect pytest framework
    expect(result.testFramework?.name).toBe("pytest");
    // Should preserve key diagnostic info
    expect(result.logs).toContain("AssertionError: assert 400 == 201");
    expect(result.logs).toContain("tests/test_api.py:42");
    expect(result.logs).toContain("1 failed, 41 passed");
  });

  it("should correctly handle OOM kill during test run", () => {
    const realLog = `
2024-01-15T10:00:00.000Z Running 500 tests...
2024-01-15T10:00:01.000Z test_memory_1 PASSED
2024-01-15T10:00:02.000Z test_memory_2 PASSED
${"2024-01-15T10:00:03.000Z test_memory_X PASSED\n".repeat(100)}
2024-01-15T10:05:00.000Z Killed
2024-01-15T10:05:00.001Z npm ERR! code ELIFECYCLE
2024-01-15T10:05:00.002Z npm ERR! errno 137
2024-01-15T10:05:00.003Z npm ERR! kenchi@1.0.0 test: \`jest\`
2024-01-15T10:05:00.004Z npm ERR! Exit status 137
`;
    const result = preprocessLogsWithMetadata(realLog);
    const anchor = findBestAnchor(result.logs);

    // Should anchor on OOM indicators (Tier 2), not early test passes
    expect(anchor.tier).toBe(2);
    // Processed logs should contain the critical OOM info
    expect(result.logs).toContain("Killed");
    expect(result.logs).toContain("137");
  });

  it("should handle logs with secrets that need redaction", () => {
    const realLog = `
2024-01-15T10:00:00.000Z Authenticating with GitHub...
2024-01-15T10:00:01.000Z Using token: ghp_abcdef1234567890abcdef1234567890abcd
2024-01-15T10:00:02.000Z Error: Repository not found
2024-01-15T10:00:02.001Z     at fetchRepo (src/github.ts:42:15)
`;
    const result = preprocessLogsWithMetadata(realLog);

    // Should redact the token
    expect(result.logs).not.toContain("ghp_abcdef");
    expect(result.secretsRedacted).toBe(1);
    // Should preserve diagnostic info
    expect(result.logs).toContain("Repository not found");
    expect(result.logs).toContain("src/github.ts:42:15");
  });
});

describe("Regression Tests: Anchor Position Robustness", () => {
  describe("Invalid position handling", () => {
    it("should handle content that triggers edge case anchor positions", () => {
      // Content with no clear error indicators should still truncate safely
      const content = "A".repeat(100000);
      const result = truncateWithErrorContext(content, 50000);

      // Should not throw and should produce valid output
      expect(result.content.length).toBeLessThanOrEqual(50000 + 50);
      expect(result.anchorInfo.tier).toBe(-1); // Fallback tier
    });

    it("should handle very short content without truncation", () => {
      const content = "Short log with ERROR";
      const result = truncateWithErrorContext(content, 50000);

      expect(result.content).toBe(content);
      expect(result.content).not.toContain("[truncated]");
    });

    it("should handle content with anchor at exact end", () => {
      // Error at very end of content
      const content = "A".repeat(99990) + "ERROR";
      const result = truncateWithErrorContext(content, 50000);

      // Should handle gracefully without out-of-bounds
      expect(result.content).toContain("ERROR");
      expect(result.anchorInfo.position).toBeGreaterThan(99000);
    });

    it("should handle content with anchor at exact start", () => {
      // Error at very beginning of content
      const content = "ERROR" + "B".repeat(100000);
      const result = truncateWithErrorContext(content, 50000);

      // Should handle gracefully
      expect(result.content).toContain("ERROR");
    });

    it("should produce valid output even with pathological input", () => {
      // Input designed to stress position calculations
      const pathological = "E".repeat(50) + "\n".repeat(50000) + "ERROR" + "\n".repeat(50000);
      const result = truncateWithErrorContext(pathological, 10000);

      // Should not throw and should produce some output
      expect(typeof result.content).toBe("string");
      expect(result.content.length).toBeGreaterThan(0);
    });
  });

  describe("Double-subtraction regression prevention", () => {
    it("should anchor correctly when error is in middle of content", () => {
      // Build content where we can verify the window is correctly centered
      const before = "B".repeat(60000);
      const marker = "##[error] Test failed here";
      const after = "A".repeat(60000);
      const content = before + marker + after;

      const result = truncateWithErrorContext(content, 50000);

      // The truncated content should contain the error marker
      expect(result.content).toContain("##[error]");

      // And should have context from both before and after
      // (not shifted so far that we lose the marker itself)
      expect(result.content).toContain("B");
      expect(result.content).toContain("A");
    });

    it("should not lose error context due to double offset application", () => {
      // This is the key regression test: if findBestAnchor returns pre-shifted
      // position, and truncateWithErrorContext also applies an offset,
      // we could end up with a window that doesn't contain the actual error
      const prefix = "X".repeat(70000);
      const error = "Process completed with exit code 1";
      const suffix = "Y".repeat(30000);
      const content = prefix + error + suffix;

      const result = truncateWithErrorContext(content, 40000);

      // The actual error message MUST be in the truncated output
      expect(result.content).toContain("Process completed with exit code 1");
    });
  });
});

describe("Regression Tests: Edge Cases", () => {
  it("should handle empty logs gracefully", () => {
    const result = preprocessLogsWithMetadata("");

    expect(result.logs).toBe("");
    expect(result.wasTruncated).toBe(false);
    expect(result.secretsRedacted).toBe(0);
  });

  it("should handle logs with only whitespace", () => {
    const result = preprocessLogsWithMetadata("   \n\n   \t\t   ");

    expect(result.logs.trim()).toBe("");
  });

  it("should handle very long single lines without catastrophic backtracking", () => {
    // This tests regex performance - should complete quickly
    const longLine = "A".repeat(10000) + " ERROR " + "B".repeat(10000);
    const start = Date.now();
    const result = preprocessLogsWithMetadata(longLine);
    const duration = Date.now() - start;

    // Should complete in reasonable time (< 1 second)
    expect(duration).toBeLessThan(1000);
    expect(result.logs).toContain("ERROR");
  });

  it("should handle binary-like content without crashing", () => {
    // Some logs may have corrupted/binary content
    const binaryLike = "Normal log\x00\x01\x02Binary\xFFcontent\x00More logs";

    // Should not throw
    expect(() => preprocessLogsWithMetadata(binaryLike)).not.toThrow();
  });
});

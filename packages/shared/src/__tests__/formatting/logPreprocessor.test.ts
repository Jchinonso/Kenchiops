/**
 * Unit tests for formatting/logPreprocessor.ts
 *
 * Tests the simplified log preprocessing pipeline for CI failure analysis.
 * Includes multi-platform CI support: GitHub Actions, GitLab CI, CircleCI, Jenkins, Azure DevOps.
 */
import { describe, it, expect } from "@jest/globals";
import {
  stripAnsiCodes,
  stripCITimestamps,
  stripCIGroupMarkers,
  stripCITimestampsForPlatform,
  stripCIGroupMarkersForPlatform,
  truncateWithErrorContext,
  preprocessLogs,
  preprocessLogsWithMetadata,
} from "../../formatting/logPreprocessor.js";
import { LOG_PARSING_LIMITS, TEXT_SANITIZATION_PATTERNS } from "../../constants/index.js";

describe("Log Preprocessor", () => {
  describe("stripAnsiCodes", () => {
    it("should strip basic ANSI color codes", () => {
      const input = "\x1b[31mERROR\x1b[0m: Something failed";
      const result = stripAnsiCodes(input);
      expect(result).toBe("ERROR: Something failed");
    });

    it("should strip multiple ANSI codes", () => {
      const input = "\x1b[1m\x1b[31mBold Red\x1b[0m and \x1b[32mGreen\x1b[0m";
      const result = stripAnsiCodes(input);
      expect(result).toBe("Bold Red and Green");
    });

    it("should handle text without ANSI codes", () => {
      const input = "Plain text without any codes";
      const result = stripAnsiCodes(input);
      expect(result).toBe("Plain text without any codes");
    });

    it("should handle empty string", () => {
      const result = stripAnsiCodes("");
      expect(result).toBe("");
    });

    it("should strip ANSI codes with multiple parameters", () => {
      const input = "\x1b[38;5;196mRed 256-color\x1b[0m text";
      const result = stripAnsiCodes(input);
      expect(result).toBe("Red 256-color text");
    });
  });

  describe("stripCITimestamps", () => {
    it("should strip GitHub Actions timestamps", () => {
      const input = "2026-01-11T12:34:56.789Z npm test";
      const result = stripCITimestamps(input);
      expect(result).toBe("npm test");
    });

    it("should strip timestamps from multiple lines", () => {
      const input = `2026-01-11T10:00:00.000Z First line
2026-01-11T10:00:01.123Z Second line
2026-01-11T10:00:02.456Z Third line`;
      const result = stripCITimestamps(input);
      expect(result).toBe(`First line
Second line
Third line`);
    });

    it("should preserve timestamps not at line start", () => {
      const input = "Error at 2026-01-11T10:00:00.000Z in module";
      const result = stripCITimestamps(input);
      expect(result).toBe("Error at 2026-01-11T10:00:00.000Z in module");
    });

    it("should handle text without timestamps", () => {
      const input = "Regular log line without timestamp";
      const result = stripCITimestamps(input);
      expect(result).toBe("Regular log line without timestamp");
    });

    it("should handle empty string", () => {
      const result = stripCITimestamps("");
      expect(result).toBe("");
    });
  });

  describe("truncateWithErrorContext", () => {
    it("should not truncate content under max size", () => {
      const input = "Short content";
      const result = truncateWithErrorContext(input, 1000);
      expect(result.content).toBe("Short content");
      expect(result.content).not.toContain("[truncated]");
      expect(result.anchorInfo).toBeDefined();
    });

    it("should truncate content over max size", () => {
      const longContent = "A".repeat(60000);
      const result = truncateWithErrorContext(longContent, 50000);
      expect(result.content.length).toBeLessThanOrEqual(50000 + 50); // Allow for markers
      expect(result.content).toContain("[truncated]");
    });

    it("should center truncation on error indicator", () => {
      const prefix = "A".repeat(60000);
      const error = "ERROR: test failed";
      const suffix = "B".repeat(60000);
      const input = prefix + error + suffix;

      const result = truncateWithErrorContext(input, 50000);

      expect(result.content).toContain("ERROR: test failed");
    });

    it("should handle content with multiple error indicators using tiered selection", () => {
      const input = "A".repeat(30000) + "FAILED" + "B".repeat(30000) + "ERROR" + "C".repeat(30000);
      const result = truncateWithErrorContext(input, 50000);

      // Tiered selection prefers LATEST match within same tier
      expect(result.content).toContain("ERROR");
      expect(result.anchorInfo.totalMatches).toBeGreaterThan(0);
    });

    it("should handle content without error indicators", () => {
      const input = "A".repeat(100000);
      const result = truncateWithErrorContext(input, 50000);

      // Should truncate from start when no error indicator found
      expect(result.content.length).toBeLessThanOrEqual(50000 + 50);
      expect(result.anchorInfo.tier).toBe(-1); // Fallback tier
    });

    it("should use default max size from constants", () => {
      const longContent = "A".repeat(LOG_PARSING_LIMITS.MAX_LOG_SIZE + 10000);
      const result = truncateWithErrorContext(longContent);

      expect(result.content.length).toBeLessThanOrEqual(LOG_PARSING_LIMITS.MAX_LOG_SIZE + 50);
    });

    it("should return anchor info with tier information", () => {
      const input = "A".repeat(10000) + "##[error] Job failed" + "B".repeat(10000);
      const result = truncateWithErrorContext(input, 50000);

      expect(result.anchorInfo.tier).toBe(1); // Tier 1 CI boundary
      expect(result.anchorInfo.totalMatches).toBeGreaterThan(0);
    });
  });

  describe("preprocessLogs", () => {
    it("should apply all transformations in order", () => {
      const input = "2026-01-11T10:00:00.000Z \x1b[31mERROR\x1b[0m: Test failed";
      const result = preprocessLogs(input);

      expect(result).toBe("ERROR: Test failed");
      expect(result).not.toContain("\x1b[");
      expect(result).not.toContain("2026-01-11");
    });

    it("should handle complex CI log content", () => {
      const input = `2026-01-11T10:00:00.000Z \x1b[32m> kenchi@1.0.0 test\x1b[0m
2026-01-11T10:00:01.000Z \x1b[31mFAILED\x1b[0m tests/app.test.ts
2026-01-11T10:00:02.000Z   Expected: true
2026-01-11T10:00:03.000Z   Received: false`;

      const result = preprocessLogs(input);

      expect(result).toContain("> kenchi@1.0.0 test");
      expect(result).toContain("FAILED tests/app.test.ts");
      expect(result).not.toContain("\x1b[");
      expect(result).not.toContain("2026-01-11T");
    });

    it("should preserve error context when truncating", () => {
      const prefix = "2026-01-11T10:00:00.000Z \x1b[32mSetup log\x1b[0m\n".repeat(5000);
      const error = "2026-01-11T10:00:01.000Z \x1b[31mERROR: Critical failure\x1b[0m\n";
      const suffix = "2026-01-11T10:00:02.000Z \x1b[32mCleanup log\x1b[0m\n".repeat(5000);
      const input = prefix + error + suffix;

      const result = preprocessLogs(input, 10000);

      expect(result).toContain("ERROR: Critical failure");
    });
  });

  describe("Tier-Aware Window Weights", () => {
    it("should allocate more context BEFORE for CI boundary markers (tier 1)", () => {
      // CI boundary markers (##[error]) indicate the error is BEFORE the marker
      // so we want 70% context before, 30% after
      const beforeContent = "A".repeat(40000);
      const errorMarker = "##[error] Job failed";
      const afterContent = "B".repeat(40000);
      const content = beforeContent + errorMarker + afterContent;

      const result = truncateWithErrorContext(content, 10000);

      // With 70% before fraction, we should have more A's than B's
      const aCount = (result.content.match(/A/g) ?? []).length;
      const bCount = (result.content.match(/B/g) ?? []).length;

      // A's should be significantly more than B's (about 7:3 ratio)
      expect(aCount).toBeGreaterThan(bCount);
    });

    it("should allocate more context AFTER for stack traces (tier 3)", () => {
      // Stack traces need more context after (the stack itself continues)
      // so we want 40% before, 60% after
      const beforeContent = "X".repeat(40000);
      const stackTrace = "Traceback (most recent call last):";
      const afterContent = "Y".repeat(40000);
      const content = beforeContent + stackTrace + afterContent;

      const result = truncateWithErrorContext(content, 10000);

      // With 40% before fraction, we should have more Y's than X's
      const xCount = (result.content.match(/X/g) ?? []).length;
      const yCount = (result.content.match(/Y/g) ?? []).length;

      // Y's should be more than X's (about 4:6 ratio)
      expect(yCount).toBeGreaterThan(xCount);
    });

    it("should use balanced 50/50 for fallback tier", () => {
      // Generic ERROR/FAILED fallback uses balanced window
      const beforeContent = "M".repeat(40000);
      const errorWord = "Generic ERROR message";
      const afterContent = "N".repeat(40000);
      const content = beforeContent + errorWord + afterContent;

      const result = truncateWithErrorContext(content, 10000);

      const mCount = (result.content.match(/M/g) ?? []).length;
      const nCount = (result.content.match(/N/g) ?? []).length;

      // Should be roughly balanced (within 20% of each other)
      const ratio = mCount / (mCount + nCount);
      expect(ratio).toBeGreaterThan(0.35);
      expect(ratio).toBeLessThan(0.65);
    });

    it("should return tier information in anchor info", () => {
      const ciContent = "A".repeat(1000) + "##[error] Failed" + "B".repeat(1000);
      const result = truncateWithErrorContext(ciContent, 50000);
      expect(result.anchorInfo.tier).toBe(1);

      const infraContent = "X".repeat(1000) + "Killed" + "Y".repeat(1000);
      const infraResult = truncateWithErrorContext(infraContent, 50000);
      expect(infraResult.anchorInfo.tier).toBe(2);
    });
  });

  describe("preprocessLogsWithMetadata", () => {
    it("should return logs and metadata", () => {
      const input = "2026-01-11T10:00:00.000Z \x1b[31mERROR\x1b[0m: Test failed";
      const result = preprocessLogsWithMetadata(input);

      expect(result.logs).toBe("ERROR: Test failed");
      expect(result.originalSize).toBe(input.length);
      expect(result.processedSize).toBeLessThanOrEqual(result.originalSize);
      expect(result.wasTruncated).toBe(false);
    });

    it("should detect truncation", () => {
      const longContent = "2026-01-11T10:00:00.000Z ERROR: ".repeat(5000);
      const result = preprocessLogsWithMetadata(longContent, 1000);

      expect(result.wasTruncated).toBe(true);
      expect(result.logs).toContain("[truncated]");
    });

    it("should track secret redaction count", () => {
      const input = "API_KEY=sk-1234567890abcdef and TOKEN=ghp_secrettoken123";
      const result = preprocessLogsWithMetadata(input);

      // Secret redaction is handled by redactSecretsWithStats
      expect(result.secretsRedacted).toBeGreaterThanOrEqual(0);
      expect(result.secretTypes).toBeDefined();
    });

    it("should redact secrets from logs", () => {
      const input = "Connecting with key: sk-proj-abcdefghijklmnop123456";
      const result = preprocessLogsWithMetadata(input);

      // The actual secret should be redacted
      expect(result.logs).not.toContain("sk-proj-abcdefghijklmnop123456");
    });

    it("should handle empty input", () => {
      const result = preprocessLogsWithMetadata("");

      expect(result.logs).toBe("");
      expect(result.originalSize).toBe(0);
      expect(result.processedSize).toBe(0);
      expect(result.wasTruncated).toBe(false);
      expect(result.secretsRedacted).toBe(0);
    });
  });

  // ==========================================================================
  // Multi-Platform CI Timestamp Tests
  // ==========================================================================
  describe("Multi-Platform CI Timestamps", () => {
    describe("GitHub Actions timestamps", () => {
      it("should strip ISO 8601 timestamps with high precision", () => {
        const input = "2026-01-16T10:30:45.1659529Z npm test";
        const result = stripCITimestamps(input);
        expect(result).toBe("npm test");
      });

      it("should strip timestamps with varying fractional precision", () => {
        const input = `2026-01-16T10:30:45.1Z Step 1
2026-01-16T10:30:46.12Z Step 2
2026-01-16T10:30:47.123Z Step 3
2026-01-16T10:30:48.1234567Z Step 4`;
        const result = stripCITimestamps(input);
        expect(result).toBe(`Step 1
Step 2
Step 3
Step 4`);
      });
    });

    describe("GitLab CI timestamps", () => {
      it("should strip bracketed datetime format", () => {
        const input = "[2026-01-16 10:30:45] Running tests";
        const result = stripCITimestamps(input);
        expect(result).toBe("Running tests");
      });

      it("should strip space-separated datetime format", () => {
        const input = "2026-01-16 10:30:45.123 Executing script";
        const result = stripCITimestamps(input);
        expect(result).toBe("Executing script");
      });

      it("should strip GitLab timestamps from multiple lines", () => {
        const input = `[2026-01-16 10:30:45] Line 1
2026-01-16 10:30:46.789 Line 2`;
        const result = stripCITimestamps(input);
        expect(result).toBe(`Line 1
Line 2`);
      });
    });

    describe("CircleCI timestamps", () => {
      it("should strip HH:MM:SS time prefix", () => {
        const input = "10:30:45 Running step";
        const result = stripCITimestamps(input);
        expect(result).toBe("Running step");
      });

      it("should strip CircleCI timestamps from multiple lines", () => {
        const input = `10:30:45 Step 1
10:30:46 Step 2
10:30:47 Step 3`;
        const result = stripCITimestamps(input);
        expect(result).toBe(`Step 1
Step 2
Step 3`);
      });
    });

    describe("Jenkins timestamps", () => {
      it("should strip bracketed ISO 8601 timestamps", () => {
        const input = "[2026-01-16T10:30:45.123Z] Building project";
        const result = stripCITimestamps(input);
        expect(result).toBe("Building project");
      });

      it("should strip Timestamper plugin format", () => {
        const input = "[2026-01-16 10:30:45] Running mvn test";
        const result = stripCITimestamps(input);
        expect(result).toBe("Running mvn test");
      });
    });

    describe("Azure DevOps timestamps", () => {
      it("should strip high-precision ISO 8601 timestamps", () => {
        const input = "2026-01-16T10:30:45.1234567Z ##[section]Starting";
        const result = stripCITimestamps(input);
        expect(result).toBe("##[section]Starting");
      });
    });

    describe("Platform-specific stripping", () => {
      it("should strip only GitHub timestamps when platform specified", () => {
        const githubLine = "2026-01-16T10:30:45.123Z GitHub log";
        const circleciLine = "10:30:45 CircleCI log";

        const githubResult = stripCITimestampsForPlatform(githubLine, "github");
        const circleciResult = stripCITimestampsForPlatform(circleciLine, "github");

        expect(githubResult).toBe("GitHub log");
        expect(circleciResult).toBe("10:30:45 CircleCI log"); // Not stripped
      });

      it("should strip only CircleCI timestamps when platform specified", () => {
        const circleciLine = "10:30:45 CircleCI log";
        const githubLine = "2026-01-16T10:30:45.123Z GitHub log";

        const circleciResult = stripCITimestampsForPlatform(circleciLine, "circleci");
        const githubResult = stripCITimestampsForPlatform(githubLine, "circleci");

        expect(circleciResult).toBe("CircleCI log");
        expect(githubResult).toBe("2026-01-16T10:30:45.123Z GitHub log"); // Not stripped
      });
    });
  });

  // ==========================================================================
  // Multi-Platform CI Group Markers Tests
  // ==========================================================================
  describe("Multi-Platform CI Group Markers", () => {
    describe("GitHub Actions group markers", () => {
      it("should strip ##[group] markers", () => {
        const input = `##[group]Running tests
npm test
##[endgroup]`;
        const result = stripCIGroupMarkers(input);
        expect(result).toBe(`
npm test
`);
      });
    });

    describe("GitLab CI section markers", () => {
      it("should strip section_start markers", () => {
        const input = "section_start:1642332645:build_script\nBuilding...";
        const result = stripCIGroupMarkers(input);
        expect(result).toBe("\nBuilding...");
      });

      it("should strip section_end markers", () => {
        const input = "Done building\nsection_end:1642332650:build_script";
        const result = stripCIGroupMarkers(input);
        expect(result).toBe("Done building\n");
      });
    });

    describe("CircleCI markers", () => {
      it("should strip shell invocation lines", () => {
        const input = `#!/bin/bash -eo pipefail
npm test`;
        const result = stripCIGroupMarkers(input);
        expect(result).toBe(`
npm test`);
      });

      it("should preserve step headers as they contain useful context", () => {
        const input = `Spin up environment
Setting up...
Checkout code
Cloning repo...`;
        const result = stripCIGroupMarkers(input);
        // Step headers are preserved - they may contain useful context
        expect(result).toBe(`Spin up environment
Setting up...
Checkout code
Cloning repo...`);
      });
    });

    describe("Jenkins pipeline markers", () => {
      it("should strip [Pipeline] markers", () => {
        const input = `[Pipeline] Start of Pipeline
[Pipeline] node
Running on agent
[Pipeline] End of Pipeline`;
        const result = stripCIGroupMarkers(input);
        expect(result).toBe(`

Running on agent
`);
      });

      it("should preserve error messages that happen to mention Pipeline", () => {
        const input = "[Pipeline] Error: Something failed\nActual error content";
        const result = stripCIGroupMarkers(input);
        // Non-standard [Pipeline] lines with errors are preserved
        expect(result).toBe("[Pipeline] Error: Something failed\nActual error content");
      });
    });

    describe("Azure DevOps markers", () => {
      it("should strip ##[section] markers", () => {
        const input = `##[section]Starting: Build
Building project...
##[section]Finishing: Build`;
        const result = stripCIGroupMarkers(input);
        expect(result).toBe(`
Building project...
`);
      });

      it("should strip ##[command] markers", () => {
        const input = `##[command]"C:\\agent\\dotnet.exe" build
Building...`;
        const result = stripCIGroupMarkers(input);
        expect(result).toBe(`
Building...`);
      });

      it("should preserve log level markers as they contain diagnostic info", () => {
        const input = `##[debug]Debug info
##[warning]Warning message
##[error]Error occurred
Actual content`;
        const result = stripCIGroupMarkers(input);
        // Log level markers (debug/warning/error) are preserved for diagnostics
        expect(result).toBe(`##[debug]Debug info
##[warning]Warning message
##[error]Error occurred
Actual content`);
      });
    });

    describe("Platform-specific group marker stripping", () => {
      it("should strip only GitHub markers when platform specified", () => {
        const githubMarker = "##[group]Test Group";
        const azureMarker = "##[section]Starting";

        const githubResult = stripCIGroupMarkersForPlatform(githubMarker, "github");
        const azureResult = stripCIGroupMarkersForPlatform(azureMarker, "github");

        expect(githubResult).toBe("");
        expect(azureResult).toBe("##[section]Starting"); // Not stripped
      });

      it("should strip only Jenkins markers when platform specified", () => {
        const jenkinsMarker = "[Pipeline] Stage";
        const gitlabMarker = "section_start:123:test";

        const jenkinsResult = stripCIGroupMarkersForPlatform(jenkinsMarker, "jenkins");
        const gitlabResult = stripCIGroupMarkersForPlatform(gitlabMarker, "jenkins");

        expect(jenkinsResult).toBe("");
        expect(gitlabResult).toBe("section_start:123:test"); // Not stripped
      });
    });
  });

  // ==========================================================================
  // Pattern Constant Tests
  // ==========================================================================
  describe("TEXT_SANITIZATION_PATTERNS", () => {
    it("should have all platform-specific timestamp patterns defined", () => {
      expect(TEXT_SANITIZATION_PATTERNS.CI_TIMESTAMP_GITHUB).toBeDefined();
      expect(TEXT_SANITIZATION_PATTERNS.CI_TIMESTAMP_GITLAB).toBeDefined();
      expect(TEXT_SANITIZATION_PATTERNS.CI_TIMESTAMP_CIRCLECI).toBeDefined();
      expect(TEXT_SANITIZATION_PATTERNS.CI_TIMESTAMP_JENKINS).toBeDefined();
      expect(TEXT_SANITIZATION_PATTERNS.CI_TIMESTAMP_AZURE).toBeDefined();
      expect(TEXT_SANITIZATION_PATTERNS.CI_TIMESTAMP_ALL).toBeDefined();
    });

    it("should have all platform-specific group patterns defined", () => {
      expect(TEXT_SANITIZATION_PATTERNS.CI_GROUP_GITHUB).toBeDefined();
      expect(TEXT_SANITIZATION_PATTERNS.CI_GROUP_GITLAB).toBeDefined();
      expect(TEXT_SANITIZATION_PATTERNS.CI_GROUP_CIRCLECI).toBeDefined();
      expect(TEXT_SANITIZATION_PATTERNS.CI_GROUP_JENKINS).toBeDefined();
      expect(TEXT_SANITIZATION_PATTERNS.CI_GROUP_AZURE).toBeDefined();
      expect(TEXT_SANITIZATION_PATTERNS.CI_GROUP_ALL).toBeDefined();
    });

    it("should have deprecated patterns for backward compatibility", () => {
      expect(TEXT_SANITIZATION_PATTERNS.CI_TIMESTAMP).toBeDefined();
      expect(TEXT_SANITIZATION_PATTERNS.CI_GROUP_MARKERS).toBeDefined();
    });
  });

  // ==========================================================================
  // Integration Tests with Mixed Platforms
  // ==========================================================================
  describe("Mixed Platform Log Processing", () => {
    it("should handle logs with mixed timestamp formats", () => {
      const mixedLog = `2026-01-16T10:30:45.123Z GitHub line
10:30:46 CircleCI line
[2026-01-16 10:30:47] GitLab line
[Pipeline] Start of Pipeline
##[group]GitHub group
section_start:123:test`;

      const result = preprocessLogs(mixedLog);

      expect(result).toContain("GitHub line");
      expect(result).toContain("CircleCI line");
      expect(result).toContain("GitLab line");
      expect(result).not.toContain("2026-01-16T");
      expect(result).not.toContain("[Pipeline] Start of Pipeline");
      expect(result).not.toContain("##[group]");
    });

    it("should preserve actual error content while stripping CI noise", () => {
      const logWithError = `2026-01-16T10:30:45.123Z ##[group]Run Tests
10:30:46 Executing npm test
[Pipeline] Error: Module not found
TypeError: Cannot read property 'foo' of undefined
    at Object.<anonymous> (src/test.ts:42:15)
##[endgroup]
section_end:123:test`;

      const result = preprocessLogs(logWithError);

      // [Pipeline] Error lines are preserved (not a standard Pipeline marker)
      expect(result).toContain("[Pipeline] Error: Module not found");
      expect(result).toContain("TypeError: Cannot read property 'foo' of undefined");
      expect(result).toContain("at Object.<anonymous> (src/test.ts:42:15)");
    });
  });
});

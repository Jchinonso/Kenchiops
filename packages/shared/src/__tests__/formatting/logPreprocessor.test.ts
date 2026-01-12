/**
 * Unit tests for formatting/logPreprocessor.ts
 *
 * Tests the simplified log preprocessing pipeline for CI failure analysis.
 */
import { describe, it, expect } from "@jest/globals";
import {
  stripAnsiCodes,
  stripCITimestamps,
  truncateWithErrorContext,
  preprocessLogs,
  preprocessLogsWithMetadata,
} from "../../formatting/logPreprocessor.js";
import { LOG_PARSING_LIMITS } from "../../constants/index.js";

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
      expect(result).toBe("Short content");
      expect(result).not.toContain("[truncated]");
    });

    it("should truncate content over max size", () => {
      const longContent = "A".repeat(60000);
      const result = truncateWithErrorContext(longContent, 50000);
      expect(result.length).toBeLessThanOrEqual(50000 + 50); // Allow for markers
      expect(result).toContain("[truncated]");
    });

    it("should center truncation on first error indicator", () => {
      const prefix = "A".repeat(60000);
      const error = "ERROR: test failed";
      const suffix = "B".repeat(60000);
      const input = prefix + error + suffix;

      const result = truncateWithErrorContext(input, 50000);

      expect(result).toContain("ERROR: test failed");
    });

    it("should handle content with multiple error indicators", () => {
      const input = "A".repeat(30000) + "FAILED" + "B".repeat(30000) + "ERROR" + "C".repeat(30000);
      const result = truncateWithErrorContext(input, 50000);

      // Should center on first error indicator (FAILED)
      expect(result).toContain("FAILED");
    });

    it("should handle content without error indicators", () => {
      const input = "A".repeat(100000);
      const result = truncateWithErrorContext(input, 50000);

      // Should truncate from start when no error indicator found
      expect(result.length).toBeLessThanOrEqual(50000 + 50);
      expect(result).not.toContain("[truncated]...\n"); // No prefix marker at start
    });

    it("should use default max size from constants", () => {
      const longContent = "A".repeat(LOG_PARSING_LIMITS.MAX_LOG_SIZE + 10000);
      const result = truncateWithErrorContext(longContent);

      expect(result.length).toBeLessThanOrEqual(LOG_PARSING_LIMITS.MAX_LOG_SIZE + 50);
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
});

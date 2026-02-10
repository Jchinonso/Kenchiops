/**
 * Unit tests for Analysis Evidence Builder
 *
 * Tests section splitting and evidence log building from CI failure logs.
 */

import { describe, it, expect } from "@jest/globals";
import { splitEvidenceSections, buildEvidenceLogs } from "../services/analysisEvidence.js";

describe("Analysis Evidence Builder", () => {
  // ==================== splitEvidenceSections ====================

  describe("splitEvidenceSections", () => {
    it("should return empty array for empty content", () => {
      const result = splitEvidenceSections("");

      expect(result).toEqual([]);
    });

    it("should return empty array for whitespace-only content", () => {
      const result = splitEvidenceSections("   \n  \n   ");

      expect(result).toEqual([]);
    });

    it("should create single Overview section for content without headings", () => {
      const content = "Error: Connection refused\nRetrying in 5s...";

      const result = splitEvidenceSections(content);

      expect(result).toHaveLength(1);
      expect(result[0].heading).toBe("Overview");
      expect(result[0].content).toBe("Error: Connection refused\nRetrying in 5s...");
    });

    it("should split content by markdown headings (##)", () => {
      const content = [
        "## Failed Tests",
        "test_login failed",
        "test_signup failed",
        "## Workflow Logs",
        "Step 3: Build failed",
      ].join("\n");

      const result = splitEvidenceSections(content);

      expect(result).toHaveLength(2);
      expect(result[0].heading).toBe("Failed Tests");
      expect(result[0].content).toContain("test_login failed");
      expect(result[0].content).toContain("test_signup failed");
      expect(result[1].heading).toBe("Workflow Logs");
      expect(result[1].content).toContain("Step 3: Build failed");
    });

    it("should handle content before first heading as Overview section", () => {
      const content = ["Some preamble text", "## Failed Tests", "test_login failed"].join("\n");

      const result = splitEvidenceSections(content);

      expect(result).toHaveLength(2);
      expect(result[0].heading).toBe("Overview");
      expect(result[0].content).toBe("Some preamble text");
      expect(result[1].heading).toBe("Failed Tests");
      expect(result[1].content).toBe("test_login failed");
    });

    it("should not split on single # headings (only ##)", () => {
      const content = "# Top Level Heading\nSome content";

      const result = splitEvidenceSections(content);

      expect(result).toHaveLength(1);
      expect(result[0].heading).toBe("Overview");
      expect(result[0].content).toContain("# Top Level Heading");
    });

    it("should not split on ### headings (only ##)", () => {
      const content = "### Subheading\nSome content";

      const result = splitEvidenceSections(content);

      expect(result).toHaveLength(1);
      expect(result[0].heading).toBe("Overview");
      expect(result[0].content).toContain("### Subheading");
    });

    it("should filter out sections with empty content", () => {
      const content = [
        "## Section With Content",
        "content here",
        "## Empty Section",
        "## Another Section",
        "more content",
      ].join("\n");

      const result = splitEvidenceSections(content);

      // Empty sections should be filtered out
      const sectionHeadings = result.map((s) => s.heading);
      expect(sectionHeadings).toContain("Section With Content");
      expect(sectionHeadings).toContain("Another Section");
    });

    it("should trim whitespace from section content", () => {
      const content = ["## Failed Tests", "", "  test_login failed  ", ""].join("\n");

      const result = splitEvidenceSections(content);

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe("test_login failed");
    });

    it("should handle many sections", () => {
      const sections = Array.from({ length: 10 }, (_, i) => `## Section ${i}\nContent ${i}`);
      const content = sections.join("\n");

      const result = splitEvidenceSections(content);

      expect(result).toHaveLength(10);
      expect(result[0].heading).toBe("Section 0");
      expect(result[9].heading).toBe("Section 9");
    });

    it("should handle heading with extra whitespace", () => {
      const content = "##   Spaced Heading   \nContent here";

      const result = splitEvidenceSections(content);

      expect(result).toHaveLength(1);
      expect(result[0].heading).toBe("Spaced Heading");
    });

    it("should preserve multiline content within sections", () => {
      const content = ["## Error Details", "Line 1", "Line 2", "Line 3"].join("\n");

      const result = splitEvidenceSections(content);

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe("Line 1\nLine 2\nLine 3");
    });
  });

  // ==================== buildEvidenceLogs ====================

  describe("buildEvidenceLogs", () => {
    const collectedAt = "2024-01-15T10:00:00.000Z";

    it("should return raw_log entry for content without sections", () => {
      const failureLog = "";

      const result = buildEvidenceLogs(failureLog, collectedAt);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("raw_log");
      expect(result[0].level).toBe("ERROR");
      expect(result[0].message).toBe("");
      expect(result[0].timestamp).toBe(collectedAt);
      expect(result[0].source).toBe("ci");
    });

    it("should build log entries from sections", () => {
      const failureLog = [
        "## Failed Tests",
        "test_login failed",
        "## Workflow Logs",
        "Step 3 failed",
      ].join("\n");

      const result = buildEvidenceLogs(failureLog, collectedAt);

      expect(result).toHaveLength(2);
    });

    it("should set ERROR level for error section headings", () => {
      const failureLog = "## Failed Tests\ntest_login failed";

      const result = buildEvidenceLogs(failureLog, collectedAt);

      expect(result[0].level).toBe("ERROR");
    });

    it("should set INFO level for non-error section headings", () => {
      const failureLog = "## Commit Info\ncommit abc123";

      const result = buildEvidenceLogs(failureLog, collectedAt);

      expect(result[0].level).toBe("INFO");
    });

    it("should apply correct source overrides per section heading", () => {
      const failureLog = [
        "## Failed Tests",
        "test content",
        "## CI Annotations (Errors & Warnings)",
        "annotation content",
        "## Workflow Logs",
        "log content",
        "## Dependency Changes",
        "dep content",
        "## PR Diff",
        "diff content",
        "## Overview",
        "overview content",
      ].join("\n");

      const result = buildEvidenceLogs(failureLog, collectedAt);

      // Verify known source overrides
      expect(result.find((r) => r.message.includes("## Failed Tests"))?.source).toBe("ci-tests");
      expect(result.find((r) => r.message.includes("## CI Annotations"))?.source).toBe(
        "ci-annotations"
      );
      expect(result.find((r) => r.message.includes("## Workflow Logs"))?.source).toBe("ci-logs");
      expect(result.find((r) => r.message.includes("## Dependency Changes"))?.source).toBe(
        "ci-deps"
      );
      expect(result.find((r) => r.message.includes("## PR Diff"))?.source).toBe("ci-diff");
      expect(result.find((r) => r.message.includes("## Overview"))?.source).toBe("ci-overview");
    });

    it("should default to ci source for unknown section headings", () => {
      const failureLog = "## Unknown Custom Section\ncontent here";

      const result = buildEvidenceLogs(failureLog, collectedAt);

      expect(result[0].source).toBe("ci");
    });

    it("should generate sanitized IDs from section headings", () => {
      const failureLog = "## Failed Tests\ntest content";

      const result = buildEvidenceLogs(failureLog, collectedAt);

      // sanitizeIdPart lowercases and replaces non-alphanumeric with _
      expect(result[0].id).toBe("failed_tests");
    });

    it("should format message with heading prefix", () => {
      const failureLog = "## Failed Tests\ntest_login failed";

      const result = buildEvidenceLogs(failureLog, collectedAt);

      expect(result[0].message).toBe("## Failed Tests\ntest_login failed");
    });

    it("should offset timestamps by 1000ms between entries", () => {
      const failureLog = [
        "## Section A",
        "content A",
        "## Section B",
        "content B",
        "## Section C",
        "content C",
      ].join("\n");

      const result = buildEvidenceLogs(failureLog, collectedAt);

      expect(result).toHaveLength(3);

      const baseTime = new Date(collectedAt).getTime();
      expect(new Date(result[0].timestamp!).getTime()).toBe(baseTime);
      expect(new Date(result[1].timestamp!).getTime()).toBe(baseTime + 1000);
      expect(new Date(result[2].timestamp!).getTime()).toBe(baseTime + 2000);
    });

    it("should handle content with special characters", () => {
      const failureLog = "## Failed Tests\nError: expected `true` but got `false`";

      const result = buildEvidenceLogs(failureLog, collectedAt);

      expect(result[0].message).toContain("expected `true` but got `false`");
    });

    it("should handle unicode content", () => {
      const failureLog = "## Failed Tests\nError: invalid character '\u00e9' in input";

      const result = buildEvidenceLogs(failureLog, collectedAt);

      expect(result[0].message).toContain("\u00e9");
    });

    it("should correctly classify all known error section headings", () => {
      // These are the headings defined in ERROR_SECTION_HEADINGS
      const errorHeadings = [
        "Failed Tests",
        "CI Annotations (Errors & Warnings)",
        "CI Check Output",
        "Workflow Logs",
      ];

      for (const heading of errorHeadings) {
        const failureLog = `## ${heading}\ncontent`;
        const result = buildEvidenceLogs(failureLog, collectedAt);
        expect(result[0].level).toBe("ERROR");
      }
    });

    it("should classify non-error section headings as INFO", () => {
      const infoHeadings = [
        "Dependency Changes",
        "Build Config Changes",
        "PR Diff",
        "Relevant Source Files",
        "Commit Info",
        "Recent PR Discussion",
        "Pull Request",
        "Overview",
      ];

      for (const heading of infoHeadings) {
        const failureLog = `## ${heading}\ncontent`;
        const result = buildEvidenceLogs(failureLog, collectedAt);
        expect(result[0].level).toBe("INFO");
      }
    });
  });
});

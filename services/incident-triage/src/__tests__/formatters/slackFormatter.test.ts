/**
 * Slack Formatter Tests
 *
 * Tests for the pure Slack Block Kit formatting function.
 */

import { describe, it, expect } from "@jest/globals";
import { formatSlackBlocks } from "../../formatters/slackFormatter.js";
import type { SlackFormatterInput } from "../../types/policyTypes.js";

// ==================== Test Fixtures ====================

const createTestInput = (overrides: Partial<SlackFormatterInput> = {}): SlackFormatterInput => ({
  alertId: "alert-1",
  headline: "High CPU on payments-api in production",
  rootCauseSummary: "CPU utilization is above 95% on the payments-api service",
  impactAssessment: "Production payments processing is affected",
  severityLabel: "high",
  severityScore: 72,
  confidence: 0.85,
  completeness: 0.75,
  summarySource: "ai",
  environment: "production",
  serviceName: "payments-api",
  matchedRules: [
    { ruleId: "P2_HIGH_PROD", ruleName: "High Production Alert", reason: "severity=high" },
  ],
  ...overrides,
});

// ==================== Tests ====================

describe("formatSlackBlocks", () => {
  describe("block structure", () => {
    it("should return an array of blocks", () => {
      const input = createTestInput();

      const result = formatSlackBlocks(input);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it("should start with a header block", () => {
      const input = createTestInput();

      const result = formatSlackBlocks(input);

      expect(result[0]).toHaveProperty("type", "header");
    });

    it("should include divider blocks for visual separation", () => {
      const input = createTestInput();

      const result = formatSlackBlocks(input);

      const dividers = result.filter((block) => block.type === "divider");
      expect(dividers.length).toBeGreaterThanOrEqual(2);
    });

    it("should end with a routing context block", () => {
      const input = createTestInput();

      const result = formatSlackBlocks(input);

      const lastBlock = result[result.length - 1];
      expect(lastBlock).toHaveProperty("type", "context");
    });

    it("should not mutate inputs", () => {
      const input = Object.freeze(createTestInput());

      expect(() => formatSlackBlocks(input)).not.toThrow();
    });
  });

  describe("header block", () => {
    it("should include severity emoji and headline in header", () => {
      const input = createTestInput({ severityLabel: "high" });

      const result = formatSlackBlocks(input);
      const header = result[0] as { text: { text: string } };

      expect(header.text.text).toContain(":warning:");
      expect(header.text.text).toContain("High CPU on payments-api");
    });

    it("should use correct emoji for critical severity", () => {
      const input = createTestInput({ severityLabel: "critical" });

      const result = formatSlackBlocks(input);
      const header = result[0] as { text: { text: string } };

      expect(header.text.text).toContain(":rotating_light:");
    });

    it("should use correct emoji for medium severity", () => {
      const input = createTestInput({ severityLabel: "medium" });

      const result = formatSlackBlocks(input);
      const header = result[0] as { text: { text: string } };

      expect(header.text.text).toContain(":large_yellow_circle:");
    });

    it("should use correct emoji for low severity", () => {
      const input = createTestInput({ severityLabel: "low" });

      const result = formatSlackBlocks(input);
      const header = result[0] as { text: { text: string } };

      expect(header.text.text).toContain(":large_blue_circle:");
    });

    it("should use correct emoji for info severity", () => {
      const input = createTestInput({ severityLabel: "info" });

      const result = formatSlackBlocks(input);
      const header = result[0] as { text: { text: string } };

      expect(header.text.text).toContain(":information_source:");
    });
  });

  describe("metadata section", () => {
    it("should include severity label and score", () => {
      const input = createTestInput({ severityLabel: "high", severityScore: 72 });

      const result = formatSlackBlocks(input);
      const metadataSection = result.find(
        (block) =>
          block.type === "section" &&
          Array.isArray(block.fields) &&
          (block.fields as Array<{ text: string }>).some((f) => f.text.includes("Severity"))
      ) as { fields: Array<{ text: string }> };

      expect(metadataSection).toBeDefined();
      const severityField = metadataSection.fields.find((f) => f.text.includes("Severity"));
      expect(severityField!.text).toContain("HIGH");
      expect(severityField!.text).toContain("72");
    });

    it("should include environment", () => {
      const input = createTestInput({ environment: "production" });

      const result = formatSlackBlocks(input);
      const metadataSection = result.find(
        (block) =>
          block.type === "section" &&
          Array.isArray(block.fields) &&
          (block.fields as Array<{ text: string }>).some((f) => f.text.includes("Environment"))
      ) as { fields: Array<{ text: string }> };

      const envField = metadataSection.fields.find((f) => f.text.includes("Environment"));
      expect(envField!.text).toContain("production");
    });

    it("should show Unknown when environment is null", () => {
      const input = createTestInput({ environment: null });

      const result = formatSlackBlocks(input);
      const metadataSection = result.find(
        (block) =>
          block.type === "section" &&
          Array.isArray(block.fields) &&
          (block.fields as Array<{ text: string }>).some((f) => f.text.includes("Environment"))
      ) as { fields: Array<{ text: string }> };

      const envField = metadataSection.fields.find((f) => f.text.includes("Environment"));
      expect(envField!.text).toContain("Unknown");
    });

    it("should include service name", () => {
      const input = createTestInput({ serviceName: "payments-api" });

      const result = formatSlackBlocks(input);
      const metadataSection = result.find(
        (block) =>
          block.type === "section" &&
          Array.isArray(block.fields) &&
          (block.fields as Array<{ text: string }>).some((f) => f.text.includes("Service"))
      ) as { fields: Array<{ text: string }> };

      const serviceField = metadataSection.fields.find((f) => f.text.includes("Service"));
      expect(serviceField!.text).toContain("payments-api");
    });

    it("should show Unknown when serviceName is null", () => {
      const input = createTestInput({ serviceName: null });

      const result = formatSlackBlocks(input);
      const metadataSection = result.find(
        (block) =>
          block.type === "section" &&
          Array.isArray(block.fields) &&
          (block.fields as Array<{ text: string }>).some((f) => f.text.includes("Service"))
      ) as { fields: Array<{ text: string }> };

      const serviceField = metadataSection.fields.find((f) => f.text.includes("Service"));
      expect(serviceField!.text).toContain("Unknown");
    });

    it("should include alert ID", () => {
      const input = createTestInput({ alertId: "alert-xyz-123" });

      const result = formatSlackBlocks(input);
      const metadataSection = result.find(
        (block) =>
          block.type === "section" &&
          Array.isArray(block.fields) &&
          (block.fields as Array<{ text: string }>).some((f) => f.text.includes("Alert ID"))
      ) as { fields: Array<{ text: string }> };

      const alertField = metadataSection.fields.find((f) => f.text.includes("Alert ID"));
      expect(alertField!.text).toContain("alert-xyz-123");
    });
  });

  describe("scores section", () => {
    it("should include confidence percentage", () => {
      const input = createTestInput({ confidence: 0.85 });

      const result = formatSlackBlocks(input);
      const scoresSection = result.find(
        (block) =>
          block.type === "section" &&
          Array.isArray(block.fields) &&
          (block.fields as Array<{ text: string }>).some((f) => f.text.includes("Confidence"))
      ) as { fields: Array<{ text: string }> };

      const confField = scoresSection.fields.find((f) => f.text.includes("Confidence"));
      expect(confField!.text).toContain("85%");
    });

    it("should include completeness percentage", () => {
      const input = createTestInput({ completeness: 0.75 });

      const result = formatSlackBlocks(input);
      const scoresSection = result.find(
        (block) =>
          block.type === "section" &&
          Array.isArray(block.fields) &&
          (block.fields as Array<{ text: string }>).some((f) => f.text.includes("Completeness"))
      ) as { fields: Array<{ text: string }> };

      const compField = scoresSection.fields.find((f) => f.text.includes("Completeness"));
      expect(compField!.text).toContain("75%");
    });
  });

  describe("summary section", () => {
    it("should label as AI Summary when summarySource is ai", () => {
      const input = createTestInput({ summarySource: "ai" });

      const result = formatSlackBlocks(input);
      const allText = JSON.stringify(result);

      expect(allText).toContain("AI Summary");
      expect(allText).toContain(":robot_face:");
    });

    it("should label as Template Summary when summarySource is fallback", () => {
      const input = createTestInput({ summarySource: "fallback" });

      const result = formatSlackBlocks(input);
      const allText = JSON.stringify(result);

      expect(allText).toContain("Template Summary");
      expect(allText).toContain(":clipboard:");
    });

    it("should include root cause summary", () => {
      const input = createTestInput({
        rootCauseSummary: "CPU spike caused by memory leak",
      });

      const result = formatSlackBlocks(input);
      const allText = JSON.stringify(result);

      expect(allText).toContain("CPU spike caused by memory leak");
    });

    it("should include impact assessment", () => {
      const input = createTestInput({
        impactAssessment: "Production payments delayed by 30 seconds",
      });

      const result = formatSlackBlocks(input);
      const allText = JSON.stringify(result);

      expect(allText).toContain("Production payments delayed by 30 seconds");
    });
  });

  describe("routing context", () => {
    it("should include matched rule names", () => {
      const input = createTestInput({
        matchedRules: [
          { ruleId: "P1", ruleName: "Critical Prod", reason: "severity=critical" },
          { ruleId: "P2", ruleName: "High Prod", reason: "severity=high" },
        ],
      });

      const result = formatSlackBlocks(input);
      const contextBlock = result[result.length - 1] as {
        elements: Array<{ text: string }>;
      };

      expect(contextBlock.elements[0].text).toContain("Critical Prod");
      expect(contextBlock.elements[0].text).toContain("High Prod");
    });

    it("should join multiple rule names with commas", () => {
      const input = createTestInput({
        matchedRules: [
          { ruleId: "R1", ruleName: "Rule A", reason: "test" },
          { ruleId: "R2", ruleName: "Rule B", reason: "test" },
        ],
      });

      const result = formatSlackBlocks(input);
      const contextBlock = result[result.length - 1] as {
        elements: Array<{ text: string }>;
      };

      expect(contextBlock.elements[0].text).toContain("Rule A, Rule B");
    });
  });
});

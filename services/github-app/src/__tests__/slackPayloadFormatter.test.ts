/**
 * Unit tests for Slack Payload Formatter
 */

import { describe, it, expect } from "@jest/globals";
import { buildConsolidatedSlackPayload } from "../formatters/slackPayloadFormatter.js";
import type { AggregatedFailures, AnalyzedFailure, CodeAnnotation } from "@kenchi/shared";

describe("Slack Payload Formatter", () => {
  const createAnnotation = (overrides: Partial<CodeAnnotation> = {}): CodeAnnotation => ({
    path: "src/index.ts",
    line: 42,
    level: "failure",
    message: "Test error message",
    title: "Test Error",
    ...overrides,
  });

  const createFailure = (overrides: Partial<AnalyzedFailure> = {}): AnalyzedFailure => ({
    checkRunId: 12345,
    checkName: "CI Build",
    conclusion: "failure",
    confidence: 0.85,
    analysis: "Build failed due to syntax error",
    identifiedCause: "Missing semicolon in index.ts",
    annotations: [],
    recommendedActions: [],
    testFailures: [],
    timestamp: new Date(),
    ...overrides,
  });

  const createAggregation = (overrides: Partial<AggregatedFailures> = {}): AggregatedFailures => ({
    repository: { fullName: "owner/repo", owner: "owner", name: "repo" },
    commitSha: "abc123def456789",
    installationId: 12345,
    pullRequestNumbers: [123],
    failures: [createFailure()],
    prContext: {
      number: 123,
      title: "Fix bug",
      author: "developer",
      branch: "feature/fix",
      baseBranch: "main",
      labels: [],
    },
    workflowContext: null,
    firstFailureAt: new Date(),
    lastFailureAt: new Date(),
    ...overrides,
  });

  describe("buildConsolidatedSlackPayload", () => {
    it("should return object with blocks and text", () => {
      const aggregation = createAggregation();
      const payload = buildConsolidatedSlackPayload(aggregation);

      expect(payload).toHaveProperty("blocks");
      expect(payload).toHaveProperty("text");
      expect(Array.isArray(payload.blocks)).toBe(true);
    });

    it("should include metadata", () => {
      const aggregation = createAggregation();
      const payload = buildConsolidatedSlackPayload(aggregation);

      expect(payload.metadata).toEqual({
        repository: "owner/repo",
        commitSha: "abc123def456789",
        failureCount: 1,
        checkNames: ["CI Build"],
        avgConfidence: 0.85,
        isConsolidated: true,
      });
    });

    it("should include header block with CI Failed message", () => {
      const aggregation = createAggregation();
      const payload = buildConsolidatedSlackPayload(aggregation);
      const blocks = payload.blocks as Array<{ type: string; text?: { text: string } }>;

      const headerBlock = blocks.find((b) => b.type === "header");
      expect(headerBlock?.text?.text).toBe("🚨 CI Build Failed");
    });

    it("should include repository link in fields", () => {
      const aggregation = createAggregation({
        repository: { fullName: "myorg/myrepo", owner: "myorg", name: "myrepo" },
      });
      const payload = buildConsolidatedSlackPayload(aggregation);
      const blocks = payload.blocks as Array<{
        type: string;
        fields?: Array<{ text: string }>;
      }>;

      const sectionBlock = blocks.find((b) => b.fields);
      const repoField = sectionBlock?.fields?.find((f) => f.text.includes("Repository"));

      expect(repoField?.text).toContain("myorg/myrepo");
      expect(repoField?.text).toContain("https://github.com/myorg/myrepo");
    });

    it("should include branch information", () => {
      const aggregation = createAggregation({
        prContext: {
          number: 123,
          title: "Test",
          author: "dev",
          branch: "feature/test",
          baseBranch: "develop",
          labels: [],
        },
      });
      const payload = buildConsolidatedSlackPayload(aggregation);
      const blocks = payload.blocks as Array<{
        type: string;
        fields?: Array<{ text: string }>;
      }>;

      const sectionBlock = blocks.find((b) => b.fields);
      const branchField = sectionBlock?.fields?.find((f) => f.text.includes("Branch"));

      expect(branchField?.text).toContain("feature/test");
      expect(branchField?.text).toContain("develop");
    });

    it("should include commit link", () => {
      const aggregation = createAggregation({ commitSha: "abcdef123456" });
      const payload = buildConsolidatedSlackPayload(aggregation);
      const blocks = payload.blocks as Array<{
        type: string;
        fields?: Array<{ text: string }>;
      }>;

      const sectionBlock = blocks.find((b) => b.fields);
      const commitField = sectionBlock?.fields?.find((f) => f.text.includes("Commit"));

      expect(commitField?.text).toContain("abcdef1");
    });

    it("should include confidence with emoji", () => {
      const aggregation = createAggregation({
        failures: [createFailure({ confidence: 0.9 })],
      });
      const payload = buildConsolidatedSlackPayload(aggregation);
      const blocks = payload.blocks as Array<{
        type: string;
        fields?: Array<{ text: string }>;
      }>;

      const sectionBlock = blocks.find((b) => b.fields);
      const confidenceField = sectionBlock?.fields?.find((f) => f.text.includes("Confidence"));

      expect(confidenceField?.text).toContain("🟢"); // High confidence
      expect(confidenceField?.text).toContain("90%");
    });

    it("should show yellow emoji for medium confidence", () => {
      const aggregation = createAggregation({
        failures: [createFailure({ confidence: 0.5 })],
      });
      const payload = buildConsolidatedSlackPayload(aggregation);
      const blocks = payload.blocks as Array<{
        type: string;
        fields?: Array<{ text: string }>;
      }>;

      const sectionBlock = blocks.find((b) => b.fields);
      const confidenceField = sectionBlock?.fields?.find((f) => f.text.includes("Confidence"));

      expect(confidenceField?.text).toContain("🟡");
    });

    it("should show red emoji for low confidence", () => {
      const aggregation = createAggregation({
        failures: [createFailure({ confidence: 0.2 })],
      });
      const payload = buildConsolidatedSlackPayload(aggregation);
      const blocks = payload.blocks as Array<{
        type: string;
        fields?: Array<{ text: string }>;
      }>;

      const sectionBlock = blocks.find((b) => b.fields);
      const confidenceField = sectionBlock?.fields?.find((f) => f.text.includes("Confidence"));

      expect(confidenceField?.text).toContain("🔴");
    });

    it("should include PR link when context exists", () => {
      const aggregation = createAggregation({
        prContext: {
          number: 456,
          title: "Add feature",
          author: "dev",
          branch: "feature",
          baseBranch: "main",
          labels: [],
        },
      });
      const payload = buildConsolidatedSlackPayload(aggregation);
      const blocks = payload.blocks as Array<{
        type: string;
        text?: { text: string };
      }>;

      const prBlock = blocks.find(
        (b) => b.type === "section" && b.text?.text?.includes("Pull Request")
      );

      expect(prBlock?.text?.text).toContain("#456");
      expect(prBlock?.text?.text).toContain("Add feature");
    });

    it("should not include PR link when no context", () => {
      const aggregation = createAggregation({ prContext: undefined });
      const payload = buildConsolidatedSlackPayload(aggregation);
      const blocks = payload.blocks as Array<{
        type: string;
        text?: { text: string };
      }>;

      const prBlock = blocks.find(
        (b) => b.type === "section" && b.text?.text?.includes("Pull Request")
      );

      expect(prBlock).toBeUndefined();
    });

    it("should include failed checks header with count", () => {
      const aggregation = createAggregation({
        failures: [createFailure(), createFailure(), createFailure()],
      });
      const payload = buildConsolidatedSlackPayload(aggregation);
      const blocks = payload.blocks as Array<{
        type: string;
        text?: { text: string };
      }>;

      const checksHeader = blocks.find((b) => b.text?.text?.includes("Failed Checks"));

      expect(checksHeader?.text?.text).toContain("(3)");
    });

    it("should include failure blocks with check name", () => {
      const aggregation = createAggregation({
        failures: [createFailure({ checkName: "Unit Tests", identifiedCause: "Test failure" })],
      });
      const payload = buildConsolidatedSlackPayload(aggregation);
      const blocks = payload.blocks as Array<{
        type: string;
        text?: { text: string };
      }>;

      const failureBlock = blocks.find(
        (b) => b.type === "section" && b.text?.text?.includes("Unit Tests")
      );

      expect(failureBlock?.text?.text).toContain("Unit Tests");
      expect(failureBlock?.text?.text).toContain("Test failure");
    });

    it("should include annotations when present", () => {
      const aggregation = createAggregation({
        failures: [
          createFailure({
            annotations: [
              createAnnotation({ path: "src/test.ts", line: 100, message: "Error here" }),
            ],
          }),
        ],
      });
      const payload = buildConsolidatedSlackPayload(aggregation);
      const blocks = payload.blocks as Array<{
        type: string;
        elements?: Array<{ text: string }>;
      }>;

      const contextBlock = blocks.find(
        (b) => b.type === "context" && b.elements?.some((e) => e.text?.includes("src/test.ts"))
      );

      expect(contextBlock).toBeDefined();
      expect(contextBlock?.elements?.[0]?.text).toContain("src/test.ts:100");
    });

    it("should limit displayed checks to 5", () => {
      const failures = Array.from({ length: 10 }, (_, i) =>
        createFailure({ checkName: `Check ${i}` })
      );
      const aggregation = createAggregation({ failures });
      const payload = buildConsolidatedSlackPayload(aggregation);
      const blocks = payload.blocks as Array<{
        type: string;
        elements?: Array<{ text: string }>;
      }>;

      const moreBlock = blocks.find(
        (b) => b.type === "context" && b.elements?.some((e) => e.text?.includes("more failed"))
      );

      expect(moreBlock).toBeDefined();
      expect(moreBlock?.elements?.[0]?.text).toContain("5 more failed checks");
    });

    it("should include recommended actions section", () => {
      const aggregation = createAggregation({
        failures: [
          createFailure({
            recommendedActions: [
              { description: "Fix the bug", priority: "high", actionType: "fix" },
            ],
          }),
        ],
      });
      const payload = buildConsolidatedSlackPayload(aggregation);
      const blocks = payload.blocks as Array<{
        type: string;
        text?: { text: string };
      }>;

      const actionsHeader = blocks.find((b) => b.text?.text?.includes("Recommended Actions"));
      const actionsBlock = blocks.find(
        (b) => b.type === "section" && b.text?.text?.includes("Fix the bug")
      );

      expect(actionsHeader).toBeDefined();
      expect(actionsBlock?.text?.text).toContain("🔴 Fix the bug");
    });

    it("should include footer with KenchiOps credit", () => {
      const aggregation = createAggregation();
      const payload = buildConsolidatedSlackPayload(aggregation);
      const blocks = payload.blocks as Array<{
        type: string;
        elements?: Array<{ text: string }>;
      }>;

      const footerBlock = blocks.find(
        (b) => b.type === "context" && b.elements?.some((e) => e.text?.includes("KenchiOps"))
      );

      expect(footerBlock).toBeDefined();
    });

    it("should generate correct fallback text", () => {
      const aggregation = createAggregation({
        repository: { fullName: "test/project", owner: "test", name: "project" },
        failures: [createFailure(), createFailure()],
      });
      const payload = buildConsolidatedSlackPayload(aggregation);

      expect(payload.text).toBe("🚨 CI Failure: 2 check(s) failed in test/project");
    });

    it("should handle empty failures array", () => {
      const aggregation = createAggregation({ failures: [] });
      const payload = buildConsolidatedSlackPayload(aggregation);

      expect(payload.blocks).toBeDefined();
      expect(payload.metadata).toEqual({
        repository: "owner/repo",
        commitSha: "abc123def456789",
        failureCount: 0,
        checkNames: [],
        avgConfidence: 0,
        isConsolidated: true,
      });
    });
  });
});

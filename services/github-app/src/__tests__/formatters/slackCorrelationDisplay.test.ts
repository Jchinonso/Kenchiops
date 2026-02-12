/**
 * Unit tests for Change Correlation Display in Slack Payloads
 *
 * Tests the condensed correlation format used in Slack Block Kit messages.
 */

import { describe, it, expect } from "@jest/globals";
import {
  UI_EMOJI,
  GITHUB_COMMENT_DISPLAY,
  type LLMChangeCorrelation,
  type AggregatedFailures,
} from "@kenchi/shared";
import { buildConsolidatedSlackPayload } from "../../services/formatters/slackPayloadFormatter.js";

// ==================== Test Fixtures ====================

const makeCorrelation = (overrides: Partial<LLMChangeCorrelation> = {}): LLMChangeCorrelation => ({
  changedFunction: "add",
  changedFile: "src/calculator.ts",
  changedLine: 8,
  failingTests: ["test_add"],
  correlation: "high",
  explanation: "The add function was modified and test_add directly tests it",
  ...overrides,
});

const makeAggregation = (overrides: Partial<AggregatedFailures> = {}): AggregatedFailures =>
  ({
    commitSha: "abc1234567890",
    repository: { fullName: "owner/repo" },
    pullRequestNumbers: [42],
    failures: [
      {
        checkName: "CI / tests",
        identifiedCause: "Test failures",
        analysis: "Test failures",
      },
    ],
    ...overrides,
  }) as AggregatedFailures;

// ==================== Slack correlation blocks ====================

describe("buildConsolidatedSlackPayload — correlation blocks", () => {
  it("includes correlation block when failures have changeCorrelations", () => {
    const aggregation = makeAggregation({
      failures: [
        {
          checkName: "CI / tests",
          identifiedCause: "Test failures",
          changeCorrelations: [
            makeCorrelation({
              changedFunction: "add",
              failingTests: ["test_add"],
              correlation: "high",
            }),
          ],
        } as AggregatedFailures["failures"][number],
      ],
    });

    const payload = buildConsolidatedSlackPayload(aggregation);
    const mrkdwnTexts = payload.blocks
      .filter((block) => block.type === "section" && block.text?.type === "mrkdwn")
      .map((block) => block.text?.text ?? "");

    const correlationText = mrkdwnTexts.find((text) => text.includes("Change Correlation"));

    expect(correlationText).toBeDefined();
    expect(correlationText).toContain(`${UI_EMOJI.link}`);
    expect(correlationText).toContain("`add()`");
    expect(correlationText).toContain("test_add");
    expect(correlationText).toContain("(high)");
  });

  it("omits correlation block when no changeCorrelations on any failure", () => {
    const aggregation = makeAggregation({
      failures: [
        {
          checkName: "CI / tests",
          identifiedCause: "Test failures",
        } as AggregatedFailures["failures"][number],
      ],
    });

    const payload = buildConsolidatedSlackPayload(aggregation);
    const mrkdwnTexts = payload.blocks
      .filter((block) => block.type === "section" && block.text?.type === "mrkdwn")
      .map((block) => block.text?.text ?? "");

    const correlationText = mrkdwnTexts.find((text) => text.includes("Change Correlation"));

    expect(correlationText).toBeUndefined();
  });

  it("omits correlation block when changeCorrelations is empty array", () => {
    const aggregation = makeAggregation({
      failures: [
        {
          checkName: "CI / tests",
          identifiedCause: "Test failures",
          changeCorrelations: [],
        } as AggregatedFailures["failures"][number],
      ],
    });

    const payload = buildConsolidatedSlackPayload(aggregation);
    const mrkdwnTexts = payload.blocks
      .filter((block) => block.type === "section" && block.text?.type === "mrkdwn")
      .map((block) => block.text?.text ?? "");

    const correlationText = mrkdwnTexts.find((text) => text.includes("Change Correlation"));

    expect(correlationText).toBeUndefined();
  });

  it("aggregates correlations from multiple failures", () => {
    const aggregation = makeAggregation({
      failures: [
        {
          checkName: "CI / tests",
          identifiedCause: "Test failures",
          changeCorrelations: [makeCorrelation({ changedFunction: "add", correlation: "high" })],
        } as AggregatedFailures["failures"][number],
        {
          checkName: "CI / lint",
          identifiedCause: "Lint errors",
          changeCorrelations: [
            makeCorrelation({ changedFunction: "subtract", correlation: "medium" }),
          ],
        } as AggregatedFailures["failures"][number],
      ],
    });

    const payload = buildConsolidatedSlackPayload(aggregation);
    const mrkdwnTexts = payload.blocks
      .filter((block) => block.type === "section" && block.text?.type === "mrkdwn")
      .map((block) => block.text?.text ?? "");

    const correlationText = mrkdwnTexts.find((text) => text.includes("Change Correlation"));

    expect(correlationText).toBeDefined();
    expect(correlationText).toContain("`add()`");
    expect(correlationText).toContain("`subtract()`");
    // Uses pipe separator between correlations
    expect(correlationText).toContain(" | ");
  });

  it("shows 'no failures' for correlations with empty failingTests", () => {
    const aggregation = makeAggregation({
      failures: [
        {
          checkName: "CI / tests",
          identifiedCause: "Test failures",
          changeCorrelations: [
            makeCorrelation({
              changedFunction: "formatOutput",
              failingTests: [],
              correlation: "none",
            }),
          ],
        } as AggregatedFailures["failures"][number],
      ],
    });

    const payload = buildConsolidatedSlackPayload(aggregation);
    const mrkdwnTexts = payload.blocks
      .filter((block) => block.type === "section" && block.text?.type === "mrkdwn")
      .map((block) => block.text?.text ?? "");

    const correlationText = mrkdwnTexts.find((text) => text.includes("Change Correlation"));

    expect(correlationText).toContain("no failures");
  });

  it("truncates failing tests at MAX_CORRELATION_TESTS in Slack format", () => {
    const maxTests = GITHUB_COMMENT_DISPLAY.MAX_CORRELATION_TESTS;
    const manyTests = Array.from({ length: maxTests + 2 }, (_, i) => `test_${i}`);

    const aggregation = makeAggregation({
      failures: [
        {
          checkName: "CI / tests",
          identifiedCause: "Test failures",
          changeCorrelations: [makeCorrelation({ failingTests: manyTests })],
        } as AggregatedFailures["failures"][number],
      ],
    });

    const payload = buildConsolidatedSlackPayload(aggregation);
    const mrkdwnTexts = payload.blocks
      .filter((block) => block.type === "section" && block.text?.type === "mrkdwn")
      .map((block) => block.text?.text ?? "");

    const correlationText = mrkdwnTexts.find((text) => text.includes("Change Correlation"));

    expect(correlationText).toBeDefined();
    // Should show only first N tests
    for (let i = 0; i < maxTests; i++) {
      expect(correlationText).toContain(`test_${i}`);
    }
    // Should NOT show test beyond the limit
    expect(correlationText).not.toContain(`test_${maxTests}`);
  });

  it("limits displayed correlations to MAX_CORRELATION_ROWS", () => {
    const maxRows = GITHUB_COMMENT_DISPLAY.MAX_CORRELATION_ROWS;
    const manyCorrelations = Array.from({ length: maxRows + 3 }, (_, i) =>
      makeCorrelation({ changedFunction: `func_${i}` })
    );

    const aggregation = makeAggregation({
      failures: [
        {
          checkName: "CI / tests",
          identifiedCause: "Test failures",
          changeCorrelations: manyCorrelations,
        } as AggregatedFailures["failures"][number],
      ],
    });

    const payload = buildConsolidatedSlackPayload(aggregation);
    const mrkdwnTexts = payload.blocks
      .filter((block) => block.type === "section" && block.text?.type === "mrkdwn")
      .map((block) => block.text?.text ?? "");

    const correlationText = mrkdwnTexts.find((text) => text.includes("Change Correlation"));

    expect(correlationText).toBeDefined();

    // Should show first maxRows
    for (let i = 0; i < maxRows; i++) {
      expect(correlationText).toContain(`func_${i}()`);
    }

    // Should NOT show overflow
    expect(correlationText).not.toContain(`func_${maxRows}()`);
  });
});

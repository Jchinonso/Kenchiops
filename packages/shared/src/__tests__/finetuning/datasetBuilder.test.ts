/**
 * Tests for dataset builder module.
 */

import {
  buildTrainingExample,
  toOpenAIFormat,
  toJSONL,
  filterExamples,
  calculateDatasetStats,
  type TrainingExample,
  type TrainingExampleInput,
} from "../../finetuning/datasetBuilder.js";
import type { Event, Evidence, LLMAnalysisResult } from "../../core/types.js";
import type { FeedbackRecord } from "../../database/feedbackRepository.js";

// ==================== Test Fixtures ====================

const createMockEvent = (overrides: Partial<Event> = {}): Event => ({
  id: "event_123",
  type: "ci_failure",
  source: "github",
  timestamp: new Date().toISOString(),
  severity: "high",
  title: "Build failed on main branch",
  ...overrides,
});

const createMockEvidence = (overrides: Partial<Evidence> = {}): Evidence => ({
  logs: [
    {
      level: "error",
      message: "TypeError: Cannot read property 'foo' of undefined",
      timestamp: new Date().toISOString(),
    },
    { level: "info", message: "Build step completed", timestamp: new Date().toISOString() },
  ],
  gitHistory: [
    {
      sha: "abc123",
      message: "Add new feature",
      author: "dev@example.com",
      timestamp: new Date().toISOString(),
      filesChanged: ["src/feature.ts"],
    },
  ],
  relatedDocs: [
    {
      id: "doc_1",
      type: "runbook",
      title: "Error Handling Guide",
      similarity: 0.85,
      content: "...",
    },
  ],
  ...overrides,
});

const createMockAnalysis = (overrides: Partial<LLMAnalysisResult> = {}): LLMAnalysisResult => ({
  eventId: "event_123",
  summary: "Build failed due to undefined property access",
  identifiedCause: "Missing null check in feature.ts",
  confidence: "high",
  confidenceScore: 0.85,
  reasoning: "The error log shows a TypeError with undefined property access.",
  impactAssessment: { severity: "medium", scope: "limited", estimatedRecoveryTime: "15 minutes" },
  recommendedActions: [
    { id: "action_1", type: "code_fix", description: "Add null check", priority: "high" },
  ],
  codeAnnotations: [],
  ragMetadata: { retrievedDocIds: ["doc_1"], retrievalTimeMs: 50, documentsSearched: 10 },
  ...overrides,
});

const createMockFeedback = (
  feedbackType: "correct" | "incorrect" | "flaky" | "rag_helpful" | "rag_not_helpful",
  overrides: Partial<FeedbackRecord> = {}
): FeedbackRecord => ({
  id: "feedback_123",
  analysisId: "event_123",
  feedbackType,
  userId: "user_123",
  tenantId: "tenant_123",
  createdAt: new Date().toISOString(),
  ...overrides,
});

const createTrainingExampleInput = (
  overrides: Partial<TrainingExampleInput> = {}
): TrainingExampleInput => ({
  event: createMockEvent(),
  evidence: createMockEvidence(),
  analysis: createMockAnalysis(),
  feedback: [],
  ...overrides,
});

// ==================== Tests ====================

describe("Dataset Builder", () => {
  describe("buildTrainingExample", () => {
    it("should create training example with unlabeled feedback when no feedback", () => {
      const input = createTrainingExampleInput();

      const result = buildTrainingExample(input);

      expect(result.id).toMatch(/^train_event_123_\d+$/);
      expect(result.eventType).toBe("ci_failure");
      expect(result.feedbackLabel).toBe("unlabeled");
      expect(result.metadata.analysisId).toBe("event_123");
      expect(result.metadata.eventId).toBe("event_123");
      expect(result.metadata.confidenceScore).toBe(0.85);
    });

    it("should label as positive when majority feedback is positive", () => {
      const input = createTrainingExampleInput({
        feedback: [
          createMockFeedback("correct"),
          createMockFeedback("rag_helpful"),
          createMockFeedback("incorrect"),
        ],
      });

      const result = buildTrainingExample(input);

      expect(result.feedbackLabel).toBe("positive");
      expect(result.metadata.feedbackCount).toBe(3);
    });

    it("should label as negative when majority feedback is negative", () => {
      const input = createTrainingExampleInput({
        feedback: [
          createMockFeedback("incorrect"),
          createMockFeedback("rag_not_helpful"),
          createMockFeedback("correct"),
        ],
      });

      const result = buildTrainingExample(input);

      expect(result.feedbackLabel).toBe("negative");
    });

    it("should label as neutral when feedback is mixed or tied", () => {
      const input = createTrainingExampleInput({
        feedback: [createMockFeedback("correct"), createMockFeedback("incorrect")],
      });

      const result = buildTrainingExample(input);

      expect(result.feedbackLabel).toBe("neutral");
    });

    it("should include RAG docs count in metadata", () => {
      const input = createTrainingExampleInput({
        evidence: createMockEvidence({
          relatedDocs: [
            { id: "doc_1", type: "runbook", title: "Guide 1", similarity: 0.9, content: "..." },
            { id: "doc_2", type: "postmortem", title: "Guide 2", similarity: 0.8, content: "..." },
          ],
        }),
      });

      const result = buildTrainingExample(input);

      expect(result.metadata.ragDocsUsed).toBe(2);
    });

    it("should include actions count in metadata", () => {
      const input = createTrainingExampleInput({
        actions: [
          { id: "action_1", type: "code_fix", description: "Fix issue", priority: "high" },
          { id: "action_2", type: "notify", description: "Alert team", priority: "medium" },
        ],
      });

      const result = buildTrainingExample(input);

      expect(result.metadata.actionsProposed).toBe(2);
    });

    it("should anonymize sensitive data in evidence summary", () => {
      // GitHub PAT format: ghp_ + 36 alphanumeric characters
      const sensitiveToken = "ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890";
      const input = createTrainingExampleInput({
        evidence: createMockEvidence({
          logs: [
            {
              level: "error",
              message: `Token: ${sensitiveToken} exposed in logs`,
              timestamp: new Date().toISOString(),
            },
          ],
        }),
      });

      const result = buildTrainingExample(input);

      expect(result.evidenceSummary).not.toContain(sensitiveToken);
      expect(result.evidenceSummary).toContain("[REDACTED]");
    });
  });

  describe("toOpenAIFormat", () => {
    it("should convert training example to OpenAI chat format", () => {
      const example: TrainingExample = {
        id: "train_123",
        eventType: "ci_failure",
        evidenceSummary: "Logs: Error in build",
        analysisOutput: '{"summary":"Build failed"}',
        feedbackLabel: "positive",
        metadata: {
          analysisId: "analysis_123",
          eventId: "event_123",
          confidenceScore: 0.9,
          feedbackCount: 2,
          ragDocsUsed: 1,
          actionsProposed: 1,
          createdAt: new Date().toISOString(),
        },
      };

      const result = toOpenAIFormat(example);

      expect(result.messages).toHaveLength(3);
      expect(result.messages[0].role).toBe("system");
      expect(result.messages[1].role).toBe("user");
      expect(result.messages[2].role).toBe("assistant");
      expect(result.messages[1].content).toContain("ci_failure");
      expect(result.messages[2].content).toBe(example.analysisOutput);
    });

    it("should include event type in user message", () => {
      const example: TrainingExample = {
        id: "train_123",
        eventType: "deployment_failure",
        evidenceSummary: "Deploy logs",
        analysisOutput: "{}",
        feedbackLabel: "positive",
        metadata: {
          analysisId: "a",
          eventId: "e",
          confidenceScore: 0.8,
          feedbackCount: 1,
          ragDocsUsed: 0,
          actionsProposed: 0,
          createdAt: new Date().toISOString(),
        },
      };

      const result = toOpenAIFormat(example);

      expect(result.messages[1].content).toContain("deployment_failure");
    });
  });

  describe("toJSONL", () => {
    it("should convert examples to JSONL format", () => {
      const examples: TrainingExample[] = [
        {
          id: "train_1",
          eventType: "ci_failure",
          evidenceSummary: "Error 1",
          analysisOutput: '{"summary":"Failure 1"}',
          feedbackLabel: "positive",
          metadata: {
            analysisId: "a1",
            eventId: "e1",
            confidenceScore: 0.9,
            feedbackCount: 1,
            ragDocsUsed: 0,
            actionsProposed: 0,
            createdAt: new Date().toISOString(),
          },
        },
        {
          id: "train_2",
          eventType: "test_failure",
          evidenceSummary: "Error 2",
          analysisOutput: '{"summary":"Failure 2"}',
          feedbackLabel: "negative",
          metadata: {
            analysisId: "a2",
            eventId: "e2",
            confidenceScore: 0.7,
            feedbackCount: 2,
            ragDocsUsed: 1,
            actionsProposed: 1,
            createdAt: new Date().toISOString(),
          },
        },
      ];

      const result = toJSONL(examples);
      const lines = result.split("\n");

      expect(lines).toHaveLength(2);
      expect(() => JSON.parse(lines[0])).not.toThrow();
      expect(() => JSON.parse(lines[1])).not.toThrow();

      const parsed = JSON.parse(lines[0]);
      expect(parsed.messages).toBeDefined();
    });

    it("should return empty string for empty array", () => {
      const result = toJSONL([]);

      expect(result).toBe("");
    });
  });

  describe("filterExamples", () => {
    const createExamples = (): TrainingExample[] => [
      {
        id: "train_1",
        eventType: "ci_failure",
        evidenceSummary: "",
        analysisOutput: "",
        feedbackLabel: "positive",
        metadata: {
          analysisId: "",
          eventId: "",
          confidenceScore: 0.9,
          feedbackCount: 1,
          ragDocsUsed: 0,
          actionsProposed: 0,
          createdAt: "",
        },
      },
      {
        id: "train_2",
        eventType: "test_failure",
        evidenceSummary: "",
        analysisOutput: "",
        feedbackLabel: "negative",
        metadata: {
          analysisId: "",
          eventId: "",
          confidenceScore: 0.5,
          feedbackCount: 1,
          ragDocsUsed: 0,
          actionsProposed: 0,
          createdAt: "",
        },
      },
      {
        id: "train_3",
        eventType: "ci_failure",
        evidenceSummary: "",
        analysisOutput: "",
        feedbackLabel: "unlabeled",
        metadata: {
          analysisId: "",
          eventId: "",
          confidenceScore: 0.8,
          feedbackCount: 0,
          ragDocsUsed: 0,
          actionsProposed: 0,
          createdAt: "",
        },
      },
    ];

    it("should exclude unlabeled examples by default", () => {
      const examples = createExamples();

      const result = filterExamples(examples);

      expect(result).toHaveLength(2);
      expect(result.every((example) => example.feedbackLabel !== "unlabeled")).toBe(true);
    });

    it("should include unlabeled examples when option is set", () => {
      const examples = createExamples();

      const result = filterExamples(examples, { includeUnlabeled: true });

      expect(result).toHaveLength(3);
    });

    it("should filter by minimum confidence", () => {
      const examples = createExamples();

      const result = filterExamples(examples, { includeUnlabeled: true, minConfidence: 0.7 });

      expect(result).toHaveLength(2);
      expect(result.every((example) => example.metadata.confidenceScore >= 0.7)).toBe(true);
    });

    it("should filter by event types", () => {
      const examples = createExamples();

      const result = filterExamples(examples, {
        includeUnlabeled: true,
        eventTypes: ["ci_failure"],
      });

      expect(result).toHaveLength(2);
      expect(result.every((example) => example.eventType === "ci_failure")).toBe(true);
    });

    it("should limit number of examples", () => {
      const examples = createExamples();

      const result = filterExamples(examples, { includeUnlabeled: true, maxExamples: 1 });

      expect(result).toHaveLength(1);
    });
  });

  describe("calculateDatasetStats", () => {
    it("should calculate correct statistics", () => {
      const examples: TrainingExample[] = [
        {
          id: "1",
          eventType: "ci_failure",
          evidenceSummary: "",
          analysisOutput: "",
          feedbackLabel: "positive",
          metadata: {
            analysisId: "",
            eventId: "",
            confidenceScore: 0.9,
            feedbackCount: 1,
            ragDocsUsed: 0,
            actionsProposed: 0,
            createdAt: "",
          },
        },
        {
          id: "2",
          eventType: "ci_failure",
          evidenceSummary: "",
          analysisOutput: "",
          feedbackLabel: "positive",
          metadata: {
            analysisId: "",
            eventId: "",
            confidenceScore: 0.8,
            feedbackCount: 1,
            ragDocsUsed: 0,
            actionsProposed: 0,
            createdAt: "",
          },
        },
        {
          id: "3",
          eventType: "test_failure",
          evidenceSummary: "",
          analysisOutput: "",
          feedbackLabel: "negative",
          metadata: {
            analysisId: "",
            eventId: "",
            confidenceScore: 0.7,
            feedbackCount: 1,
            ragDocsUsed: 0,
            actionsProposed: 0,
            createdAt: "",
          },
        },
        {
          id: "4",
          eventType: "deployment_failure",
          evidenceSummary: "",
          analysisOutput: "",
          feedbackLabel: "neutral",
          metadata: {
            analysisId: "",
            eventId: "",
            confidenceScore: 0.6,
            feedbackCount: 1,
            ragDocsUsed: 0,
            actionsProposed: 0,
            createdAt: "",
          },
        },
      ];

      const stats = calculateDatasetStats(examples);

      expect(stats.totalExamples).toBe(4);
      expect(stats.positiveExamples).toBe(2);
      expect(stats.negativeExamples).toBe(1);
      expect(stats.neutralExamples).toBe(1);
      expect(stats.unlabeledExamples).toBe(0);
      expect(stats.averageConfidence).toBeCloseTo(0.75, 10);
      expect(stats.eventTypeDistribution).toEqual({
        ci_failure: 2,
        test_failure: 1,
        deployment_failure: 1,
      });
    });

    it("should handle empty array", () => {
      const stats = calculateDatasetStats([]);

      expect(stats.totalExamples).toBe(0);
      expect(stats.averageConfidence).toBe(0);
      expect(stats.eventTypeDistribution).toEqual({});
    });
  });
});

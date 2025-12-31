/**
 * Unit tests for RAG Reranker
 */

import { describe, it, expect } from "@jest/globals";
import {
  rerankResults,
  applyHardRules,
  fullRerank,
  type RerankableResult,
  type QueryContext,
  _testExports,
} from "../../rag/reranker.js";

const { calculateRecencyBoost, calculateFeedbackSignal, RECENCY_CONFIG } = _testExports;

describe("RAG Reranker", () => {
  // Test fixtures
  const createResult = (overrides: Partial<RerankableResult> = {}): RerankableResult => ({
    id: "doc-1",
    similarity: 0.85,
    docType: "runbook",
    content: "Test content",
    createdAt: new Date().toISOString(),
    ...overrides,
  });

  describe("calculateRecencyBoost", () => {
    it("should return max boost for recent documents", () => {
      const recent = new Date().toISOString();
      const boost = calculateRecencyBoost(recent);

      expect(boost).toBe(RECENCY_CONFIG.MAX_BOOST);
    });

    it("should return min boost for old documents", () => {
      const old = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
      const boost = calculateRecencyBoost(old);

      expect(boost).toBe(RECENCY_CONFIG.MIN_BOOST);
    });

    it("should return min boost when no date provided", () => {
      const boost = calculateRecencyBoost(undefined);

      expect(boost).toBe(RECENCY_CONFIG.MIN_BOOST);
    });

    it("should decay linearly between full and no boost", () => {
      const midAge = (RECENCY_CONFIG.FULL_BOOST_DAYS + RECENCY_CONFIG.NO_BOOST_DAYS) / 2;
      const midDate = new Date(Date.now() - midAge * 24 * 60 * 60 * 1000).toISOString();
      const boost = calculateRecencyBoost(midDate);

      expect(boost).toBeGreaterThan(RECENCY_CONFIG.MIN_BOOST);
      expect(boost).toBeLessThan(RECENCY_CONFIG.MAX_BOOST);
    });
  });

  describe("calculateFeedbackSignal", () => {
    it("should return neutral score when no metadata", () => {
      const score = calculateFeedbackSignal(undefined);

      expect(score).toBe(0.5);
    });

    it("should return helpful rate when no negative feedback", () => {
      const score = calculateFeedbackSignal({ helpfulRate: 0.8 });

      expect(score).toBe(0.8);
    });

    it("should penalize for negative feedback", () => {
      const score = calculateFeedbackSignal({
        helpfulRate: 0.8,
        negativeFeedbackCount: 3,
      });

      expect(score).toBeLessThan(0.8);
      expect(score).toBe(0.5); // 0.8 - (3 * 0.1) = 0.5
    });

    it("should cap penalty at 0.4", () => {
      const score = calculateFeedbackSignal({
        helpfulRate: 0.8,
        negativeFeedbackCount: 10, // Would be 1.0 penalty but capped at 0.4
      });

      expect(score).toBe(0.4); // 0.8 - 0.4 = 0.4
    });

    it("should not go below 0", () => {
      const score = calculateFeedbackSignal({
        helpfulRate: 0.2,
        negativeFeedbackCount: 5,
      });

      expect(score).toBe(0); // max(0, 0.2 - 0.4) = 0
    });
  });

  describe("rerankResults", () => {
    it("should sort results by final score descending", () => {
      const results: RerankableResult[] = [
        createResult({ id: "1", similarity: 0.7 }),
        createResult({ id: "2", similarity: 0.9 }),
        createResult({ id: "3", similarity: 0.8 }),
      ];

      const reranked = rerankResults(results);

      expect(reranked[0].result.id).toBe("2");
      expect(reranked[1].result.id).toBe("3");
      expect(reranked[2].result.id).toBe("1");
    });

    it("should filter by minimum score", () => {
      const results: RerankableResult[] = [
        createResult({ id: "1", similarity: 0.9 }),
        createResult({ id: "2", similarity: 0.3 }),
      ];

      const reranked = rerankResults(results, { minScore: 0.6 });

      expect(reranked.length).toBe(1);
      expect(reranked[0].result.id).toBe("1");
    });

    it("should limit to topK results", () => {
      const results: RerankableResult[] = [
        createResult({ id: "1", similarity: 0.9 }),
        createResult({ id: "2", similarity: 0.85 }),
        createResult({ id: "3", similarity: 0.8 }),
      ];

      const reranked = rerankResults(results, { topK: 2 });

      expect(reranked.length).toBe(2);
    });

    it("should include score breakdown", () => {
      const results: RerankableResult[] = [createResult()];

      const reranked = rerankResults(results);

      expect(reranked[0].scoreBreakdown).toBeDefined();
      expect(reranked[0].scoreBreakdown.vectorScore).toBeGreaterThan(0);
      expect(reranked[0].scoreBreakdown.reliabilityScore).toBeGreaterThan(0);
    });

    it("should apply metadata boost for matching repo", () => {
      const queryContext: QueryContext = {
        repository: "myorg/myrepo",
      };

      const matchingResult = createResult({
        id: "1",
        similarity: 0.8,
        metadata: { repository: "myorg/myrepo" },
      });
      const nonMatchingResult = createResult({
        id: "2",
        similarity: 0.8,
        metadata: { repository: "other/repo" },
      });

      const reranked = rerankResults([matchingResult, nonMatchingResult], { queryContext });

      // Matching repo should have higher score due to metadata boost
      expect(reranked[0].result.id).toBe("1");
      expect(reranked[0].scoreBreakdown.metadataBoost).toBeGreaterThan(0);
      expect(reranked[1].scoreBreakdown.metadataBoost).toBe(0);
    });
  });

  describe("applyHardRules", () => {
    it("should prioritize same-repo results", () => {
      const queryContext: QueryContext = { repository: "myorg/myrepo" };

      const results = [
        {
          result: createResult({ id: "1", metadata: { repository: "other/repo" } }),
          finalScore: 0.9,
        },
        {
          result: createResult({ id: "2", metadata: { repository: "myorg/myrepo" } }),
          finalScore: 0.8,
        },
      ].map((item) => ({
        ...item,
        scoreBreakdown: {
          vectorScore: 0,
          reliabilityScore: 0,
          recencyScore: 0,
          feedbackScore: 0,
          metadataBoost: 0,
        },
      }));

      const reordered = applyHardRules(results, queryContext);

      // Same-repo result comes first even with lower score
      expect(reordered[0].result.id).toBe("2");
      expect(reordered[1].result.id).toBe("1");
    });

    it("should not reorder when no query context", () => {
      const results = [
        { result: createResult({ id: "1" }), finalScore: 0.9 },
        { result: createResult({ id: "2" }), finalScore: 0.8 },
      ].map((item) => ({
        ...item,
        scoreBreakdown: {
          vectorScore: 0,
          reliabilityScore: 0,
          recencyScore: 0,
          feedbackScore: 0,
          metadataBoost: 0,
        },
      }));

      const reordered = applyHardRules(results);

      expect(reordered[0].result.id).toBe("1");
    });
  });

  describe("fullRerank", () => {
    it("should apply scoring and hard rules together", () => {
      const queryContext: QueryContext = { repository: "myorg/myrepo" };

      const results: RerankableResult[] = [
        createResult({ id: "1", similarity: 0.9, metadata: { repository: "other/repo" } }),
        createResult({ id: "2", similarity: 0.85, metadata: { repository: "myorg/myrepo" } }),
      ];

      const reranked = fullRerank(results, { queryContext });

      // Same-repo result should be first despite lower similarity
      expect(reranked[0].result.id).toBe("2");
    });

    it("should respect topK after hard rules", () => {
      const results: RerankableResult[] = [
        createResult({ id: "1", similarity: 0.9 }),
        createResult({ id: "2", similarity: 0.85 }),
        createResult({ id: "3", similarity: 0.8 }),
      ];

      const reranked = fullRerank(results, { topK: 2 });

      expect(reranked.length).toBe(2);
    });
  });

  describe("source reliability", () => {
    it("should give higher reliability to PR fix comments than Slack", () => {
      const prResult = createResult({ id: "1", similarity: 0.8, docType: "pr_fix_comment" });
      const slackResult = createResult({ id: "2", similarity: 0.8, docType: "slack_resolution" });

      const reranked = rerankResults([prResult, slackResult]);

      // PR fix comment should rank higher due to source reliability
      expect(reranked[0].result.id).toBe("1");
    });

    it("should give highest reliability to team documentation", () => {
      const runbookResult = createResult({ id: "1", similarity: 0.8, docType: "runbook" });
      const analysisResult = createResult({ id: "2", similarity: 0.8, docType: "analysis_lesson" });

      const reranked = rerankResults([runbookResult, analysisResult]);

      // Runbook should rank higher due to team docs reliability
      expect(reranked[0].result.id).toBe("1");
    });
  });
});

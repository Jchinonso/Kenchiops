/**
 * Unit tests for PR Fix Comment Detector
 */

import { describe, it, expect } from "@jest/globals";
import {
  analyzeComment,
  findFixComments,
  extractFixKnowledge,
  isDuplicateKnowledge,
  type PRComment,
  type PRFixFailureContext,
} from "../../rag/prFixCommentDetector.js";

describe("PR Fix Comment Detector", () => {
  // Test fixtures
  const createComment = (overrides: Partial<PRComment> = {}): PRComment => ({
    id: "comment-123",
    author: "testuser",
    body: "This is a test comment",
    createdAt: new Date().toISOString(),
    ...overrides,
  });

  const createFailureContext = (
    overrides: Partial<PRFixFailureContext> = {}
  ): PRFixFailureContext => ({
    checkRunId: 12345,
    checkName: "build",
    errorSummary: "TypeScript compilation failed",
    failedAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    repository: "testorg/testrepo",
    prNumber: 42,
    commitSha: "abc123def456",
    ...overrides,
  });

  describe("analyzeComment", () => {
    it("should detect high-confidence fix comments", () => {
      const comment = createComment({
        body: "The issue was that we were missing the import statement. Fixed by adding the correct import.",
      });

      const result = analyzeComment(comment);

      expect(result.isFixComment).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.3);
      expect(result.matchedPatterns.length).toBeGreaterThan(0);
    });

    it("should detect comments with root cause explanation", () => {
      const comment = createComment({
        body: "Root cause: the API endpoint was returning 404 because the route was not registered. Solution: added the missing route handler.",
      });

      const result = analyzeComment(comment);

      expect(result.isFixComment).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.3);
    });

    it("should detect comments with code blocks", () => {
      const comment = createComment({
        body: `Fixed the issue by updating the config:
\`\`\`typescript
const config = { timeout: 5000 };
\`\`\``,
      });

      const result = analyzeComment(comment);

      expect(result.hasCodeBlock).toBe(true);
    });

    it("should detect file references", () => {
      const comment = createComment({
        body: "The problem was in src/utils/helper.ts - the function was not exported correctly.",
      });

      const result = analyzeComment(comment);

      expect(result.hasFileReference).toBe(true);
    });

    it("should exclude bot comments", () => {
      const comment = createComment({
        author: "dependabot[bot]",
        body: "The issue was fixed by updating dependencies.",
      });

      const result = analyzeComment(comment);

      expect(result.isFixComment).toBe(false);
      expect(result.confidence).toBe(0);
    });

    it("should exclude trivial comments", () => {
      const comment = createComment({
        body: "LGTM",
      });

      const result = analyzeComment(comment);

      expect(result.isFixComment).toBe(false);
    });

    it("should exclude short comments", () => {
      const comment = createComment({
        body: "Fixed it!",
      });

      const result = analyzeComment(comment);

      expect(result.isFixComment).toBe(false);
    });
  });

  describe("findFixComments", () => {
    it("should filter comments to those after failure time", () => {
      const failedAt = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago
      const comments: PRComment[] = [
        createComment({
          id: "1",
          body: "The issue was a missing import. Fixed by adding the correct import statement to resolve the compilation error.",
          createdAt: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago (before failure)
        }),
        createComment({
          id: "2",
          body: "The issue was a missing import. Fixed by adding the correct import statement to resolve the compilation error.",
          createdAt: new Date(Date.now() - 1800000).toISOString(), // 30 minutes ago (after failure)
        }),
      ];

      const result = findFixComments(comments, failedAt);

      expect(result.length).toBe(1);
      expect(result[0].comment.id).toBe("2");
    });

    it("should sort by confidence descending", () => {
      const failedAt = new Date(Date.now() - 3600000).toISOString();
      const comments: PRComment[] = [
        createComment({
          id: "1",
          body: "Updated the code to fix the problem by changing the configuration. This should resolve the issue.",
          createdAt: new Date(Date.now() - 1800000).toISOString(),
        }),
        createComment({
          id: "2",
          body: "Root cause was a type error. The issue was that the interface didn't match. Fixed by updating the type definition.",
          createdAt: new Date(Date.now() - 1800000).toISOString(),
        }),
      ];

      const result = findFixComments(comments, failedAt);

      if (result.length >= 2) {
        expect(result[0].confidence).toBeGreaterThanOrEqual(result[1].confidence);
      }
    });

    it("should return empty array when no fix comments found", () => {
      const failedAt = new Date(Date.now() - 3600000).toISOString();
      const comments: PRComment[] = [
        createComment({
          id: "1",
          body: "Thanks!",
          createdAt: new Date(Date.now() - 1800000).toISOString(),
        }),
      ];

      const result = findFixComments(comments, failedAt);

      expect(result.length).toBe(0);
    });
  });

  describe("extractFixKnowledge", () => {
    it("should create knowledge document from analysis", () => {
      const comment = createComment({
        body: "The issue was a missing dependency. Fixed by running npm install and adding the package to package.json.",
      });
      const analysis = analyzeComment(comment);
      const failureContext = createFailureContext();

      const knowledge = extractFixKnowledge(analysis, failureContext);

      expect(knowledge.title).toContain("Fix");
      expect(knowledge.content).toContain("Failure Pattern");
      expect(knowledge.content).toContain("Fix Explanation");
      expect(knowledge.metadata.prUrl).toContain("github.com");
    });

    it("should include failure context in content", () => {
      const comment = createComment({
        body: "The issue was a type mismatch. Fixed by updating the interface definition to match the expected type.",
      });
      const analysis = analyzeComment(comment);
      const failureContext = createFailureContext({
        checkName: "lint",
        repository: "myorg/myrepo",
        errorSummary: "ESLint errors found",
      });

      const knowledge = extractFixKnowledge(analysis, failureContext);

      expect(knowledge.content).toContain("lint");
      expect(knowledge.content).toContain("myorg/myrepo");
      expect(knowledge.content).toContain("ESLint errors found");
    });
  });

  describe("isDuplicateKnowledge", () => {
    it("should detect duplicate content", () => {
      const comment = createComment({
        body: "The issue was a missing import. Fixed by adding the correct import statement.",
      });
      const analysis = analyzeComment(comment);
      const failureContext = createFailureContext();
      const knowledge = extractFixKnowledge(analysis, failureContext);

      const existingContent = `
## Fix Explanation
The issue was a missing import. Fixed by adding the correct import statement.
`;

      const result = isDuplicateKnowledge(knowledge, existingContent);

      expect(result).toBe(true);
    });

    it("should not flag different content as duplicate", () => {
      const comment = createComment({
        body: "The issue was a missing import. Fixed by adding the correct import statement.",
      });
      const analysis = analyzeComment(comment);
      const failureContext = createFailureContext();
      const knowledge = extractFixKnowledge(analysis, failureContext);

      const existingContent = `
## Fix Explanation
Completely different fix explanation about database connection timeout issues.
`;

      const result = isDuplicateKnowledge(knowledge, existingContent);

      expect(result).toBe(false);
    });
  });
});

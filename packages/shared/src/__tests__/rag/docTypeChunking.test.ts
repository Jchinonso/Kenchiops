/**
 * Unit tests for Doc-Type-Specific Chunking
 */

import { describe, it, expect } from "@jest/globals";
import {
  chunkByDocType,
  getChunkingStrategy,
  hasCustomStrategy,
  getRegisteredDocTypesWithStrategies,
  DOC_TYPES,
  ANALYSIS_LESSON_STRATEGY,
  PR_FIX_COMMENT_STRATEGY,
  RUNBOOK_STRATEGY,
} from "../../rag/index.js";

describe("Chunking Strategies", () => {
  describe("getChunkingStrategy", () => {
    it("should return strategy for known doc type", () => {
      const strategy = getChunkingStrategy("analysis_lesson");
      expect(strategy).toEqual(ANALYSIS_LESSON_STRATEGY);
    });

    it("should return default strategy for unknown doc type", () => {
      const strategy = getChunkingStrategy("unknown_type");
      expect(strategy).toBeDefined();
      expect(strategy.targetTokens).toBe(400);
    });

    it("should return correct strategy for runbooks", () => {
      const strategy = getChunkingStrategy("runbook");
      expect(strategy).toEqual(RUNBOOK_STRATEGY);
      expect(strategy.preserveSections).toBe(true);
    });

    it("should return atomic strategy for PR fix comments", () => {
      const strategy = getChunkingStrategy("pr_fix_comment");
      expect(strategy).toEqual(PR_FIX_COMMENT_STRATEGY);
      expect(strategy.atomicUnit).toBe(true);
    });
  });

  describe("hasCustomStrategy", () => {
    it("should return true for registered doc types", () => {
      expect(hasCustomStrategy("analysis_lesson")).toBe(true);
      expect(hasCustomStrategy("pr_fix_comment")).toBe(true);
      expect(hasCustomStrategy("runbook")).toBe(true);
    });

    it("should return false for unregistered doc types", () => {
      expect(hasCustomStrategy("unknown_type")).toBe(false);
      expect(hasCustomStrategy("")).toBe(false);
    });
  });

  describe("getRegisteredDocTypesWithStrategies", () => {
    it("should return array of doc types with strategies", () => {
      const docTypes = getRegisteredDocTypesWithStrategies();

      expect(Array.isArray(docTypes)).toBe(true);
      expect(docTypes.length).toBeGreaterThan(0);

      const analysisLesson = docTypes.find((entry) => entry.docType === "analysis_lesson");
      expect(analysisLesson).toBeDefined();
      expect(analysisLesson?.strategy.atomicUnit).toBe(true);
    });
  });

  describe("DOC_TYPES", () => {
    it("should have all expected doc types", () => {
      expect(DOC_TYPES.ANALYSIS_LESSON).toBe("analysis_lesson");
      expect(DOC_TYPES.PR_FIX_COMMENT).toBe("pr_fix_comment");
      expect(DOC_TYPES.SLACK_RESOLUTION).toBe("slack_resolution");
      expect(DOC_TYPES.RUNBOOK).toBe("runbook");
      expect(DOC_TYPES.POSTMORTEM).toBe("postmortem");
    });
  });
});

describe("chunkByDocType", () => {
  describe("atomic chunking strategy", () => {
    it("should keep small analysis lessons as single chunk", () => {
      const content = `
Error: TypeError: Cannot read property 'x' of undefined

Root Cause: The user object was not properly initialized before accessing its properties.

Fix: Added null check before accessing user.x property.
      `.trim();

      const result = chunkByDocType(content, "analysis_lesson");

      expect(result.strategy).toBe("atomic");
      expect(result.chunks.length).toBe(1);
      expect(result.chunks[0].content).toContain("Error Analysis Lesson");
      expect(result.chunks[0].content).toContain("TypeError");
    });

    it("should keep small PR fix comments as single chunk", () => {
      const content = `
This fixed the issue by ensuring the database connection is properly closed after use.
The connection pool was being exhausted because connections weren't being released.
      `.trim();

      const result = chunkByDocType(content, "pr_fix_comment");

      expect(result.strategy).toBe("atomic");
      expect(result.chunks.length).toBe(1);
      expect(result.chunks[0].content).toContain("PR Fix Comment");
    });

    it("should chunk large atomic content when exceeding limit", () => {
      const content = "x".repeat(3000); // Large content

      const result = chunkByDocType(content, "analysis_lesson");

      expect(result.chunks.length).toBeGreaterThan(1);
    });
  });

  describe("section-aware chunking strategy", () => {
    it("should preserve sections in runbooks", () => {
      const content = `
# Overview
This runbook describes the deployment process.

# Prerequisites
- Access to production environment
- Valid credentials

# Steps
1. Pull latest changes
2. Run tests
3. Deploy to staging
4. Verify staging
5. Deploy to production
      `.trim();

      const result = chunkByDocType(content, "runbook", "Deployment Runbook");

      expect(result.strategy).toBe("section-aware");
      expect(result.chunks[0].content).toContain("Runbook: Deployment Runbook");
    });

    it("should preserve sections in postmortems", () => {
      const content = `
# Incident Summary
Production outage on 2025-01-10.

# Timeline
08:00 - First alerts triggered
08:15 - Team paged
08:30 - Root cause identified

# Root Cause
Database connection pool exhausted.

# Action Items
- Increase pool size
- Add monitoring
      `.trim();

      const result = chunkByDocType(content, "postmortem", "Jan 10 Outage");

      expect(result.strategy).toBe("section-aware");
      expect(result.chunks[0].content).toContain("Postmortem: Jan 10 Outage");
    });
  });

  describe("standard chunking strategy", () => {
    it("should use standard chunking for documentation", () => {
      const content = `
This is general documentation content that doesn't have a specific structure.
It contains various information about the system and its components.
The content will be chunked using the default strategy.
      `.trim();

      const result = chunkByDocType(content, "documentation");

      expect(result.docType).toBe("documentation");
      expect(result.chunks.length).toBeGreaterThan(0);
    });
  });

  describe("metadata", () => {
    it("should include correct metadata in result", () => {
      const content = "Test content for metadata verification";

      const result = chunkByDocType(content, "analysis_lesson");

      expect(result.metadata.originalLength).toBe(content.length);
      expect(result.metadata.chunkCount).toBe(result.chunks.length);
      expect(typeof result.metadata.preservedSections).toBe("boolean");
    });

    it("should include chunk metadata in each chunk", () => {
      const content = "Test content for chunk metadata";

      const result = chunkByDocType(content, "pr_fix_comment");

      result.chunks.forEach((chunk, index) => {
        expect(chunk.metadata.chunkIndex).toBe(index);
        expect(chunk.metadata.totalChunks).toBe(result.chunks.length);
        expect(chunk.metadata.estimatedTokens).toBeGreaterThan(0);
      });
    });
  });

  describe("context prefixes", () => {
    it("should add correct prefix for analysis lessons", () => {
      const result = chunkByDocType("Test error", "analysis_lesson");
      expect(result.chunks[0].content).toContain("Error Analysis Lesson");
    });

    it("should add correct prefix for slack resolutions", () => {
      const result = chunkByDocType("Resolution content", "slack_resolution");
      expect(result.chunks[0].content).toContain("Slack Resolution Thread");
    });

    it("should include title in runbook prefix", () => {
      const result = chunkByDocType("Steps here", "runbook", "My Runbook");
      expect(result.chunks[0].content).toContain("Runbook: My Runbook");
    });

    it("should use 'Untitled' when no title provided", () => {
      const result = chunkByDocType("Steps here", "runbook");
      expect(result.chunks[0].content).toContain("Runbook: Untitled");
    });
  });
});

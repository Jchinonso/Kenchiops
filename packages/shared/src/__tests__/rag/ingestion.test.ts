/**
 * Unit tests for RAG Ingestion Module
 *
 * Tests relationship auto-detection configuration for high-value document types.
 */

import { describe, it, expect } from "@jest/globals";
import {
  AUTO_DETECT_RELATIONSHIP_DOC_TYPES,
  KNOWLEDGE_DOC_TYPES,
} from "../../constants/ragConstants.js";

describe("RAG Ingestion - Relationship Auto-Detection", () => {
  describe("AUTO_DETECT_RELATIONSHIP_DOC_TYPES constant", () => {
    it("should be an array with the expected doc types", () => {
      expect(Array.isArray(AUTO_DETECT_RELATIONSHIP_DOC_TYPES)).toBe(true);
    });

    it("should include postmortem doc type", () => {
      expect(AUTO_DETECT_RELATIONSHIP_DOC_TYPES).toContain(KNOWLEDGE_DOC_TYPES.POSTMORTEM);
    });

    it("should include analysis_lesson doc type", () => {
      expect(AUTO_DETECT_RELATIONSHIP_DOC_TYPES).toContain(KNOWLEDGE_DOC_TYPES.ANALYSIS_LESSON);
    });

    it("should include linked_fix doc type", () => {
      expect(AUTO_DETECT_RELATIONSHIP_DOC_TYPES).toContain(KNOWLEDGE_DOC_TYPES.LINKED_FIX);
    });

    it("should include pr_fix_comment doc type", () => {
      expect(AUTO_DETECT_RELATIONSHIP_DOC_TYPES).toContain(KNOWLEDGE_DOC_TYPES.PR_FIX_COMMENT);
    });

    it("should have exactly 4 high-value doc types", () => {
      expect(AUTO_DETECT_RELATIONSHIP_DOC_TYPES).toHaveLength(4);
    });

    it("should NOT include readme doc type", () => {
      expect(AUTO_DETECT_RELATIONSHIP_DOC_TYPES).not.toContain(KNOWLEDGE_DOC_TYPES.README);
    });

    it("should NOT include documentation doc type", () => {
      expect(AUTO_DETECT_RELATIONSHIP_DOC_TYPES).not.toContain(KNOWLEDGE_DOC_TYPES.DOCUMENTATION);
    });

    it("should NOT include runbook doc type", () => {
      expect(AUTO_DETECT_RELATIONSHIP_DOC_TYPES).not.toContain(KNOWLEDGE_DOC_TYPES.RUNBOOK);
    });

    it("should NOT include external doc type", () => {
      expect(AUTO_DETECT_RELATIONSHIP_DOC_TYPES).not.toContain(KNOWLEDGE_DOC_TYPES.EXTERNAL);
    });

    it("should NOT include slack_resolution doc type", () => {
      // Slack resolutions are handled separately with their own ingestion pipeline
      expect(AUTO_DETECT_RELATIONSHIP_DOC_TYPES).not.toContain(
        KNOWLEDGE_DOC_TYPES.SLACK_RESOLUTION
      );
    });
  });

  describe("shouldDetectRelationships logic", () => {
    /**
     * Helper to replicate the logic from ingestion.ts
     */
    const shouldDetectRelationships = (
      detectRelationshipsInput: boolean | undefined,
      docType: string
    ): boolean => {
      return (
        detectRelationshipsInput ??
        AUTO_DETECT_RELATIONSHIP_DOC_TYPES.includes(
          docType as typeof KNOWLEDGE_DOC_TYPES.POSTMORTEM
        )
      );
    };

    describe("when detectRelationships is undefined", () => {
      it("should return true for postmortem", () => {
        expect(shouldDetectRelationships(undefined, "postmortem")).toBe(true);
      });

      it("should return true for analysis_lesson", () => {
        expect(shouldDetectRelationships(undefined, "analysis_lesson")).toBe(true);
      });

      it("should return true for linked_fix", () => {
        expect(shouldDetectRelationships(undefined, "linked_fix")).toBe(true);
      });

      it("should return true for pr_fix_comment", () => {
        expect(shouldDetectRelationships(undefined, "pr_fix_comment")).toBe(true);
      });

      it("should return false for readme", () => {
        expect(shouldDetectRelationships(undefined, "readme")).toBe(false);
      });

      it("should return false for documentation", () => {
        expect(shouldDetectRelationships(undefined, "documentation")).toBe(false);
      });

      it("should return false for runbook", () => {
        expect(shouldDetectRelationships(undefined, "runbook")).toBe(false);
      });
    });

    describe("when detectRelationships is explicitly set", () => {
      it("should return true when explicitly set to true for any doc type", () => {
        expect(shouldDetectRelationships(true, "readme")).toBe(true);
        expect(shouldDetectRelationships(true, "documentation")).toBe(true);
        expect(shouldDetectRelationships(true, "postmortem")).toBe(true);
      });

      it("should return false when explicitly set to false for auto-detect doc types", () => {
        expect(shouldDetectRelationships(false, "postmortem")).toBe(false);
        expect(shouldDetectRelationships(false, "analysis_lesson")).toBe(false);
        expect(shouldDetectRelationships(false, "linked_fix")).toBe(false);
      });

      it("should return false when explicitly set to false for non-auto doc types", () => {
        expect(shouldDetectRelationships(false, "readme")).toBe(false);
        expect(shouldDetectRelationships(false, "documentation")).toBe(false);
      });
    });
  });
});

/**
 * Unit tests for RAG Metadata Schemas
 */

import { describe, it, expect } from "@jest/globals";
import {
  analysisLessonMetadataSchema,
  prFixCommentMetadataSchema,
  slackResolutionMetadataSchema,
  teamDocsMetadataSchema,
  externalDocsMetadataSchema,
  runbookMetadataSchema,
  postmortemMetadataSchema,
  validateMetadata,
  validateMetadataOrThrow,
  hasSchemaForDocType,
  getRegisteredDocTypes,
  getSchemaForDocType,
} from "../../rag/schemas/index.js";

describe("Metadata Schemas", () => {
  describe("analysisLessonMetadataSchema", () => {
    it("should validate valid analysis lesson metadata", () => {
      const validMetadata = {
        errorSignature: "TypeError: Cannot read property 'x' of undefined",
        errorType: "TypeError",
        rootCause: "Null reference access",
        failureCategory: "runtime_error",
        repository: "myorg/myrepo",
        prNumber: 123,
        commitSha: "abc1234",
      };

      const result = analysisLessonMetadataSchema.safeParse(validMetadata);
      expect(result.success).toBe(true);
    });

    it("should require errorSignature", () => {
      const invalidMetadata = {
        errorType: "TypeError",
      };

      const result = analysisLessonMetadataSchema.safeParse(invalidMetadata);
      expect(result.success).toBe(false);
    });

    it("should validate failureCategory enum values", () => {
      const metadata = {
        errorSignature: "Test error",
        failureCategory: "invalid_category",
      };

      const result = analysisLessonMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(false);
    });

    it("should validate commit SHA format", () => {
      const validMetadata = {
        errorSignature: "Test error",
        commitSha: "abc1234def5678",
      };
      expect(analysisLessonMetadataSchema.safeParse(validMetadata).success).toBe(true);

      const invalidMetadata = {
        errorSignature: "Test error",
        commitSha: "not-a-sha",
      };
      expect(analysisLessonMetadataSchema.safeParse(invalidMetadata).success).toBe(false);
    });
  });

  describe("prFixCommentMetadataSchema", () => {
    it("should validate valid PR fix comment metadata", () => {
      const validMetadata = {
        prNumber: 456,
        commentId: 789,
        commentAuthor: "developer",
        prTitle: "Fix null pointer exception",
        repository: "myorg/myrepo",
      };

      const result = prFixCommentMetadataSchema.safeParse(validMetadata);
      expect(result.success).toBe(true);
    });

    it("should require prNumber and commentId", () => {
      const invalidMetadata = {
        commentAuthor: "developer",
      };

      const result = prFixCommentMetadataSchema.safeParse(invalidMetadata);
      expect(result.success).toBe(false);
    });

    it("should require commentAuthor", () => {
      const invalidMetadata = {
        prNumber: 456,
        commentId: 789,
      };

      const result = prFixCommentMetadataSchema.safeParse(invalidMetadata);
      expect(result.success).toBe(false);
    });
  });

  describe("slackResolutionMetadataSchema", () => {
    it("should validate valid Slack resolution metadata", () => {
      const validMetadata = {
        channelId: "C12345678",
        channelName: "ci-failures",
        threadTs: "1234567890.123456",
        resolverUserId: "U12345678",
        resolverUsername: "devops_user",
        confidence: 0.85,
        matchedPatterns: ["fixed_explicit", "solution_intro"],
        hasCodeBlock: true,
        hasPositiveReactions: true,
      };

      const result = slackResolutionMetadataSchema.safeParse(validMetadata);
      expect(result.success).toBe(true);
    });

    it("should require channelId and threadTs and resolverUserId", () => {
      const invalidMetadata = {
        channelName: "ci-failures",
        confidence: 0.8,
        matchedPatterns: [],
        hasCodeBlock: false,
        hasPositiveReactions: false,
      };

      const result = slackResolutionMetadataSchema.safeParse(invalidMetadata);
      expect(result.success).toBe(false);
    });

    it("should validate confidence range", () => {
      const validMetadata = {
        channelId: "C12345678",
        threadTs: "1234567890.123456",
        resolverUserId: "U12345678",
        confidence: 1.5, // Invalid - should be 0-1
        matchedPatterns: [],
        hasCodeBlock: false,
        hasPositiveReactions: false,
      };

      const result = slackResolutionMetadataSchema.safeParse(validMetadata);
      expect(result.success).toBe(false);
    });
  });

  describe("teamDocsMetadataSchema", () => {
    it("should validate valid team docs metadata", () => {
      const validMetadata = {
        docTitle: "Deployment Runbook",
        docVersion: "1.0.0",
        author: "devops-team",
        tags: ["deployment", "production"],
        applicableServices: ["api", "web"],
      };

      const result = teamDocsMetadataSchema.safeParse(validMetadata);
      expect(result.success).toBe(true);
    });

    it("should require docTitle", () => {
      const invalidMetadata = {
        author: "devops-team",
      };

      const result = teamDocsMetadataSchema.safeParse(invalidMetadata);
      expect(result.success).toBe(false);
    });
  });

  describe("externalDocsMetadataSchema", () => {
    it("should validate valid external docs metadata", () => {
      const validMetadata = {
        docTitle: "External Guide",
        sourceUrl: "https://docs.example.com/guide",
        sourceName: "Example Docs",
        fetchedAt: "2025-01-15T12:00:00Z",
      };

      const result = externalDocsMetadataSchema.safeParse(validMetadata);
      expect(result.success).toBe(true);
    });

    it("should validate URL format", () => {
      const invalidMetadata = {
        docTitle: "External Guide",
        sourceUrl: "not-a-url",
        sourceName: "Example Docs",
        fetchedAt: "2025-01-15T12:00:00Z",
      };

      const result = externalDocsMetadataSchema.safeParse(invalidMetadata);
      expect(result.success).toBe(false);
    });
  });

  describe("runbookMetadataSchema", () => {
    it("should validate valid runbook metadata", () => {
      const validMetadata = {
        docTitle: "Incident Response Runbook",
        runbookType: "incident_response",
        estimatedTime: "30 minutes",
        prerequisites: ["VPN access", "Admin credentials"],
      };

      const result = runbookMetadataSchema.safeParse(validMetadata);
      expect(result.success).toBe(true);
    });

    it("should validate runbookType enum", () => {
      const invalidMetadata = {
        docTitle: "Runbook",
        runbookType: "invalid_type",
      };

      const result = runbookMetadataSchema.safeParse(invalidMetadata);
      expect(result.success).toBe(false);
    });
  });

  describe("postmortemMetadataSchema", () => {
    it("should validate valid postmortem metadata", () => {
      const validMetadata = {
        docTitle: "Outage Postmortem",
        incidentId: "INC-001",
        incidentDate: "2025-01-10T08:00:00Z",
        severity: "high",
        rootCauses: ["Database connection pool exhaustion"],
        actionItems: ["Increase pool size", "Add monitoring"],
      };

      const result = postmortemMetadataSchema.safeParse(validMetadata);
      expect(result.success).toBe(true);
    });

    it("should validate severity enum", () => {
      const invalidMetadata = {
        docTitle: "Postmortem",
        severity: "extreme", // Invalid
      };

      const result = postmortemMetadataSchema.safeParse(invalidMetadata);
      expect(result.success).toBe(false);
    });
  });
});

describe("validateMetadata", () => {
  it("should validate metadata for known doc type", () => {
    const result = validateMetadata("analysis_lesson", {
      errorSignature: "Test error",
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  it("should return error for unknown doc type", () => {
    const result = validateMetadata("unknown_type", {});

    expect(result.success).toBe(false);
    expect(result.errors).toContainEqual({
      path: "docType",
      message: "Unknown document type: unknown_type",
    });
  });

  it("should return validation errors for invalid metadata", () => {
    const result = validateMetadata("pr_fix_comment", {
      prNumber: "not-a-number", // Invalid type
    });

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
  });
});

describe("validateMetadataOrThrow", () => {
  it("should return validated metadata for valid input", () => {
    const metadata = validateMetadataOrThrow("analysis_lesson", {
      errorSignature: "Test error",
    });

    expect(metadata).toBeDefined();
    expect(metadata.errorSignature).toBe("Test error");
  });

  it("should throw for invalid metadata", () => {
    expect(() => {
      validateMetadataOrThrow("pr_fix_comment", {});
    }).toThrow("Metadata validation failed");
  });

  it("should throw for unknown doc type", () => {
    expect(() => {
      validateMetadataOrThrow("unknown_type", {});
    }).toThrow("Unknown document type");
  });
});

describe("Schema Registry Functions", () => {
  describe("hasSchemaForDocType", () => {
    it("should return true for registered doc types", () => {
      expect(hasSchemaForDocType("analysis_lesson")).toBe(true);
      expect(hasSchemaForDocType("pr_fix_comment")).toBe(true);
      expect(hasSchemaForDocType("runbook")).toBe(true);
    });

    it("should return false for unregistered doc types", () => {
      expect(hasSchemaForDocType("unknown_type")).toBe(false);
      expect(hasSchemaForDocType("")).toBe(false);
    });
  });

  describe("getRegisteredDocTypes", () => {
    it("should return array of registered doc types", () => {
      const docTypes = getRegisteredDocTypes();

      expect(Array.isArray(docTypes)).toBe(true);
      expect(docTypes.length).toBeGreaterThan(0);
      expect(docTypes).toContain("analysis_lesson");
      expect(docTypes).toContain("pr_fix_comment");
      expect(docTypes).toContain("runbook");
    });
  });

  describe("getSchemaForDocType", () => {
    it("should return schema for registered doc type", () => {
      const schema = getSchemaForDocType("analysis_lesson");
      expect(schema).toBeDefined();
    });

    it("should return undefined for unregistered doc type", () => {
      const schema = getSchemaForDocType("unknown_type");
      expect(schema).toBeUndefined();
    });
  });
});

describe("Base Metadata Defaults", () => {
  it("should apply default values for hitCount", () => {
    const result = analysisLessonMetadataSchema.parse({
      errorSignature: "Test error",
    });

    expect(result.hitCount).toBe(0);
  });

  it("should apply default values for negativeFeedbackCount", () => {
    const result = analysisLessonMetadataSchema.parse({
      errorSignature: "Test error",
    });

    expect(result.negativeFeedbackCount).toBe(0);
  });
});

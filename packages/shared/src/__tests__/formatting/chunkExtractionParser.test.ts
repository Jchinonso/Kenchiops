/**
 * Unit tests for formatting/chunkExtractionParser.ts
 *
 * Tests the chunk extraction parser module that handles validation
 * and parsing of LLM responses for artifact extraction.
 */
import { describe, it, expect } from "@jest/globals";
import {
  isValidArtifactType,
  isValidSeverity,
  isValidConfidence,
  hasRequiredFields,
  extractOptionalFields,
  validateArtifact,
  parseExtractionResponse,
} from "../../formatting/extraction/index.js";
import { ARTIFACT_TYPES, ARTIFACT_SEVERITY, ARTIFACT_CONFIDENCE } from "../../constants/index.js";

describe("Chunk Extraction Parser", () => {
  describe("isValidArtifactType", () => {
    it("should return true for all valid artifact types", () => {
      const validTypes = Object.values(ARTIFACT_TYPES);
      validTypes.forEach((type) => {
        expect(isValidArtifactType(type)).toBe(true);
      });
    });

    it("should return false for invalid artifact type", () => {
      expect(isValidArtifactType("invalid_type")).toBe(false);
      expect(isValidArtifactType("STACK_TRACE")).toBe(false); // Wrong case
      expect(isValidArtifactType("")).toBe(false);
    });

    it("should return false for non-string values", () => {
      expect(isValidArtifactType(123)).toBe(false);
      expect(isValidArtifactType(null)).toBe(false);
      expect(isValidArtifactType(undefined)).toBe(false);
      expect(isValidArtifactType({})).toBe(false);
    });

    it("should recognize all known artifact types", () => {
      expect(isValidArtifactType("infra_killer")).toBe(true);
      expect(isValidArtifactType("stack_trace")).toBe(true);
      expect(isValidArtifactType("test_failure")).toBe(true);
      expect(isValidArtifactType("compiler_error")).toBe(true);
      expect(isValidArtifactType("lint_error")).toBe(true);
      expect(isValidArtifactType("generic_error")).toBe(true);
      expect(isValidArtifactType("ci_boundary")).toBe(true);
    });
  });

  describe("isValidSeverity", () => {
    it("should return true for valid severity values", () => {
      expect(isValidSeverity("error")).toBe(true);
      expect(isValidSeverity("warning")).toBe(true);
    });

    it("should return false for invalid severity", () => {
      expect(isValidSeverity("info")).toBe(false);
      expect(isValidSeverity("critical")).toBe(false);
      expect(isValidSeverity("ERROR")).toBe(false); // Wrong case
      expect(isValidSeverity("")).toBe(false);
    });

    it("should return false for non-string values", () => {
      expect(isValidSeverity(1)).toBe(false);
      expect(isValidSeverity(null)).toBe(false);
      expect(isValidSeverity(undefined)).toBe(false);
    });
  });

  describe("isValidConfidence", () => {
    it("should return true for valid confidence values", () => {
      expect(isValidConfidence("high")).toBe(true);
      expect(isValidConfidence("medium")).toBe(true);
      expect(isValidConfidence("low")).toBe(true);
    });

    it("should return false for invalid confidence", () => {
      expect(isValidConfidence("very_high")).toBe(false);
      expect(isValidConfidence("HIGH")).toBe(false); // Wrong case
      expect(isValidConfidence("")).toBe(false);
    });

    it("should return false for non-string values", () => {
      expect(isValidConfidence(0.8)).toBe(false);
      expect(isValidConfidence(null)).toBe(false);
      expect(isValidConfidence(undefined)).toBe(false);
    });
  });

  describe("hasRequiredFields", () => {
    it("should return true when all required fields are present", () => {
      const artifact = {
        evidence_id: "chunk#0:L1-L5",
        error_message: "Test error",
        snippet: "Error: test",
        snippet_line_start: 1,
      };
      expect(hasRequiredFields(artifact)).toBe(true);
    });

    it("should return false when evidence_id is missing", () => {
      const artifact = {
        error_message: "Test error",
        snippet: "Error: test",
        snippet_line_start: 1,
      };
      expect(hasRequiredFields(artifact)).toBe(false);
    });

    it("should return false when error_message is missing", () => {
      const artifact = {
        evidence_id: "chunk#0:L1-L5",
        snippet: "Error: test",
        snippet_line_start: 1,
      };
      expect(hasRequiredFields(artifact)).toBe(false);
    });

    it("should return false when snippet is missing", () => {
      const artifact = {
        evidence_id: "chunk#0:L1-L5",
        error_message: "Test error",
        snippet_line_start: 1,
      };
      expect(hasRequiredFields(artifact)).toBe(false);
    });

    it("should return false when snippet_line_start is missing", () => {
      const artifact = {
        evidence_id: "chunk#0:L1-L5",
        error_message: "Test error",
        snippet: "Error: test",
      };
      expect(hasRequiredFields(artifact)).toBe(false);
    });

    it("should return false when snippet_line_start is not a number", () => {
      const artifact = {
        evidence_id: "chunk#0:L1-L5",
        error_message: "Test error",
        snippet: "Error: test",
        snippet_line_start: "1",
      };
      expect(hasRequiredFields(artifact)).toBe(false);
    });
  });

  describe("extractOptionalFields", () => {
    it("should extract file_path", () => {
      const artifact = { file_path: "src/app.ts" };
      const result = extractOptionalFields(artifact);
      expect(result.filePath).toBe("src/app.ts");
    });

    it("should extract line_number", () => {
      const artifact = { line_number: 42 };
      const result = extractOptionalFields(artifact);
      expect(result.lineNumber).toBe(42);
    });

    it("should extract column", () => {
      const artifact = { column: 5 };
      const result = extractOptionalFields(artifact);
      expect(result.column).toBe(5);
    });

    it("should extract test_name", () => {
      const artifact = { test_name: "should work correctly" };
      const result = extractOptionalFields(artifact);
      expect(result.testName).toBe("should work correctly");
    });

    it("should extract test_suite", () => {
      const artifact = { test_suite: "AppComponent" };
      const result = extractOptionalFields(artifact);
      expect(result.testSuite).toBe("AppComponent");
    });

    it("should extract expected value", () => {
      const artifact = { expected: "true" };
      const result = extractOptionalFields(artifact);
      expect(result.expected).toBe("true");
    });

    it("should extract actual value", () => {
      const artifact = { actual: "false" };
      const result = extractOptionalFields(artifact);
      expect(result.actual).toBe("false");
    });

    it("should handle null expected/actual", () => {
      const artifact = { expected: null, actual: null };
      const result = extractOptionalFields(artifact);
      expect(result.expected).toBeNull();
      expect(result.actual).toBeNull();
    });

    it("should convert numeric expected/actual to string", () => {
      const artifact = { expected: 42, actual: 43 };
      const result = extractOptionalFields(artifact);
      expect(result.expected).toBe("42");
      expect(result.actual).toBe("43");
    });

    it("should extract error_code", () => {
      const artifact = { error_code: "TS2322" };
      const result = extractOptionalFields(artifact);
      expect(result.errorCode).toBe("TS2322");
    });

    it("should extract framework", () => {
      const artifact = { framework: "jest" };
      const result = extractOptionalFields(artifact);
      expect(result.framework).toBe("jest");
    });

    it("should skip invalid file_path (empty string)", () => {
      const artifact = { file_path: "" };
      const result = extractOptionalFields(artifact);
      expect(result.filePath).toBeUndefined();
    });

    it("should skip invalid line_number (non-number)", () => {
      const artifact = { line_number: "42" };
      const result = extractOptionalFields(artifact);
      expect(result.lineNumber).toBeUndefined();
    });

    it("should extract all fields when present", () => {
      const artifact = {
        file_path: "src/test.ts",
        line_number: 10,
        column: 5,
        test_name: "my test",
        test_suite: "MyTests",
        expected: "true",
        actual: "false",
        error_code: "E001",
        framework: "vitest",
      };
      const result = extractOptionalFields(artifact);

      expect(result.filePath).toBe("src/test.ts");
      expect(result.lineNumber).toBe(10);
      expect(result.column).toBe(5);
      expect(result.testName).toBe("my test");
      expect(result.testSuite).toBe("MyTests");
      expect(result.expected).toBe("true");
      expect(result.actual).toBe("false");
      expect(result.errorCode).toBe("E001");
      expect(result.framework).toBe("vitest");
    });
  });

  describe("validateArtifact", () => {
    const validRawArtifact = {
      evidence_id: "chunk#0:L1-L5",
      type: "stack_trace",
      severity: "error",
      error_message: "Error: test",
      snippet: "Error: test\n    at foo",
      snippet_line_start: 1,
      confidence: "high",
    };

    it("should validate and return valid artifact", () => {
      const result = validateArtifact(validRawArtifact, 0);

      expect(result).not.toBeNull();
      expect(result?.evidenceId).toBe("chunk#0:L1-L5");
      expect(result?.type).toBe(ARTIFACT_TYPES.STACK_TRACE);
      expect(result?.severity).toBe(ARTIFACT_SEVERITY.ERROR);
      expect(result?.confidence).toBe(ARTIFACT_CONFIDENCE.HIGH);
    });

    it("should return null for non-object input", () => {
      expect(validateArtifact("string", 0)).toBeNull();
      expect(validateArtifact(123, 0)).toBeNull();
      expect(validateArtifact(null, 0)).toBeNull();
      expect(validateArtifact(undefined, 0)).toBeNull();
    });

    it("should return null for missing required fields", () => {
      const incomplete = { type: "stack_trace" };
      expect(validateArtifact(incomplete, 0)).toBeNull();
    });

    it("should return null for invalid artifact type", () => {
      const invalidType = { ...validRawArtifact, type: "invalid_type" };
      expect(validateArtifact(invalidType, 0)).toBeNull();
    });

    it("should default invalid severity to error", () => {
      const invalidSeverity = { ...validRawArtifact, severity: "invalid" };
      const result = validateArtifact(invalidSeverity, 0);

      expect(result).not.toBeNull();
      expect(result?.severity).toBe(ARTIFACT_SEVERITY.ERROR);
    });

    it("should default invalid confidence to medium", () => {
      const invalidConfidence = { ...validRawArtifact, confidence: "invalid" };
      const result = validateArtifact(invalidConfidence, 0);

      expect(result).not.toBeNull();
      expect(result?.confidence).toBe(ARTIFACT_CONFIDENCE.MEDIUM);
    });

    it("should include optional fields when present", () => {
      const withOptional = {
        ...validRawArtifact,
        file_path: "src/app.ts",
        line_number: 42,
        test_name: "my test",
      };
      const result = validateArtifact(withOptional, 0);

      expect(result?.filePath).toBe("src/app.ts");
      expect(result?.lineNumber).toBe(42);
      expect(result?.testName).toBe("my test");
    });

    it("should generate assertion_hash", () => {
      const result = validateArtifact(validRawArtifact, 0);

      expect(result?.assertion_hash).toBeDefined();
      expect(result?.assertion_hash?.length).toBeGreaterThan(0);
    });
  });

  describe("parseExtractionResponse", () => {
    it("should parse valid JSON array response", () => {
      const response = JSON.stringify([
        {
          evidence_id: "chunk#0:L1-L5",
          type: "stack_trace",
          severity: "error",
          error_message: "Error: test",
          snippet: "Error: test",
          snippet_line_start: 1,
          confidence: "high",
        },
      ]);

      const artifacts = parseExtractionResponse(response, 0);

      expect(artifacts.length).toBe(1);
      expect(artifacts[0].type).toBe(ARTIFACT_TYPES.STACK_TRACE);
    });

    it("should handle markdown code blocks", () => {
      const response = `\`\`\`json
[{
  "evidence_id": "chunk#0:L1-L5",
  "type": "generic_error",
  "severity": "error",
  "error_message": "Error",
  "snippet": "Error",
  "snippet_line_start": 1,
  "confidence": "medium"
}]
\`\`\``;

      const artifacts = parseExtractionResponse(response, 0);
      expect(artifacts.length).toBe(1);
    });

    it("should extract JSON from text with surrounding prose", () => {
      const response = `Here are the artifacts:
[{
  "evidence_id": "chunk#0:L1-L5",
  "type": "generic_error",
  "severity": "error",
  "error_message": "Error",
  "snippet": "Error",
  "snippet_line_start": 1,
  "confidence": "medium"
}]
That's what I found.`;

      const artifacts = parseExtractionResponse(response, 0);
      expect(artifacts.length).toBe(1);
    });

    it("should return empty array for empty response", () => {
      const artifacts = parseExtractionResponse("[]", 0);
      expect(artifacts).toEqual([]);
    });

    it("should return empty array for invalid JSON", () => {
      const artifacts = parseExtractionResponse("not valid json", 0);
      expect(artifacts).toEqual([]);
    });

    it("should return empty array for non-array JSON", () => {
      const artifacts = parseExtractionResponse('{"key": "value"}', 0);
      expect(artifacts).toEqual([]);
    });

    it("should filter out invalid artifacts", () => {
      const response = JSON.stringify([
        { type: "invalid" }, // Invalid - missing fields
        {
          evidence_id: "chunk#0:L1-L5",
          type: "stack_trace",
          severity: "error",
          error_message: "Valid",
          snippet: "Valid",
          snippet_line_start: 1,
          confidence: "high",
        },
      ]);

      const artifacts = parseExtractionResponse(response, 0);
      expect(artifacts.length).toBe(1);
      expect(artifacts[0].errorMessage).toBe("Valid");
    });

    it("should respect maxArtifacts limit", () => {
      const manyArtifacts = Array.from({ length: 30 }, (_, index) => ({
        evidence_id: `chunk#0:L${index}-L${index + 1}`,
        type: "generic_error",
        severity: "error",
        error_message: `Error ${index}`,
        snippet: `Error ${index}`,
        snippet_line_start: index + 1,
        confidence: "low",
      }));

      const artifacts = parseExtractionResponse(JSON.stringify(manyArtifacts), 0, 10);
      expect(artifacts.length).toBe(10);
    });

    it("should use default maxArtifacts when not specified", () => {
      const manyArtifacts = Array.from({ length: 30 }, (_, index) => ({
        evidence_id: `chunk#0:L${index}-L${index + 1}`,
        type: "generic_error",
        severity: "error",
        error_message: `Error ${index}`,
        snippet: `Error ${index}`,
        snippet_line_start: index + 1,
        confidence: "low",
      }));

      const artifacts = parseExtractionResponse(JSON.stringify(manyArtifacts), 0);
      // All 30 artifacts are valid and within the default limit (100)
      expect(artifacts.length).toBe(30);
    });

    it("should handle markdown code block with json language tag", () => {
      const response = `\`\`\`json
[{"evidence_id": "chunk#0:L1-L2", "type": "generic_error", "severity": "error", "error_message": "Test", "snippet": "Test", "snippet_line_start": 1, "confidence": "medium"}]
\`\`\``;

      const artifacts = parseExtractionResponse(response, 0);
      expect(artifacts.length).toBe(1);
    });

    it("should handle markdown code block without language tag", () => {
      const response = `\`\`\`
[{"evidence_id": "chunk#0:L1-L2", "type": "generic_error", "severity": "error", "error_message": "Test", "snippet": "Test", "snippet_line_start": 1, "confidence": "medium"}]
\`\`\``;

      const artifacts = parseExtractionResponse(response, 0);
      expect(artifacts.length).toBe(1);
    });

    it("should handle whitespace in response", () => {
      const response = `
        [{"evidence_id": "chunk#0:L1-L2", "type": "generic_error", "severity": "error", "error_message": "Test", "snippet": "Test", "snippet_line_start": 1, "confidence": "medium"}]
      `;

      const artifacts = parseExtractionResponse(response, 0);
      expect(artifacts.length).toBe(1);
    });
  });
});

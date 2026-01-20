/**
 * Unit tests for formatting/artifactSignature.ts
 *
 * Tests the artifact signature module that computes deterministic
 * signatures for artifact deduplication.
 */
import { describe, it, expect } from "@jest/globals";
import {
  computeArtifactSignature,
  computeArtifactSignatureSync,
  computeAbsoluteEvidenceId,
} from "../../formatting/aggregation/index.js";
import type { ExtractedArtifact } from "../../formatting/extraction/index.js";
import { ARTIFACT_TYPES, ARTIFACT_SEVERITY, ARTIFACT_CONFIDENCE } from "../../constants/index.js";

describe("Artifact Signature", () => {
  // Helper to create a mock artifact
  const createMockArtifact = (overrides: Partial<ExtractedArtifact> = {}): ExtractedArtifact => ({
    evidenceId: "chunk#0:L1-L5",
    type: ARTIFACT_TYPES.GENERIC_ERROR,
    severity: ARTIFACT_SEVERITY.ERROR,
    errorMessage: "Test error message",
    snippet: "Error: test",
    snippetLineStart: 1,
    confidence: ARTIFACT_CONFIDENCE.MEDIUM,
    ...overrides,
  });

  describe("computeArtifactSignature (async)", () => {
    it("should compute a signature with hash and components", async () => {
      const artifact = createMockArtifact({ type: ARTIFACT_TYPES.STACK_TRACE });
      const signature = await computeArtifactSignature(artifact);

      expect(signature.hash).toBeDefined();
      expect(signature.hash.length).toBeGreaterThan(0);
      expect(signature.components).toBeDefined();
      expect(signature.components.type).toBe(ARTIFACT_TYPES.STACK_TRACE);
    });

    it("should produce identical hash for same artifact", async () => {
      const artifact = createMockArtifact({
        type: ARTIFACT_TYPES.TEST_FAILURE,
        filePath: "src/app.test.ts",
        lineNumber: 42,
      });

      const sig1 = await computeArtifactSignature(artifact);
      const sig2 = await computeArtifactSignature(artifact);

      expect(sig1.hash).toBe(sig2.hash);
    });

    it("should produce different hash for different types", async () => {
      const artifact1 = createMockArtifact({ type: ARTIFACT_TYPES.STACK_TRACE });
      const artifact2 = createMockArtifact({ type: ARTIFACT_TYPES.COMPILER_ERROR });

      const sig1 = await computeArtifactSignature(artifact1);
      const sig2 = await computeArtifactSignature(artifact2);

      expect(sig1.hash).not.toBe(sig2.hash);
    });

    it("should produce different hash for different file paths", async () => {
      const artifact1 = createMockArtifact({ filePath: "src/a.ts" });
      const artifact2 = createMockArtifact({ filePath: "src/b.ts" });

      const sig1 = await computeArtifactSignature(artifact1);
      const sig2 = await computeArtifactSignature(artifact2);

      expect(sig1.hash).not.toBe(sig2.hash);
    });

    it("should produce different hash for different line numbers", async () => {
      const artifact1 = createMockArtifact({ filePath: "src/a.ts", lineNumber: 10 });
      const artifact2 = createMockArtifact({ filePath: "src/a.ts", lineNumber: 20 });

      const sig1 = await computeArtifactSignature(artifact1);
      const sig2 = await computeArtifactSignature(artifact2);

      expect(sig1.hash).not.toBe(sig2.hash);
    });

    it("should normalize file path to lowercase", async () => {
      const artifact = createMockArtifact({ filePath: "SRC/App.Test.ts" });
      const signature = await computeArtifactSignature(artifact);

      expect(signature.components.filePath).toBe("src/app.test.ts");
    });

    it("should normalize test name to lowercase", async () => {
      const artifact = createMockArtifact({ testName: "Should Work Correctly" });
      const signature = await computeArtifactSignature(artifact);

      expect(signature.components.testName).toBe("should work correctly");
    });

    it("should NOT include error message in signature (too variable)", async () => {
      const artifact1 = createMockArtifact({
        filePath: "src/a.ts",
        lineNumber: 10,
        errorMessage: "Error version 1",
      });
      const artifact2 = createMockArtifact({
        filePath: "src/a.ts",
        lineNumber: 10,
        errorMessage: "Error version 2 - different message",
      });

      const sig1 = await computeArtifactSignature(artifact1);
      const sig2 = await computeArtifactSignature(artifact2);

      // Same file/line should produce same hash regardless of message
      expect(sig1.hash).toBe(sig2.hash);
    });

    it("should NOT include snippet in signature (too variable)", async () => {
      const artifact1 = createMockArtifact({
        filePath: "src/a.ts",
        lineNumber: 10,
        snippet: "const x = 1;",
      });
      const artifact2 = createMockArtifact({
        filePath: "src/a.ts",
        lineNumber: 10,
        snippet: "const y = 2; // different",
      });

      const sig1 = await computeArtifactSignature(artifact1);
      const sig2 = await computeArtifactSignature(artifact2);

      // Same file/line should produce same hash regardless of snippet
      expect(sig1.hash).toBe(sig2.hash);
    });

    it("should include error code in signature", async () => {
      const artifact1 = createMockArtifact({ errorCode: "TS2322" });
      const artifact2 = createMockArtifact({ errorCode: "TS2345" });

      const sig1 = await computeArtifactSignature(artifact1);
      const sig2 = await computeArtifactSignature(artifact2);

      expect(sig1.hash).not.toBe(sig2.hash);
      expect(sig1.components.errorCode).toBe("TS2322");
    });

    it("should include assertion_hash for high confidence artifacts", async () => {
      const artifact = createMockArtifact({
        confidence: ARTIFACT_CONFIDENCE.HIGH,
        assertion_hash: "abc123",
      });

      const signature = await computeArtifactSignature(artifact);

      expect(signature.components.assertionHash).toBe("abc123");
    });

    it("should NOT include assertion_hash for low/medium confidence", async () => {
      const artifactMedium = createMockArtifact({
        confidence: ARTIFACT_CONFIDENCE.MEDIUM,
        assertion_hash: "abc123",
      });
      const artifactLow = createMockArtifact({
        confidence: ARTIFACT_CONFIDENCE.LOW,
        assertion_hash: "xyz789",
      });

      const sigMedium = await computeArtifactSignature(artifactMedium);
      const sigLow = await computeArtifactSignature(artifactLow);

      expect(sigMedium.components.assertionHash).toBeUndefined();
      expect(sigLow.components.assertionHash).toBeUndefined();
    });
  });

  describe("computeArtifactSignatureSync", () => {
    it("should compute a signature synchronously", () => {
      const artifact = createMockArtifact();
      const signature = computeArtifactSignatureSync(artifact);

      expect(signature.hash).toBeDefined();
      expect(signature.hash.length).toBeGreaterThan(0);
    });

    it("should be deterministic", () => {
      const artifact = createMockArtifact({
        type: ARTIFACT_TYPES.TEST_FAILURE,
        testName: "should work",
      });

      const sig1 = computeArtifactSignatureSync(artifact);
      const sig2 = computeArtifactSignatureSync(artifact);

      expect(sig1.hash).toBe(sig2.hash);
    });

    it("should produce different hashes for different artifacts", () => {
      const artifact1 = createMockArtifact({ type: ARTIFACT_TYPES.STACK_TRACE });
      const artifact2 = createMockArtifact({ type: ARTIFACT_TYPES.LINT_ERROR });

      const sig1 = computeArtifactSignatureSync(artifact1);
      const sig2 = computeArtifactSignatureSync(artifact2);

      expect(sig1.hash).not.toBe(sig2.hash);
    });

    it("should handle artifacts with no optional fields", () => {
      const artifact = createMockArtifact({
        filePath: undefined,
        lineNumber: undefined,
        testName: undefined,
        errorCode: undefined,
      });

      const signature = computeArtifactSignatureSync(artifact);

      expect(signature.hash).toBeDefined();
      expect(signature.components.filePath).toBeUndefined();
      expect(signature.components.lineNumber).toBeUndefined();
    });
  });

  describe("computeAbsoluteEvidenceId", () => {
    it("should compute absolute line numbers from offset", () => {
      const artifact = createMockArtifact({ evidenceId: "chunk#0:L10-L15" });
      const absoluteId = computeAbsoluteEvidenceId(artifact, 100);

      expect(absoluteId).toBe("chunk#0:L109-L114");
    });

    it("should handle offset of 1 (no change)", () => {
      const artifact = createMockArtifact({ evidenceId: "chunk#0:L1-L5" });
      const absoluteId = computeAbsoluteEvidenceId(artifact, 1);

      expect(absoluteId).toBe("chunk#0:L1-L5");
    });

    it("should handle single-line evidence", () => {
      const artifact = createMockArtifact({ evidenceId: "chunk#0:L5-L5" });
      const absoluteId = computeAbsoluteEvidenceId(artifact, 50);

      expect(absoluteId).toBe("chunk#0:L54-L54");
    });

    it("should preserve chunk ID", () => {
      const artifact = createMockArtifact({ evidenceId: "chunk#5:L10-L20" });
      const absoluteId = computeAbsoluteEvidenceId(artifact, 100);

      expect(absoluteId).toContain("chunk#5:");
    });

    it("should return original if parsing fails - invalid format", () => {
      const artifact = createMockArtifact({ evidenceId: "invalid-format" });
      const absoluteId = computeAbsoluteEvidenceId(artifact, 100);

      expect(absoluteId).toBe("invalid-format");
    });

    it("should return original if parsing fails - missing lines", () => {
      const artifact = createMockArtifact({ evidenceId: "chunk#0:test" });
      const absoluteId = computeAbsoluteEvidenceId(artifact, 100);

      expect(absoluteId).toBe("chunk#0:test");
    });

    it("should return original if parsing fails - no colon", () => {
      const artifact = createMockArtifact({ evidenceId: "chunk#0" });
      const absoluteId = computeAbsoluteEvidenceId(artifact, 100);

      expect(absoluteId).toBe("chunk#0");
    });

    it("should handle large offsets", () => {
      const artifact = createMockArtifact({ evidenceId: "chunk#0:L1-L10" });
      const absoluteId = computeAbsoluteEvidenceId(artifact, 10000);

      expect(absoluteId).toBe("chunk#0:L10000-L10009");
    });

    it("should handle chunk ID with multiple digits", () => {
      const artifact = createMockArtifact({ evidenceId: "chunk#123:L5-L10" });
      const absoluteId = computeAbsoluteEvidenceId(artifact, 50);

      expect(absoluteId).toBe("chunk#123:L54-L59");
    });
  });

  describe("signature components", () => {
    it("should include type in components", () => {
      const artifact = createMockArtifact({ type: ARTIFACT_TYPES.INFRA_KILLER });
      const signature = computeArtifactSignatureSync(artifact);

      expect(signature.components.type).toBe(ARTIFACT_TYPES.INFRA_KILLER);
    });

    it("should include all optional components when present", () => {
      const artifact = createMockArtifact({
        type: ARTIFACT_TYPES.TEST_FAILURE,
        filePath: "src/test.ts",
        lineNumber: 42,
        errorCode: "TEST001",
        testName: "should work",
        confidence: ARTIFACT_CONFIDENCE.HIGH,
        assertion_hash: "hash123",
      });

      const signature = computeArtifactSignatureSync(artifact);

      expect(signature.components.type).toBe(ARTIFACT_TYPES.TEST_FAILURE);
      expect(signature.components.filePath).toBe("src/test.ts");
      expect(signature.components.lineNumber).toBe(42);
      expect(signature.components.errorCode).toBe("TEST001");
      expect(signature.components.testName).toBe("should work");
      expect(signature.components.assertionHash).toBe("hash123");
    });

    it("should exclude undefined optional components", () => {
      const artifact = createMockArtifact({
        type: ARTIFACT_TYPES.GENERIC_ERROR,
        filePath: undefined,
        lineNumber: undefined,
      });

      const signature = computeArtifactSignatureSync(artifact);

      expect(signature.components.type).toBe(ARTIFACT_TYPES.GENERIC_ERROR);
      expect(signature.components.filePath).toBeUndefined();
      expect(signature.components.lineNumber).toBeUndefined();
    });
  });

  describe("hash consistency", () => {
    it("should produce consistent hash across multiple calls", async () => {
      const artifact = createMockArtifact({
        type: ARTIFACT_TYPES.TEST_FAILURE,
        filePath: "src/test.ts",
        lineNumber: 100,
        testName: "my test",
      });

      const hashes = await Promise.all([
        computeArtifactSignature(artifact),
        computeArtifactSignature(artifact),
        computeArtifactSignature(artifact),
      ]);

      expect(hashes[0].hash).toBe(hashes[1].hash);
      expect(hashes[1].hash).toBe(hashes[2].hash);
    });

    it("should be consistent between sync and async for same input", async () => {
      const artifact = createMockArtifact({
        type: ARTIFACT_TYPES.COMPILER_ERROR,
        filePath: "src/main.ts",
        lineNumber: 50,
      });

      const asyncSig = await computeArtifactSignature(artifact);
      const syncSig = computeArtifactSignatureSync(artifact);

      // Both should have the same components
      expect(asyncSig.components).toEqual(syncSig.components);
    });
  });
});

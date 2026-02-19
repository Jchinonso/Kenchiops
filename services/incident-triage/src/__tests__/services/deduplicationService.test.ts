/**
 * Deduplication Service Tests
 *
 * Tests for the dedup service with mocked DedupRepositoryPort.
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockCreateLogger = jest.fn(() => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock("@kenchi/shared", () => ({
  ...jest.requireActual("@kenchi/shared"),
  createLogger: (...args: unknown[]) => mockCreateLogger(...args),
}));

import { createDeduplicationService } from "../../services/deduplicationService.js";
import type { DedupRepositoryPort } from "../../types/severityTypes.js";
import type { RequestContext } from "@kenchi/shared";

// ==================== Test Fixtures ====================

const testContext: RequestContext = {
  requestId: "test-request-id",
  tenantId: "test-tenant",
};

const createMockRepo = (): {
  findByFingerprint: jest.Mock;
  upsertDedupEntry: jest.Mock;
} => ({
  findByFingerprint: jest.fn(),
  upsertDedupEntry: jest.fn(),
});

// ==================== Tests ====================

describe("createDeduplicationService", () => {
  // let: repo reference changes per test in beforeEach
  let mockRepo: ReturnType<typeof createMockRepo>;

  beforeEach(() => {
    mockRepo = createMockRepo();
    jest.clearAllMocks();
  });

  describe("checkDuplicate", () => {
    it("should return isDuplicate=false when fingerprint is empty", async () => {
      const service = createDeduplicationService(mockRepo as unknown as DedupRepositoryPort);

      const result = await service.checkDuplicate("", "tenant-1", testContext);

      expect(result.isDuplicate).toBe(false);
      expect(mockRepo.findByFingerprint).not.toHaveBeenCalled();
    });

    it("should return isDuplicate=false when no dedup entry exists", async () => {
      mockRepo.findByFingerprint.mockResolvedValueOnce(null);
      const service = createDeduplicationService(mockRepo as unknown as DedupRepositoryPort);

      const result = await service.checkDuplicate("fp-123", "tenant-1", testContext);

      expect(result.isDuplicate).toBe(false);
      expect(mockRepo.findByFingerprint).toHaveBeenCalledWith("fp-123", "tenant-1");
    });

    it("should return isDuplicate=false when dedup entry is expired", async () => {
      const pastDate = new Date(Date.now() - 60_000); // 1 minute ago
      mockRepo.findByFingerprint.mockResolvedValueOnce({
        alertId: "old-alert",
        expiresAt: pastDate,
      });
      const service = createDeduplicationService(mockRepo as unknown as DedupRepositoryPort);

      const result = await service.checkDuplicate("fp-123", "tenant-1", testContext);

      expect(result.isDuplicate).toBe(false);
    });

    it("should return isDuplicate=true when dedup entry is not expired", async () => {
      const futureDate = new Date(Date.now() + 60_000); // 1 minute from now
      mockRepo.findByFingerprint.mockResolvedValueOnce({
        alertId: "existing-alert",
        expiresAt: futureDate,
      });
      const service = createDeduplicationService(mockRepo as unknown as DedupRepositoryPort);

      const result = await service.checkDuplicate("fp-123", "tenant-1", testContext);

      expect(result.isDuplicate).toBe(true);
      expect(result.existingAlertId).toBe("existing-alert");
    });

    it("should pass fingerprint and tenantId to the repository", async () => {
      mockRepo.findByFingerprint.mockResolvedValueOnce(null);
      const service = createDeduplicationService(mockRepo as unknown as DedupRepositoryPort);

      await service.checkDuplicate("fp-abc", "tenant-xyz", testContext);

      expect(mockRepo.findByFingerprint).toHaveBeenCalledWith("fp-abc", "tenant-xyz");
    });
  });

  describe("registerAlert", () => {
    it("should skip registration when fingerprint is empty", async () => {
      const service = createDeduplicationService(mockRepo as unknown as DedupRepositoryPort);

      await service.registerAlert("", "tenant-1", "alert-1", undefined, testContext);

      expect(mockRepo.upsertDedupEntry).not.toHaveBeenCalled();
    });

    it("should register alert with default window when windowMinutes is undefined", async () => {
      mockRepo.upsertDedupEntry.mockResolvedValueOnce(undefined);
      const service = createDeduplicationService(mockRepo as unknown as DedupRepositoryPort);

      await service.registerAlert("fp-123", "tenant-1", "alert-1", undefined, testContext);

      expect(mockRepo.upsertDedupEntry).toHaveBeenCalledTimes(1);
      const [fingerprint, tenantId, alertId, expiresAt] = mockRepo.upsertDedupEntry.mock.calls[0];
      expect(fingerprint).toBe("fp-123");
      expect(tenantId).toBe("tenant-1");
      expect(alertId).toBe("alert-1");
      // Default window is 30 minutes
      const expectedExpiry = Date.now() + 30 * 60_000;
      expect(Math.abs(expiresAt.getTime() - expectedExpiry)).toBeLessThan(5000);
    });

    it("should register alert with custom window minutes", async () => {
      mockRepo.upsertDedupEntry.mockResolvedValueOnce(undefined);
      const service = createDeduplicationService(mockRepo as unknown as DedupRepositoryPort);

      await service.registerAlert("fp-123", "tenant-1", "alert-1", 60, testContext);

      const [, , , expiresAt] = mockRepo.upsertDedupEntry.mock.calls[0];
      const expectedExpiry = Date.now() + 60 * 60_000;
      expect(Math.abs(expiresAt.getTime() - expectedExpiry)).toBeLessThan(5000);
    });

    it("should pass all arguments to the repository", async () => {
      mockRepo.upsertDedupEntry.mockResolvedValueOnce(undefined);
      const service = createDeduplicationService(mockRepo as unknown as DedupRepositoryPort);

      await service.registerAlert("fp-xyz", "tenant-abc", "alert-999", 15, testContext);

      expect(mockRepo.upsertDedupEntry).toHaveBeenCalledWith(
        "fp-xyz",
        "tenant-abc",
        "alert-999",
        expect.any(Date)
      );
    });
  });
});

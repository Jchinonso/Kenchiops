/**
 * Unit tests for Model Version Service
 *
 * Tests model version retrieval (DB-first with in-memory fallback),
 * active model selection, model activation with feature flag persistence,
 * rollback to baseline, and A/B test configuration.
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// ==================== Mock Setup ====================

const mockGetAllModelVersionsFromDB = jest.fn();
const mockGetAllModelVersions = jest.fn();
const mockGetModelVersionById = jest.fn();
const mockGetBaselineModel = jest.fn();
const mockSelectModel = jest.fn();
const mockTriggerRollback = jest.fn();
const mockUpdateFeatureFlags = jest.fn();
const mockSaveFeatureFlags = jest.fn();
const mockGetFeatureFlagsFromDB = jest.fn();
const mockSetRollbackActive = jest.fn();

jest.mock("@kenchi/shared", () => {
  const actual = jest.requireActual("@kenchi/shared") as Record<string, unknown>;
  return {
    ...actual,
    getAllModelVersionsFromDB: (...args: unknown[]) => mockGetAllModelVersionsFromDB(...args),
    getAllModelVersions: (...args: unknown[]) => mockGetAllModelVersions(...args),
    getModelVersionById: (...args: unknown[]) => mockGetModelVersionById(...args),
    getBaselineModel: (...args: unknown[]) => mockGetBaselineModel(...args),
    selectModel: (...args: unknown[]) => mockSelectModel(...args),
    triggerRollback: (...args: unknown[]) => mockTriggerRollback(...args),
    updateFeatureFlags: (...args: unknown[]) => mockUpdateFeatureFlags(...args),
    saveFeatureFlags: (...args: unknown[]) => mockSaveFeatureFlags(...args),
    getFeatureFlagsFromDB: (...args: unknown[]) => mockGetFeatureFlagsFromDB(...args),
    setRollbackActive: (...args: unknown[]) => mockSetRollbackActive(...args),
    createLogger: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    })),
  };
});

// Import after mock setup
import {
  getModelVersions,
  getActiveModel,
  activateModel,
  rollbackToBaseline,
  configureABTest,
} from "../services/finetuning/modelService.js";
import type { ModelVersion } from "@kenchi/shared";

// ==================== Test Helpers ====================

const createModelVersion = (overrides: Partial<ModelVersion> = {}): ModelVersion => ({
  id: "version-1",
  name: "Base Model v1",
  modelId: "gpt-4o-mini-2024-07-18",
  description: "Base model",
  createdAt: "2024-01-01T00:00:00Z",
  isBaseline: true,
  metadata: {},
  ...overrides,
});

const createFeatureFlags = (overrides: Record<string, unknown> = {}) => ({
  defaultModelVersion: "base_v1",
  rollbackEnabled: true,
  rollbackModelVersion: "base_v1",
  abTestEnabled: false,
  abTestConfig: undefined,
  tenantOverrides: undefined,
  ...overrides,
});

// ==================== Tests ====================

describe("Model Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==================== getModelVersions ====================

  describe("getModelVersions", () => {
    it("should return versions from database when available", async () => {
      const dbVersions = [
        createModelVersion({ id: "v1" }),
        createModelVersion({ id: "v2", isBaseline: false }),
      ];
      mockGetAllModelVersionsFromDB.mockResolvedValue(dbVersions);

      const result = await getModelVersions();

      expect(result).toEqual(dbVersions);
      expect(mockGetAllModelVersionsFromDB).toHaveBeenCalled();
      expect(mockGetAllModelVersions).not.toHaveBeenCalled();
    });

    it("should fall back to in-memory when database returns empty array", async () => {
      const inMemoryVersions = [createModelVersion({ id: "mem-v1" })];
      mockGetAllModelVersionsFromDB.mockResolvedValue([]);
      mockGetAllModelVersions.mockReturnValue(inMemoryVersions);

      const result = await getModelVersions();

      expect(result).toEqual(inMemoryVersions);
      expect(mockGetAllModelVersions).toHaveBeenCalled();
    });

    it("should fall back to in-memory when database throws", async () => {
      const inMemoryVersions = [createModelVersion({ id: "fallback-v1" })];
      mockGetAllModelVersionsFromDB.mockRejectedValue(new Error("DB connection refused"));
      mockGetAllModelVersions.mockReturnValue(inMemoryVersions);

      const result = await getModelVersions();

      expect(result).toEqual(inMemoryVersions);
    });

    it("should return empty array when both DB and in-memory are empty", async () => {
      mockGetAllModelVersionsFromDB.mockResolvedValue([]);
      mockGetAllModelVersions.mockReturnValue([]);

      const result = await getModelVersions();

      expect(result).toEqual([]);
    });
  });

  // ==================== getActiveModel ====================

  describe("getActiveModel", () => {
    it("should call selectModel with tenantId", async () => {
      const selectionResult = {
        versionId: "v1",
        modelId: "gpt-4o-mini",
        source: "default",
      };
      mockSelectModel.mockReturnValue(selectionResult);

      const result = await getActiveModel("tenant-123");

      expect(result).toEqual(selectionResult);
      expect(mockSelectModel).toHaveBeenCalledWith("tenant-123");
    });

    it("should pass empty string when tenantId is undefined", async () => {
      mockSelectModel.mockReturnValue({ versionId: "v1", modelId: "m", source: "default" });

      await getActiveModel();

      expect(mockSelectModel).toHaveBeenCalledWith("");
    });

    it("should pass empty string when tenantId is explicitly undefined", async () => {
      mockSelectModel.mockReturnValue({ versionId: "v1", modelId: "m", source: "default" });

      await getActiveModel(undefined);

      expect(mockSelectModel).toHaveBeenCalledWith("");
    });
  });

  // ==================== activateModel ====================

  describe("activateModel", () => {
    it("should activate model and update both DB and in-memory flags", async () => {
      const version = createModelVersion({ id: "new-v1", isBaseline: false });
      const baselineModel = createModelVersion({ id: "base-v1", isBaseline: true });
      mockGetModelVersionById.mockResolvedValue(version);
      mockGetBaselineModel.mockResolvedValue(baselineModel);
      mockGetFeatureFlagsFromDB.mockResolvedValue(createFeatureFlags());
      mockSaveFeatureFlags.mockResolvedValue(undefined);

      const result = await activateModel("new-v1");

      expect(result).toBe(true);
      expect(mockSaveFeatureFlags).toHaveBeenCalledWith(
        expect.objectContaining({
          flags: expect.objectContaining({
            defaultModelVersion: "new-v1",
            rollbackEnabled: true,
            rollbackModelVersion: "base-v1",
          }),
          rollbackActive: false,
        })
      );
      expect(mockUpdateFeatureFlags).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultModelVersion: "new-v1",
          rollbackEnabled: true,
          rollbackModelVersion: "base-v1",
        })
      );
    });

    it("should return false when model version is not found", async () => {
      mockGetModelVersionById.mockResolvedValue(null);

      const result = await activateModel("nonexistent-v1");

      expect(result).toBe(false);
      expect(mockSaveFeatureFlags).not.toHaveBeenCalled();
      expect(mockUpdateFeatureFlags).not.toHaveBeenCalled();
    });

    it("should use fallback baseline ID when no baseline model exists", async () => {
      const version = createModelVersion({ id: "new-v1" });
      mockGetModelVersionById.mockResolvedValue(version);
      mockGetBaselineModel.mockResolvedValue(null);
      mockGetFeatureFlagsFromDB.mockResolvedValue(createFeatureFlags());
      mockSaveFeatureFlags.mockResolvedValue(undefined);

      await activateModel("new-v1");

      expect(mockSaveFeatureFlags).toHaveBeenCalledWith(
        expect.objectContaining({
          flags: expect.objectContaining({
            rollbackModelVersion: "base_v1",
          }),
        })
      );
    });

    it("should preserve existing AB test config when activating", async () => {
      const version = createModelVersion({ id: "new-v1" });
      mockGetModelVersionById.mockResolvedValue(version);
      mockGetBaselineModel.mockResolvedValue(createModelVersion({ id: "base" }));
      mockGetFeatureFlagsFromDB.mockResolvedValue(
        createFeatureFlags({
          abTestEnabled: true,
          abTestConfig: {
            controlVersion: "a",
            treatmentVersion: "b",
            treatmentPercentage: 50,
          },
          tenantOverrides: { "tenant-1": "override-v1" },
        })
      );
      mockSaveFeatureFlags.mockResolvedValue(undefined);

      await activateModel("new-v1");

      expect(mockSaveFeatureFlags).toHaveBeenCalledWith(
        expect.objectContaining({
          flags: expect.objectContaining({
            abTestEnabled: true,
            abTestConfig: expect.objectContaining({
              controlVersion: "a",
              treatmentVersion: "b",
            }),
            tenantOverrides: expect.objectContaining({
              "tenant-1": "override-v1",
            }),
          }),
        })
      );
    });

    it("should return false when saveFeatureFlags throws", async () => {
      const version = createModelVersion({ id: "new-v1" });
      mockGetModelVersionById.mockResolvedValue(version);
      mockGetBaselineModel.mockResolvedValue(createModelVersion({ id: "base" }));
      mockGetFeatureFlagsFromDB.mockResolvedValue(createFeatureFlags());
      mockSaveFeatureFlags.mockRejectedValue(new Error("DB write failed"));

      const result = await activateModel("new-v1");

      expect(result).toBe(false);
    });

    it("should handle null current flags from DB", async () => {
      const version = createModelVersion({ id: "new-v1" });
      mockGetModelVersionById.mockResolvedValue(version);
      mockGetBaselineModel.mockResolvedValue(createModelVersion({ id: "base" }));
      mockGetFeatureFlagsFromDB.mockResolvedValue(null);
      mockSaveFeatureFlags.mockResolvedValue(undefined);

      const result = await activateModel("new-v1");

      expect(result).toBe(true);
      // Should use fallback defaults for undefined fields
      expect(mockSaveFeatureFlags).toHaveBeenCalledWith(
        expect.objectContaining({
          flags: expect.objectContaining({
            abTestEnabled: false,
          }),
        })
      );
    });
  });

  // ==================== rollbackToBaseline ====================

  describe("rollbackToBaseline", () => {
    it("should trigger in-memory rollback and persist to DB", async () => {
      mockSetRollbackActive.mockResolvedValue(undefined);

      const result = await rollbackToBaseline();

      expect(result).toBe(true);
      expect(mockTriggerRollback).toHaveBeenCalled();
      expect(mockSetRollbackActive).toHaveBeenCalledWith(true);
    });

    it("should return false when setRollbackActive fails", async () => {
      mockSetRollbackActive.mockRejectedValue(new Error("DB write failed"));

      const result = await rollbackToBaseline();

      expect(result).toBe(false);
    });

    it("should still call triggerRollback even if DB fails", async () => {
      // triggerRollback is called before setRollbackActive
      mockSetRollbackActive.mockRejectedValue(new Error("DB write failed"));

      await rollbackToBaseline();

      // In-memory rollback was already triggered before DB failure
      expect(mockTriggerRollback).toHaveBeenCalled();
    });
  });

  // ==================== configureABTest ====================

  describe("configureABTest", () => {
    it("should save A/B test configuration to DB and update in-memory", async () => {
      mockGetFeatureFlagsFromDB.mockResolvedValue(createFeatureFlags());
      mockGetBaselineModel.mockResolvedValue(createModelVersion({ id: "baseline-v1" }));
      mockSaveFeatureFlags.mockResolvedValue(undefined);

      const result = await configureABTest({
        controlVersion: "control-v1",
        treatmentVersion: "treatment-v1",
        treatmentPercentage: 30,
      });

      expect(result).toBe(true);
      expect(mockSaveFeatureFlags).toHaveBeenCalledWith(
        expect.objectContaining({
          flags: expect.objectContaining({
            abTestEnabled: true,
            abTestConfig: expect.objectContaining({
              controlVersion: "control-v1",
              treatmentVersion: "treatment-v1",
              treatmentPercentage: 30,
              startedAt: expect.any(String),
            }),
          }),
          rollbackActive: false,
        })
      );
      expect(mockUpdateFeatureFlags).toHaveBeenCalledWith(
        expect.objectContaining({
          abTestEnabled: true,
          abTestConfig: expect.objectContaining({
            controlVersion: "control-v1",
            treatmentVersion: "treatment-v1",
            treatmentPercentage: 30,
          }),
        })
      );
    });

    it("should preserve existing default model version and tenant overrides", async () => {
      mockGetFeatureFlagsFromDB.mockResolvedValue(
        createFeatureFlags({
          defaultModelVersion: "current-default",
          tenantOverrides: { t1: "v1" },
        })
      );
      mockGetBaselineModel.mockResolvedValue(createModelVersion({ id: "baseline" }));
      mockSaveFeatureFlags.mockResolvedValue(undefined);

      await configureABTest({
        controlVersion: "a",
        treatmentVersion: "b",
        treatmentPercentage: 50,
      });

      expect(mockSaveFeatureFlags).toHaveBeenCalledWith(
        expect.objectContaining({
          flags: expect.objectContaining({
            defaultModelVersion: "current-default",
            tenantOverrides: expect.objectContaining({ t1: "v1" }),
          }),
        })
      );
    });

    it("should use fallback defaults when no current flags exist in DB", async () => {
      mockGetFeatureFlagsFromDB.mockResolvedValue(null);
      mockGetBaselineModel.mockResolvedValue(null);
      mockSaveFeatureFlags.mockResolvedValue(undefined);

      const result = await configureABTest({
        controlVersion: "a",
        treatmentVersion: "b",
        treatmentPercentage: 50,
      });

      expect(result).toBe(true);
      expect(mockSaveFeatureFlags).toHaveBeenCalledWith(
        expect.objectContaining({
          flags: expect.objectContaining({
            defaultModelVersion: "base_v1",
            rollbackModelVersion: "base_v1",
          }),
        })
      );
    });

    it("should return false when saveFeatureFlags throws", async () => {
      mockGetFeatureFlagsFromDB.mockResolvedValue(createFeatureFlags());
      mockGetBaselineModel.mockResolvedValue(createModelVersion({ id: "baseline" }));
      mockSaveFeatureFlags.mockRejectedValue(new Error("DB write failed"));

      const result = await configureABTest({
        controlVersion: "a",
        treatmentVersion: "b",
        treatmentPercentage: 50,
      });

      expect(result).toBe(false);
    });

    it("should include a startedAt ISO timestamp in the A/B test config", async () => {
      mockGetFeatureFlagsFromDB.mockResolvedValue(createFeatureFlags());
      mockGetBaselineModel.mockResolvedValue(createModelVersion({ id: "baseline" }));
      mockSaveFeatureFlags.mockResolvedValue(undefined);

      const before = new Date().toISOString();
      await configureABTest({
        controlVersion: "a",
        treatmentVersion: "b",
        treatmentPercentage: 50,
      });
      const after = new Date().toISOString();

      const savedFlags = mockSaveFeatureFlags.mock.calls[0][0] as {
        flags: { abTestConfig: { startedAt: string } };
      };
      const { startedAt } = savedFlags.flags.abTestConfig;
      expect(startedAt >= before).toBe(true);
      expect(startedAt <= after).toBe(true);
    });
  });
});

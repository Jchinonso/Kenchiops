/**
 * Tests for model versioning and feature flags module.
 */

import {
  registerModelVersion,
  getModelVersion,
  getAllModelVersions,
  getBaselineModel,
  updateFeatureFlags,
  getFeatureFlags,
  setTenantModelOverride,
  removeTenantModelOverride,
  triggerRollback,
  clearRollback,
  isRollbackActive,
  selectModel,
  type ModelVersion,
} from "../../finetuning/modelVersioning.js";

describe("Model Versioning", () => {
  // Reset state before each test
  beforeEach(() => {
    clearRollback();
    updateFeatureFlags({
      defaultModelVersion: "base_v1",
      rollbackEnabled: true,
      rollbackModelVersion: "base_v1",
      abTestEnabled: false,
      tenantOverrides: {},
    });
  });

  describe("getBaselineModel", () => {
    it("should return the baseline model version", () => {
      const baseline = getBaselineModel();

      expect(baseline.id).toBe("base_v1");
      expect(baseline.isBaseline).toBe(true);
      expect(baseline.name).toBe("Base Model");
    });
  });

  describe("registerModelVersion and getModelVersion", () => {
    it("should register and retrieve a model version", () => {
      const testVersion: ModelVersion = {
        id: "test_v1",
        name: "Test Model",
        modelId: "ft:gpt-4:test",
        createdAt: new Date().toISOString(),
        isBaseline: false,
      };

      registerModelVersion(testVersion);
      const retrieved = getModelVersion("test_v1");

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe("test_v1");
      expect(retrieved?.modelId).toBe("ft:gpt-4:test");
    });

    it("should return null for non-existent version", () => {
      const result = getModelVersion("non_existent");

      expect(result).toBeNull();
    });
  });

  describe("getAllModelVersions", () => {
    it("should return all registered versions including baseline", () => {
      const versions = getAllModelVersions();

      expect(versions.length).toBeGreaterThanOrEqual(1);
      expect(versions.some((version) => version.isBaseline)).toBe(true);
    });
  });

  describe("Feature Flags", () => {
    it("should update and retrieve feature flags", () => {
      updateFeatureFlags({
        abTestEnabled: true,
      });

      const flags = getFeatureFlags();

      expect(flags.abTestEnabled).toBe(true);
      expect(flags.rollbackEnabled).toBe(true); // Should preserve existing flags
    });

    it("should set tenant model override", () => {
      setTenantModelOverride("tenant_123", "base_v1");

      const flags = getFeatureFlags();

      expect(flags.tenantOverrides?.tenant_123).toBe("base_v1");
    });

    it("should remove tenant model override", () => {
      setTenantModelOverride("tenant_123", "base_v1");
      removeTenantModelOverride("tenant_123");

      const flags = getFeatureFlags();

      expect(flags.tenantOverrides?.tenant_123).toBeUndefined();
    });

    it("should not set override for non-existent model version", () => {
      setTenantModelOverride("tenant_123", "non_existent_version");

      const flags = getFeatureFlags();

      expect(flags.tenantOverrides?.tenant_123).toBeUndefined();
    });
  });

  describe("Rollback", () => {
    it("should trigger rollback successfully", () => {
      const result = triggerRollback();

      expect(result).toBe(true);
      expect(isRollbackActive()).toBe(true);
    });

    it("should not trigger rollback if already active", () => {
      triggerRollback();
      const result = triggerRollback();

      expect(result).toBe(false);
    });

    it("should clear rollback state", () => {
      triggerRollback();
      clearRollback();

      expect(isRollbackActive()).toBe(false);
    });

    it("should not trigger rollback if disabled", () => {
      updateFeatureFlags({ rollbackEnabled: false });

      const result = triggerRollback();

      expect(result).toBe(false);
      expect(isRollbackActive()).toBe(false);
    });
  });

  describe("selectModel", () => {
    it("should return default model when no overrides", () => {
      const result = selectModel("tenant_123");

      expect(result.reason).toBe("default");
      expect(result.versionId).toBe("base_v1");
      expect(result.isABTest).toBe(false);
    });

    it("should return rollback model when rollback is active", () => {
      triggerRollback();

      const result = selectModel("tenant_123");

      expect(result.reason).toBe("rollback");
      expect(result.versionId).toBe("base_v1");
    });

    it("should return tenant override when set", () => {
      setTenantModelOverride("tenant_123", "base_v1");

      const result = selectModel("tenant_123");

      expect(result.reason).toBe("tenant_override");
    });

    it("should assign to A/B test groups deterministically", () => {
      const testVersion: ModelVersion = {
        id: "treatment_v1",
        name: "Treatment Model",
        modelId: "ft:gpt-4:treatment",
        createdAt: new Date().toISOString(),
        isBaseline: false,
      };
      registerModelVersion(testVersion);

      updateFeatureFlags({
        abTestEnabled: true,
        abTestConfig: {
          controlVersion: "base_v1",
          treatmentVersion: "treatment_v1",
          treatmentPercentage: 50,
          startedAt: new Date().toISOString(),
        },
      });

      const result1 = selectModel("tenant_abc");
      const result2 = selectModel("tenant_abc");

      // Same tenant should get same result (deterministic)
      expect(result1.abTestGroup).toBe(result2.abTestGroup);
      expect(result1.isABTest).toBe(true);
    });

    it("should prioritize rollback over A/B test", () => {
      updateFeatureFlags({
        abTestEnabled: true,
        abTestConfig: {
          controlVersion: "base_v1",
          treatmentVersion: "base_v1",
          treatmentPercentage: 50,
          startedAt: new Date().toISOString(),
        },
      });

      triggerRollback();

      const result = selectModel("tenant_123");

      expect(result.reason).toBe("rollback");
    });

    it("should prioritize tenant override over A/B test", () => {
      updateFeatureFlags({
        abTestEnabled: true,
        abTestConfig: {
          controlVersion: "base_v1",
          treatmentVersion: "base_v1",
          treatmentPercentage: 50,
          startedAt: new Date().toISOString(),
        },
      });
      setTenantModelOverride("tenant_123", "base_v1");

      const result = selectModel("tenant_123");

      expect(result.reason).toBe("tenant_override");
    });
  });
});

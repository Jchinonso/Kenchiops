/**
 * Unit tests for Fine-Tuning Job Service
 *
 * Tests job lifecycle: dataset extraction + validation, dry run mode,
 * job submission via shared workflow, job status retrieval, cancellation,
 * listing, and completion handling with model registration.
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// ==================== Mock Setup ====================

const mockExtractTrainingDataset = jest.fn();
const mockValidateExtractedDataset = jest.fn();
const mockSubmitFineTuningWorkflow = jest.fn();
const mockGetFineTuningJob = jest.fn();
const mockCancelFineTuningJob = jest.fn();
const mockListFineTuningJobs = jest.fn();
const mockRegisterModelVersion = jest.fn();
const mockCreateModelVersion = jest.fn();

jest.mock("@kenchi/shared", () => {
  const actual = jest.requireActual("@kenchi/shared") as Record<string, unknown>;
  return {
    ...actual,
    extractTrainingDataset: (...args: unknown[]) => mockExtractTrainingDataset(...args),
    validateExtractedDataset: (...args: unknown[]) => mockValidateExtractedDataset(...args),
    submitFineTuningWorkflow: (...args: unknown[]) => mockSubmitFineTuningWorkflow(...args),
    getFineTuningJob: (...args: unknown[]) => mockGetFineTuningJob(...args),
    cancelFineTuningJob: (...args: unknown[]) => mockCancelFineTuningJob(...args),
    listFineTuningJobs: (...args: unknown[]) => mockListFineTuningJobs(...args),
    registerModelVersion: (...args: unknown[]) => mockRegisterModelVersion(...args),
    createModelVersion: (...args: unknown[]) => mockCreateModelVersion(...args),
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
  startFineTuningJob,
  getJobStatus,
  cancelJob,
  listJobs,
  handleJobCompletion,
} from "../services/finetuning/jobService.js";

// ==================== Test Helpers ====================

const createValidDataset = (overrides: Record<string, unknown> = {}) => ({
  stats: {
    totalExamples: 100,
    positiveExamples: 70,
    negativeExamples: 30,
    averageConfidence: 0.85,
  },
  jsonl: '{"messages":[...]}\n{"messages":[...]}',
  extractedAt: "2024-01-15T10:00:00.000Z",
  ...overrides,
});

const createValidValidation = (overrides: Record<string, unknown> = {}) => ({
  valid: true,
  issues: [],
  ...overrides,
});

const createInvalidValidation = (issues: string[] = ["Not enough examples"]) => ({
  valid: false,
  issues,
});

const createJobResult = (overrides: Record<string, unknown> = {}) => ({
  jobId: "ftjob-123",
  status: "succeeded",
  model: "gpt-4o-mini-2024-07-18",
  fineTunedModel: "ft:gpt-4o-mini:kenchi:custom:abc123",
  trainingFileId: "file-abc123",
  createdAt: "2024-01-15T10:00:00Z",
  ...overrides,
});

// ==================== Tests ====================

describe("Job Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==================== startFineTuningJob ====================

  describe("startFineTuningJob", () => {
    it("should extract dataset, validate, and submit job on success", async () => {
      const dataset = createValidDataset();
      mockExtractTrainingDataset.mockResolvedValue(dataset);
      mockValidateExtractedDataset.mockReturnValue(createValidValidation());
      mockSubmitFineTuningWorkflow.mockResolvedValue({
        fileId: "file-xyz",
        job: {
          jobId: "ftjob-new-1",
          status: "queued",
          model: "gpt-4o-mini-2024-07-18",
        },
      });

      const result = await startFineTuningJob({
        tenantId: "tenant-1",
        epochs: 3,
        suffix: "my-model",
      });

      expect(result.success).toBe(true);
      expect(result.jobId).toBe("ftjob-new-1");
      expect(result.status).toBe("queued");
      expect(result.fileId).toBe("file-xyz");
      expect(result.model).toBe("gpt-4o-mini-2024-07-18");
      expect(result.datasetStats).toEqual(dataset.stats);
    });

    it("should pass extraction options with tenantId to extractTrainingDataset", async () => {
      mockExtractTrainingDataset.mockResolvedValue(createValidDataset());
      mockValidateExtractedDataset.mockReturnValue(createValidValidation());
      mockSubmitFineTuningWorkflow.mockResolvedValue({
        fileId: "file-1",
        job: { jobId: "ftjob-1", status: "queued", model: "m" },
      });

      await startFineTuningJob({ tenantId: "tenant-42" });

      expect(mockExtractTrainingDataset).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: "tenant-42" })
      );
    });

    it("should return failure when dataset validation fails", async () => {
      mockExtractTrainingDataset.mockResolvedValue(createValidDataset());
      mockValidateExtractedDataset.mockReturnValue(
        createInvalidValidation(["Too few examples", "Low confidence"])
      );

      const result = await startFineTuningJob({ tenantId: "tenant-1" });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Dataset validation failed");
      expect(result.validationIssues).toEqual(["Too few examples", "Low confidence"]);
      expect(result.datasetStats).toBeDefined();
      // Should NOT have called submitFineTuningWorkflow
      expect(mockSubmitFineTuningWorkflow).not.toHaveBeenCalled();
    });

    it("should return dry_run result when dryRun is true", async () => {
      mockExtractTrainingDataset.mockResolvedValue(createValidDataset());
      mockValidateExtractedDataset.mockReturnValue(createValidValidation());

      const result = await startFineTuningJob({
        tenantId: "tenant-1",
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe("dry_run");
      expect(result.datasetStats).toBeDefined();
      // Should NOT have called submitFineTuningWorkflow
      expect(mockSubmitFineTuningWorkflow).not.toHaveBeenCalled();
    });

    it("should generate default suffix with timestamp when suffix not provided", async () => {
      mockExtractTrainingDataset.mockResolvedValue(createValidDataset());
      mockValidateExtractedDataset.mockReturnValue(createValidValidation());
      mockSubmitFineTuningWorkflow.mockResolvedValue({
        fileId: "file-1",
        job: { jobId: "ftjob-1", status: "queued", model: "m" },
      });

      await startFineTuningJob({});

      expect(mockSubmitFineTuningWorkflow).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          suffix: expect.stringContaining("kenchi_"),
        })
      );
    });

    it("should use provided suffix when given", async () => {
      mockExtractTrainingDataset.mockResolvedValue(createValidDataset());
      mockValidateExtractedDataset.mockReturnValue(createValidValidation());
      mockSubmitFineTuningWorkflow.mockResolvedValue({
        fileId: "file-1",
        job: { jobId: "ftjob-1", status: "queued", model: "m" },
      });

      await startFineTuningJob({ suffix: "my-custom-suffix" });

      expect(mockSubmitFineTuningWorkflow).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ suffix: "my-custom-suffix" })
      );
    });

    it("should pass epochs to workflow submission", async () => {
      mockExtractTrainingDataset.mockResolvedValue(createValidDataset());
      mockValidateExtractedDataset.mockReturnValue(createValidValidation());
      mockSubmitFineTuningWorkflow.mockResolvedValue({
        fileId: "file-1",
        job: { jobId: "ftjob-1", status: "queued", model: "m" },
      });

      await startFineTuningJob({ epochs: 5 });

      expect(mockSubmitFineTuningWorkflow).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ epochs: 5 })
      );
    });

    it("should return failure result when extraction throws", async () => {
      mockExtractTrainingDataset.mockRejectedValue(new Error("DB connection failed"));

      const result = await startFineTuningJob({ tenantId: "tenant-1" });

      expect(result.success).toBe(false);
      expect(result.error).toBe("DB connection failed");
    });

    it("should return failure result when workflow submission throws", async () => {
      mockExtractTrainingDataset.mockResolvedValue(createValidDataset());
      mockValidateExtractedDataset.mockReturnValue(createValidValidation());
      mockSubmitFineTuningWorkflow.mockRejectedValue(new Error("OpenAI API error"));

      const result = await startFineTuningJob({ tenantId: "tenant-1" });

      expect(result.success).toBe(false);
      expect(result.error).toBe("OpenAI API error");
    });
  });

  // ==================== getJobStatus ====================

  describe("getJobStatus", () => {
    it("should return job result when found", async () => {
      const jobResult = createJobResult();
      mockGetFineTuningJob.mockResolvedValue(jobResult);

      const result = await getJobStatus("ftjob-123");

      expect(result).toEqual(jobResult);
      expect(mockGetFineTuningJob).toHaveBeenCalledWith("ftjob-123");
    });

    it("should return null when job retrieval fails", async () => {
      mockGetFineTuningJob.mockRejectedValue(new Error("Not found"));

      const result = await getJobStatus("ftjob-nonexistent");

      expect(result).toBeNull();
    });
  });

  // ==================== cancelJob ====================

  describe("cancelJob", () => {
    it("should delegate to cancelFineTuningJob and return its result", async () => {
      mockCancelFineTuningJob.mockResolvedValue(true);

      const result = await cancelJob("ftjob-123");

      expect(result).toBe(true);
      expect(mockCancelFineTuningJob).toHaveBeenCalledWith("ftjob-123");
    });

    it("should return false when cancellation fails", async () => {
      mockCancelFineTuningJob.mockResolvedValue(false);

      const result = await cancelJob("ftjob-already-done");

      expect(result).toBe(false);
    });
  });

  // ==================== listJobs ====================

  describe("listJobs", () => {
    it("should delegate to listFineTuningJobs with specified limit", async () => {
      const jobs = [createJobResult(), createJobResult({ jobId: "ftjob-456" })];
      mockListFineTuningJobs.mockResolvedValue(jobs);

      const result = await listJobs(10);

      expect(result).toEqual(jobs);
      expect(mockListFineTuningJobs).toHaveBeenCalledWith(10);
    });

    it("should default to 20 when limit not specified", async () => {
      mockListFineTuningJobs.mockResolvedValue([]);

      await listJobs();

      expect(mockListFineTuningJobs).toHaveBeenCalledWith(20);
    });
  });

  // ==================== handleJobCompletion ====================

  describe("handleJobCompletion", () => {
    it("should register model version when job succeeded with fineTunedModel", async () => {
      const job = createJobResult({
        status: "succeeded",
        fineTunedModel: "ft:gpt-4o-mini:kenchi:custom:xyz",
        model: "gpt-4o-mini-2024-07-18",
        jobId: "ftjob-done",
        trainingFileId: "file-train-1",
      });

      const createdVersion = {
        id: "version-1",
        name: "Fine-tuned 2024-01-15",
        modelId: "ft:gpt-4o-mini:kenchi:custom:xyz",
        description: expect.any(String),
        createdAt: "2024-01-15T10:00:00Z",
        isBaseline: false,
        metadata: {},
      };
      mockCreateModelVersion.mockResolvedValue(createdVersion);

      await handleJobCompletion(job);

      expect(mockCreateModelVersion).toHaveBeenCalledWith(
        expect.objectContaining({
          modelId: "ft:gpt-4o-mini:kenchi:custom:xyz",
          metadata: expect.objectContaining({
            parentModelId: "gpt-4o-mini-2024-07-18",
            trainingDatasetId: "file-train-1",
          }),
        })
      );
      expect(mockRegisterModelVersion).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "version-1",
          modelId: "ft:gpt-4o-mini:kenchi:custom:xyz",
          isBaseline: false,
        })
      );
    });

    it("should do nothing when job status is not succeeded", async () => {
      const job = createJobResult({ status: "failed", fineTunedModel: null });

      await handleJobCompletion(job);

      expect(mockCreateModelVersion).not.toHaveBeenCalled();
      expect(mockRegisterModelVersion).not.toHaveBeenCalled();
    });

    it("should do nothing when job has no fineTunedModel", async () => {
      const job = createJobResult({
        status: "succeeded",
        fineTunedModel: undefined,
      });

      await handleJobCompletion(job);

      expect(mockCreateModelVersion).not.toHaveBeenCalled();
    });

    it("should do nothing when job status is cancelled", async () => {
      const job = createJobResult({
        status: "cancelled",
        fineTunedModel: "ft:model",
      });

      await handleJobCompletion(job);

      expect(mockCreateModelVersion).not.toHaveBeenCalled();
    });

    it("should not throw when createModelVersion fails", async () => {
      const job = createJobResult({
        status: "succeeded",
        fineTunedModel: "ft:gpt-4o-mini:kenchi:custom:xyz",
      });
      mockCreateModelVersion.mockRejectedValue(new Error("DB constraint violation"));

      // Should not throw, just log the error
      await expect(handleJobCompletion(job)).resolves.not.toThrow();
    });

    it("should not call registerModelVersion when createModelVersion fails", async () => {
      const job = createJobResult({
        status: "succeeded",
        fineTunedModel: "ft:gpt-4o-mini:kenchi:custom:xyz",
      });
      mockCreateModelVersion.mockRejectedValue(new Error("DB error"));

      await handleJobCompletion(job);

      expect(mockRegisterModelVersion).not.toHaveBeenCalled();
    });
  });
});

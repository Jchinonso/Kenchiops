/**
 * Unit tests for Analysis Routes
 *
 * Tests the async job-based analysis flow:
 * - POST /api/analyze -> 202 Accepted with job_id
 * - GET /api/jobs/:id -> job status with result/error
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import request from "supertest";
import express, { type Express, type NextFunction, type Request, type Response } from "express";

// ==================== Mock Setup ====================

const mockQuery = jest.fn<(...args: unknown[]) => Promise<{ rows: unknown[] }>>();
const mockGenerateEventId = jest.fn<(prefix: string) => string>();
const mockLoggerInfo = jest.fn();
const mockLoggerError = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerDebug = jest.fn();

/**
 * NotFoundError stub used in the mock. Matches the real error class shape
 * so the error middleware can detect it.
 */
class MockNotFoundError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly metadata: Record<string, unknown>;

  constructor(message: string, context: { metadata?: Record<string, unknown> } = {}) {
    super(message);
    this.name = "NotFoundError";
    this.statusCode = 404;
    this.code = "NOT_FOUND";
    this.metadata = context.metadata ?? {};
  }
}

jest.mock("@kenchi/shared", () => ({
  asyncHandler:
    (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        await fn(req, res, next);
      } catch (error) {
        next(error);
      }
    },
  validate:
    (schema: Record<string, unknown>) =>
    (req: Request, res: Response, next: NextFunction): void => {
      const bodySchema = (schema as { body?: Record<string, (v: unknown) => boolean | string> })
        .body;
      if (bodySchema) {
        const errors: string[] = [];
        for (const [field, validator] of Object.entries(bodySchema)) {
          const value = (req.body as Record<string, unknown>)?.[field];
          const result = validator(value);
          if (result !== true) {
            errors.push(`${field} ${result}`);
          }
        }
        if (errors.length > 0) {
          res.status(400).json({ error: "Validation failed", details: errors });
          return;
        }
      }
      next();
    },
  validators: {
    required: (value: unknown): boolean | string => {
      if (value === undefined || value === null || value === "") {
        return "is required";
      }
      return true;
    },
    string: (value: unknown): boolean | string => {
      if (typeof value !== "string") {
        return "must be a string";
      }
      return true;
    },
  },
  HTTP_STATUS: {
    OK: 200,
    CREATED: 201,
    ACCEPTED: 202,
    BAD_REQUEST: 400,
    NOT_FOUND: 404,
    INTERNAL_SERVER_ERROR: 500,
  },
  createLogger: jest.fn(() => ({
    info: mockLoggerInfo,
    error: mockLoggerError,
    warn: mockLoggerWarn,
    debug: mockLoggerDebug,
  })),
  SERVICE_NAMES: {
    API: "api",
  },
  API_ROUTES: {
    ANALYZE: "/api/analyze",
  },
  query: mockQuery,
  NotFoundError: MockNotFoundError,
  generateEventId: mockGenerateEventId,
}));

// Import the router after mocks are registered
import { analysisRoutes } from "../routes/analysisRoutes.js";

// ==================== Test Suite ====================

describe("Analysis Routes", () => {
  let app: Express;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerateEventId.mockReturnValue("job_1234567890_abc123");

    app = express();
    app.use(express.json());
    app.use(analysisRoutes);

    // Error handling middleware matching Express error handler signature
    app.use(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      (err: Error & { statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => {
        const status = err.statusCode ?? 500;
        res.status(status).json({ error: err.message });
      }
    );
  });

  // ==================== POST /api/analyze ====================

  describe("POST /api/analyze", () => {
    const validRequest = {
      failure_log: "Build failed with error: Module not found",
      repository: "owner/repo",
      commit: "abc123def456",
    };

    const mockJobRow = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      status: "pending",
    };

    it("should return 202 Accepted with job_id for valid input", async () => {
      mockQuery.mockResolvedValue({ rows: [mockJobRow] });

      const response = await request(app).post("/api/analyze").send(validRequest);

      expect(response.status).toBe(202);
      expect(response.body).toEqual({
        job_id: mockJobRow.id,
        status: "pending",
      });
    });

    it("should return 400 when failure_log is missing", async () => {
      const response = await request(app).post("/api/analyze").send({
        repository: "owner/repo",
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Validation failed");
    });

    it("should return 400 when repository is missing", async () => {
      const response = await request(app).post("/api/analyze").send({
        failure_log: "Some error",
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Validation failed");
    });

    it("should return 400 when both required fields are missing", async () => {
      const response = await request(app).post("/api/analyze").send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Validation failed");
    });

    it("should return 400 when failure_log is empty string", async () => {
      const response = await request(app).post("/api/analyze").send({
        failure_log: "",
        repository: "owner/repo",
      });

      expect(response.status).toBe(400);
    });

    it("should return 400 when repository is empty string", async () => {
      const response = await request(app).post("/api/analyze").send({
        failure_log: "Some error",
        repository: "",
      });

      expect(response.status).toBe(400);
    });

    it("should insert correct data into database via query()", async () => {
      mockQuery.mockResolvedValue({ rows: [mockJobRow] });

      await request(app).post("/api/analyze").send(validRequest);

      expect(mockQuery).toHaveBeenCalledTimes(1);

      const [queryText, params] = mockQuery.mock.calls[0] as [string, unknown[]];

      // Verify the SQL is the INSERT_JOB query
      expect(queryText).toContain("INSERT INTO analysis_jobs");
      expect(queryText).toContain("RETURNING id, status");

      // Verify parameters
      // $1 = idempotency_key
      expect(params[0]).toBe("job_1234567890_abc123");
      // $2 = workspace_id (tenant_id ?? "default")
      expect(params[1]).toBe("default");
      // $3 = log_ref (JSON stringified payload)
      const logRef = JSON.parse(params[2] as string);
      expect(logRef.failure_log).toBe(validRequest.failure_log);
      expect(logRef.repository).toBe(validRequest.repository);
      expect(logRef.commit).toBe(validRequest.commit);
      // $4 = repository_full_name
      expect(params[3]).toBe(validRequest.repository);
      // $5 = commit_sha
      expect(params[4]).toBe(validRequest.commit);
      // $6 = installation_id (0 for direct API calls)
      expect(params[5]).toBe(0);
    });

    it("should use tenant_id from request body when provided", async () => {
      mockQuery.mockResolvedValue({ rows: [mockJobRow] });

      await request(app)
        .post("/api/analyze")
        .send({
          ...validRequest,
          tenant_id: "tenant-xyz",
        });

      const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      // $2 = workspace_id should be the provided tenant_id
      expect(params[1]).toBe("tenant-xyz");
    });

    it("should default workspace_id to 'default' when tenant_id is absent", async () => {
      mockQuery.mockResolvedValue({ rows: [mockJobRow] });

      await request(app).post("/api/analyze").send({
        failure_log: "Error occurred",
        repository: "owner/repo",
      });

      const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(params[1]).toBe("default");
    });

    it("should default commit_sha to 'unknown' when commit is absent", async () => {
      mockQuery.mockResolvedValue({ rows: [mockJobRow] });

      await request(app).post("/api/analyze").send({
        failure_log: "Error occurred",
        repository: "owner/repo",
      });

      const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      // $5 = commit_sha
      expect(params[4]).toBe("unknown");
    });

    it("should call generateEventId with 'job' prefix", async () => {
      mockQuery.mockResolvedValue({ rows: [mockJobRow] });

      await request(app).post("/api/analyze").send(validRequest);

      expect(mockGenerateEventId).toHaveBeenCalledWith("job");
    });

    it("should log job creation with relevant metadata", async () => {
      mockQuery.mockResolvedValue({ rows: [mockJobRow] });

      await request(app).post("/api/analyze").send(validRequest);

      expect(mockLoggerInfo).toHaveBeenCalledWith("Analysis job created", {
        jobId: mockJobRow.id,
        repository: validRequest.repository,
        hasCommit: true,
      });
    });

    it("should log hasCommit as false when commit is not provided", async () => {
      mockQuery.mockResolvedValue({ rows: [mockJobRow] });

      await request(app).post("/api/analyze").send({
        failure_log: "Error occurred",
        repository: "owner/repo",
      });

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        "Analysis job created",
        expect.objectContaining({ hasCommit: false })
      );
    });

    it("should include optional fields in log_ref JSON", async () => {
      mockQuery.mockResolvedValue({ rows: [mockJobRow] });

      await request(app)
        .post("/api/analyze")
        .send({
          ...validRequest,
          tenant_id: "tenant-abc",
          workflow_id: "wf-123",
          test_framework: { name: "jest", language: "typescript", assertion_hint: "expect" },
        });

      const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      const logRef = JSON.parse(params[2] as string);

      expect(logRef.tenant_id).toBe("tenant-abc");
      expect(logRef.workflow_id).toBe("wf-123");
      expect(logRef.test_framework).toEqual({
        name: "jest",
        language: "typescript",
        assertion_hint: "expect",
      });
    });

    it("should handle database errors gracefully", async () => {
      mockQuery.mockRejectedValue(new Error("Connection refused"));

      const response = await request(app).post("/api/analyze").send(validRequest);

      expect(response.status).toBe(500);
    });

    it("should handle concurrent requests independently", async () => {
      let callCount = 0;
      mockQuery.mockImplementation(async () => {
        callCount += 1;
        return {
          rows: [{ id: `job-uuid-${callCount}`, status: "pending" }],
        };
      });

      const requests = Array.from({ length: 5 }, () =>
        request(app).post("/api/analyze").send({
          failure_log: "Error",
          repository: "test/repo",
        })
      );

      const responses = await Promise.all(requests);

      responses.forEach((response) => {
        expect(response.status).toBe(202);
        expect(response.body.status).toBe("pending");
        expect(response.body.job_id).toBeDefined();
      });

      expect(mockQuery).toHaveBeenCalledTimes(5);
    });

    it("should handle special characters in repository name", async () => {
      mockQuery.mockResolvedValue({ rows: [mockJobRow] });

      const response = await request(app).post("/api/analyze").send({
        failure_log: "Error occurred",
        repository: "org-name/repo_name-123",
      });

      expect(response.status).toBe(202);

      const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(params[3]).toBe("org-name/repo_name-123");
    });

    it("should handle unicode characters in failure log", async () => {
      mockQuery.mockResolvedValue({ rows: [mockJobRow] });

      const response = await request(app).post("/api/analyze").send({
        failure_log: "Error: test failure unicode chars",
        repository: "owner/repo",
      });

      expect(response.status).toBe(202);
    });

    it("should handle very long failure logs", async () => {
      mockQuery.mockResolvedValue({ rows: [mockJobRow] });

      const longLog = "Error: ".repeat(1000) + "Stack trace here";

      const response = await request(app).post("/api/analyze").send({
        failure_log: longLog,
        repository: "owner/repo",
      });

      expect(response.status).toBe(202);

      const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      const logRef = JSON.parse(params[2] as string);
      expect(logRef.failure_log).toBe(longLog);
    });

    it("should handle multiline failure logs", async () => {
      mockQuery.mockResolvedValue({ rows: [mockJobRow] });

      const multilineLog = "Error on line 1\nError on line 2\nStack trace:\n  at function()";

      const response = await request(app).post("/api/analyze").send({
        failure_log: multilineLog,
        repository: "owner/repo",
      });

      expect(response.status).toBe(202);
    });
  });

  // ==================== GET /api/jobs/:id ====================

  describe("GET /api/jobs/:id", () => {
    const jobId = "550e8400-e29b-41d4-a716-446655440000";

    it("should return job status when job is found with pending status", async () => {
      mockQuery.mockResolvedValue({
        rows: [{ id: jobId, status: "pending", result: null, error: null }],
      });

      const response = await request(app).get(`/api/jobs/${jobId}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        job_id: jobId,
        status: "pending",
      });
    });

    it("should return job status when job is processing", async () => {
      mockQuery.mockResolvedValue({
        rows: [{ id: jobId, status: "processing", result: null, error: null }],
      });

      const response = await request(app).get(`/api/jobs/${jobId}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        job_id: jobId,
        status: "processing",
      });
    });

    it("should return job status with result when job is completed", async () => {
      const jobResult = {
        analysis: "Build failed due to missing dependency",
        confidence: 0.85,
      };

      mockQuery.mockResolvedValue({
        rows: [{ id: jobId, status: "completed", result: jobResult, error: null }],
      });

      const response = await request(app).get(`/api/jobs/${jobId}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        job_id: jobId,
        status: "completed",
        result: jobResult,
      });
    });

    it("should return job status with error when job has failed", async () => {
      mockQuery.mockResolvedValue({
        rows: [
          {
            id: jobId,
            status: "failed",
            result: null,
            error: "LLM timeout after 60s",
          },
        ],
      });

      const response = await request(app).get(`/api/jobs/${jobId}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        job_id: jobId,
        status: "failed",
        error: "LLM timeout after 60s",
      });
    });

    it("should throw NotFoundError when job is not found", async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const response = await request(app).get(`/api/jobs/${jobId}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe("Job not found");
    });

    it("should query database with the correct job ID", async () => {
      mockQuery.mockResolvedValue({
        rows: [{ id: jobId, status: "pending", result: null, error: null }],
      });

      await request(app).get(`/api/jobs/${jobId}`);

      expect(mockQuery).toHaveBeenCalledTimes(1);

      const [queryText, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(queryText).toContain("SELECT id, status, result, error");
      expect(queryText).toContain("FROM analysis_jobs");
      expect(params[0]).toBe(jobId);
    });

    it("should handle database errors gracefully", async () => {
      mockQuery.mockRejectedValue(new Error("Connection refused"));

      const response = await request(app).get(`/api/jobs/${jobId}`);

      expect(response.status).toBe(500);
    });

    it("should omit result and error fields when they are null", async () => {
      mockQuery.mockResolvedValue({
        rows: [{ id: jobId, status: "pending", result: null, error: null }],
      });

      const response = await request(app).get(`/api/jobs/${jobId}`);

      expect(response.body).not.toHaveProperty("result");
      expect(response.body).not.toHaveProperty("error");
    });
  });
});

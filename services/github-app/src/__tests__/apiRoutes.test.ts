/**
 * Unit tests for API Routes
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import express, { type Request, type Response } from "express";
import request from "supertest";

// Mock dependencies
jest.mock("@kenchi/shared", () => ({
  asyncHandler: (fn: unknown) => fn,
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
  HTTP_STATUS: {
    OK: 200,
    BAD_REQUEST: 400,
    INTERNAL_SERVER_ERROR: 500,
  },
  KENCHI_BRANDING: {
    CHECK_RUN_NAME: "KenchiOps Analysis",
    COMMENT_MARKER: "<!-- kenchiops-marker -->",
  },
  validate:
    (schema: { body?: Record<string, unknown> }) =>
    (req: Request, res: Response, next: () => void) => {
      // Basic validation for required fields
      if (schema.body) {
        Object.keys(schema.body).forEach((field) => {
          if (req.body[field] === undefined || req.body[field] === null || req.body[field] === "") {
            res.status(400).json({ error: `${field} is required` });
          }
        });
        const missingField = Object.keys(schema.body).find(
          (field) =>
            req.body[field] === undefined || req.body[field] === null || req.body[field] === ""
        );
        if (missingField) return;
      }
      next();
    },
  validators: {
    required: (v: unknown) => v !== undefined && v !== null && v !== "",
    string: (v: unknown) => typeof v === "string",
  },
}));

jest.mock("../services/githubService.js", () => ({
  postPRComment: jest.fn(() => Promise.resolve()),
  createCheckRunWithAnnotations: jest.fn(() => Promise.resolve()),
  getInstallationRepositories: jest.fn(() =>
    Promise.resolve([
      {
        id: 1,
        name: "repo1",
        fullName: "owner/repo1",
        private: true,
        defaultBranch: "main",
      },
    ])
  ),
}));

jest.mock("../services/workflowService.js", () => ({
  rerunFailedJobs: jest.fn(() => Promise.resolve({ success: true, message: "Rerun triggered" })),
  getWorkflowRunIdForCheckRun: jest.fn(() => Promise.resolve(12345)),
  getCheckSuiteIdForRun: jest.fn(() => Promise.resolve(67890)),
  rerequestCheckSuite: jest.fn(() =>
    Promise.resolve({ success: true, message: "Check suite rerequested" })
  ),
}));

jest.mock("../config/appConfig.js", () => ({
  appConfig: {
    github: {
      installationId: 12345,
    },
  },
}));

jest.mock("../formatters/commentFormatter.js", () => ({
  formatGitHubComment: jest.fn(() => "Formatted comment"),
}));

// Import after mocks
import { apiRoutes } from "../routes/apiRoutes.js";
import {
  postPRComment,
  createCheckRunWithAnnotations,
  getInstallationRepositories,
} from "../services/githubService.js";
import { formatGitHubComment } from "../formatters/commentFormatter.js";

const mockPostPRComment = postPRComment as jest.MockedFunction<typeof postPRComment>;
const mockCreateCheckRunWithAnnotations = createCheckRunWithAnnotations as jest.MockedFunction<
  typeof createCheckRunWithAnnotations
>;
const mockGetInstallationRepositories = getInstallationRepositories as jest.MockedFunction<
  typeof getInstallationRepositories
>;
const mockFormatGitHubComment = formatGitHubComment as jest.MockedFunction<
  typeof formatGitHubComment
>;

describe("API Routes", () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create Express app with routes
    app = express();
    app.use(express.json());
    app.use(apiRoutes);

    mockFormatGitHubComment.mockReturnValue("Formatted comment");
    mockPostPRComment.mockResolvedValue();
    mockCreateCheckRunWithAnnotations.mockResolvedValue();
    mockGetInstallationRepositories.mockResolvedValue([
      {
        id: 1,
        name: "repo1",
        fullName: "owner/repo1",
        private: true,
        defaultBranch: "main",
      },
    ]);
  });

  describe("POST /api/github/comment", () => {
    const validBody = {
      repository: "testowner/testrepo",
      pr_number: 123,
      analysis: {
        analysis: "Test analysis",
        identified_cause: "Test cause",
        confidence: 0.85,
        recommended_actions: [{ description: "Fix it", priority: "high" }],
      },
    };

    it("should post comment to GitHub PR", async () => {
      const response = await request(app).post("/api/github/comment").send(validBody);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("posted");
      expect(mockPostPRComment).toHaveBeenCalledWith(
        12345,
        "testowner",
        "testrepo",
        123,
        expect.any(String)
      );
    });

    it("should format comment with analysis data", async () => {
      await request(app).post("/api/github/comment").send(validBody);

      expect(mockFormatGitHubComment).toHaveBeenCalledWith(
        expect.objectContaining({
          summary: "Test analysis",
          identified_cause: "Test cause",
          confidence: 0.85,
          repository: "testowner/testrepo",
        })
      );
    });

    it("should reject invalid repository format", async () => {
      const response = await request(app)
        .post("/api/github/comment")
        .send({
          ...validBody,
          repository: "invalid-format",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("Invalid repository format");
    });

    it("should reject missing repository", async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { repository, ...bodyWithoutRepo } = validBody;
      const response = await request(app).post("/api/github/comment").send(bodyWithoutRepo);

      expect(response.status).toBe(400);
    });

    it("should create check run with annotations when available", async () => {
      const bodyWithAnnotations = {
        ...validBody,
        analysis: {
          ...validBody.analysis,
          headSha: "abc123",
          annotations: [
            {
              path: "src/index.ts",
              startLine: 10,
              level: "failure",
              message: "Error here",
              title: "Test Error",
            },
          ],
        },
      };

      await request(app).post("/api/github/comment").send(bodyWithAnnotations);

      expect(mockCreateCheckRunWithAnnotations).toHaveBeenCalledWith(
        expect.objectContaining({
          installationId: 12345,
          owner: "testowner",
          repo: "testrepo",
          headSha: "abc123",
          name: "KenchiOps Analysis",
          summary: expect.any(String),
          annotations: expect.arrayContaining([
            expect.objectContaining({
              path: "src/index.ts",
              start_line: 10,
              annotation_level: "failure",
            }),
          ]),
        })
      );
    });

    it("should not create check run without headSha", async () => {
      const bodyWithAnnotations = {
        ...validBody,
        analysis: {
          ...validBody.analysis,
          annotations: [{ path: "test.ts", startLine: 1, level: "warning", message: "Test" }],
        },
      };

      await request(app).post("/api/github/comment").send(bodyWithAnnotations);

      expect(mockCreateCheckRunWithAnnotations).not.toHaveBeenCalled();
    });

    it("should handle GitHub API errors", async () => {
      mockPostPRComment.mockRejectedValue(new Error("GitHub API error"));

      const response = await request(app).post("/api/github/comment").send(validBody);

      expect(response.status).toBe(500);
      expect(response.body.status).toBe("error");
      expect(response.body.error).toContain("GitHub API error");
    });

    it("should include annotation count in response", async () => {
      const bodyWithAnnotations = {
        ...validBody,
        analysis: {
          ...validBody.analysis,
          headSha: "abc123",
          annotations: [{ path: "test.ts", startLine: 1, level: "failure", message: "Error" }],
        },
      };

      const response = await request(app).post("/api/github/comment").send(bodyWithAnnotations);

      expect(response.body.annotations_posted).toBe(1);
    });

    it("should convert annotation levels correctly", async () => {
      const bodyWithMixedAnnotations = {
        ...validBody,
        analysis: {
          ...validBody.analysis,
          headSha: "abc123",
          annotations: [
            { path: "test1.ts", startLine: 1, level: "failure", message: "Fail" },
            { path: "test2.ts", startLine: 2, level: "warning", message: "Warn" },
            { path: "test3.ts", startLine: 3, level: "notice", message: "Notice" },
          ],
        },
      };

      await request(app).post("/api/github/comment").send(bodyWithMixedAnnotations);

      expect(mockCreateCheckRunWithAnnotations).toHaveBeenCalledWith(
        expect.objectContaining({
          installationId: expect.any(Number),
          owner: expect.any(String),
          repo: expect.any(String),
          headSha: expect.any(String),
          name: expect.any(String),
          summary: expect.any(String),
          annotations: expect.arrayContaining([
            expect.objectContaining({ annotation_level: "failure" }),
            expect.objectContaining({ annotation_level: "warning" }),
            expect.objectContaining({ annotation_level: "notice" }),
          ]),
        })
      );
    });
  });

  describe("POST /api/github/annotations", () => {
    const validBody = {
      repository: "testowner/testrepo",
      head_sha: "abc123def456",
      annotations: [
        {
          path: "src/index.ts",
          line: 10,
          level: "failure",
          message: "Error message",
          title: "Error",
        },
      ],
      summary: "Test summary",
      check_name: "Custom Check",
    };

    it("should create check run with annotations", async () => {
      const response = await request(app).post("/api/github/annotations").send(validBody);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("created");
      expect(mockCreateCheckRunWithAnnotations).toHaveBeenCalledWith(
        expect.objectContaining({
          installationId: 12345,
          owner: "testowner",
          repo: "testrepo",
          headSha: "abc123def456",
          name: "Custom Check",
          summary: "Test summary",
          annotations: expect.any(Array),
        })
      );
    });

    it("should use default check name when not provided", async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { check_name, ...bodyWithoutCheckName } = validBody;
      await request(app).post("/api/github/annotations").send(bodyWithoutCheckName);

      expect(mockCreateCheckRunWithAnnotations).toHaveBeenCalledWith(
        expect.objectContaining({
          installationId: expect.any(Number),
          owner: expect.any(String),
          repo: expect.any(String),
          headSha: expect.any(String),
          name: "KenchiOps Analysis",
          summary: expect.any(String),
          annotations: expect.any(Array),
        })
      );
    });

    it("should reject invalid repository format", async () => {
      const response = await request(app)
        .post("/api/github/annotations")
        .send({
          ...validBody,
          repository: "invalid",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("Invalid repository format");
    });

    it("should handle GitHub API errors", async () => {
      mockCreateCheckRunWithAnnotations.mockRejectedValue(new Error("API error"));

      const response = await request(app).post("/api/github/annotations").send(validBody);

      expect(response.status).toBe(500);
      expect(response.body.status).toBe("error");
    });

    it("should convert annotation levels to GitHub format", async () => {
      await request(app).post("/api/github/annotations").send(validBody);

      expect(mockCreateCheckRunWithAnnotations).toHaveBeenCalledWith(
        expect.objectContaining({
          installationId: expect.any(Number),
          owner: expect.any(String),
          repo: expect.any(String),
          headSha: expect.any(String),
          name: expect.any(String),
          summary: expect.any(String),
          annotations: expect.arrayContaining([
            expect.objectContaining({
              annotation_level: "failure",
              start_line: 10,
              end_line: 10,
            }),
          ]),
        })
      );
    });

    it("should include annotation count in response", async () => {
      const response = await request(app).post("/api/github/annotations").send(validBody);

      expect(response.body.annotation_count).toBe(1);
    });
  });

  describe("GET /api/installations/:installationId/repositories", () => {
    it("should fetch repositories for installation", async () => {
      const response = await request(app).get("/api/installations/12345/repositories");

      expect(response.status).toBe(200);
      expect(response.body.repositories).toHaveLength(1);
      expect(response.body.repositories[0]).toMatchObject({
        id: 1,
        name: "repo1",
        fullName: "owner/repo1",
      });
    });

    it("should include total count in response", async () => {
      const response = await request(app).get("/api/installations/12345/repositories");

      expect(response.body.total).toBe(1);
      expect(response.body.installationId).toBe(12345);
    });

    it("should reject invalid installation ID", async () => {
      const response = await request(app).get("/api/installations/invalid/repositories");

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("Invalid installation ID");
    });

    it("should reject negative installation ID", async () => {
      const response = await request(app).get("/api/installations/-1/repositories");

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("Invalid installation ID");
    });

    it("should reject zero installation ID", async () => {
      const response = await request(app).get("/api/installations/0/repositories");

      expect(response.status).toBe(400);
    });

    it("should handle GitHub API errors", async () => {
      mockGetInstallationRepositories.mockRejectedValue(new Error("GitHub API error"));

      const response = await request(app).get("/api/installations/12345/repositories");

      expect(response.status).toBe(500);
      expect(response.body.error).toContain("GitHub API error");
    });

    it("should handle empty repository list", async () => {
      mockGetInstallationRepositories.mockResolvedValue([]);

      const response = await request(app).get("/api/installations/12345/repositories");

      expect(response.status).toBe(200);
      expect(response.body.total).toBe(0);
      expect(response.body.repositories).toEqual([]);
    });

    it("should handle large installation IDs", async () => {
      const response = await request(app).get("/api/installations/999999999/repositories");

      expect(response.status).toBe(200);
      expect(mockGetInstallationRepositories).toHaveBeenCalledWith(999999999);
    });
  });
});

/**
 * Unit tests for integrations/githubAppClient.ts
 */
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { ExternalServiceError } from "../../core/errors.js";
import type { GitHubRepository } from "../../core/types.js";
import type { ResilientResponse } from "../../http/resilientClient.js";

// Mock config before importing githubAppClient
jest.mock("../../core/config.js", () => ({
  config: {
    GITHUB_APP_URL: "https://github-app.example.com",
  },
}));

// Mock logger to suppress logs during tests
jest.mock("../../core/logger.js", () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  })),
}));

// Mock resilient HTTP client
const mockResilientGet = jest.fn();
jest.mock("../../http/resilientClient.js", () => ({
  resilientGet: (...args: unknown[]) => mockResilientGet(...args),
}));

// Mock formatting/index.js for truncateText
jest.mock("../../formatting/index.js", () => ({
  truncateText: (text: string, maxLen: number) =>
    text.length > maxLen ? text.slice(0, maxLen - 3) + "..." : text,
}));

// Import after mocks
import { fetchInstallationRepositories } from "../../integrations/githubAppClient.js";

/**
 * Helper to create a mock resilient response.
 */
const createMockResponse = <T>(data: T, status = 200): ResilientResponse<T> => ({
  data,
  status,
  retryCount: 0,
  duration: 100,
});

describe("githubAppClient", () => {
  const mockInstallationId = 12345;
  const mockGitHubAppUrl = "https://github-app.example.com";

  beforeEach(() => {
    mockResilientGet.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("fetchInstallationRepositories", () => {
    const mockApiResponse = {
      installationId: mockInstallationId,
      repositories: [
        {
          id: 1,
          name: "repo1",
          fullName: "owner/repo1",
          private: false,
          defaultBranch: "main",
        },
        {
          id: 2,
          name: "repo2",
          fullName: "owner/repo2",
          private: true,
          defaultBranch: "master",
        },
        {
          id: 3,
          name: "repo3",
          fullName: "org/repo3",
          private: false,
          defaultBranch: "develop",
        },
      ],
      total: 3,
    };

    describe("happy path", () => {
      it("should fetch and transform repositories successfully", async () => {
        mockResilientGet.mockResolvedValueOnce(createMockResponse(mockApiResponse));

        const result = await fetchInstallationRepositories(mockInstallationId);

        expect(mockResilientGet).toHaveBeenCalledTimes(1);
        expect(mockResilientGet).toHaveBeenCalledWith(
          `${mockGitHubAppUrl}/api/github/installations/${mockInstallationId}/repositories`,
          { headers: { "Content-Type": "application/json" } }
        );

        expect(result).toHaveLength(3);
        expect(result[0]).toEqual({
          id: 1,
          fullName: "owner/repo1",
          name: "repo1",
          owner: "owner",
          private: false,
          defaultBranch: "main",
        });
        expect(result[1]).toEqual({
          id: 2,
          fullName: "owner/repo2",
          name: "repo2",
          owner: "owner",
          private: true,
          defaultBranch: "master",
        });
        expect(result[2]).toEqual({
          id: 3,
          fullName: "org/repo3",
          name: "repo3",
          owner: "org",
          private: false,
          defaultBranch: "develop",
        });
      });

      it("should return empty array when no repositories exist", async () => {
        mockResilientGet.mockResolvedValueOnce(
          createMockResponse({
            installationId: mockInstallationId,
            repositories: [],
            total: 0,
          })
        );

        const result = await fetchInstallationRepositories(mockInstallationId);

        expect(result).toEqual([]);
      });

      it("should handle single repository", async () => {
        mockResilientGet.mockResolvedValueOnce(
          createMockResponse({
            installationId: mockInstallationId,
            repositories: [
              {
                id: 1,
                name: "single-repo",
                fullName: "owner/single-repo",
                private: false,
                defaultBranch: "main",
              },
            ],
            total: 1,
          })
        );

        const result = await fetchInstallationRepositories(mockInstallationId);

        expect(result).toHaveLength(1);
        expect(result[0].fullName).toBe("owner/single-repo");
      });

      it("should correctly parse owner from fullName", async () => {
        mockResilientGet.mockResolvedValueOnce(
          createMockResponse({
            installationId: mockInstallationId,
            repositories: [
              {
                id: 1,
                name: "repo",
                fullName: "complex-org-name/repo",
                private: false,
                defaultBranch: "main",
              },
            ],
            total: 1,
          })
        );

        const result = await fetchInstallationRepositories(mockInstallationId);

        expect(result[0].owner).toBe("complex-org-name");
      });

      it("should preserve all repository properties", async () => {
        mockResilientGet.mockResolvedValueOnce(
          createMockResponse({
            installationId: mockInstallationId,
            repositories: [
              {
                id: 999,
                name: "test-repo",
                fullName: "test-owner/test-repo",
                private: true,
                defaultBranch: "develop",
              },
            ],
            total: 1,
          })
        );

        const result = await fetchInstallationRepositories(mockInstallationId);

        expect(result[0]).toEqual({
          id: 999,
          fullName: "test-owner/test-repo",
          name: "test-repo",
          owner: "test-owner",
          private: true,
          defaultBranch: "develop",
        });
      });
    });

    describe("error handling", () => {
      it("should throw ExternalServiceError on network failure", async () => {
        mockResilientGet.mockRejectedValueOnce(new Error("Network request failed"));

        await expect(fetchInstallationRepositories(mockInstallationId)).rejects.toThrow(
          ExternalServiceError
        );
      });

      it("should throw ExternalServiceError on timeout", async () => {
        mockResilientGet.mockRejectedValueOnce(new Error("Request timeout"));

        await expect(fetchInstallationRepositories(mockInstallationId)).rejects.toThrow(
          ExternalServiceError
        );
      });

      it("should throw ExternalServiceError on DNS failure", async () => {
        mockResilientGet.mockRejectedValueOnce(new Error("getaddrinfo ENOTFOUND"));

        await expect(fetchInstallationRepositories(mockInstallationId)).rejects.toThrow(
          ExternalServiceError
        );
      });

      it("should throw ExternalServiceError on connection refused", async () => {
        mockResilientGet.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));

        await expect(fetchInstallationRepositories(mockInstallationId)).rejects.toThrow(
          ExternalServiceError
        );
      });

      it("should include installation ID in error metadata", async () => {
        mockResilientGet.mockRejectedValueOnce(new Error("Network error"));

        try {
          await fetchInstallationRepositories(mockInstallationId);
          // Should not reach here
          expect(true).toBe(false);
        } catch (error) {
          expect(error).toBeInstanceOf(ExternalServiceError);
          if (error instanceof ExternalServiceError) {
            expect(error.metadata?.installationId).toBe(mockInstallationId);
          }
        }
      });

      it("should re-throw ExternalServiceError from resilient client without wrapping", async () => {
        const originalError = new ExternalServiceError("github-app", "Service unavailable", {
          operation: "resilientGet",
        });
        mockResilientGet.mockRejectedValueOnce(originalError);

        try {
          await fetchInstallationRepositories(mockInstallationId);
          expect(true).toBe(false);
        } catch (error) {
          expect(error).toBe(originalError);
        }
      });
    });

    describe("edge cases", () => {
      it("should handle repository with hyphenated fullName", async () => {
        mockResilientGet.mockResolvedValueOnce(
          createMockResponse({
            installationId: mockInstallationId,
            repositories: [
              {
                id: 1,
                name: "repo-name",
                fullName: "org-name/repo-name",
                private: false,
                defaultBranch: "main",
              },
            ],
            total: 1,
          })
        );

        const result = await fetchInstallationRepositories(mockInstallationId);

        expect(result[0].owner).toBe("org-name");
        expect(result[0].name).toBe("repo-name");
      });

      it("should handle repository with underscored fullName", async () => {
        mockResilientGet.mockResolvedValueOnce(
          createMockResponse({
            installationId: mockInstallationId,
            repositories: [
              {
                id: 1,
                name: "repo_name",
                fullName: "org_name/repo_name",
                private: false,
                defaultBranch: "main",
              },
            ],
            total: 1,
          })
        );

        const result = await fetchInstallationRepositories(mockInstallationId);

        expect(result[0].owner).toBe("org_name");
        expect(result[0].name).toBe("repo_name");
      });

      it("should handle repository with dots in name", async () => {
        mockResilientGet.mockResolvedValueOnce(
          createMockResponse({
            installationId: mockInstallationId,
            repositories: [
              {
                id: 1,
                name: "repo.name",
                fullName: "org.name/repo.name",
                private: false,
                defaultBranch: "main",
              },
            ],
            total: 1,
          })
        );

        const result = await fetchInstallationRepositories(mockInstallationId);

        expect(result[0].owner).toBe("org.name");
        expect(result[0].name).toBe("repo.name");
      });

      it("should handle large number of repositories", async () => {
        const manyRepos = Array.from({ length: 100 }, (_, i) => ({
          id: i + 1,
          name: `repo${i}`,
          fullName: `owner/repo${i}`,
          private: i % 2 === 0,
          defaultBranch: "main",
        }));

        mockResilientGet.mockResolvedValueOnce(
          createMockResponse({
            installationId: mockInstallationId,
            repositories: manyRepos,
            total: 100,
          })
        );

        const result = await fetchInstallationRepositories(mockInstallationId);

        expect(result).toHaveLength(100);
        expect(result[0].id).toBe(1);
        expect(result[99].id).toBe(100);
      });

      it("should handle different default branch names", async () => {
        mockResilientGet.mockResolvedValueOnce(
          createMockResponse({
            installationId: mockInstallationId,
            repositories: [
              {
                id: 1,
                name: "repo1",
                fullName: "owner/repo1",
                private: false,
                defaultBranch: "main",
              },
              {
                id: 2,
                name: "repo2",
                fullName: "owner/repo2",
                private: false,
                defaultBranch: "master",
              },
              {
                id: 3,
                name: "repo3",
                fullName: "owner/repo3",
                private: false,
                defaultBranch: "develop",
              },
              {
                id: 4,
                name: "repo4",
                fullName: "owner/repo4",
                private: false,
                defaultBranch: "trunk",
              },
            ],
            total: 4,
          })
        );

        const result = await fetchInstallationRepositories(mockInstallationId);

        expect(result[0].defaultBranch).toBe("main");
        expect(result[1].defaultBranch).toBe("master");
        expect(result[2].defaultBranch).toBe("develop");
        expect(result[3].defaultBranch).toBe("trunk");
      });

      it("should handle installation ID as zero", async () => {
        mockResilientGet.mockResolvedValueOnce(
          createMockResponse({
            installationId: 0,
            repositories: [],
            total: 0,
          })
        );

        const result = await fetchInstallationRepositories(0);

        expect(mockResilientGet).toHaveBeenCalledWith(
          `${mockGitHubAppUrl}/api/github/installations/0/repositories`,
          expect.any(Object)
        );
        expect(result).toEqual([]);
      });

      it("should handle very large installation ID", async () => {
        const largeId = 999999999;
        mockResilientGet.mockResolvedValueOnce(
          createMockResponse({
            installationId: largeId,
            repositories: [],
            total: 0,
          })
        );

        const result = await fetchInstallationRepositories(largeId);

        expect(mockResilientGet).toHaveBeenCalledWith(
          `${mockGitHubAppUrl}/api/github/installations/${largeId}/repositories`,
          expect.any(Object)
        );
        expect(result).toEqual([]);
      });
    });

    describe("request configuration", () => {
      it("should pass Content-Type header to resilient client", async () => {
        mockResilientGet.mockResolvedValueOnce(
          createMockResponse({
            installationId: mockInstallationId,
            repositories: [],
            total: 0,
          })
        );

        await fetchInstallationRepositories(mockInstallationId);

        expect(mockResilientGet).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            headers: { "Content-Type": "application/json" },
          })
        );
      });

      it("should construct correct URL with installation ID", async () => {
        mockResilientGet.mockResolvedValueOnce(
          createMockResponse({
            installationId: mockInstallationId,
            repositories: [],
            total: 0,
          })
        );

        await fetchInstallationRepositories(mockInstallationId);

        expect(mockResilientGet).toHaveBeenCalledWith(
          `${mockGitHubAppUrl}/api/github/installations/${mockInstallationId}/repositories`,
          expect.any(Object)
        );
      });
    });

    describe("type safety", () => {
      it("should return array of GitHubRepository type", async () => {
        mockResilientGet.mockResolvedValueOnce(createMockResponse(mockApiResponse));

        const result: readonly GitHubRepository[] =
          await fetchInstallationRepositories(mockInstallationId);

        result.forEach((repo) => {
          expect(typeof repo.id).toBe("number");
          expect(typeof repo.fullName).toBe("string");
          expect(typeof repo.name).toBe("string");
          expect(typeof repo.owner).toBe("string");
          expect(typeof repo.private).toBe("boolean");
          expect(typeof repo.defaultBranch).toBe("string");
        });
      });

      it("should maintain readonly properties", async () => {
        mockResilientGet.mockResolvedValueOnce(createMockResponse(mockApiResponse));

        const result = await fetchInstallationRepositories(mockInstallationId);

        // TypeScript will enforce readonly at compile time
        // This test verifies the structure is correct
        expect(result[0]).toHaveProperty("id");
        expect(result[0]).toHaveProperty("fullName");
        expect(result[0]).toHaveProperty("name");
        expect(result[0]).toHaveProperty("owner");
        expect(result[0]).toHaveProperty("private");
        expect(result[0]).toHaveProperty("defaultBranch");
      });
    });
  });
});

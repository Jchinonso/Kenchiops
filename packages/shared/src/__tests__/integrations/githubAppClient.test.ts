/**
 * Unit tests for integrations/githubAppClient.ts
 */
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { ExternalServiceError } from "../../core/errors.js";
import type { GitHubRepository } from "../../core/types.js";

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

// Import after mocks
import { fetchInstallationRepositories } from "../../integrations/githubAppClient.js";

// Mock global fetch
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

describe("githubAppClient", () => {
  const mockInstallationId = 12345;
  const mockGitHubAppUrl = "https://github-app.example.com";

  beforeEach(() => {
    mockFetch.mockClear();
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
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockApiResponse,
        } as Response);

        const result = await fetchInstallationRepositories(mockInstallationId);

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledWith(
          `${mockGitHubAppUrl}/api/installations/${mockInstallationId}/repositories`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          }
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
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            installationId: mockInstallationId,
            repositories: [],
            total: 0,
          }),
        } as Response);

        const result = await fetchInstallationRepositories(mockInstallationId);

        expect(result).toEqual([]);
      });

      it("should handle single repository", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
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
          }),
        } as Response);

        const result = await fetchInstallationRepositories(mockInstallationId);

        expect(result).toHaveLength(1);
        expect(result[0].fullName).toBe("owner/single-repo");
      });

      it("should correctly parse owner from fullName", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
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
          }),
        } as Response);

        const result = await fetchInstallationRepositories(mockInstallationId);

        expect(result[0].owner).toBe("complex-org-name");
      });

      it("should preserve all repository properties", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
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
          }),
        } as Response);

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

    describe("HTTP error handling", () => {
      it("should throw ExternalServiceError on 404 Not Found", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 404,
          text: async () => "Installation not found",
        } as Response);

        await expect(fetchInstallationRepositories(mockInstallationId)).rejects.toThrow(
          ExternalServiceError
        );

        await expect(fetchInstallationRepositories(mockInstallationId)).rejects.toThrow(
          /GitHubApp/
        );
      });

      it("should throw ExternalServiceError on 401 Unauthorized", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 401,
          text: async () => "Unauthorized",
        } as Response);

        await expect(fetchInstallationRepositories(mockInstallationId)).rejects.toThrow(
          ExternalServiceError
        );
      });

      it("should throw ExternalServiceError on 403 Forbidden", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 403,
          text: async () => "Forbidden",
        } as Response);

        await expect(fetchInstallationRepositories(mockInstallationId)).rejects.toThrow(
          ExternalServiceError
        );
      });

      it("should throw ExternalServiceError on 500 Internal Server Error", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: async () => "Internal Server Error",
        } as Response);

        await expect(fetchInstallationRepositories(mockInstallationId)).rejects.toThrow(
          ExternalServiceError
        );
      });

      it("should throw ExternalServiceError on 503 Service Unavailable", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 503,
          text: async () => "Service Unavailable",
        } as Response);

        await expect(fetchInstallationRepositories(mockInstallationId)).rejects.toThrow(
          ExternalServiceError
        );
      });

      it("should include status code in error message", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 422,
          text: async () => "Unprocessable Entity",
        } as Response);

        await expect(fetchInstallationRepositories(mockInstallationId)).rejects.toThrow(/422/);
      });

      it("should include error text in error message", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 400,
          text: async () => "Bad Request: Invalid installation ID",
        } as Response);

        await expect(fetchInstallationRepositories(mockInstallationId)).rejects.toThrow(
          /Invalid installation ID/
        );
      });
    });

    describe("network error handling", () => {
      it("should throw ExternalServiceError on network failure", async () => {
        mockFetch.mockRejectedValueOnce(new Error("Network request failed"));

        await expect(fetchInstallationRepositories(mockInstallationId)).rejects.toThrow(
          ExternalServiceError
        );
      });

      it("should throw ExternalServiceError on timeout", async () => {
        mockFetch.mockRejectedValueOnce(new Error("Request timeout"));

        await expect(fetchInstallationRepositories(mockInstallationId)).rejects.toThrow(
          ExternalServiceError
        );
      });

      it("should throw ExternalServiceError on DNS failure", async () => {
        mockFetch.mockRejectedValueOnce(new Error("getaddrinfo ENOTFOUND"));

        await expect(fetchInstallationRepositories(mockInstallationId)).rejects.toThrow(
          ExternalServiceError
        );
      });

      it("should throw ExternalServiceError on connection refused", async () => {
        mockFetch.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));

        await expect(fetchInstallationRepositories(mockInstallationId)).rejects.toThrow(
          ExternalServiceError
        );
      });

      it("should include installation ID in error metadata", async () => {
        mockFetch.mockRejectedValueOnce(new Error("Network error"));

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
    });

    describe("invalid response handling", () => {
      it("should throw ExternalServiceError when response is not JSON", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => {
            throw new SyntaxError("Unexpected token < in JSON");
          },
        } as unknown as Response);

        await expect(fetchInstallationRepositories(mockInstallationId)).rejects.toThrow(
          ExternalServiceError
        );
      });

      it("should throw ExternalServiceError when response has invalid structure", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            // Missing required fields
            invalidField: "test",
          }),
        } as Response);

        await expect(fetchInstallationRepositories(mockInstallationId)).rejects.toThrow();
      });

      it("should handle response with missing repositories array", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            installationId: mockInstallationId,
            total: 0,
            // Missing repositories array
          }),
        } as Response);

        await expect(fetchInstallationRepositories(mockInstallationId)).rejects.toThrow();
      });

      it("should handle response with null repositories", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            installationId: mockInstallationId,
            repositories: null,
            total: 0,
          }),
        } as Response);

        await expect(fetchInstallationRepositories(mockInstallationId)).rejects.toThrow();
      });
    });

    describe("edge cases", () => {
      it("should handle repository with hyphenated fullName", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
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
          }),
        } as Response);

        const result = await fetchInstallationRepositories(mockInstallationId);

        expect(result[0].owner).toBe("org-name");
        expect(result[0].name).toBe("repo-name");
      });

      it("should handle repository with underscored fullName", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
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
          }),
        } as Response);

        const result = await fetchInstallationRepositories(mockInstallationId);

        expect(result[0].owner).toBe("org_name");
        expect(result[0].name).toBe("repo_name");
      });

      it("should handle repository with dots in name", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
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
          }),
        } as Response);

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

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            installationId: mockInstallationId,
            repositories: manyRepos,
            total: 100,
          }),
        } as Response);

        const result = await fetchInstallationRepositories(mockInstallationId);

        expect(result).toHaveLength(100);
        expect(result[0].id).toBe(1);
        expect(result[99].id).toBe(100);
      });

      it("should handle different default branch names", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
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
          }),
        } as Response);

        const result = await fetchInstallationRepositories(mockInstallationId);

        expect(result[0].defaultBranch).toBe("main");
        expect(result[1].defaultBranch).toBe("master");
        expect(result[2].defaultBranch).toBe("develop");
        expect(result[3].defaultBranch).toBe("trunk");
      });

      it("should handle installation ID as zero", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            installationId: 0,
            repositories: [],
            total: 0,
          }),
        } as Response);

        const result = await fetchInstallationRepositories(0);

        expect(mockFetch).toHaveBeenCalledWith(
          `${mockGitHubAppUrl}/api/installations/0/repositories`,
          expect.any(Object)
        );
        expect(result).toEqual([]);
      });

      it("should handle very large installation ID", async () => {
        const largeId = 999999999;
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            installationId: largeId,
            repositories: [],
            total: 0,
          }),
        } as Response);

        const result = await fetchInstallationRepositories(largeId);

        expect(mockFetch).toHaveBeenCalledWith(
          `${mockGitHubAppUrl}/api/installations/${largeId}/repositories`,
          expect.any(Object)
        );
        expect(result).toEqual([]);
      });
    });

    describe("request configuration", () => {
      it("should use GET method", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            installationId: mockInstallationId,
            repositories: [],
            total: 0,
          }),
        } as Response);

        await fetchInstallationRepositories(mockInstallationId);

        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            method: "GET",
          })
        );
      });

      it("should include Content-Type header", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            installationId: mockInstallationId,
            repositories: [],
            total: 0,
          }),
        } as Response);

        await fetchInstallationRepositories(mockInstallationId);

        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            headers: {
              "Content-Type": "application/json",
            },
          })
        );
      });

      it("should construct correct URL with installation ID", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            installationId: mockInstallationId,
            repositories: [],
            total: 0,
          }),
        } as Response);

        await fetchInstallationRepositories(mockInstallationId);

        expect(mockFetch).toHaveBeenCalledWith(
          `${mockGitHubAppUrl}/api/installations/${mockInstallationId}/repositories`,
          expect.any(Object)
        );
      });
    });

    describe("type safety", () => {
      it("should return array of GitHubRepository type", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockApiResponse,
        } as Response);

        const result: GitHubRepository[] = await fetchInstallationRepositories(mockInstallationId);

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
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockApiResponse,
        } as Response);

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

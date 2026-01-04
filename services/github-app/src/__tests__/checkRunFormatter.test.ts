/**
 * Unit tests for Check Run Formatter
 */

import { describe, it, expect } from "@jest/globals";
import { buildEnrichedLogContent, formatDuration } from "../formatters/checkRunFormatter.js";
import type { CheckRunWebhook } from "../types/githubTypes.js";
import type { EnrichedContext } from "../services/context/index.js";

describe("Check Run Formatter", () => {
  // Test fixtures
  const createMockWebhook = (overrides: Partial<CheckRunWebhook> = {}): CheckRunWebhook => ({
    action: "completed",
    check_run: {
      id: 12345,
      name: "CI Build",
      conclusion: "failure",
      head_sha: "abc123def456",
      output: {
        title: "Build Failed",
        summary: "The build process encountered errors",
        text: "Error details here",
      },
      pull_requests: [
        {
          number: 123,
          head: { sha: "abc123def456", ref: "feature-branch" },
          base: { sha: "def789", ref: "main" },
        },
      ],
    },
    repository: {
      full_name: "owner/repo",
      owner: { login: "owner" },
      name: "repo",
    },
    installation: { id: 12345 },
    ...overrides,
  });

  const createMockContext = (overrides: Partial<EnrichedContext> = {}): EnrichedContext => ({
    repositoryMetadata: {
      id: 12345,
      name: "repo",
      fullName: "owner/repo",
      owner: "owner",
      defaultBranch: "main",
      isPrivate: false,
      language: "TypeScript",
    },
    workflowTiming: {
      workflowName: "CI",
      jobName: "build",
      startedAt: "2024-01-01T10:00:00Z",
      completedAt: "2024-01-01T10:03:00Z",
      durationMs: 180000,
      conclusion: "failure",
    },
    prMetadata: {
      number: 123,
      title: "Add new feature",
      author: "testuser",
      headBranch: "feature",
      baseBranch: "main",
      reviewStatus: "pending",
      isDraft: false,
      labels: ["bug", "priority-high"],
      reviewers: ["reviewer1", "reviewer2"],
      description: "This PR adds a new feature to the system.",
      comments: [
        {
          author: "commenter",
          body: "Great work!",
          createdAt: "2024-01-01T10:00:00Z",
        },
      ],
    },
    annotations: [
      {
        path: "src/index.ts",
        startLine: 10,
        endLine: 10,
        message: "Type error: expected string",
        level: "failure",
        title: "Type Error",
      },
    ],
    testFailures: [
      {
        testName: "should handle edge case",
        error: "Expected true but got false",
        file: "src/__tests__/index.test.ts",
      },
    ],
    dependencyChanges: [
      {
        name: "lodash",
        type: "added",
        newVersion: "4.17.21",
      },
    ],
    buildConfigChanges: [
      {
        file: "tsconfig.json",
        diff: '+  "strict": true',
      },
    ],
    workflowLogs: "npm install\nnpm run build\n[ERROR] Build failed",
    commitInfo: {
      sha: "abc123def456",
      author: "Test Author",
      committer: "Test Committer",
      timestamp: "2024-01-01T10:00:00Z",
      message: "feat: add new feature",
      changedFiles: ["src/index.ts", "package.json"],
    },
    prDiff: "+ added line\n- removed line",
    sourceFiles: [
      {
        path: "src/index.ts",
        content: "export const foo = 'bar';",
        startLine: 1,
        endLine: 1,
      },
    ],
    ...overrides,
  });

  describe("formatDuration", () => {
    it("should format seconds only", () => {
      expect(formatDuration(5000)).toBe("5s");
      expect(formatDuration(45000)).toBe("45s");
    });

    it("should format minutes and seconds", () => {
      expect(formatDuration(65000)).toBe("1m 5s");
      expect(formatDuration(180000)).toBe("3m 0s");
      expect(formatDuration(125000)).toBe("2m 5s");
    });

    it("should handle zero duration", () => {
      expect(formatDuration(0)).toBe("0s");
    });

    it("should handle large durations", () => {
      expect(formatDuration(3600000)).toBe("60m 0s");
    });
  });

  describe("buildEnrichedLogContent", () => {
    it("should return markdown content", () => {
      const webhook = createMockWebhook();
      const context = createMockContext();
      const content = buildEnrichedLogContent(webhook, context);

      expect(typeof content).toBe("string");
      expect(content.length).toBeGreaterThan(0);
    });

    it("should include repository overview section", () => {
      const webhook = createMockWebhook();
      const context = createMockContext();
      const content = buildEnrichedLogContent(webhook, context);

      expect(content).toContain("## Repository & CI Overview");
      expect(content).toContain("**Repository:** owner/repo");
      expect(content).toContain("**Default Branch:** main");
    });

    it("should include language when available", () => {
      const webhook = createMockWebhook();
      const context = createMockContext();
      const content = buildEnrichedLogContent(webhook, context);

      expect(content).toContain("**Language:** TypeScript");
    });

    it("should include workflow timing information", () => {
      const webhook = createMockWebhook();
      const context = createMockContext();
      const content = buildEnrichedLogContent(webhook, context);

      expect(content).toContain("**Workflow:** CI");
      expect(content).toContain("**Failed Job:** build");
      expect(content).toContain("**Duration:** 3m 0s");
      expect(content).toContain("**Conclusion:** failure");
    });

    it("should include PR metadata section", () => {
      const webhook = createMockWebhook();
      const context = createMockContext();
      const content = buildEnrichedLogContent(webhook, context);

      expect(content).toContain("## Pull Request #123");
      expect(content).toContain("**Title:** Add new feature");
      expect(content).toContain("**Author:** @testuser");
      expect(content).toContain("**Branch:** feature → main");
    });

    it("should include PR labels and reviewers", () => {
      const webhook = createMockWebhook();
      const context = createMockContext();
      const content = buildEnrichedLogContent(webhook, context);

      expect(content).toContain("`bug`");
      expect(content).toContain("`priority-high`");
      expect(content).toContain("@reviewer1");
      expect(content).toContain("@reviewer2");
    });

    it("should include PR description", () => {
      const webhook = createMockWebhook();
      const context = createMockContext();
      const content = buildEnrichedLogContent(webhook, context);

      expect(content).toContain("**Description:**");
      expect(content).toContain("This PR adds a new feature");
    });

    it("should truncate long descriptions", () => {
      const webhook = createMockWebhook();
      const longDescription = "A".repeat(600);
      const context = createMockContext({
        prMetadata: {
          ...createMockContext().prMetadata!,
          description: longDescription,
        },
      });
      const content = buildEnrichedLogContent(webhook, context);

      expect(content).toContain("...");
      expect(content).not.toContain("A".repeat(600));
    });

    it("should include CI check output section", () => {
      const webhook = createMockWebhook();
      const context = createMockContext();
      const content = buildEnrichedLogContent(webhook, context);

      expect(content).toContain("## CI Check Output");
      expect(content).toContain("Build Failed");
      expect(content).toContain("Error details here");
    });

    it("should include annotations section", () => {
      const webhook = createMockWebhook();
      const context = createMockContext();
      const content = buildEnrichedLogContent(webhook, context);

      expect(content).toContain("## CI Annotations (Errors & Warnings)");
      expect(content).toContain("[anno#1]");
      expect(content).toContain("❌");
      expect(content).toContain("Path: src/index.ts:10");
      expect(content).toContain("Type error: expected string");
    });

    it("should show correct level emoji for annotations", () => {
      const webhook = createMockWebhook();
      const context = createMockContext({
        annotations: [
          { path: "a.ts", startLine: 1, endLine: 1, message: "Error", level: "failure" },
          { path: "b.ts", startLine: 2, endLine: 2, message: "Warning", level: "warning" },
          { path: "c.ts", startLine: 3, endLine: 3, message: "Notice", level: "notice" },
        ],
      });
      const content = buildEnrichedLogContent(webhook, context);

      expect(content).toContain("❌");
      expect(content).toContain("⚠️");
      expect(content).toContain("ℹ️");
    });

    it("should include test failures section", () => {
      const webhook = createMockWebhook();
      const context = createMockContext();
      const content = buildEnrichedLogContent(webhook, context);

      expect(content).toContain("## Failed Tests");
      expect(content).toContain("[test#1]");
      expect(content).toContain("should handle edge case");
      expect(content).toContain("Expected true but got false");
    });

    it("should include test file name when available", () => {
      const webhook = createMockWebhook();
      const context = createMockContext();
      const content = buildEnrichedLogContent(webhook, context);

      expect(content).toContain("src/__tests__/index.test.ts");
    });

    it("should include dependency changes section", () => {
      const webhook = createMockWebhook();
      const context = createMockContext();
      const content = buildEnrichedLogContent(webhook, context);

      expect(content).toContain("## Dependency Changes");
    });

    it("should include build config changes section", () => {
      const webhook = createMockWebhook();
      const context = createMockContext();
      const content = buildEnrichedLogContent(webhook, context);

      expect(content).toContain("## Build Config Changes");
      expect(content).toContain("[cfg#tsconfig_json] tsconfig.json");
      expect(content).toContain('"strict": true');
    });

    it("should include workflow logs section", () => {
      const webhook = createMockWebhook();
      const context = createMockContext();
      const content = buildEnrichedLogContent(webhook, context);

      expect(content).toContain("## Workflow Logs");
      expect(content).toContain("npm install");
      expect(content).toContain("[ERROR] Build failed");
    });

    it("should include commit info section", () => {
      const webhook = createMockWebhook();
      const context = createMockContext();
      const content = buildEnrichedLogContent(webhook, context);

      expect(content).toContain("## Commit Info");
      expect(content).toContain("[commit#abc123def456] SHA: abc123def456");
      expect(content).toContain("Author: Test Author");
      expect(content).toContain("Message: feat: add new feature");
      expect(content).toContain("src/index.ts");
    });

    it("should include PR diff section", () => {
      const webhook = createMockWebhook();
      const context = createMockContext();
      const content = buildEnrichedLogContent(webhook, context);

      expect(content).toContain("## PR Diff");
      expect(content).toContain("+ added line");
      expect(content).toContain("- removed line");
    });

    it("should include source files section", () => {
      const webhook = createMockWebhook();
      const context = createMockContext();
      const content = buildEnrichedLogContent(webhook, context);

      expect(content).toContain("## Relevant Source Files");
      expect(content).toContain("[src#");
      expect(content).toContain("src/index.ts");
      expect(content).toContain("export const foo = 'bar'");
    });

    it("should include line range for source files", () => {
      const webhook = createMockWebhook();
      const context = createMockContext({
        sourceFiles: [
          {
            path: "src/main.ts",
            content: "code here",
            startLine: 10,
            endLine: 20,
          },
        ],
      });
      const content = buildEnrichedLogContent(webhook, context);

      expect(content).toContain("[src#src_main_ts:10-20]");
    });

    it("should include PR comments section", () => {
      const webhook = createMockWebhook();
      const context = createMockContext();
      const content = buildEnrichedLogContent(webhook, context);

      expect(content).toContain("## Recent PR Discussion");
      expect(content).toContain("[comment#1]");
      expect(content).toContain("@commenter");
      expect(content).toContain("Great work!");
    });

    it("should handle missing optional sections gracefully", () => {
      const webhook = createMockWebhook();
      const context = createMockContext({
        repositoryMetadata: undefined,
        workflowTiming: undefined,
        prMetadata: undefined,
        annotations: [],
        testFailures: [],
        dependencyChanges: [],
        buildConfigChanges: [],
        workflowLogs: undefined,
        commitInfo: undefined,
        prDiff: undefined,
        sourceFiles: [],
      });
      const content = buildEnrichedLogContent(webhook, context);

      expect(content).toBeDefined();
      expect(content).not.toContain("## Repository & CI Overview");
      expect(content).not.toContain("## Pull Request");
      expect(content).not.toContain("## Failed Tests");
    });

    it("should separate sections with dividers", () => {
      const webhook = createMockWebhook();
      const context = createMockContext();
      const content = buildEnrichedLogContent(webhook, context);

      expect(content).toContain("---");
    });

    it("should return fallback message when no context available", () => {
      const emptyContext: EnrichedContext = {
        workflowLogs: null,
        prDiff: null,
        sourceFiles: [],
        commitInfo: null,
        annotations: [],
        dependencyChanges: [],
        buildConfigChanges: [],
        testFailures: [],
        prMetadata: null,
        repositoryMetadata: null,
        workflowTiming: null,
      };

      // Override check_run output to be empty
      const emptyWebhook = createMockWebhook({
        check_run: {
          ...createMockWebhook().check_run,
          output: { title: "", summary: "", text: "" },
        },
      });

      const content = buildEnrichedLogContent(emptyWebhook, emptyContext);

      expect(content).toContain("CI check");
      expect(content).toContain("failed");
    });

    it("should mark private repositories correctly", () => {
      const webhook = createMockWebhook();
      const context = createMockContext({
        repositoryMetadata: {
          id: 12345,
          name: "private-repo",
          fullName: "owner/private-repo",
          owner: "owner",
          defaultBranch: "main",
          isPrivate: true,
          language: null,
        },
      });
      const content = buildEnrichedLogContent(webhook, context);

      expect(content).toContain("(private)");
    });

    it("should mark public repositories correctly", () => {
      const webhook = createMockWebhook();
      const context = createMockContext();
      const content = buildEnrichedLogContent(webhook, context);

      expect(content).toContain("(public)");
    });

    it("should handle draft PRs", () => {
      const webhook = createMockWebhook();
      const context = createMockContext({
        prMetadata: {
          ...createMockContext().prMetadata!,
          isDraft: true,
        },
      });
      const content = buildEnrichedLogContent(webhook, context);

      expect(content).toContain("(Draft)");
    });

    it("should handle empty labels and reviewers", () => {
      const webhook = createMockWebhook();
      const context = createMockContext({
        prMetadata: {
          ...createMockContext().prMetadata!,
          labels: [],
          reviewers: [],
        },
      });
      const content = buildEnrichedLogContent(webhook, context);

      expect(content).not.toContain("**Labels:**");
      expect(content).not.toContain("**Reviewers:**");
    });

    it("should handle missing job name in workflow timing", () => {
      const webhook = createMockWebhook();
      const context = createMockContext({
        workflowTiming: {
          workflowName: "CI",
          jobName: null,
          startedAt: null,
          completedAt: null,
          durationMs: null,
          conclusion: "failure",
        },
      });
      const content = buildEnrichedLogContent(webhook, context);

      expect(content).not.toContain("**Failed Job:**");
    });

    it("should handle missing duration in workflow timing", () => {
      const webhook = createMockWebhook();
      const context = createMockContext({
        workflowTiming: {
          workflowName: "CI",
          jobName: "build",
          startedAt: null,
          completedAt: null,
          durationMs: null,
          conclusion: "failure",
        },
      });
      const content = buildEnrichedLogContent(webhook, context);

      expect(content).not.toContain("**Duration:**");
    });
  });
});

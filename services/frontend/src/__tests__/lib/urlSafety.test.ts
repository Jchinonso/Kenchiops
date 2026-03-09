import { describe, it, expect } from "vitest";
import { isSafeUrl, isSafeRepoPath, buildSafeGitHubUrl } from "@/lib/urlSafety";

describe("isSafeUrl", () => {
  it("should accept https URLs", () => {
    expect(isSafeUrl("https://github.com/org/repo")).toBe(true);
  });
  it("should accept http URLs", () => {
    expect(isSafeUrl("http://internal.corp/docs")).toBe(true);
  });
  it("should reject javascript: protocol", () => {
    // eslint-disable-next-line no-script-url
    expect(isSafeUrl("javascript:alert(1)")).toBe(false);
  });
  it("should reject JAVASCRIPT: case-insensitive", () => {
    // eslint-disable-next-line no-script-url
    expect(isSafeUrl("JAVASCRIPT:alert(1)")).toBe(false);
  });
  it("should reject data: URIs", () => {
    expect(isSafeUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
  });
  it("should reject vbscript: protocol", () => {
    expect(isSafeUrl("vbscript:MsgBox(1)")).toBe(false);
  });
  it("should reject empty string", () => {
    expect(isSafeUrl("")).toBe(false);
  });
  it("should reject malformed URLs", () => {
    expect(isSafeUrl("not-a-url")).toBe(false);
  });
  it("should reject blob: URIs", () => {
    expect(isSafeUrl("blob:https://example.com/uuid")).toBe(false);
  });
});

describe("isSafeRepoPath", () => {
  it("should accept valid owner/repo", () => {
    expect(isSafeRepoPath("octocat/Hello-World")).toBe(true);
  });
  it("should accept dots and underscores", () => {
    expect(isSafeRepoPath("my-org/my.repo_name")).toBe(true);
  });
  it("should reject path traversal", () => {
    expect(isSafeRepoPath("../../evil.com")).toBe(false);
  });
  it("should reject encoded characters", () => {
    expect(isSafeRepoPath("owner%2Frepo")).toBe(false);
  });
  it("should reject multiple slashes", () => {
    expect(isSafeRepoPath("owner/repo/extra")).toBe(false);
  });
  it("should reject empty string", () => {
    expect(isSafeRepoPath("")).toBe(false);
  });
  it("should reject leading slash", () => {
    expect(isSafeRepoPath("/owner/repo")).toBe(false);
  });
});

describe("buildSafeGitHubUrl", () => {
  it("should build valid GitHub URL", () => {
    expect(buildSafeGitHubUrl("octocat/Hello-World")).toBe(
      "https://github.com/octocat/Hello-World"
    );
  });
  it("should append suffix", () => {
    expect(buildSafeGitHubUrl("octocat/Hello-World", "/commit/abc123")).toBe(
      "https://github.com/octocat/Hello-World/commit/abc123"
    );
  });
  it("should return null for invalid repo path", () => {
    expect(buildSafeGitHubUrl("../../evil")).toBeNull();
  });
  it("should return null for suffix with path traversal", () => {
    expect(buildSafeGitHubUrl("octocat/repo", "/../../../evil.com")).toBeNull();
  });
  it("should return null for suffix with encoded chars", () => {
    expect(buildSafeGitHubUrl("octocat/repo", "/commit/%2e%2e")).toBeNull();
  });
});

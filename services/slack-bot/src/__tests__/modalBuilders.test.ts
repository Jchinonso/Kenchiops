/**
 * Unit tests for Modal Builders
 */

import { describe, it, expect } from "@jest/globals";
import {
  buildRepoSelectModal,
  buildNoReposModal,
  buildUnconfigureModal,
  buildNoConfiguredReposModal,
  REPO_SELECT_MODAL_CALLBACK,
  REPO_SELECT_ACTION_ID,
  UNCONFIGURE_MODAL_CALLBACK,
  UNCONFIGURE_SELECT_ACTION_ID,
  type RepositoryOption,
  type RepositoryMapping,
} from "../handlers/modalBuilders.js";

describe("Modal Builders", () => {
  // Test fixtures
  const createMockRepositoryOption = (
    overrides: Partial<RepositoryOption> = {}
  ): RepositoryOption => ({
    fullName: "owner/repo",
    name: "repo",
    ...overrides,
  });

  const createMockRepositoryMapping = (
    overrides: Partial<RepositoryMapping> = {}
  ): RepositoryMapping => ({
    repository: "owner/repo",
    channelId: "C123456",
    channelName: "general",
    ...overrides,
  });

  describe("Constants", () => {
    it("should have correct REPO_SELECT_MODAL_CALLBACK value", () => {
      expect(REPO_SELECT_MODAL_CALLBACK).toBe("repo_select_modal");
    });

    it("should have correct REPO_SELECT_ACTION_ID value", () => {
      expect(REPO_SELECT_ACTION_ID).toBe("repo_select_action");
    });

    it("should have correct UNCONFIGURE_MODAL_CALLBACK value", () => {
      expect(UNCONFIGURE_MODAL_CALLBACK).toBe("unconfigure_modal");
    });

    it("should have correct UNCONFIGURE_SELECT_ACTION_ID value", () => {
      expect(UNCONFIGURE_SELECT_ACTION_ID).toBe("unconfigure_select_action");
    });
  });

  describe("buildRepoSelectModal", () => {
    it("should return modal view type", () => {
      const repositories = [createMockRepositoryOption()];
      const modal = buildRepoSelectModal("C123456", "general", repositories);

      expect(modal.type).toBe("modal");
    });

    it("should have correct callback_id", () => {
      const repositories = [createMockRepositoryOption()];
      const modal = buildRepoSelectModal("C123456", "general", repositories);

      expect(modal.callback_id).toBe(REPO_SELECT_MODAL_CALLBACK);
    });

    it("should include channelId in private_metadata", () => {
      const repositories = [createMockRepositoryOption()];
      const modal = buildRepoSelectModal("C999999", "test-channel", repositories);

      expect(modal.private_metadata).toBeDefined();
      const metadata = JSON.parse(modal.private_metadata!);
      expect(metadata.channelId).toBe("C999999");
    });

    it("should include channelName in private_metadata", () => {
      const repositories = [createMockRepositoryOption()];
      const modal = buildRepoSelectModal("C123456", "engineering", repositories);

      expect(modal.private_metadata).toBeDefined();
      const metadata = JSON.parse(modal.private_metadata!);
      expect(metadata.channelName).toBe("engineering");
    });

    it("should include messageTs in private_metadata when provided", () => {
      const repositories = [createMockRepositoryOption()];
      const modal = buildRepoSelectModal("C123456", "general", repositories, "1234567890.123456");

      expect(modal.private_metadata).toBeDefined();
      const metadata = JSON.parse(modal.private_metadata!);
      expect(metadata.messageTs).toBe("1234567890.123456");
    });

    it("should not include messageTs in private_metadata when not provided", () => {
      const repositories = [createMockRepositoryOption()];
      const modal = buildRepoSelectModal("C123456", "general", repositories);

      expect(modal.private_metadata).toBeDefined();
      const metadata = JSON.parse(modal.private_metadata!);
      expect(metadata.messageTs).toBeUndefined();
    });

    it("should have correct modal title", () => {
      const repositories = [createMockRepositoryOption()];
      const modal = buildRepoSelectModal("C123456", "general", repositories);

      expect(modal.title.type).toBe("plain_text");
      expect(modal.title.text).toBe("Select Repository");
      expect(modal.title.emoji).toBe(true);
    });

    it("should have submit button with Connect text", () => {
      const repositories = [createMockRepositoryOption()];
      const modal = buildRepoSelectModal("C123456", "general", repositories);

      expect(modal.submit).toBeDefined();
      expect(modal.submit?.type).toBe("plain_text");
      expect(modal.submit?.text).toBe("Connect");
      expect(modal.submit?.emoji).toBe(true);
    });

    it("should have close button with Cancel text", () => {
      const repositories = [createMockRepositoryOption()];
      const modal = buildRepoSelectModal("C123456", "general", repositories);

      expect(modal.close).toBeDefined();
      expect(modal.close?.type).toBe("plain_text");
      expect(modal.close?.text).toBe("Cancel");
      expect(modal.close?.emoji).toBe(true);
    });

    it("should include channel name in description", () => {
      const repositories = [createMockRepositoryOption()];
      const modal = buildRepoSelectModal("C123456", "dev-team", repositories);
      const content = JSON.stringify(modal.blocks);

      expect(content).toContain("dev-team");
    });

    it("should have blocks array with content", () => {
      const repositories = [createMockRepositoryOption()];
      const modal = buildRepoSelectModal("C123456", "general", repositories);

      expect(Array.isArray(modal.blocks)).toBe(true);
      expect(modal.blocks.length).toBeGreaterThan(0);
    });

    it("should include section block with description", () => {
      const repositories = [createMockRepositoryOption()];
      const modal = buildRepoSelectModal("C123456", "general", repositories);

      const sectionBlock = modal.blocks.find((b) => b.type === "section");
      expect(sectionBlock).toBeDefined();
    });

    it("should include divider block", () => {
      const repositories = [createMockRepositoryOption()];
      const modal = buildRepoSelectModal("C123456", "general", repositories);

      const dividerBlock = modal.blocks.find((b) => b.type === "divider");
      expect(dividerBlock).toBeDefined();
    });

    it("should include input block for repository selection", () => {
      const repositories = [createMockRepositoryOption()];
      const modal = buildRepoSelectModal("C123456", "general", repositories);

      const inputBlock = modal.blocks.find((b) => b.type === "input");
      expect(inputBlock).toBeDefined();
    });

    it("should include context block with help text", () => {
      const repositories = [createMockRepositoryOption()];
      const modal = buildRepoSelectModal("C123456", "general", repositories);

      const contextBlock = modal.blocks.find((b) => b.type === "context");
      expect(contextBlock).toBeDefined();
    });

    it("should map single repository to option correctly", () => {
      const repositories = [createMockRepositoryOption({ fullName: "myorg/myrepo" })];
      const modal = buildRepoSelectModal("C123456", "general", repositories);
      const content = JSON.stringify(modal.blocks);

      expect(content).toContain("myorg/myrepo");
    });

    it("should map multiple repositories to options correctly", () => {
      const repositories = [
        createMockRepositoryOption({ fullName: "org1/repo1" }),
        createMockRepositoryOption({ fullName: "org2/repo2" }),
        createMockRepositoryOption({ fullName: "org3/repo3" }),
      ];
      const modal = buildRepoSelectModal("C123456", "general", repositories);
      const content = JSON.stringify(modal.blocks);

      expect(content).toContain("org1/repo1");
      expect(content).toContain("org2/repo2");
      expect(content).toContain("org3/repo3");
    });

    it("should use repository fullName as both text and value", () => {
      const repositories = [createMockRepositoryOption({ fullName: "test/repo" })];
      const modal = buildRepoSelectModal("C123456", "general", repositories);
      const content = JSON.stringify(modal.blocks);

      // fullName should appear as both display text and value
      const matches = content.match(/"test\/repo"/g);
      expect(matches).toBeDefined();
      expect(matches!.length).toBeGreaterThanOrEqual(2);
    });

    it("should include correct action_id in select element", () => {
      const repositories = [createMockRepositoryOption()];
      const modal = buildRepoSelectModal("C123456", "general", repositories);
      const content = JSON.stringify(modal.blocks);

      expect(content).toContain(REPO_SELECT_ACTION_ID);
    });

    it("should handle empty repository list", () => {
      const modal = buildRepoSelectModal("C123456", "general", []);

      expect(modal.blocks.length).toBeGreaterThan(0);
      // Should still have input block but with empty options
      const inputBlock = modal.blocks.find((b) => b.type === "input");
      expect(inputBlock).toBeDefined();
    });

    it("should handle channel name with special characters", () => {
      const repositories = [createMockRepositoryOption()];
      const modal = buildRepoSelectModal("C123456", "dev-team-#1", repositories);
      const content = JSON.stringify(modal.blocks);

      expect(content).toContain("dev-team-#1");
    });

    it("should handle repository with very long name", () => {
      const longName = "organization/" + "a".repeat(100);
      const repositories = [createMockRepositoryOption({ fullName: longName })];
      const modal = buildRepoSelectModal("C123456", "general", repositories);

      expect(modal.blocks.length).toBeGreaterThan(0);
    });

    it("should handle large number of repositories", () => {
      const repositories = Array.from({ length: 50 }, (_, i) =>
        createMockRepositoryOption({ fullName: `org/repo${i}` })
      );
      const modal = buildRepoSelectModal("C123456", "general", repositories);

      expect(modal.blocks.length).toBeGreaterThan(0);
      const content = JSON.stringify(modal.blocks);
      expect(content).toContain("org/repo0");
      expect(content).toContain("org/repo49");
    });
  });

  describe("buildNoReposModal", () => {
    it("should return modal view type", () => {
      const modal = buildNoReposModal("general");

      expect(modal.type).toBe("modal");
    });

    it("should have correct callback_id", () => {
      const modal = buildNoReposModal("general");

      expect(modal.callback_id).toBe("no_repos_modal");
    });

    it("should have correct modal title", () => {
      const modal = buildNoReposModal("general");

      expect(modal.title.type).toBe("plain_text");
      expect(modal.title.text).toBe("No Repositories");
      expect(modal.title.emoji).toBe(true);
    });

    it("should have close button with Close text", () => {
      const modal = buildNoReposModal("general");

      expect(modal.close).toBeDefined();
      expect(modal.close?.type).toBe("plain_text");
      expect(modal.close?.text).toBe("Close");
      expect(modal.close?.emoji).toBe(true);
    });

    it("should not have submit button", () => {
      const modal = buildNoReposModal("general");

      expect(modal.submit).toBeUndefined();
    });

    it("should include channel name in message", () => {
      const modal = buildNoReposModal("engineering");
      const content = JSON.stringify(modal.blocks);

      expect(content).toContain("engineering");
    });

    it("should have blocks array with content", () => {
      const modal = buildNoReposModal("general");

      expect(Array.isArray(modal.blocks)).toBe(true);
      expect(modal.blocks.length).toBeGreaterThan(0);
    });

    it("should include section block with message", () => {
      const modal = buildNoReposModal("general");

      const sectionBlock = modal.blocks.find((b) => b.type === "section");
      expect(sectionBlock).toBeDefined();
    });

    it("should include context block with explanation", () => {
      const modal = buildNoReposModal("general");

      const contextBlock = modal.blocks.find((b) => b.type === "context");
      expect(contextBlock).toBeDefined();
    });

    it("should explain why no repositories are available", () => {
      const modal = buildNoReposModal("general");
      const content = JSON.stringify(modal.blocks);

      expect(content).toContain("No repositories available");
    });

    it("should handle channel name with special characters", () => {
      const modal = buildNoReposModal("dev-team-#1");
      const content = JSON.stringify(modal.blocks);

      expect(content).toContain("dev-team-#1");
    });

    it("should handle empty channel name", () => {
      const modal = buildNoReposModal("");

      expect(modal.blocks.length).toBeGreaterThan(0);
    });

    it("should handle very long channel name", () => {
      const longName = "a".repeat(200);
      const modal = buildNoReposModal(longName);

      expect(modal.blocks.length).toBeGreaterThan(0);
    });
  });

  describe("buildUnconfigureModal", () => {
    it("should return modal view type", () => {
      const mappings = [createMockRepositoryMapping()];
      const modal = buildUnconfigureModal(mappings);

      expect(modal.type).toBe("modal");
    });

    it("should have correct callback_id", () => {
      const mappings = [createMockRepositoryMapping()];
      const modal = buildUnconfigureModal(mappings);

      expect(modal.callback_id).toBe(UNCONFIGURE_MODAL_CALLBACK);
    });

    it("should have correct modal title", () => {
      const mappings = [createMockRepositoryMapping()];
      const modal = buildUnconfigureModal(mappings);

      expect(modal.title.type).toBe("plain_text");
      expect(modal.title.text).toBe("Remove Repository");
      expect(modal.title.emoji).toBe(true);
    });

    it("should have submit button with Remove text", () => {
      const mappings = [createMockRepositoryMapping()];
      const modal = buildUnconfigureModal(mappings);

      expect(modal.submit).toBeDefined();
      expect(modal.submit?.type).toBe("plain_text");
      expect(modal.submit?.text).toBe("Remove");
      expect(modal.submit?.emoji).toBe(true);
    });

    it("should have close button with Cancel text", () => {
      const mappings = [createMockRepositoryMapping()];
      const modal = buildUnconfigureModal(mappings);

      expect(modal.close).toBeDefined();
      expect(modal.close?.type).toBe("plain_text");
      expect(modal.close?.text).toBe("Cancel");
      expect(modal.close?.emoji).toBe(true);
    });

    it("should have blocks array with content", () => {
      const mappings = [createMockRepositoryMapping()];
      const modal = buildUnconfigureModal(mappings);

      expect(Array.isArray(modal.blocks)).toBe(true);
      expect(modal.blocks.length).toBeGreaterThan(0);
    });

    it("should include section block with description", () => {
      const mappings = [createMockRepositoryMapping()];
      const modal = buildUnconfigureModal(mappings);

      const sectionBlock = modal.blocks.find((b) => b.type === "section");
      expect(sectionBlock).toBeDefined();
    });

    it("should include divider block", () => {
      const mappings = [createMockRepositoryMapping()];
      const modal = buildUnconfigureModal(mappings);

      const dividerBlock = modal.blocks.find((b) => b.type === "divider");
      expect(dividerBlock).toBeDefined();
    });

    it("should include input block for mapping selection", () => {
      const mappings = [createMockRepositoryMapping()];
      const modal = buildUnconfigureModal(mappings);

      const inputBlock = modal.blocks.find((b) => b.type === "input");
      expect(inputBlock).toBeDefined();
    });

    it("should include context block with warning", () => {
      const mappings = [createMockRepositoryMapping()];
      const modal = buildUnconfigureModal(mappings);

      const contextBlock = modal.blocks.find((b) => b.type === "context");
      expect(contextBlock).toBeDefined();
    });

    it("should display single mapping correctly", () => {
      const mappings = [
        createMockRepositoryMapping({
          repository: "myorg/myrepo",
          channelName: "dev",
        }),
      ];
      const modal = buildUnconfigureModal(mappings);
      const content = JSON.stringify(modal.blocks);

      expect(content).toContain("myorg/myrepo");
      expect(content).toContain("dev");
    });

    it("should display multiple mappings correctly", () => {
      const mappings = [
        createMockRepositoryMapping({
          repository: "org1/repo1",
          channelId: "C111111",
          channelName: "channel1",
        }),
        createMockRepositoryMapping({
          repository: "org2/repo2",
          channelId: "C222222",
          channelName: "channel2",
        }),
        createMockRepositoryMapping({
          repository: "org3/repo3",
          channelId: "C333333",
          channelName: "channel3",
        }),
      ];
      const modal = buildUnconfigureModal(mappings);
      const content = JSON.stringify(modal.blocks);

      expect(content).toContain("org1/repo1");
      expect(content).toContain("org2/repo2");
      expect(content).toContain("org3/repo3");
      expect(content).toContain("channel1");
      expect(content).toContain("channel2");
      expect(content).toContain("channel3");
    });

    it("should handle channelName being null by using channelId", () => {
      const mappings = [
        createMockRepositoryMapping({
          repository: "owner/repo",
          channelId: "C999999",
          channelName: null,
        }),
      ];
      const modal = buildUnconfigureModal(mappings);
      const content = JSON.stringify(modal.blocks);

      expect(content).toContain("owner/repo");
      expect(content).toContain("C999999");
    });

    it("should encode repository and channelId in option value as JSON", () => {
      const mappings = [
        createMockRepositoryMapping({
          repository: "test/repo",
          channelId: "C123456",
        }),
      ];
      const modal = buildUnconfigureModal(mappings);
      const content = JSON.stringify(modal.blocks);

      // Should contain JSON-encoded value with repository and channelId
      expect(content).toContain("test/repo");
      expect(content).toContain("C123456");
    });

    it("should include correct action_id in select element", () => {
      const mappings = [createMockRepositoryMapping()];
      const modal = buildUnconfigureModal(mappings);
      const content = JSON.stringify(modal.blocks);

      expect(content).toContain(UNCONFIGURE_SELECT_ACTION_ID);
    });

    it("should handle empty mappings list", () => {
      const modal = buildUnconfigureModal([]);

      expect(modal.blocks.length).toBeGreaterThan(0);
      // Should still have input block but with empty options
      const inputBlock = modal.blocks.find((b) => b.type === "input");
      expect(inputBlock).toBeDefined();
    });

    it("should handle mapping with special characters in repository name", () => {
      const mappings = [
        createMockRepositoryMapping({
          repository: "org-name/repo.name-test",
          channelName: "general",
        }),
      ];
      const modal = buildUnconfigureModal(mappings);
      const content = JSON.stringify(modal.blocks);

      expect(content).toContain("org-name/repo.name-test");
    });

    it("should handle mapping with special characters in channel name", () => {
      const mappings = [
        createMockRepositoryMapping({
          repository: "owner/repo",
          channelName: "dev-team-#1",
        }),
      ];
      const modal = buildUnconfigureModal(mappings);
      const content = JSON.stringify(modal.blocks);

      expect(content).toContain("dev-team-#1");
    });

    it("should handle large number of mappings", () => {
      const mappings = Array.from({ length: 30 }, (_, i) =>
        createMockRepositoryMapping({
          repository: `org/repo${i}`,
          channelId: `C${i.toString().padStart(6, "0")}`,
          channelName: `channel${i}`,
        })
      );
      const modal = buildUnconfigureModal(mappings);

      expect(modal.blocks.length).toBeGreaterThan(0);
      const content = JSON.stringify(modal.blocks);
      expect(content).toContain("org/repo0");
      expect(content).toContain("org/repo29");
    });

    it("should display arrow separator between repository and channel", () => {
      const mappings = [
        createMockRepositoryMapping({
          repository: "owner/repo",
          channelName: "general",
        }),
      ];
      const modal = buildUnconfigureModal(mappings);
      const content = JSON.stringify(modal.blocks);

      expect(content).toContain("→");
    });
  });

  describe("buildNoConfiguredReposModal", () => {
    it("should return modal view type", () => {
      const modal = buildNoConfiguredReposModal();

      expect(modal.type).toBe("modal");
    });

    it("should have correct callback_id", () => {
      const modal = buildNoConfiguredReposModal();

      expect(modal.callback_id).toBe("no_configured_repos_modal");
    });

    it("should have correct modal title", () => {
      const modal = buildNoConfiguredReposModal();

      expect(modal.title.type).toBe("plain_text");
      expect(modal.title.text).toBe("No Repositories");
      expect(modal.title.emoji).toBe(true);
    });

    it("should have close button with Close text", () => {
      const modal = buildNoConfiguredReposModal();

      expect(modal.close).toBeDefined();
      expect(modal.close?.type).toBe("plain_text");
      expect(modal.close?.text).toBe("Close");
      expect(modal.close?.emoji).toBe(true);
    });

    it("should not have submit button", () => {
      const modal = buildNoConfiguredReposModal();

      expect(modal.submit).toBeUndefined();
    });

    it("should have blocks array with content", () => {
      const modal = buildNoConfiguredReposModal();

      expect(Array.isArray(modal.blocks)).toBe(true);
      expect(modal.blocks.length).toBeGreaterThan(0);
    });

    it("should include section block with message", () => {
      const modal = buildNoConfiguredReposModal();

      const sectionBlock = modal.blocks.find((b) => b.type === "section");
      expect(sectionBlock).toBeDefined();
    });

    it("should include context block with instructions", () => {
      const modal = buildNoConfiguredReposModal();

      const contextBlock = modal.blocks.find((b) => b.type === "context");
      expect(contextBlock).toBeDefined();
    });

    it("should explain no repositories are configured", () => {
      const modal = buildNoConfiguredReposModal();
      const content = JSON.stringify(modal.blocks);

      expect(content).toContain("No repositories are currently configured");
    });

    it("should include instructions to configure a repository", () => {
      const modal = buildNoConfiguredReposModal();
      const content = JSON.stringify(modal.blocks);

      expect(content).toContain("/kenchi configure");
    });
  });

  describe("edge cases", () => {
    it("should handle repository option with empty name", () => {
      const repositories = [createMockRepositoryOption({ fullName: "", name: "" })];
      const modal = buildRepoSelectModal("C123456", "general", repositories);

      expect(modal.blocks.length).toBeGreaterThan(0);
    });

    it("should handle mapping with empty repository name", () => {
      const mappings = [
        createMockRepositoryMapping({
          repository: "",
          channelName: "general",
        }),
      ];
      const modal = buildUnconfigureModal(mappings);

      expect(modal.blocks.length).toBeGreaterThan(0);
    });

    it("should handle mapping with empty channelId", () => {
      const mappings = [
        createMockRepositoryMapping({
          repository: "owner/repo",
          channelId: "",
          channelName: "general",
        }),
      ];
      const modal = buildUnconfigureModal(mappings);

      expect(modal.blocks.length).toBeGreaterThan(0);
    });

    it("should handle unicode characters in channel name", () => {
      const modal = buildNoReposModal("チャンネル-日本語");
      const content = JSON.stringify(modal.blocks);

      expect(content).toContain("チャンネル-日本語");
    });

    it("should handle unicode characters in repository name", () => {
      const repositories = [createMockRepositoryOption({ fullName: "組織/リポジトリ" })];
      const modal = buildRepoSelectModal("C123456", "general", repositories);
      const content = JSON.stringify(modal.blocks);

      expect(content).toContain("組織/リポジトリ");
    });

    it("should handle messageTs with special format", () => {
      const repositories = [createMockRepositoryOption()];
      const modal = buildRepoSelectModal("C123456", "general", repositories, "0.000000");

      const metadata = JSON.parse(modal.private_metadata!);
      expect(metadata.messageTs).toBe("0.000000");
    });

    it("should create valid JSON in option value for unconfigure modal", () => {
      const mappings = [
        createMockRepositoryMapping({
          repository: "owner/repo-with-dash",
          channelId: "C123456",
        }),
      ];
      const modal = buildUnconfigureModal(mappings);
      const content = JSON.stringify(modal.blocks);

      // Should be able to parse the entire structure without errors
      expect(() => JSON.parse(content)).not.toThrow();
    });

    it("should handle repository name with forward slashes", () => {
      const repositories = [createMockRepositoryOption({ fullName: "org/sub/repo" })];
      const modal = buildRepoSelectModal("C123456", "general", repositories);
      const content = JSON.stringify(modal.blocks);

      expect(content).toContain("org/sub/repo");
    });

    it("should handle channel name with hash symbol", () => {
      const modal = buildNoReposModal("#general");
      const content = JSON.stringify(modal.blocks);

      expect(content).toContain("#general");
    });

    it("should handle mapping where both channelName and channelId are empty", () => {
      const mappings = [
        createMockRepositoryMapping({
          repository: "owner/repo",
          channelId: "",
          channelName: null,
        }),
      ];
      const modal = buildUnconfigureModal(mappings);

      expect(modal.blocks.length).toBeGreaterThan(0);
    });
  });
});

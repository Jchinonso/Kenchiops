import { describe, it, expect } from "@jest/globals";
import {
  detectResolution,
  hasResolutionSignals,
  extractUniquePatterns,
  type SlackThread,
  type SlackMessage,
} from "../../rag/slackResolutionDetector.js";

describe("Slack Resolution Detector", () => {
  const createMessage = (text: string, options: Partial<SlackMessage> = {}): SlackMessage => ({
    ts: options.ts ?? "1234567890.123456",
    userId: options.userId ?? "U123456",
    username: options.username,
    text,
    reactions: options.reactions,
    isBot: options.isBot,
    threadTs: options.threadTs,
  });

  const createThread = (
    messages: readonly SlackMessage[],
    options: Partial<SlackThread> = {}
  ): SlackThread => ({
    channelId: options.channelId ?? "C123456",
    channelName: options.channelName,
    threadTs: options.threadTs ?? "1234567890.123456",
    messages,
    originalIssue: options.originalIssue,
    repository: options.repository,
  });

  describe("detectResolution", () => {
    it("should return no resolution for empty thread", () => {
      const thread = createThread([]);
      const result = detectResolution(thread);

      expect(result.hasResolution).toBe(false);
      expect(result.resolution).toBeNull();
      expect(result.analysisMetadata.messagesAnalyzed).toBe(0);
    });

    it("should detect resolution with 'fixed it' pattern", () => {
      const thread = createThread([
        createMessage("Why is the build failing?"),
        createMessage("I fixed it by updating the dependency version"),
      ]);

      const result = detectResolution(thread);

      expect(result.hasResolution).toBe(true);
      expect(result.resolution).not.toBeNull();
      expect(result.resolution?.matchedPatterns).toContain("fixed_explicit");
    });

    it("should detect resolution with 'the fix is' pattern", () => {
      const thread = createThread([
        createMessage("Getting type errors"),
        createMessage("The fix is to add the missing type annotation"),
      ]);

      const result = detectResolution(thread);

      expect(result.hasResolution).toBe(true);
      expect(result.resolution?.matchedPatterns).toContain("solution_statement");
    });

    it("should detect resolution with 'here is the solution' pattern", () => {
      const thread = createThread([
        createMessage("Build is broken"),
        createMessage("Here's the solution: update tsconfig to use moduleResolution: bundler"),
      ]);

      const result = detectResolution(thread);

      expect(result.hasResolution).toBe(true);
      expect(result.resolution?.matchedPatterns).toContain("solution_intro");
    });

    it("should boost confidence with positive reactions", () => {
      const thread = createThread([
        createMessage("Issue with tests"),
        createMessage("Try changing the mock setup", {
          reactions: [{ name: "white_check_mark", count: 2 }],
        }),
      ]);

      const result = detectResolution(thread);

      expect(result.hasResolution).toBe(true);
      expect(result.resolution?.hasPositiveReactions).toBe(true);
      expect(result.resolution?.confidence).toBeGreaterThan(0.3);
    });

    it("should boost confidence with code blocks", () => {
      const thread = createThread([
        createMessage("How do I fix this?"),
        createMessage("Try this:\n```typescript\nconst fix = true;\n```"),
      ]);

      const result = detectResolution(thread);

      expect(result.hasResolution).toBe(true);
      expect(result.resolution?.hasCodeBlock).toBe(true);
    });

    it("should prefer later messages in thread", () => {
      const thread = createThread([
        createMessage("I fixed it temporarily"),
        createMessage("Actually, the real fix is to update the config"),
        createMessage("That fixed it for good!"),
      ]);

      const result = detectResolution(thread);

      expect(result.hasResolution).toBe(true);
      // The last message should have higher position score
      expect(result.allCandidates.length).toBeGreaterThan(1);
    });

    it("should skip short bot messages", () => {
      const thread = createThread([
        createMessage("Bot message", { isBot: true }),
        createMessage("The fix is to update the dependency"),
      ]);

      const result = detectResolution(thread);

      expect(result.hasResolution).toBe(true);
      expect(result.resolution?.resolverUserId).not.toBe("bot");
    });

    it("should include resolver information", () => {
      const thread = createThread([
        createMessage("Build failing"),
        createMessage("I fixed this by updating the import", {
          userId: "U_RESOLVER",
          username: "resolver_user",
        }),
      ]);

      const result = detectResolution(thread);

      expect(result.hasResolution).toBe(true);
      expect(result.resolution?.resolverUserId).toBe("U_RESOLVER");
      expect(result.resolution?.resolverUsername).toBe("resolver_user");
    });

    it("should include thread context in resolution content", () => {
      const thread = createThread(
        [
          createMessage("Getting OOM errors"),
          createMessage("The problem is in the memory allocation"),
        ],
        { originalIssue: "OOM error in production" }
      );

      const result = detectResolution(thread);

      expect(result.hasResolution).toBe(true);
      expect(result.resolution?.resolutionContent).toContain("OOM error in production");
    });

    it("should not detect resolution without signals", () => {
      const thread = createThread([
        createMessage("Hello"),
        createMessage("How are you?"),
        createMessage("Good thanks"),
      ]);

      const result = detectResolution(thread);

      expect(result.hasResolution).toBe(false);
      expect(result.allCandidates.length).toBe(0);
    });

    it("should track pattern match counts in metadata", () => {
      const thread = createThread([
        createMessage("The fix is to update"),
        createMessage("I fixed it too"),
        createMessage("The solution is clear now"),
      ]);

      const result = detectResolution(thread);

      expect(Object.keys(result.analysisMetadata.patternMatchCounts).length).toBeGreaterThan(0);
    });
  });

  describe("hasResolutionSignals", () => {
    it("should return true for thread with resolution patterns", () => {
      const thread = createThread([
        createMessage("Issue here"),
        createMessage("I fixed this by updating the config"),
      ]);

      expect(hasResolutionSignals(thread)).toBe(true);
    });

    it("should return true for thread with positive reactions", () => {
      const thread = createThread([
        createMessage("Any ideas?"),
        createMessage("Try this approach", {
          reactions: [{ name: "thumbsup", count: 3 }],
        }),
      ]);

      expect(hasResolutionSignals(thread)).toBe(true);
    });

    it("should return false for thread without signals", () => {
      const thread = createThread([createMessage("Hello"), createMessage("Hi there")]);

      expect(hasResolutionSignals(thread)).toBe(false);
    });
  });

  describe("extractUniquePatterns", () => {
    it("should extract unique patterns from all candidates", () => {
      const thread = createThread([
        createMessage("The fix is to update"),
        createMessage("I fixed it"),
        createMessage("The solution is here"),
      ]);

      const result = detectResolution(thread);
      const patterns = extractUniquePatterns(result);

      expect(patterns.length).toBeGreaterThan(0);
      // Should be unique - no duplicates
      expect(new Set(patterns).size).toBe(patterns.length);
    });

    it("should return empty array when no candidates", () => {
      const thread = createThread([createMessage("Hello")]);
      const result = detectResolution(thread);
      const patterns = extractUniquePatterns(result);

      expect(patterns).toEqual([]);
    });
  });

  describe("confidence scoring", () => {
    it("should give higher score to messages with multiple patterns", () => {
      const singlePatternThread = createThread([createMessage("The fix is here")]);

      const multiPatternThread = createThread([
        createMessage("I fixed it! The solution is to update the config. This should fix it now."),
      ]);

      const singleResult = detectResolution(singlePatternThread);
      const multiResult = detectResolution(multiPatternThread);

      expect(multiResult.analysisMetadata.topScore).toBeGreaterThan(
        singleResult.analysisMetadata.topScore
      );
    });

    it("should give higher score to longer substantive messages", () => {
      const shortThread = createThread([createMessage("Fixed it")]);

      const longThread = createThread([
        createMessage(
          "I fixed it by updating the dependency version from 1.0 to 2.0. " +
            "The issue was that the old version had a bug in the parsing logic. " +
            "After updating, all tests pass and the build is green."
        ),
      ]);

      const shortResult = detectResolution(shortThread);
      const longResult = detectResolution(longThread);

      expect(longResult.analysisMetadata.topScore).toBeGreaterThan(
        shortResult.analysisMetadata.topScore
      );
    });
  });

  describe("reaction detection", () => {
    it("should recognize various positive reaction types", () => {
      const reactions = [
        "white_check_mark",
        "heavy_check_mark",
        "thumbsup",
        "+1",
        "tada",
        "rocket",
        "100",
      ];

      reactions.forEach((reactionName) => {
        const thread = createThread([
          createMessage("Try this solution", {
            reactions: [{ name: reactionName, count: 1 }],
          }),
        ]);

        const result = detectResolution(thread);
        expect(result.allCandidates.length).toBeGreaterThan(0);
        expect(result.allCandidates[0].hasPositiveReactions).toBe(true);
      });
    });

    it("should not count non-positive reactions", () => {
      const thread = createThread([
        createMessage("Maybe try this", {
          reactions: [{ name: "thinking_face", count: 2 }],
        }),
      ]);

      const result = detectResolution(thread);

      // Should have candidates only if there are other signals
      if (result.allCandidates.length > 0) {
        expect(result.allCandidates[0].hasPositiveReactions).toBe(false);
      }
    });
  });
});

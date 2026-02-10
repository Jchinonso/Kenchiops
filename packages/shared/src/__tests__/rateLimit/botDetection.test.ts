/**
 * Tests for bot detection module.
 */

import type { Request } from "express";
import {
  createBotDetector,
  defaultBotDetector,
  isBot,
  isSuspiciousBot,
  shouldBlockBot,
} from "../../rateLimit/botDetection.js";

const createMockRequest = (userAgent: string): Request =>
  ({
    headers: { "user-agent": userAgent },
  }) as Request;

describe("BotDetector", () => {
  describe("search engine detection", () => {
    const searchEngines = [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
      "Mozilla/5.0 (compatible; Yahoo! Slurp; http://help.yahoo.com/help/us/ysearch/slurp)",
      "DuckDuckBot/1.0; (+http://duckduckgo.com/duckduckbot.html)",
      "Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)",
      "Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)",
    ];

    it.each(searchEngines)("should detect %s as search engine", (ua) => {
      const detector = createBotDetector();
      const result = detector.check(createMockRequest(ua));

      expect(result.isBot).toBe(true);
      expect(result.botType).toBe("search_engine");
      expect(result.shouldBlock).toBe(false); // Allowed by default
    });

    it("should block search engines when allowSearchEngines is false", () => {
      const detector = createBotDetector({ allowSearchEngines: false });
      const result = detector.check(createMockRequest("Googlebot/2.1"));

      expect(result.isBot).toBe(true);
      expect(result.shouldBlock).toBe(true);
    });
  });

  describe("monitoring bot detection", () => {
    const monitoringBots = [
      "Pingdom.com_bot_version_1.4_(http://www.pingdom.com/)",
      "UptimeRobot/2.0",
      "NewRelicPinger/1.0",
      "Datadog Agent/7.0.0",
    ];

    it.each(monitoringBots)("should detect %s as monitoring bot", (ua) => {
      const detector = createBotDetector();
      const result = detector.check(createMockRequest(ua));

      expect(result.isBot).toBe(true);
      expect(result.botType).toBe("monitoring");
      expect(result.shouldBlock).toBe(false); // Allowed by default
    });

    it("should block monitoring bots when allowMonitoring is false", () => {
      const detector = createBotDetector({ allowMonitoring: false });
      const result = detector.check(createMockRequest("UptimeRobot/2.0"));

      expect(result.isBot).toBe(true);
      expect(result.shouldBlock).toBe(true);
    });
  });

  describe("malicious bot detection", () => {
    const maliciousBots = [
      "python-requests/2.25.1",
      "curl/7.64.1",
      "Wget/1.20.3",
      "Scrapy/2.4.1",
      "Java/1.8.0_281",
      "Go-http-client/1.1",
      "PHP/7.4.3",
    ];

    it.each(maliciousBots)("should detect %s as malicious (signal only by default)", (ua) => {
      const detector = createBotDetector();
      const result = detector.check(createMockRequest(ua));

      // By default, blockMalicious is false (signal-based)
      expect(result.isBot).toBe(false); // Not detected as bot when not blocking
    });

    it("should block malicious bots when blockMalicious is true", () => {
      const detector = createBotDetector({ blockMalicious: true });
      const result = detector.check(createMockRequest("python-requests/2.25.1"));

      expect(result.isBot).toBe(true);
      expect(result.botType).toBe("malicious");
      expect(result.shouldBlock).toBe(true);
    });
  });

  describe("empty User-Agent handling", () => {
    it("should detect empty User-Agent", () => {
      const detector = createBotDetector();
      const result = detector.check(createMockRequest(""));

      expect(result.isBot).toBe(true);
      expect(result.botType).toBe("empty_ua");
      expect(result.shouldBlock).toBe(false); // Not blocked by default
    });

    it("should block empty User-Agent when blockEmptyUA is true", () => {
      const detector = createBotDetector({ blockEmptyUA: true });
      const result = detector.check(createMockRequest(""));

      expect(result.isBot).toBe(true);
      expect(result.shouldBlock).toBe(true);
    });

    it("should handle missing User-Agent header", () => {
      const detector = createBotDetector();
      const req = { headers: {} } as Request;
      const result = detector.check(req);

      expect(result.isBot).toBe(true);
      expect(result.botType).toBe("empty_ua");
    });
  });

  describe("custom patterns", () => {
    it("should block custom blocked patterns", () => {
      const detector = createBotDetector({
        customBlocked: [/MyEvilBot/i, /BadScraper/i],
      });

      const result = detector.check(createMockRequest("MyEvilBot/1.0"));

      expect(result.isBot).toBe(true);
      expect(result.botType).toBe("custom");
      expect(result.shouldBlock).toBe(true);
    });

    it("should classify custom blocked as 'suspicious' not 'malicious'", () => {
      const detector = createBotDetector({
        customBlocked: [/MyCompanyTool/i],
      });

      const result = detector.check(createMockRequest("MyCompanyTool/1.0"));

      // Custom blocked = "suspicious" (safer default than "malicious")
      // Teams may block patterns that aren't actually malicious
      expect(result.category).toBe("suspicious");
    });

    it("should allow custom allowed patterns", () => {
      const detector = createBotDetector({
        customAllowed: [/MyTrustedBot/i],
      });

      const result = detector.check(createMockRequest("MyTrustedBot/1.0"));

      expect(result.isBot).toBe(true);
      expect(result.botType).toBe("custom");
      expect(result.shouldBlock).toBe(false);
    });

    it("should prioritize custom blocked over custom allowed", () => {
      const detector = createBotDetector({
        customBlocked: [/Bot/i],
        customAllowed: [/TrustedBot/i],
      });

      // "TrustedBot" matches both patterns, but blocked takes priority
      const result = detector.check(createMockRequest("TrustedBot/1.0"));

      expect(result.shouldBlock).toBe(true);
    });
  });

  describe("rate multiplier", () => {
    it("should return configured rate multiplier for detected bots", () => {
      const detector = createBotDetector({
        botRateMultiplier: 0.25,
      });

      const result = detector.check(createMockRequest("Googlebot/2.1"));

      expect(result.rateMultiplier).toBe(0.25);
    });

    it("should never return 0 multiplier - use shouldBlock instead", () => {
      const detector = createBotDetector({
        blockMalicious: true,
        botRateMultiplier: 0.5,
      });

      const result = detector.check(createMockRequest("curl/7.64.1"));

      // rateMultiplier is never 0 - use shouldBlock for blocking decisions
      expect(result.rateMultiplier).toBe(0.5);
      expect(result.shouldBlock).toBe(true);
    });

    it("should enforce minimum rate multiplier of 0.1", () => {
      const detector = createBotDetector({
        botRateMultiplier: 0.05, // Below minimum
      });

      const result = detector.check(createMockRequest("Googlebot/2.1"));

      expect(result.rateMultiplier).toBe(0.1); // Clamped to minimum
    });

    it("should return 1 for non-bots", () => {
      const detector = createBotDetector();
      const result = detector.check(
        createMockRequest("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0")
      );

      expect(result.isBot).toBe(false);
      expect(result.rateMultiplier).toBe(1);
    });

    it("should use special multiplier (0.25) for empty UA", () => {
      const detector = createBotDetector();
      const result = detector.check(createMockRequest(""));

      expect(result.rateMultiplier).toBe(0.25);
    });
  });

  describe("category classification", () => {
    it("should return 'allowed' category for search engines", () => {
      const detector = createBotDetector();
      const result = detector.check(createMockRequest("Googlebot/2.1"));

      expect(result.category).toBe("allowed");
    });

    it("should return 'allowed' category for monitoring bots", () => {
      const detector = createBotDetector();
      const result = detector.check(createMockRequest("UptimeRobot/2.0"));

      expect(result.category).toBe("allowed");
    });

    it("should return 'suspicious' category for blocked search engines", () => {
      const detector = createBotDetector({ allowSearchEngines: false });
      const result = detector.check(createMockRequest("Googlebot/2.1"));

      expect(result.category).toBe("suspicious");
    });

    it("should return 'malicious' category for malicious bots", () => {
      const detector = createBotDetector({ blockMalicious: true });
      const result = detector.check(createMockRequest("curl/7.64.1"));

      expect(result.category).toBe("malicious");
    });

    it("should return 'unknown' category for empty UA", () => {
      const detector = createBotDetector();
      const result = detector.check(createMockRequest(""));

      expect(result.category).toBe("unknown");
    });

    it("should return null category for non-bots", () => {
      const detector = createBotDetector();
      const result = detector.check(createMockRequest("Mozilla/5.0 Chrome/91.0"));

      expect(result.category).toBeNull();
    });
  });

  describe("UA sanitization", () => {
    it("should sanitize newlines from userAgent in result", () => {
      const detector = createBotDetector();
      const result = detector.check(createMockRequest("Evil\nBot\r\nWith\rNewlines"));

      expect(result.userAgent).not.toContain("\n");
      expect(result.userAgent).not.toContain("\r");
      expect(result.userAgent).toBe("Evil Bot  With Newlines");
    });

    it("should truncate long userAgent in result", () => {
      const detector = createBotDetector();
      const longUA = "A".repeat(200);
      const result = detector.check(createMockRequest(longUA));

      expect(result.userAgent.length).toBeLessThanOrEqual(100);
    });
  });

  describe("normal browser detection", () => {
    const normalBrowsers = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/91.0.4472.124 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
    ];

    it.each(normalBrowsers)("should not detect %s as bot", (ua) => {
      const detector = createBotDetector();
      const result = detector.check(createMockRequest(ua));

      expect(result.isBot).toBe(false);
      expect(result.botType).toBeNull();
      expect(result.shouldBlock).toBe(false);
      expect(result.rateMultiplier).toBe(1);
    });
  });

  describe("checkUserAgent", () => {
    it("should check User-Agent string directly", () => {
      const detector = createBotDetector();
      const result = detector.checkUserAgent("Googlebot/2.1");

      expect(result.isBot).toBe(true);
      expect(result.botType).toBe("search_engine");
    });
  });

  describe("helper functions", () => {
    beforeEach(() => {
      // Reset to ensure clean state
    });

    describe("isBot", () => {
      it("should return true for known bots", () => {
        expect(isBot("Googlebot/2.1")).toBe(true);
      });

      it("should return false for normal browsers", () => {
        expect(isBot("Mozilla/5.0 Chrome/91.0")).toBe(false);
      });
    });

    describe("shouldBlockBot", () => {
      it("should return false for allowed bots", () => {
        expect(shouldBlockBot("Googlebot/2.1")).toBe(false);
      });

      it("should return false for normal browsers", () => {
        expect(shouldBlockBot("Mozilla/5.0 Chrome/91.0")).toBe(false);
      });
    });

    describe("isSuspiciousBot", () => {
      it("should return false for allowed bots (search engines)", () => {
        // Googlebot is a known allowed bot, not suspicious
        expect(isSuspiciousBot("Googlebot/2.1")).toBe(false);
      });

      it("should return false for allowed bots (monitoring)", () => {
        // UptimeRobot is a known monitoring bot, not suspicious
        expect(isSuspiciousBot("UptimeRobot/2.0")).toBe(false);
      });

      it("should return false for normal browsers", () => {
        expect(isSuspiciousBot("Mozilla/5.0 Chrome/91.0")).toBe(false);
      });

      it("should return false for empty UA (category is 'unknown', not suspicious)", () => {
        // Empty UA is "unknown" category, not "suspicious" or "malicious"
        expect(isSuspiciousBot("")).toBe(false);
      });
    });
  });

  describe("defaultBotDetector", () => {
    it("should be a pre-configured instance", () => {
      const result = defaultBotDetector.checkUserAgent("Googlebot/2.1");

      expect(result).toHaveProperty("isBot");
      expect(result).toHaveProperty("botType");
      expect(result).toHaveProperty("shouldBlock");
    });
  });
});

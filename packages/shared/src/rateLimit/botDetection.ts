/**
 * Bot Detection for Rate Limiting
 *
 * Analyzes User-Agent headers to detect:
 * - Search engine crawlers (allowed by default)
 * - Monitoring bots (allowed by default)
 * - Malicious scrapers (signal-based by default)
 * - Automated tools
 *
 * SECURITY:
 * - UA length capped before regex testing (ReDoS protection)
 * - UA sanitized before logging (no newline injection)
 * - rateMultiplier never 0 (use shouldBlock for blocking)
 * - category field distinguishes good vs bad bots
 *
 * RATE MULTIPLIER SEMANTICS:
 * The rateMultiplier field is intended to multiply the max requests allowed:
 *   effectiveLimit = maxRequests * rateMultiplier
 *
 * Values:
 * - 1.0 = normal rate (non-bots)
 * - 0.5 = half rate (default for detected bots)
 * - 0.25 = quarter rate (empty UA)
 * - 0.1 = minimum (clamped, never 0)
 *
 * For blocking decisions, use shouldBlock instead of rateMultiplier === 0.
 *
 * @module rateLimit/botDetection
 */

import type { Request } from "express";
import { createLogger } from "../core/logger.js";
import {
  BOT_PATTERNS,
  BOT_DETECTION_DEFAULTS,
  type BotDetectionConfig,
  type BotDetectionResult,
  type BotCategory,
} from "./types.js";

const logger = createLogger("bot-detection");

type BotType = BotDetectionResult["botType"];

/** Destructured defaults for cleaner code */
const { MAX_UA_LENGTH, MIN_RATE_MULTIPLIER, EMPTY_UA_RATE_MULTIPLIER } = BOT_DETECTION_DEFAULTS;

/**
 * Sanitizes User-Agent for safe logging.
 * - Truncates to max length
 * - Removes newlines and carriage returns (log injection)
 */
const sanitizeUA = (userAgent: string, maxLength: number = 100): string =>
  userAgent
    .slice(0, maxLength)
    .replace(/[\r\n]/g, " ")
    .trim();

/**
 * Normalizes User-Agent for processing.
 * - Truncates to MAX_UA_LENGTH for regex safety
 */
const normalizeUA = (userAgent: string | undefined): string =>
  (userAgent ?? "").slice(0, MAX_UA_LENGTH);

/**
 * Checks if User-Agent matches any pattern in a list.
 */
const matchesAnyPattern = (userAgent: string, patterns: readonly RegExp[]): boolean =>
  patterns.some((pattern) => pattern.test(userAgent));

/**
 * Maps bot type to category for downstream handling.
 *
 * IMPORTANT: Custom blocked patterns are classified as "suspicious" by default,
 * not "malicious". Teams may block patterns that aren't actually malicious
 * (e.g., internal tools, specific integrations). Reserve "malicious" for
 * known bad actors matching BOT_PATTERNS.MALICIOUS.
 */
const getCategory = (botType: BotType, shouldBlock: boolean): BotCategory | null => {
  if (botType === null) {
    return null;
  }

  switch (botType) {
    case "search_engine":
    case "monitoring":
      return shouldBlock ? "suspicious" : "allowed";
    case "malicious":
      return "malicious";
    case "empty_ua":
    case "unknown":
      return "unknown";
    case "custom":
      // Custom blocked = "suspicious", not "malicious" (safer default)
      return shouldBlock ? "suspicious" : "allowed";
    default:
      return "unknown";
  }
};

/**
 * Bot detector with configurable rules.
 *
 * Detection order:
 * 1. Empty User-Agent check
 * 2. Custom patterns (blocked > allowed)
 * 3. Built-in patterns (malicious > search > monitoring)
 */
export class BotDetector {
  private readonly allowSearchEngines: boolean;
  private readonly allowMonitoring: boolean;
  private readonly blockEmptyUA: boolean;
  private readonly blockMalicious: boolean;
  private readonly customAllowed: RegExp[];
  private readonly customBlocked: RegExp[];
  private readonly botRateMultiplier: number;

  constructor(config: BotDetectionConfig = {}) {
    this.allowSearchEngines =
      config.allowSearchEngines ?? BOT_DETECTION_DEFAULTS.ALLOW_SEARCH_ENGINES;
    this.allowMonitoring = config.allowMonitoring ?? BOT_DETECTION_DEFAULTS.ALLOW_MONITORING;
    this.blockEmptyUA = config.blockEmptyUA ?? BOT_DETECTION_DEFAULTS.BLOCK_EMPTY_UA;
    this.blockMalicious = config.blockMalicious ?? BOT_DETECTION_DEFAULTS.BLOCK_MALICIOUS;
    this.customAllowed = config.customAllowed ?? [];
    this.customBlocked = config.customBlocked ?? [];
    // Clamp to [MIN, 1]: values > 1 would give bots MORE quota (not intended)
    this.botRateMultiplier = Math.min(
      Math.max(
        config.botRateMultiplier ?? BOT_DETECTION_DEFAULTS.BOT_RATE_MULTIPLIER,
        MIN_RATE_MULTIPLIER
      ),
      1
    );
  }

  /**
   * Analyzes a request for bot signatures.
   */
  check(req: Request): BotDetectionResult {
    const rawUA = req.headers["user-agent"];
    return this.analyze(normalizeUA(rawUA));
  }

  /**
   * Analyzes a User-Agent string directly.
   * Preferred over check() when you already have the UA string.
   */
  checkUserAgent(userAgent: string): BotDetectionResult {
    return this.analyze(normalizeUA(userAgent));
  }

  /**
   * Core detection logic operating on normalized UA.
   */
  private analyze(userAgent: string): BotDetectionResult {
    // Empty User-Agent check
    const emptyResult = this.checkEmptyUserAgent(userAgent);
    if (emptyResult) {
      return emptyResult;
    }

    // Custom patterns (highest priority)
    const customResult = this.checkCustomPatterns(userAgent);
    if (customResult) {
      return customResult;
    }

    // Built-in patterns
    const builtInResult = this.checkBuiltInPatterns(userAgent);
    if (builtInResult) {
      return builtInResult;
    }

    // Not detected as bot
    return this.buildNotBotResult(userAgent);
  }

  private checkEmptyUserAgent(userAgent: string): BotDetectionResult | null {
    if (!userAgent || userAgent.trim().length === 0) {
      // Empty UA: heavily throttle, optionally block
      return this.buildResult(userAgent, "empty_ua", this.blockEmptyUA, EMPTY_UA_RATE_MULTIPLIER);
    }
    return null;
  }

  private checkCustomPatterns(userAgent: string): BotDetectionResult | null {
    // Custom blocked (highest priority)
    if (this.customBlocked.length > 0 && matchesAnyPattern(userAgent, this.customBlocked)) {
      this.logBotDetected(userAgent, "custom_blocked");
      return this.buildResult(userAgent, "custom", true);
    }

    // Custom allowed
    if (this.customAllowed.length > 0 && matchesAnyPattern(userAgent, this.customAllowed)) {
      return this.buildResult(userAgent, "custom", false);
    }

    return null;
  }

  private checkBuiltInPatterns(userAgent: string): BotDetectionResult | null {
    // Malicious patterns
    if (this.blockMalicious && matchesAnyPattern(userAgent, BOT_PATTERNS.MALICIOUS)) {
      this.logBotDetected(userAgent, "malicious");
      return this.buildResult(userAgent, "malicious", true);
    }

    // Search engines
    if (matchesAnyPattern(userAgent, BOT_PATTERNS.SEARCH_ENGINES)) {
      const shouldBlock = !this.allowSearchEngines;
      if (shouldBlock) {
        this.logBotDetected(userAgent, "search_engine");
      }
      return this.buildResult(userAgent, "search_engine", shouldBlock);
    }

    // Monitoring bots
    if (matchesAnyPattern(userAgent, BOT_PATTERNS.MONITORING)) {
      const shouldBlock = !this.allowMonitoring;
      if (shouldBlock) {
        this.logBotDetected(userAgent, "monitoring");
      }
      return this.buildResult(userAgent, "monitoring", shouldBlock);
    }

    return null;
  }

  private buildNotBotResult(userAgent: string): BotDetectionResult {
    return {
      isBot: false,
      botType: null,
      category: null,
      shouldBlock: false,
      rateMultiplier: 1,
      userAgent: sanitizeUA(userAgent),
    };
  }

  /**
   * Builds a bot detection result.
   * IMPORTANT: rateMultiplier is never 0. Use shouldBlock for blocking.
   */
  private buildResult(
    userAgent: string,
    botType: BotType,
    shouldBlock: boolean,
    customMultiplier?: number
  ): BotDetectionResult {
    // Never return 0 multiplier - use shouldBlock for blocking decisions
    const multiplier = customMultiplier ?? this.botRateMultiplier;

    return {
      isBot: true,
      botType,
      category: getCategory(botType, shouldBlock),
      shouldBlock,
      // Clamp to [MIN, 1] for consistency (guards against misconfigured defaults)
      rateMultiplier: Math.min(Math.max(multiplier, MIN_RATE_MULTIPLIER), 1),
      userAgent: sanitizeUA(userAgent),
    };
  }

  private logBotDetected(userAgent: string, type: string): void {
    logger.warn("Bot detected", {
      type,
      userAgent: sanitizeUA(userAgent),
    });
  }
}

export const createBotDetector = (config?: BotDetectionConfig): BotDetector =>
  new BotDetector(config);

export const defaultBotDetector = createBotDetector();

/**
 * Quick check if User-Agent is a recognized bot (any type).
 *
 * NOTE: This returns true for BOTH allowed bots (search engines, monitoring)
 * AND suspicious/malicious bots. Use isSuspiciousBot() or shouldBlockBot()
 * if you need to distinguish between allowed and unwanted bots.
 */
export const isBot = (userAgent: string): boolean =>
  defaultBotDetector.checkUserAgent(userAgent).isBot;

/**
 * Quick check if User-Agent is a suspicious or malicious bot.
 *
 * Returns true if category is "suspicious" or "malicious".
 * Unlike isBot(), this excludes allowed bots (search engines, monitoring).
 *
 * Use this for making access control decisions where you want to
 * allow legitimate bots but flag/throttle suspicious ones.
 */
export const isSuspiciousBot = (userAgent: string): boolean => {
  const result = defaultBotDetector.checkUserAgent(userAgent);
  return result.category === "suspicious" || result.category === "malicious";
};

/**
 * Quick check if User-Agent should be blocked.
 */
export const shouldBlockBot = (userAgent: string): boolean =>
  defaultBotDetector.checkUserAgent(userAgent).shouldBlock;

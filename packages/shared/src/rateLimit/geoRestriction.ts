/**
 * Geographic Restriction for Rate Limiting
 *
 * Restricts or adjusts rate limits based on geographic location.
 * Relies on CDN/proxy headers (e.g., Cloudflare CF-IPCountry).
 *
 * SECURITY:
 * - Geo headers are attacker-controlled unless request came from trusted proxy
 * - Use `requireTrustedProxy: true` to treat untrusted requests as unknown country
 * - Multiple geo headers are treated as suspicious (potential header injection)
 * - Country codes are validated (ISO 3166-1 alpha-2 format)
 * - Invalid config throws ValidationError (fail fast)
 *
 * SEMANTIC CONTRACT:
 * - "blocked": isAllowed=false, isRestricted=false → reject request (403)
 * - "restricted": isAllowed=true, isRestricted=true → allow but throttle
 * - "allowed": isAllowed=true, isRestricted=false → normal processing
 *
 * CATEGORY = ACTION (not source):
 * - category reflects what to DO, not why
 * - Use `reasonCode` to determine source (UNKNOWN_*, UNTRUSTED_PROXY, etc.)
 * - Unknown countries map to allowed/blocked/restricted based on config
 *
 * TRUSTED PROXY BEHAVIOR:
 * - When `requireTrustedProxy=true` and proxy isn't trusted, geo header is IGNORED
 * - Request is treated as "unknown country" and follows `unknownCountryAction` policy
 * - This ensures consistent policy enforcement regardless of header trustworthiness
 *
 * RATE MULTIPLIER SEMANTICS (aligned with bot/burst detectors):
 * - rateMultiplier is never 0 (use isAllowed for blocking decisions)
 * - Values < 1 mean stricter limits: effectiveLimit = maxRequests * rateMultiplier
 * - Clamped to [MIN_RATE_MULTIPLIER, 1] in constructor
 *
 * @module rateLimit/geoRestriction
 */

import type { Request } from "express";
import { createLogger } from "../core/logger.js";
import { ValidationError } from "../core/errors.js";
import {
  GEO_RESTRICTION_DEFAULTS,
  type GeoReasonCode,
  type GeoRestrictionConfig,
  type GeoRestrictionResult,
  type GeoBuildResultParams,
  type RequestWithProxyContext,
} from "./types.js";

const logger = createLogger("geo-restriction");

/**
 * Validates and normalizes a country code.
 * Returns null for invalid/missing codes.
 */
const normalizeCountryCode = (code: string | undefined): string | null => {
  if (!code || typeof code !== "string") {
    return null;
  }

  const normalized = code.trim().toUpperCase();
  const isValidLength = normalized.length === GEO_RESTRICTION_DEFAULTS.COUNTRY_CODE_LENGTH;
  const isValidFormat = GEO_RESTRICTION_DEFAULTS.COUNTRY_CODE_PATTERN.test(normalized);

  if (!isValidLength || !isValidFormat) {
    return null;
  }

  return normalized;
};

/**
 * Validates and normalizes country codes in one pass.
 * Returns { normalized: Set of valid codes, invalid: array of invalid codes }.
 */
const validateAndNormalizeCountries = (
  countries: string[]
): { normalized: Set<string>; invalid: string[] } => {
  const normalized = new Set<string>();
  const invalid: string[] = [];

  for (const country of countries) {
    const norm = normalizeCountryCode(country);
    if (norm) {
      normalized.add(norm);
    } else {
      invalid.push(country);
    }
  }

  return { normalized, invalid };
};

/**
 * Builds a result object with consistent structure.
 */
const buildResult = (params: GeoBuildResultParams): GeoRestrictionResult => ({
  countryCode: params.countryCode,
  isAllowed: params.isAllowed,
  isRestricted: params.isRestricted,
  rateMultiplier: params.rateMultiplier,
  category: params.category,
  reasonCode: params.reasonCode,
  reason: params.reason,
});

/**
 * Gets human-readable reason prefix for override reason codes.
 */
const getOverrideReasonPrefix = (code: GeoReasonCode): string => {
  switch (code) {
    case "UNTRUSTED_PROXY":
      return "Geo header ignored (untrusted proxy)";
    case "MULTIPLE_GEO_HEADERS":
      return "Multiple geo headers detected (possible injection)";
    default:
      return "Geo header unavailable";
  }
};

/**
 * Geographic restriction checker.
 *
 * Checks if requests are allowed based on geographic location derived from
 * CDN/proxy headers. Supports both allowlist and blocklist modes.
 *
 * MODE BEHAVIOR:
 * - allowlist: Countries IN list → allowed; others → blocked
 * - blocklist: Countries IN list → blocked; others → allowed
 */
export class GeoRestriction {
  private readonly mode: "allowlist" | "blocklist";
  private readonly countries: Set<string>;
  private readonly countryHeader: string;
  private readonly unknownCountryAction: "allow" | "block" | "rate_limit";
  private readonly restrictedRateMultiplier: number;
  private readonly requireTrustedProxy: boolean;

  constructor(config: GeoRestrictionConfig) {
    this.mode = config.mode;
    this.countryHeader = config.countryHeader ?? GEO_RESTRICTION_DEFAULTS.COUNTRY_HEADER;
    this.unknownCountryAction =
      config.unknownCountryAction ?? GEO_RESTRICTION_DEFAULTS.UNKNOWN_COUNTRY_ACTION;
    this.requireTrustedProxy = config.requireTrustedProxy ?? false;

    // Validate and normalize in one pass
    const { normalized, invalid } = validateAndNormalizeCountries(config.countries);

    // FAIL FAST: Invalid country codes
    if (invalid.length > 0) {
      const suffix = invalid.length > 5 ? ` (and ${invalid.length - 5} more)` : "";
      throw new ValidationError(
        `Invalid country codes in geo restriction config: ${invalid.slice(0, 5).join(", ")}${suffix}`,
        { metadata: { invalidCodes: invalid.slice(0, 10), totalInvalid: invalid.length } }
      );
    }

    // FAIL FAST: Allowlist mode with empty list is likely misconfiguration
    if (config.mode === "allowlist" && config.countries.length === 0) {
      throw new ValidationError("Allowlist mode requires at least one country code", {
        metadata: { mode: config.mode },
      });
    }

    // Validate country count
    if (config.countries.length > GEO_RESTRICTION_DEFAULTS.MAX_COUNTRIES) {
      throw new ValidationError(
        `Country list exceeds maximum of ${GEO_RESTRICTION_DEFAULTS.MAX_COUNTRIES}`,
        {
          metadata: {
            provided: config.countries.length,
            max: GEO_RESTRICTION_DEFAULTS.MAX_COUNTRIES,
          },
        }
      );
    }

    this.countries = normalized;

    // Clamp rateMultiplier to [MIN, 1] - never 0, never > 1
    const rawMultiplier =
      config.restrictedRateMultiplier ?? GEO_RESTRICTION_DEFAULTS.RESTRICTED_RATE_MULTIPLIER;
    this.restrictedRateMultiplier = Math.min(
      Math.max(rawMultiplier, GEO_RESTRICTION_DEFAULTS.MIN_RATE_MULTIPLIER),
      1
    );

    // Warn if multiplier was clamped
    if (rawMultiplier !== this.restrictedRateMultiplier) {
      logger.warn("Restricted rate multiplier clamped", {
        provided: rawMultiplier,
        clamped: this.restrictedRateMultiplier,
        min: GEO_RESTRICTION_DEFAULTS.MIN_RATE_MULTIPLIER,
        max: 1,
      });
    }

    logger.debug("GeoRestriction initialized", {
      mode: this.mode,
      countryCount: this.countries.size,
      countryHeader: this.countryHeader,
      unknownCountryAction: this.unknownCountryAction,
      restrictedRateMultiplier: this.restrictedRateMultiplier,
      requireTrustedProxy: this.requireTrustedProxy,
    });
  }

  /**
   * Checks if request is allowed based on geographic location.
   */
  check(req: RequestWithProxyContext): GeoRestrictionResult {
    // SECURITY: If trusted proxy required but not confirmed, treat as unknown country
    // This ensures consistent policy enforcement via unknownCountryAction
    if (this.requireTrustedProxy && req.context?.isTrustedProxy !== true) {
      logger.debug("Untrusted proxy - treating as unknown country", {
        header: this.countryHeader,
        isTrustedProxy: req.context?.isTrustedProxy,
        unknownCountryAction: this.unknownCountryAction,
      });

      return this.handleUnknownCountry("UNTRUSTED_PROXY");
    }

    const headerValue = req.headers[this.countryHeader.toLowerCase()];

    // SECURITY: Multiple geo headers is suspicious (potential header injection)
    // Log as warn since this is a security signal
    if (Array.isArray(headerValue) && headerValue.length > 1) {
      logger.warn("Multiple geo headers detected - possible injection attempt", {
        header: this.countryHeader,
        count: headerValue.length,
      });
      return this.handleUnknownCountry("MULTIPLE_GEO_HEADERS");
    }

    const rawCode = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    const countryCode = normalizeCountryCode(rawCode);

    // Handle unknown country
    if (!countryCode) {
      return this.handleUnknownCountry(null);
    }

    const isInList = this.countries.has(countryCode);

    // Allowlist mode: in list = allowed, not in list = BLOCKED
    if (this.mode === "allowlist") {
      if (isInList) {
        return buildResult({
          countryCode,
          isAllowed: true,
          isRestricted: false,
          rateMultiplier: 1,
          category: "allowed",
          reasonCode: "ALLOWLIST_MATCH",
          reason: `Country ${countryCode} is in allowlist`,
        });
      }

      // Not in allowlist = BLOCKED
      this.logBlockedDecision(countryCode, "ALLOWLIST_MISS");
      return buildResult({
        countryCode,
        isAllowed: false,
        isRestricted: false,
        rateMultiplier: GEO_RESTRICTION_DEFAULTS.MIN_RATE_MULTIPLIER,
        category: "blocked",
        reasonCode: "ALLOWLIST_MISS",
        reason: `Country ${countryCode} is not in allowlist`,
      });
    }

    // Blocklist mode: in list = BLOCKED, not in list = allowed
    if (isInList) {
      this.logBlockedDecision(countryCode, "BLOCKLIST_MATCH");
      return buildResult({
        countryCode,
        isAllowed: false,
        isRestricted: false,
        rateMultiplier: GEO_RESTRICTION_DEFAULTS.MIN_RATE_MULTIPLIER,
        category: "blocked",
        reasonCode: "BLOCKLIST_MATCH",
        reason: `Country ${countryCode} is in blocklist`,
      });
    }

    // Not in blocklist = allowed
    return buildResult({
      countryCode,
      isAllowed: true,
      isRestricted: false,
      rateMultiplier: 1,
      category: "allowed",
      reasonCode: "BLOCKLIST_MISS",
      reason: `Country ${countryCode} is not in blocklist`,
    });
  }

  /**
   * Handles unknown country based on unknownCountryAction config.
   * @param reasonOverride - Override reason code (e.g., UNTRUSTED_PROXY, MULTIPLE_GEO_HEADERS)
   */
  private handleUnknownCountry(reasonOverride: GeoReasonCode | null): GeoRestrictionResult {
    const action = this.unknownCountryAction;
    const reasonPrefix = reasonOverride ? getOverrideReasonPrefix(reasonOverride) : null;

    if (action === "block") {
      const reasonCode: GeoReasonCode = reasonOverride ?? "UNKNOWN_BLOCKED";
      const reason = reasonPrefix
        ? `${reasonPrefix}, blocking per unknownCountryAction`
        : "Country unknown and unknownCountryAction is 'block'";

      this.logBlockedDecision(null, reasonCode);
      return buildResult({
        countryCode: null,
        isAllowed: false,
        isRestricted: false,
        rateMultiplier: GEO_RESTRICTION_DEFAULTS.MIN_RATE_MULTIPLIER,
        category: "blocked",
        reasonCode,
        reason,
      });
    }

    if (action === "rate_limit") {
      const reasonCode: GeoReasonCode = reasonOverride ?? "UNKNOWN_RESTRICTED";
      const reason = reasonPrefix
        ? `${reasonPrefix}, throttling per unknownCountryAction`
        : "Country unknown, applying rate limit throttling";

      return buildResult({
        countryCode: null,
        isAllowed: true,
        isRestricted: true,
        rateMultiplier: this.restrictedRateMultiplier,
        category: "restricted",
        reasonCode,
        reason,
      });
    }

    // Default: allow with normal rate
    const reasonCode: GeoReasonCode = reasonOverride ?? "UNKNOWN_ALLOWED";
    const reason = reasonPrefix
      ? `${reasonPrefix}, allowing per unknownCountryAction`
      : "Country unknown, allowing with normal rate";

    return buildResult({
      countryCode: null,
      isAllowed: true,
      isRestricted: false,
      rateMultiplier: 1,
      category: "allowed",
      reasonCode,
      reason,
    });
  }

  /**
   * Logs blocked decisions as warnings (security signal).
   */
  private logBlockedDecision(countryCode: string | null, reasonCode: GeoReasonCode): void {
    logger.warn("Geo restriction blocked", {
      countryCode,
      mode: this.mode,
      reasonCode,
    });
  }

  /**
   * Checks if a country code is in the configured list.
   */
  isCountryInList(countryCode: string): boolean {
    const normalized = normalizeCountryCode(countryCode);
    return normalized !== null && this.countries.has(normalized);
  }

  /**
   * Gets the configured countries.
   */
  getCountries(): string[] {
    return Array.from(this.countries);
  }

  /**
   * Gets the configured mode.
   */
  getMode(): "allowlist" | "blocklist" {
    return this.mode;
  }

  /**
   * Gets the configured rate multiplier for restricted regions.
   */
  getRestrictedRateMultiplier(): number {
    return this.restrictedRateMultiplier;
  }
}

/**
 * Creates a geo restriction checker with allowlist mode.
 * Only countries in the list are allowed; others are BLOCKED.
 *
 * @throws ValidationError if countries list is empty or contains invalid codes
 */
export const createGeoAllowlist = (
  countries: string[],
  options?: Partial<Omit<GeoRestrictionConfig, "mode" | "countries">>
): GeoRestriction =>
  new GeoRestriction({
    mode: "allowlist",
    countries,
    ...options,
  });

/**
 * Creates a geo restriction checker with blocklist mode.
 * Countries in the list are BLOCKED; others are allowed.
 *
 * @throws ValidationError if countries list contains invalid codes
 */
export const createGeoBlocklist = (
  countries: string[],
  options?: Partial<Omit<GeoRestrictionConfig, "mode" | "countries">>
): GeoRestriction =>
  new GeoRestriction({
    mode: "blocklist",
    countries,
    ...options,
  });

/**
 * Extracts and validates country code from request header.
 *
 * WARNING: This does NOT respect trusted proxy policy.
 * Use `getCountryCodeTrusted` for security-sensitive contexts.
 */
export const getCountryCode = (
  req: Request,
  header: string = GEO_RESTRICTION_DEFAULTS.COUNTRY_HEADER
): string | null => {
  const headerValue = req.headers[header.toLowerCase()];
  // Treat multiple headers as invalid (return null)
  if (Array.isArray(headerValue) && headerValue.length > 1) {
    return null;
  }
  const rawCode = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  return normalizeCountryCode(rawCode);
};

/**
 * Extracts country code from request, respecting trusted proxy policy.
 *
 * Returns null if:
 * - Proxy is not trusted (when requireTrustedProxy is true)
 * - Multiple geo headers detected (suspicious)
 * - Header missing or invalid
 *
 * Use this for security-sensitive geo decisions outside the main checker.
 */
export const getCountryCodeTrusted = (
  req: RequestWithProxyContext,
  options: {
    header?: string;
    requireTrustedProxy?: boolean;
  } = {}
): string | null => {
  const { header = GEO_RESTRICTION_DEFAULTS.COUNTRY_HEADER, requireTrustedProxy = true } = options;

  // If trusted proxy required but not confirmed, don't trust the header
  if (requireTrustedProxy && req.context?.isTrustedProxy !== true) {
    return null;
  }

  return getCountryCode(req, header);
};

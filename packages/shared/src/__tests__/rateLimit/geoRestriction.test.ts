/**
 * Tests for geo restriction module.
 */

import type { Request } from "express";
import {
  createGeoAllowlist,
  createGeoBlocklist,
  getCountryCode,
} from "../../rateLimit/geoRestriction.js";
import { GEO_RESTRICTION_DEFAULTS } from "../../rateLimit/types.js";

const createMockRequest = (countryCode?: string, header?: string): Request =>
  ({
    headers: countryCode
      ? { [header ?? GEO_RESTRICTION_DEFAULTS.COUNTRY_HEADER.toLowerCase()]: countryCode }
      : {},
  }) as Request;

describe("GeoRestriction", () => {
  describe("allowlist mode", () => {
    const allowedCountries = ["US", "CA", "GB"];

    it("should allow requests from allowed countries", () => {
      const restriction = createGeoAllowlist(allowedCountries);
      const result = restriction.check(createMockRequest("US"));

      expect(result.isAllowed).toBe(true);
      expect(result.isRestricted).toBe(false);
      expect(result.countryCode).toBe("US");
      expect(result.rateMultiplier).toBe(1);
    });

    it("should block requests from non-allowed countries", () => {
      const restriction = createGeoAllowlist(allowedCountries);
      const result = restriction.check(createMockRequest("RU"));

      expect(result.isAllowed).toBe(false);
      expect(result.isRestricted).toBe(false);
      expect(result.countryCode).toBe("RU");
      expect(result.category).toBe("blocked");
    });

    it("should use MIN_RATE_MULTIPLIER for blocked countries", () => {
      const restriction = createGeoAllowlist(allowedCountries, {
        restrictedRateMultiplier: 0.25,
      });
      const result = restriction.check(createMockRequest("CN"));

      expect(result.isAllowed).toBe(false);
      expect(result.isRestricted).toBe(false);
      expect(result.rateMultiplier).toBe(GEO_RESTRICTION_DEFAULTS.MIN_RATE_MULTIPLIER);
      expect(result.category).toBe("blocked");
    });

    it.each(["us", "Us", "uS"])("should normalize country codes to uppercase (%s)", (code) => {
      const restriction = createGeoAllowlist(allowedCountries);
      const result = restriction.check(createMockRequest(code));

      expect(result.isAllowed).toBe(true);
      expect(result.countryCode).toBe("US");
    });
  });

  describe("blocklist mode", () => {
    const blockedCountries = ["RU", "CN", "KP"];

    it("should block requests from blocked countries", () => {
      const restriction = createGeoBlocklist(blockedCountries);
      const result = restriction.check(createMockRequest("RU"));

      expect(result.isAllowed).toBe(false);
      expect(result.isRestricted).toBe(false);
      expect(result.countryCode).toBe("RU");
      expect(result.category).toBe("blocked");
    });

    it("should allow requests from non-blocked countries", () => {
      const restriction = createGeoBlocklist(blockedCountries);
      const result = restriction.check(createMockRequest("US"));

      expect(result.isAllowed).toBe(true);
      expect(result.isRestricted).toBe(false);
    });
  });

  describe("unknown country handling", () => {
    const countries = ["US"];

    it("should allow unknown country by default", () => {
      const restriction = createGeoAllowlist(countries);
      const result = restriction.check(createMockRequest());

      expect(result.countryCode).toBeNull();
      expect(result.isAllowed).toBe(true);
      expect(result.isRestricted).toBe(false);
      expect(result.rateMultiplier).toBe(1);
    });

    it("should block unknown country when configured", () => {
      const restriction = createGeoAllowlist(countries, {
        unknownCountryAction: "block",
      });
      const result = restriction.check(createMockRequest());

      expect(result.countryCode).toBeNull();
      expect(result.isAllowed).toBe(false);
      expect(result.isRestricted).toBe(false);
      expect(result.rateMultiplier).toBe(GEO_RESTRICTION_DEFAULTS.MIN_RATE_MULTIPLIER);
      expect(result.category).toBe("blocked");
    });

    it("should rate limit unknown country when configured", () => {
      const restriction = createGeoAllowlist(countries, {
        unknownCountryAction: "rate_limit",
        restrictedRateMultiplier: 0.5,
      });
      const result = restriction.check(createMockRequest());

      expect(result.countryCode).toBeNull();
      expect(result.isAllowed).toBe(true);
      expect(result.isRestricted).toBe(true);
      expect(result.rateMultiplier).toBe(0.5);
    });
  });

  describe("custom country header", () => {
    it("should use custom header", () => {
      const restriction = createGeoAllowlist(["US"], {
        countryHeader: "X-Custom-Country",
      });
      const result = restriction.check(createMockRequest("US", "x-custom-country"));

      expect(result.isAllowed).toBe(true);
      expect(result.countryCode).toBe("US");
    });
  });

  describe("invalid country codes", () => {
    const restriction = createGeoAllowlist(["US"]);

    it.each(["A", "ABC", "12", "U1", ""])(
      "should treat invalid country code %s as unknown",
      (code) => {
        const result = restriction.check(createMockRequest(code || undefined));

        expect(result.countryCode).toBeNull();
      }
    );

    it("should treat multiple geo headers as suspicious and return null country", () => {
      const req = {
        headers: { "cf-ipcountry": ["US", "CA"] },
      } as unknown as Request;

      const result = restriction.check(req);
      expect(result.countryCode).toBeNull();
      expect(result.isAllowed).toBe(true);
      expect(result.rateMultiplier).toBe(1);
    });
  });

  describe("isCountryInList", () => {
    it("should return true for countries in list", () => {
      const restriction = createGeoAllowlist(["US", "CA"]);

      expect(restriction.isCountryInList("US")).toBe(true);
      expect(restriction.isCountryInList("us")).toBe(true);
    });

    it("should return false for countries not in list", () => {
      const restriction = createGeoAllowlist(["US", "CA"]);

      expect(restriction.isCountryInList("GB")).toBe(false);
    });
  });

  describe("getCountries", () => {
    it("should return configured countries", () => {
      const restriction = createGeoAllowlist(["us", "ca", "gb"]);
      const countries = restriction.getCountries();

      expect(countries).toHaveLength(3);
      expect(countries).toContain("US");
      expect(countries).toContain("CA");
      expect(countries).toContain("GB");
    });
  });

  describe("getCountryCode helper", () => {
    it("should extract country code from request", () => {
      const req = createMockRequest("US");
      expect(getCountryCode(req)).toBe("US");
    });

    it("should use custom header", () => {
      const req = createMockRequest("CA", "x-custom-country");
      expect(getCountryCode(req, "X-Custom-Country")).toBe("CA");
    });

    it("should return null for missing header", () => {
      const req = createMockRequest();
      expect(getCountryCode(req)).toBeNull();
    });
  });
});

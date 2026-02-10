/**
 * Tests for rate limiting security utilities.
 */

import type { Request } from "express";
import {
  isValidIPv4,
  isValidIPv6,
  getIPVersion,
  isPrivateIP,
  validateIP,
  getClientIP,
  createRequestFingerprint,
  sanitizeIdentity,
  extractIdentity,
  secureKeyGenerator,
  createKeyGenerator,
} from "../../rateLimit/security.js";

const createMockRequest = (
  overrides: Partial<{
    ip: string;
    headers: Record<string, string | string[] | undefined>;
    path: string;
    socket: { remoteAddress?: string };
    context: { tenantId?: string; userId?: string; installationId?: string };
  }> = {}
): Request =>
  ({
    ip: overrides.ip,
    headers: overrides.headers ?? {},
    path: overrides.path ?? "/test",
    socket: overrides.socket ?? {},
    context: overrides.context,
  }) as unknown as Request;

describe("IP Validation", () => {
  describe("isValidIPv4", () => {
    it.each(["192.168.1.1", "10.0.0.1", "255.255.255.255", "0.0.0.0", "8.8.8.8"])(
      "should validate %s as IPv4",
      (ip) => {
        expect(isValidIPv4(ip)).toBe(true);
      }
    );

    it.each(["256.1.1.1", "1.1.1", "1.1.1.1.1", "abc.def.ghi.jkl", "", "::1"])(
      "should reject %s as invalid IPv4",
      (ip) => {
        expect(isValidIPv4(ip)).toBe(false);
      }
    );
  });

  describe("isValidIPv6", () => {
    it.each([
      "::1",
      "2001:db8::1",
      "fe80::1",
      "2001:0db8:0000:0000:0000:0000:0000:0001", // Full form with leading zeros
      "2001:db8:85a3::8a2e:370:7334",
    ])("should validate %s as IPv6", (ip) => {
      expect(isValidIPv6(ip)).toBe(true);
    });

    it.each([
      "192.168.1.1",
      "not-an-ip",
      "",
      ":::1", // Invalid triple colon
    ])("should reject %s as invalid IPv6", (ip) => {
      expect(isValidIPv6(ip)).toBe(false);
    });

    it("should handle zone identifiers", () => {
      // Zone identifiers are stripped before validation
      expect(isValidIPv6("fe80::1%eth0")).toBe(true);
    });

    it("should normalize IPv4-mapped addresses to IPv4", () => {
      // IPv4-mapped IPv6 addresses are normalized to IPv4 for consistency with validateIP
      expect(isValidIPv6("::ffff:192.0.2.128")).toBe(false);
      expect(isValidIPv4("::ffff:192.0.2.128")).toBe(true);
    });
  });

  describe("getIPVersion", () => {
    it("should return 4 for IPv4", () => {
      expect(getIPVersion("192.168.1.1")).toBe(4);
    });

    it("should return 6 for IPv6", () => {
      expect(getIPVersion("::1")).toBe(6);
    });

    it("should return 0 for invalid", () => {
      expect(getIPVersion("not-an-ip")).toBe(0);
    });
  });

  describe("isPrivateIP", () => {
    it.each([
      "127.0.0.1",
      "10.0.0.1",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "::1",
      "fc00::1",
      "fd00::1", // IPv6 ULA (commonly used)
      "fdab:cdef:1234::1", // IPv6 ULA with varied prefix
      "fe80::1",
      "FE80::1", // Case insensitive
    ])("should detect %s as private", (ip) => {
      expect(isPrivateIP(ip)).toBe(true);
    });

    it.each(["8.8.8.8", "1.1.1.1", "2001:db8::1"])("should detect %s as public", (ip) => {
      expect(isPrivateIP(ip)).toBe(false);
    });
  });

  describe("validateIP", () => {
    it("should return valid public IP", () => {
      expect(validateIP("8.8.8.8")).toBe("8.8.8.8");
    });

    it("should return null for private IP by default", () => {
      expect(validateIP("192.168.1.1")).toBeNull();
    });

    it("should return private IP when rejectPrivate is false", () => {
      expect(validateIP("192.168.1.1", false)).toBe("192.168.1.1");
    });

    it("should return null for invalid IP", () => {
      expect(validateIP("not-an-ip")).toBeNull();
    });

    it("should return null for undefined", () => {
      expect(validateIP(undefined)).toBeNull();
    });

    it("should strip zone identifier and return normalized IP", () => {
      // Zone identifiers should be stripped from the returned IP
      expect(validateIP("fe80::1%eth0", false)).toBe("fe80::1");
      expect(validateIP("fe80::1%en0", false)).toBe("fe80::1");
    });

    it("should check private status on normalized IP", () => {
      // fe80::1 is a link-local (private) IPv6, even with zone identifier
      expect(validateIP("fe80::1%eth0")).toBeNull();
      expect(validateIP("fe80::1%eth0", false)).toBe("fe80::1");
    });
  });
});

describe("getClientIP", () => {
  it("should prefer pre-validated clientIP", () => {
    const req = createMockRequest({ ip: "1.1.1.1" });
    const result = getClientIP(req, { clientIP: "8.8.8.8" });
    expect(result).toBe("8.8.8.8");
  });

  it("should fall back to req.ip", () => {
    const req = createMockRequest({ ip: "8.8.8.8" });
    const result = getClientIP(req);
    expect(result).toBe("8.8.8.8");
  });

  it("should use socket remoteAddress when useSocketAddress is true", () => {
    const req = createMockRequest({
      ip: undefined,
      socket: { remoteAddress: "8.8.8.8" },
    });
    const result = getClientIP(req, { useSocketAddress: true });
    expect(result).toBe("8.8.8.8");
  });

  it("should strip IPv4-mapped IPv6 prefix from socket address", () => {
    const req = createMockRequest({
      ip: undefined,
      socket: { remoteAddress: "::ffff:8.8.8.8" },
    });
    const result = getClientIP(req, { useSocketAddress: true });
    expect(result).toBe("8.8.8.8");
  });

  it("should return null for private IP by default", () => {
    const req = createMockRequest({ ip: "192.168.1.1" });
    const result = getClientIP(req);
    expect(result).toBeNull();
  });

  it("should return private IP when rejectPrivateIP is false", () => {
    const req = createMockRequest({ ip: "192.168.1.1" });
    const result = getClientIP(req, { rejectPrivateIP: false });
    expect(result).toBe("192.168.1.1");
  });
});

describe("createRequestFingerprint", () => {
  it("should create fingerprint from headers", () => {
    const req = createMockRequest({
      headers: {
        "user-agent": "Mozilla/5.0",
        "accept-language": "en-US",
      },
    });
    const result = createRequestFingerprint(req);
    expect(result).toMatch(/^fp:[a-f0-9]{32}$/);
  });

  it("should return consistent fingerprint for same headers", () => {
    const headers = {
      "user-agent": "Mozilla/5.0",
      "accept-language": "en-US",
    };
    const req1 = createMockRequest({ headers });
    const req2 = createMockRequest({ headers });

    const fp1 = createRequestFingerprint(req1);
    const fp2 = createRequestFingerprint(req2);

    expect(fp1).toBe(fp2);
  });

  it("should return different fingerprint for different headers", () => {
    const req1 = createMockRequest({
      headers: { "user-agent": "Mozilla/5.0" },
    });
    const req2 = createMockRequest({
      headers: { "user-agent": "Chrome/91.0" },
    });

    const fp1 = createRequestFingerprint(req1);
    const fp2 = createRequestFingerprint(req2);

    expect(fp1).not.toBe(fp2);
  });

  it("should return shared bucket for requests with no headers", () => {
    const req = createMockRequest({ headers: {} });
    const result = createRequestFingerprint(req);
    expect(result).toBe("fp:unknown");
  });

  it("should return shared bucket consistently (no random entropy)", () => {
    const req1 = createMockRequest({ headers: {} });
    const req2 = createMockRequest({ headers: {} });

    const fp1 = createRequestFingerprint(req1);
    const fp2 = createRequestFingerprint(req2);

    expect(fp1).toBe(fp2);
    expect(fp1).toBe("fp:unknown");
  });
});

describe("sanitizeIdentity", () => {
  it("should return sanitized lowercase value", () => {
    expect(sanitizeIdentity("ABC123")).toBe("abc123");
  });

  it("should allow alphanumeric, dashes, and underscores", () => {
    expect(sanitizeIdentity("tenant-123_abc")).toBe("tenant-123_abc");
  });

  it("should return null for invalid characters", () => {
    expect(sanitizeIdentity("tenant@123")).toBeNull();
    expect(sanitizeIdentity("tenant;DROP TABLE")).toBeNull();
  });

  it("should return null for empty string", () => {
    expect(sanitizeIdentity("")).toBeNull();
  });

  it("should return null for non-string", () => {
    expect(sanitizeIdentity(undefined)).toBeNull();
    expect(sanitizeIdentity(["array"])).toBeNull();
  });

  it("should truncate long values", () => {
    const longValue = "a".repeat(200);
    const result = sanitizeIdentity(longValue);
    expect(result).not.toBeNull();
    expect(result!.length).toBeLessThan(200);
  });
});

describe("extractIdentity", () => {
  it("should prefer context.tenantId over headers", () => {
    const req = createMockRequest({
      context: { tenantId: "context-tenant" },
      headers: { "x-tenant-id": "header-tenant" },
    });
    expect(extractIdentity(req)).toBe("tenant:context-tenant");
  });

  it("should prefer context.userId when tenantId is missing", () => {
    const req = createMockRequest({
      context: { userId: "user-123" },
      headers: { "x-tenant-id": "header-tenant" },
    });
    expect(extractIdentity(req)).toBe("user:user-123");
  });

  it("should fall back to headers when context is empty", () => {
    const req = createMockRequest({
      headers: { "x-tenant-id": "header-tenant" },
    });
    expect(extractIdentity(req)).toBe("tenant:header-tenant");
  });

  it("should try identity headers in priority order", () => {
    const req1 = createMockRequest({
      headers: { "x-installation-id": "install-123" },
    });
    expect(extractIdentity(req1)).toBe("install:install-123");

    const req2 = createMockRequest({
      headers: { "x-client-id": "client-456" },
    });
    expect(extractIdentity(req2)).toBe("client:client-456");
  });

  it("should return null when no identity available", () => {
    const req = createMockRequest({});
    expect(extractIdentity(req)).toBeNull();
  });
});

describe("secureKeyGenerator", () => {
  it("should generate key with identity and IP", () => {
    const req = createMockRequest({
      ip: "8.8.8.8",
      context: { tenantId: "tenant-123" },
    });
    const key = secureKeyGenerator(req);
    expect(key).toBe("tenant:tenant-123|ip:8.8.8.8");
  });

  it("should generate key with identity and fingerprint when IP invalid", () => {
    const req = createMockRequest({
      ip: "192.168.1.1", // Private IP, rejected by default
      context: { tenantId: "tenant-123" },
      headers: { "user-agent": "Mozilla/5.0" },
    });
    const key = secureKeyGenerator(req);
    expect(key).toMatch(/^tenant:tenant-123\|fp:[a-f0-9]{32}$/);
  });

  it("should generate key with IP only when no identity", () => {
    const req = createMockRequest({
      ip: "8.8.8.8",
    });
    const key = secureKeyGenerator(req);
    expect(key).toBe("ip:8.8.8.8");
  });

  it("should generate fingerprint key when no IP or identity", () => {
    const req = createMockRequest({
      headers: { "user-agent": "Mozilla/5.0" },
    });
    const key = secureKeyGenerator(req);
    expect(key).toMatch(/^fp:[a-f0-9]{32}$/);
  });

  it("should generate unknown bucket key for minimal requests", () => {
    const req = createMockRequest({});
    const key = secureKeyGenerator(req);
    expect(key).toBe("fp:unknown");
  });

  it("should use options for IP resolution", () => {
    const req = createMockRequest({
      ip: "192.168.1.1", // Would be rejected
    });
    const key = secureKeyGenerator(req, { rejectPrivateIP: false });
    expect(key).toBe("ip:192.168.1.1");
  });

  it("should use proxy_ip prefix for private socket IPs", () => {
    const req = createMockRequest({
      ip: undefined,
      socket: { remoteAddress: "10.0.0.1" }, // Private socket IP
    });
    const key = secureKeyGenerator(req, {
      useSocketAddress: true,
      rejectPrivateIP: false,
    });
    expect(key).toBe("proxy_ip:10.0.0.1");
  });

  it("should use ip prefix for public socket IPs", () => {
    const req = createMockRequest({
      ip: undefined,
      socket: { remoteAddress: "8.8.8.8" }, // Public socket IP
    });
    const key = secureKeyGenerator(req, {
      useSocketAddress: true,
    });
    expect(key).toBe("ip:8.8.8.8");
  });

  it("should use proxy_ip prefix with identity for private socket IPs", () => {
    const req = createMockRequest({
      ip: undefined,
      socket: { remoteAddress: "192.168.1.1" },
      context: { tenantId: "tenant-123" },
    });
    const key = secureKeyGenerator(req, {
      useSocketAddress: true,
      rejectPrivateIP: false,
    });
    expect(key).toBe("tenant:tenant-123|proxy_ip:192.168.1.1");
  });
});

describe("createKeyGenerator", () => {
  it("should create a key generator with pre-configured options", () => {
    const generator = createKeyGenerator({
      clientIP: "8.8.8.8",
    });

    const req = createMockRequest({
      ip: "1.1.1.1", // Should be ignored
      context: { tenantId: "tenant-123" },
    });

    const key = generator(req);
    expect(key).toBe("tenant:tenant-123|ip:8.8.8.8");
  });

  it("should create generator that accepts private IPs", () => {
    const generator = createKeyGenerator({
      rejectPrivateIP: false,
    });

    const req = createMockRequest({
      ip: "192.168.1.1",
    });

    const key = generator(req);
    expect(key).toBe("ip:192.168.1.1");
  });
});

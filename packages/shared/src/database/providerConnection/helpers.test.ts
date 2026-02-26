/**
 * Tests for providerConnection helpers.
 *
 * Covers the async row-to-domain mapper that decrypts encrypted fields
 * via per-tenant HKDF, and the input validation function.
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { ProviderConnectionRow, ProviderConnection } from "./types.js";

// ==================== Mocks ====================

const mockDecryptAuto = jest.fn<(tenantId: string, value: string) => Promise<string>>();

jest.mock("../../security/tenantEncryption.js", () => ({
  decryptAuto: (...args: unknown[]) => mockDecryptAuto(args[0] as string, args[1] as string),
}));

jest.mock("../../core/errors.js", () => {
  class ValidationError extends Error {
    public readonly operation?: string;
    public readonly metadata?: Record<string, unknown>;
    constructor(
      message: string,
      opts?: { operation?: string; metadata?: Record<string, unknown> }
    ) {
      super(message);
      this.name = "ValidationError";
      this.operation = opts?.operation;
      this.metadata = opts?.metadata;
    }
  }
  return { ValidationError };
});

// ==================== Import module under test ====================

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let helpers: typeof import("./helpers.js");

// ==================== Fixtures ====================

const createMockRow = (overrides: Partial<ProviderConnectionRow> = {}): ProviderConnectionRow => ({
  id: "conn-1",
  tenant_id: "tenant-abc",
  provider: "github_app",
  connection_name: "My GitHub App",
  external_org_id: "org-42",
  base_url: null,
  config: { scopes: ["repo"] },
  webhook_secret_enc: "v2:aabb:ccdd:eeff",
  access_token_enc: "v2:1122:3344:5566",
  token_expires_at: new Date("2025-12-01T00:00:00Z"),
  is_active: true,
  created_at: new Date("2024-01-01T00:00:00Z"),
  updated_at: new Date("2024-06-01T00:00:00Z"),
  ...overrides,
});

// ==================== Tests ====================

describe("providerConnection/helpers", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    helpers = await import("./helpers.js");
  });

  describe("rowToProviderConnection", () => {
    it("should decrypt both webhook_secret_enc and access_token_enc when present", async () => {
      mockDecryptAuto
        .mockResolvedValueOnce("decrypted-webhook-secret")
        .mockResolvedValueOnce("decrypted-access-token");

      const row = createMockRow();
      const result = await helpers.rowToProviderConnection(row);

      expect(mockDecryptAuto).toHaveBeenCalledTimes(2);
      expect(mockDecryptAuto).toHaveBeenCalledWith("tenant-abc", "v2:aabb:ccdd:eeff");
      expect(mockDecryptAuto).toHaveBeenCalledWith("tenant-abc", "v2:1122:3344:5566");
      expect(result.webhookSecret).toBe("decrypted-webhook-secret");
      expect(result.accessToken).toBe("decrypted-access-token");
    });

    it("should return null for webhook_secret when webhook_secret_enc is null", async () => {
      mockDecryptAuto.mockResolvedValueOnce("decrypted-access-token");

      const row = createMockRow({ webhook_secret_enc: null });
      const result = await helpers.rowToProviderConnection(row);

      // Only one call for access_token_enc
      expect(mockDecryptAuto).toHaveBeenCalledTimes(1);
      expect(mockDecryptAuto).toHaveBeenCalledWith("tenant-abc", "v2:1122:3344:5566");
      expect(result.webhookSecret).toBeNull();
      expect(result.accessToken).toBe("decrypted-access-token");
    });

    it("should return null for access_token when access_token_enc is null", async () => {
      mockDecryptAuto.mockResolvedValueOnce("decrypted-webhook-secret");

      const row = createMockRow({ access_token_enc: null });
      const result = await helpers.rowToProviderConnection(row);

      expect(mockDecryptAuto).toHaveBeenCalledTimes(1);
      expect(mockDecryptAuto).toHaveBeenCalledWith("tenant-abc", "v2:aabb:ccdd:eeff");
      expect(result.webhookSecret).toBe("decrypted-webhook-secret");
      expect(result.accessToken).toBeNull();
    });

    it("should return null for both fields when both encrypted columns are null", async () => {
      const row = createMockRow({
        webhook_secret_enc: null,
        access_token_enc: null,
      });

      const result = await helpers.rowToProviderConnection(row);

      expect(mockDecryptAuto).not.toHaveBeenCalled();
      expect(result.webhookSecret).toBeNull();
      expect(result.accessToken).toBeNull();
    });

    it("should map all snake_case row fields to camelCase domain fields", async () => {
      mockDecryptAuto.mockResolvedValueOnce("ws").mockResolvedValueOnce("at");

      const row = createMockRow();
      const result = await helpers.rowToProviderConnection(row);

      const expected: ProviderConnection = {
        id: "conn-1",
        tenantId: "tenant-abc",
        provider: "github_app",
        connectionName: "My GitHub App",
        externalOrgId: "org-42",
        baseUrl: null,
        config: { scopes: ["repo"] },
        webhookSecret: "ws",
        accessToken: "at",
        tokenExpiresAt: new Date("2025-12-01T00:00:00Z"),
        isActive: true,
        createdAt: new Date("2024-01-01T00:00:00Z"),
        updatedAt: new Date("2024-06-01T00:00:00Z"),
      };

      expect(result).toEqual(expected);
    });

    it("should use the row's tenant_id for decryption context", async () => {
      mockDecryptAuto.mockResolvedValue("decrypted");

      const row = createMockRow({ tenant_id: "tenant-xyz-999" });
      await helpers.rowToProviderConnection(row);

      expect(mockDecryptAuto).toHaveBeenCalledWith("tenant-xyz-999", expect.any(String));
    });

    it("should propagate decryption errors", async () => {
      mockDecryptAuto.mockRejectedValueOnce(new Error("decryption failed"));

      const row = createMockRow();

      await expect(helpers.rowToProviderConnection(row)).rejects.toThrow("decryption failed");
    });

    it("should decrypt v1 (legacy) encrypted values via decryptAuto", async () => {
      // decryptAuto handles both v1 and v2 formats internally;
      // here we verify the value is passed through regardless of format
      mockDecryptAuto
        .mockResolvedValueOnce("legacy-webhook-secret")
        .mockResolvedValueOnce("legacy-token");

      const row = createMockRow({
        webhook_secret_enc: "aabbccdd:1122334455:6677889900", // v1 format (3 parts, no v2 prefix)
        access_token_enc: "ffee:ddcc:bbaa",
      });

      const result = await helpers.rowToProviderConnection(row);

      expect(mockDecryptAuto).toHaveBeenCalledWith("tenant-abc", "aabbccdd:1122334455:6677889900");
      expect(result.webhookSecret).toBe("legacy-webhook-secret");
      expect(result.accessToken).toBe("legacy-token");
    });

    it("should not mutate the input row", async () => {
      mockDecryptAuto.mockResolvedValue("decrypted");

      const row = Object.freeze(createMockRow());
      // Should not throw even with frozen input
      const result = await helpers.rowToProviderConnection(row);

      expect(result.id).toBe("conn-1");
    });
  });

  describe("validateCreateInput", () => {
    it("should not throw for valid input", () => {
      expect(() =>
        helpers.validateCreateInput({
          tenantId: "t-1",
          provider: "github_app",
          connectionName: "My Conn",
        })
      ).not.toThrow();
    });

    it("should throw ValidationError when tenantId is empty", () => {
      expect(() =>
        helpers.validateCreateInput({
          tenantId: "",
          provider: "github_app",
          connectionName: "My Conn",
        })
      ).toThrow(expect.objectContaining({ name: "ValidationError" }));
    });

    it("should throw ValidationError when provider is empty", () => {
      expect(() =>
        helpers.validateCreateInput({
          tenantId: "t-1",
          provider: "" as never,
          connectionName: "My Conn",
        })
      ).toThrow(expect.objectContaining({ name: "ValidationError" }));
    });

    it("should throw ValidationError when connectionName is empty", () => {
      expect(() =>
        helpers.validateCreateInput({
          tenantId: "t-1",
          provider: "github_app",
          connectionName: "",
        })
      ).toThrow(expect.objectContaining({ name: "ValidationError" }));
    });
  });
});

/**
 * Tests for providerConnection repository.
 *
 * Verifies that CRUD operations correctly encrypt/decrypt fields using
 * per-tenant HKDF keys, and that the encryptNullable helper handles
 * null/undefined values.
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type {
  ProviderConnectionRow,
  CreateProviderConnectionInput,
  UpdateProviderConnectionInput,
} from "./types.js";

// ==================== Mocks ====================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockQuery = jest.fn<(...args: any[]) => Promise<any>>();

jest.mock("../client/index.js", () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

const mockEncryptForTenant = jest.fn<(tenantId: string, plaintext: string) => Promise<string>>();

jest.mock("../../security/tenantEncryption.js", () => ({
  encryptForTenant: (...args: unknown[]) =>
    mockEncryptForTenant(args[0] as string, args[1] as string),
  decryptAuto: jest
    .fn<(tenantId: string, value: string) => Promise<string>>()
    .mockImplementation((_tenantId: string, value: string) =>
      Promise.resolve(`decrypted(${value})`)
    ),
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

jest.mock("../../core/logger.js", () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

jest.mock("../tenant/helpers.js", () => ({
  rowToTenant: jest.fn((row: Record<string, unknown>) => ({
    id: row.id,
    orgName: row.org_name,
  })),
}));

// ==================== Import module under test ====================

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let repo: typeof import("./repository.js");

// ==================== Fixtures ====================

const NOW = new Date("2025-01-15T12:00:00Z");

const createMockRow = (overrides: Partial<ProviderConnectionRow> = {}): ProviderConnectionRow => ({
  id: "conn-1",
  tenant_id: "tenant-abc",
  provider: "github_app",
  connection_name: "My GitHub App",
  external_org_id: "org-42",
  base_url: null,
  config: {},
  webhook_secret_enc: "v2:enc-ws",
  access_token_enc: "v2:enc-at",
  token_expires_at: null,
  is_active: true,
  created_at: NOW,
  updated_at: NOW,
  ...overrides,
});

const createValidInput = (
  overrides: Partial<CreateProviderConnectionInput> = {}
): CreateProviderConnectionInput => ({
  tenantId: "tenant-abc",
  provider: "github_app",
  connectionName: "My GitHub App",
  externalOrgId: "org-42",
  webhookSecret: "plain-webhook-secret",
  accessToken: "plain-access-token",
  ...overrides,
});

// ==================== Tests ====================

describe("providerConnection/repository", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockEncryptForTenant.mockImplementation((_tenantId: string, plaintext: string) =>
      Promise.resolve(`enc(${plaintext})`)
    );
    repo = await import("./repository.js");
  });

  // ==================== createProviderConnection ====================

  describe("createProviderConnection", () => {
    it("should encrypt webhookSecret and accessToken before inserting", async () => {
      const row = createMockRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await repo.createProviderConnection(createValidInput());

      expect(mockEncryptForTenant).toHaveBeenCalledWith("tenant-abc", "plain-webhook-secret");
      expect(mockEncryptForTenant).toHaveBeenCalledWith("tenant-abc", "plain-access-token");
    });

    it("should pass encrypted values to the INSERT query", async () => {
      const row = createMockRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await repo.createProviderConnection(createValidInput());

      const insertArgs = mockQuery.mock.calls[0][1] as unknown[];
      // $7 = webhookSecretEnc, $8 = accessTokenEnc
      expect(insertArgs[6]).toBe("enc(plain-webhook-secret)");
      expect(insertArgs[7]).toBe("enc(plain-access-token)");
    });

    it("should pass null for webhook_secret_enc when webhookSecret is null", async () => {
      const row = createMockRow({ webhook_secret_enc: null });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await repo.createProviderConnection(createValidInput({ webhookSecret: null }));

      // encryptForTenant should only be called once (for accessToken)
      expect(mockEncryptForTenant).toHaveBeenCalledTimes(1);
      expect(mockEncryptForTenant).toHaveBeenCalledWith("tenant-abc", "plain-access-token");

      const insertArgs = mockQuery.mock.calls[0][1] as unknown[];
      expect(insertArgs[6]).toBeNull(); // webhook_secret_enc
    });

    it("should pass null for access_token_enc when accessToken is undefined", async () => {
      const row = createMockRow({ access_token_enc: null });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await repo.createProviderConnection(
        createValidInput({ accessToken: undefined, webhookSecret: undefined })
      );

      expect(mockEncryptForTenant).not.toHaveBeenCalled();

      const insertArgs = mockQuery.mock.calls[0][1] as unknown[];
      expect(insertArgs[6]).toBeNull(); // webhook_secret_enc
      expect(insertArgs[7]).toBeNull(); // access_token_enc
    });

    it("should call validateCreateInput before encrypting", async () => {
      await expect(
        repo.createProviderConnection(createValidInput({ tenantId: "" }))
      ).rejects.toThrow(expect.objectContaining({ name: "ValidationError" }));

      // Should not reach encryption if validation fails
      expect(mockEncryptForTenant).not.toHaveBeenCalled();
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("should serialize config as JSON in the INSERT query", async () => {
      const row = createMockRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await repo.createProviderConnection(
        createValidInput({ config: { scopes: ["repo", "admin"] } })
      );

      const insertArgs = mockQuery.mock.calls[0][1] as unknown[];
      expect(insertArgs[5]).toBe(JSON.stringify({ scopes: ["repo", "admin"] }));
    });

    it("should default config to empty object when not provided", async () => {
      const row = createMockRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await repo.createProviderConnection(createValidInput({ config: undefined }));

      const insertArgs = mockQuery.mock.calls[0][1] as unknown[];
      expect(insertArgs[5]).toBe("{}");
    });

    it("should return a domain ProviderConnection with decrypted fields", async () => {
      const row = createMockRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await repo.createProviderConnection(createValidInput());

      // rowToProviderConnection is called on the returned row, which uses decryptAuto mock
      expect(result.id).toBe("conn-1");
      expect(result.tenantId).toBe("tenant-abc");
      expect(result.webhookSecret).toBe("decrypted(v2:enc-ws)");
      expect(result.accessToken).toBe("decrypted(v2:enc-at)");
    });
  });

  // ==================== updateProviderConnection ====================

  describe("updateProviderConnection", () => {
    it("should encrypt webhookSecret and accessToken when present in input", async () => {
      const row = createMockRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const input: UpdateProviderConnectionInput = {
        id: "conn-1",
        tenantId: "tenant-abc",
        webhookSecret: "new-webhook-secret",
        accessToken: "new-access-token",
      };

      await repo.updateProviderConnection(input);

      expect(mockEncryptForTenant).toHaveBeenCalledWith("tenant-abc", "new-webhook-secret");
      expect(mockEncryptForTenant).toHaveBeenCalledWith("tenant-abc", "new-access-token");
    });

    it("should not encrypt fields that are not present in input", async () => {
      const row = createMockRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const input: UpdateProviderConnectionInput = {
        id: "conn-1",
        tenantId: "tenant-abc",
        connectionName: "Updated Name",
      };

      await repo.updateProviderConnection(input);

      // No encryption calls since webhookSecret and accessToken are not in input
      expect(mockEncryptForTenant).not.toHaveBeenCalled();
    });

    it("should handle null webhookSecret by passing null to encryptNullable", async () => {
      const row = createMockRow({ webhook_secret_enc: null });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const input: UpdateProviderConnectionInput = {
        id: "conn-1",
        tenantId: "tenant-abc",
        webhookSecret: null,
      };

      await repo.updateProviderConnection(input);

      // encryptNullable returns null for null value, so no encryptForTenant call
      expect(mockEncryptForTenant).not.toHaveBeenCalled();
    });

    it("should build dynamic SET clause with only provided fields", async () => {
      const row = createMockRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const input: UpdateProviderConnectionInput = {
        id: "conn-1",
        tenantId: "tenant-abc",
        connectionName: "New Name",
        externalOrgId: "new-org",
      };

      await repo.updateProviderConnection(input);

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain("connection_name = $2");
      expect(sql).toContain("external_org_id = $3");
      expect(sql).toContain("updated_at = NOW()");
      expect(sql).toContain("WHERE id = $1");
    });

    it("should return null when no row is found for the given ID", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const input: UpdateProviderConnectionInput = {
        id: "nonexistent",
        tenantId: "tenant-abc",
        connectionName: "Updated",
      };

      const result = await repo.updateProviderConnection(input);
      expect(result).toBeNull();
    });
  });

  // ==================== updateConnectionToken ====================

  describe("updateConnectionToken", () => {
    it("should encrypt the plain token before updating", async () => {
      const row = createMockRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await repo.updateConnectionToken("conn-1", "tenant-abc", "my-new-token");

      expect(mockEncryptForTenant).toHaveBeenCalledWith("tenant-abc", "my-new-token");

      const queryArgs = mockQuery.mock.calls[0][1] as unknown[];
      expect(queryArgs[0]).toBe("enc(my-new-token)"); // encrypted token
      expect(queryArgs[1]).toBe("conn-1"); // connection ID
    });

    it("should return null when connection is not found", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await repo.updateConnectionToken("missing", "tenant-abc", "token");
      expect(result).toBeNull();
    });
  });

  // ==================== findByTenant ====================

  describe("findByTenant", () => {
    it("should map all returned rows to domain objects", async () => {
      const rows = [createMockRow({ id: "conn-1" }), createMockRow({ id: "conn-2" })];
      mockQuery.mockResolvedValueOnce({ rows });

      const result = await repo.findByTenant("tenant-abc");

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("conn-1");
      expect(result[1].id).toBe("conn-2");
    });

    it("should return empty array when tenant has no connections", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await repo.findByTenant("empty-tenant");
      expect(result).toEqual([]);
    });
  });

  // ==================== findByTenantAndProvider ====================

  describe("findByTenantAndProvider", () => {
    it("should return a domain object when found", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [createMockRow()] });

      const result = await repo.findByTenantAndProvider("tenant-abc", "github_app");

      expect(result).not.toBeNull();
      expect(result?.provider).toBe("github_app");
    });

    it("should return null when not found", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await repo.findByTenantAndProvider("tenant-abc", "slack");
      expect(result).toBeNull();
    });
  });

  // ==================== findConnectionById ====================

  describe("findConnectionById", () => {
    it("should return a domain object when found", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [createMockRow()] });

      const result = await repo.findConnectionById("conn-1", "tenant-1");
      expect(result).not.toBeNull();
      expect(result?.id).toBe("conn-1");
    });

    it("should return null when not found", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await repo.findConnectionById("nonexistent", "tenant-1");
      expect(result).toBeNull();
    });
  });

  // ==================== deactivateConnection ====================

  describe("deactivateConnection", () => {
    it("should return the deactivated connection", async () => {
      const row = createMockRow({ is_active: false });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await repo.deactivateConnection("conn-1");
      expect(result).not.toBeNull();
    });

    it("should return null when connection does not exist", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await repo.deactivateConnection("missing");
      expect(result).toBeNull();
    });
  });

  // ==================== findTenantByGitHubInstallation ====================

  describe("findTenantByGitHubInstallation", () => {
    it("should convert installation ID to string for query", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: "tenant-1", org_name: "test-org" }],
      });

      await repo.findTenantByGitHubInstallation(12345);

      const queryArgs = mockQuery.mock.calls[0][1] as unknown[];
      expect(queryArgs[0]).toBe("github_app");
      expect(queryArgs[1]).toBe("12345");
    });

    it("should return null when no matching tenant is found", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await repo.findTenantByGitHubInstallation(99999);
      expect(result).toBeNull();
    });
  });

  // ==================== findTenantBySlackWorkspace ====================

  describe("findTenantBySlackWorkspace", () => {
    it("should query by slack provider and workspace ID", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: "tenant-1", org_name: "slack-org" }],
      });

      await repo.findTenantBySlackWorkspace("W12345");

      const queryArgs = mockQuery.mock.calls[0][1] as unknown[];
      expect(queryArgs[0]).toBe("slack");
      expect(queryArgs[1]).toBe("W12345");
    });

    it("should return null when no matching tenant is found", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await repo.findTenantBySlackWorkspace("unknown");
      expect(result).toBeNull();
    });
  });
});

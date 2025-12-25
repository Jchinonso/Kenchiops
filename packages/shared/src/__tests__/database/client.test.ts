/**
 * Unit tests for database/client.ts
 *
 * Tests database connection pool management, query execution, and transactions.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import type pg from "pg";

// Mock functions are stored in a global-like scope for access within mock factory
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFunctions = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: jest.fn<(...args: any[]) => Promise<any>>(),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  connect: jest.fn<() => Promise<any>>(),
  release: jest.fn(),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  end: jest.fn<() => Promise<any>>(),
  on: jest.fn(),
};

// Mock PoolClient
const mockClient = {
  query: mockFunctions.query,
  release: mockFunctions.release,
  on: jest.fn(),
  removeListener: jest.fn(),
  end: jest.fn(),
  connect: jest.fn(),
  copyFrom: jest.fn(),
  copyTo: jest.fn(),
  pauseDrain: jest.fn(),
  resumeDrain: jest.fn(),
  escapeIdentifier: jest.fn(),
  escapeLiteral: jest.fn(),
} as unknown as pg.PoolClient;

// Mock Pool
const mockPool = {
  query: mockFunctions.query,
  connect: mockFunctions.connect,
  end: mockFunctions.end,
  on: mockFunctions.on,
  removeListener: jest.fn(),
  totalCount: 0,
  idleCount: 0,
  waitingCount: 0,
  expiredCount: 0,
} as unknown as pg.Pool;

// Track Pool constructor calls
const mockPoolCalls: unknown[][] = [];

// Mock pg module - Pool needs to be a constructor
// The code does: import pg from "pg"; const { Pool } = pg;
jest.mock("pg", () => {
  // Create mock pool inside factory
  const innerMockPool = {
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn(),
    on: jest.fn(),
    removeListener: jest.fn(),
  };

  return {
    __esModule: true,
    default: {
      Pool: jest.fn().mockImplementation(function (this: unknown, config: unknown) {
        mockPoolCalls.push([config]);
        return innerMockPool;
      }),
    },
  };
});

// Get the actual mock after module is mocked
// eslint-disable-next-line @typescript-eslint/no-require-imports
const getMockedPg = () => require("pg") as { default: { Pool: jest.Mock } };

// Mock logger
jest.mock("../../core/logger.js", () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

describe("Database Client", () => {
  let client: typeof import("../../database/client.js");
  let mockedPg: ReturnType<typeof getMockedPg>;

  beforeEach(async () => {
    // Clear mock call tracking
    mockPoolCalls.length = 0;

    // Reimport module to get fresh instance
    jest.resetModules();

    // Setup mocks before importing client
    mockedPg = getMockedPg();
    const innerPool = {
      query: mockFunctions.query,
      connect: mockFunctions.connect,
      end: mockFunctions.end,
      on: mockFunctions.on,
      removeListener: jest.fn(),
    };
    mockedPg.default.Pool.mockImplementation((config: unknown) => {
      mockPoolCalls.push([config]);
      return innerPool;
    });

    jest.clearAllMocks();
    mockFunctions.connect.mockResolvedValue(mockClient);
    mockFunctions.query.mockResolvedValue({ rows: [], rowCount: 0 });

    client = await import("../../database/client.js");
  });

  afterEach(async () => {
    // Clean up pool if initialized
    try {
      await client.closeDatabase();
    } catch {
      // Ignore errors during cleanup
    }
  });

  describe("initDatabase", () => {
    it("should initialize pool with connection string", () => {
      const config = {
        connectionString: "postgresql://localhost:5432/testdb",
      };

      client.initDatabase(config);

      expect(mockedPg.default.Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionString: "postgresql://localhost:5432/testdb",
        })
      );
    });

    it("should use default pool configuration when not provided", () => {
      const config = {
        connectionString: "postgresql://localhost:5432/testdb",
      };

      client.initDatabase(config);

      expect(mockedPg.default.Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          max: 10,
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 5_000,
        })
      );
    });

    it("should use custom pool configuration when provided", () => {
      const config = {
        connectionString: "postgresql://localhost:5432/testdb",
        maxConnections: 20,
        idleTimeoutMs: 60_000,
        connectionTimeoutMs: 10_000,
      };

      client.initDatabase(config);

      expect(mockedPg.default.Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          max: 20,
          idleTimeoutMillis: 60_000,
          connectionTimeoutMillis: 10_000,
        })
      );
    });

    it("should register pool event handlers", () => {
      const config = {
        connectionString: "postgresql://localhost:5432/testdb",
      };

      client.initDatabase(config);

      expect(mockFunctions.on).toHaveBeenCalledWith("error", expect.any(Function));
      expect(mockFunctions.on).toHaveBeenCalledWith("connect", expect.any(Function));
    });

    it("should warn if pool is already initialized", () => {
      const config = {
        connectionString: "postgresql://localhost:5432/testdb",
      };

      client.initDatabase(config);
      client.initDatabase(config);

      expect(mockedPg.default.Pool).toHaveBeenCalledTimes(1);
    });
  });

  describe("getPool", () => {
    it("should return pool when initialized", () => {
      const config = {
        connectionString: "postgresql://localhost:5432/testdb",
      };

      client.initDatabase(config);
      const pool = client.getPool();

      // Pool should have the expected mock methods
      expect(pool).toBeDefined();
      expect(pool.query).toBeDefined();
      expect(pool.connect).toBeDefined();
    });

    it("should throw ValidationError when pool not initialized", () => {
      expect(() => client.getPool()).toThrow("Database pool not initialized");
    });
  });

  describe("query", () => {
    beforeEach(() => {
      const config = {
        connectionString: "postgresql://localhost:5432/testdb",
      };
      client.initDatabase(config);
    });

    it("should execute query with parameters", async () => {
      const mockRows = [{ id: 1, name: "Test" }];
      mockFunctions.query.mockResolvedValue({ rows: mockRows, rowCount: 1 });

      const result = await client.query("SELECT * FROM users WHERE id = $1", [1]);

      expect(mockFunctions.query).toHaveBeenCalledWith("SELECT * FROM users WHERE id = $1", [1]);
      expect(result.rows).toEqual(mockRows);
      expect(result.rowCount).toBe(1);
    });

    it("should execute query without parameters", async () => {
      const mockRows = [{ count: "5" }];
      mockFunctions.query.mockResolvedValue({ rows: mockRows, rowCount: 1 });

      const result = await client.query("SELECT COUNT(*) FROM users");

      expect(mockFunctions.query).toHaveBeenCalledWith("SELECT COUNT(*) FROM users", undefined);
      expect(result.rows).toEqual(mockRows);
    });

    it("should return empty array when no rows returned", async () => {
      mockFunctions.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await client.query("SELECT * FROM users WHERE id = $1", [999]);

      expect(result.rows).toEqual([]);
      expect(result.rowCount).toBe(0);
    });

    it("should handle null rowCount", async () => {
      mockFunctions.query.mockResolvedValue({ rows: [], rowCount: null });

      const result = await client.query("DELETE FROM users WHERE id = $1", [1]);

      expect(result.rowCount).toBe(0);
    });

    it("should throw error when query fails", async () => {
      const dbError = new Error("Database connection failed");
      mockFunctions.query.mockRejectedValue(dbError);

      await expect(client.query("SELECT * FROM users")).rejects.toThrow("Database connection failed");
    });

    it("should throw ValidationError when pool not initialized", async () => {
      await client.closeDatabase();

      await expect(client.query("SELECT 1")).rejects.toThrow("Database pool not initialized");
    });

    it("should handle complex query with multiple parameters", async () => {
      const mockRows = [{ id: 1, name: "Test", email: "test@example.com" }];
      mockFunctions.query.mockResolvedValue({ rows: mockRows, rowCount: 1 });

      const result = await client.query(
        "UPDATE users SET name = $1, email = $2 WHERE id = $3 RETURNING *",
        ["Test", "test@example.com", 1]
      );

      expect(result.rows).toEqual(mockRows);
      expect(mockFunctions.query).toHaveBeenCalledWith(expect.any(String), ["Test", "test@example.com", 1]);
    });
  });

  describe("transaction", () => {
    beforeEach(() => {
      const config = {
        connectionString: "postgresql://localhost:5432/testdb",
      };
      client.initDatabase(config);
    });

    it("should execute transaction function and commit", async () => {
      mockFunctions.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await client.transaction(async (txClient) => {
        await txClient.query("INSERT INTO users (name) VALUES ($1)", ["Test"]);
        return { success: true };
      });

      expect(mockFunctions.connect).toHaveBeenCalled();
      expect(mockFunctions.query).toHaveBeenCalledWith("BEGIN");
      expect(mockFunctions.query).toHaveBeenCalledWith("COMMIT");
      expect(mockFunctions.release).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it("should rollback transaction on error", async () => {
      mockFunctions.query.mockImplementation((sql: string) => {
        if (sql === "BEGIN" || sql === "ROLLBACK") {
          return Promise.resolve({ rows: [], rowCount: 0 });
        }
        return Promise.reject(new Error("Query failed"));
      });

      await expect(
        client.transaction(async (txClient) => {
          await txClient.query("INSERT INTO users (name) VALUES ($1)", ["Test"]);
        })
      ).rejects.toThrow("Query failed");

      expect(mockFunctions.query).toHaveBeenCalledWith("BEGIN");
      expect(mockFunctions.query).toHaveBeenCalledWith("ROLLBACK");
      expect(mockFunctions.release).toHaveBeenCalled();
    });

    it("should release client even if transaction fails", async () => {
      mockFunctions.query.mockImplementation((sql: string) => {
        if (sql === "BEGIN" || sql === "ROLLBACK") {
          return Promise.resolve({ rows: [], rowCount: 0 });
        }
        return Promise.reject(new Error("Transaction error"));
      });

      await expect(
        client.transaction(async (txClient) => {
          await txClient.query("INSERT INTO users (name) VALUES ($1)", ["Test"]);
        })
      ).rejects.toThrow();

      expect(mockFunctions.release).toHaveBeenCalled();
    });

    it("should handle nested queries in transaction", async () => {
      const mockUserRow = { id: 1, name: "Test User" };
      const mockProfileRow = { id: 1, user_id: 1, bio: "Test bio" };

      mockFunctions.query.mockImplementation((sql: string) => {
        if (sql === "BEGIN" || sql === "COMMIT") {
          return Promise.resolve({ rows: [], rowCount: 0 });
        }
        if (sql.includes("users")) {
          return Promise.resolve({ rows: [mockUserRow], rowCount: 1 });
        }
        return Promise.resolve({ rows: [mockProfileRow], rowCount: 1 });
      });

      const result = await client.transaction(async (txClient) => {
        const user = await txClient.query("INSERT INTO users (name) VALUES ($1) RETURNING *", [
          "Test User",
        ]);
        const profile = await txClient.query(
          "INSERT INTO profiles (user_id, bio) VALUES ($1, $2) RETURNING *",
          [1, "Test bio"]
        );
        return { user: user.rows[0], profile: profile.rows[0] };
      });

      expect(result.user).toEqual(mockUserRow);
      expect(result.profile).toEqual(mockProfileRow);
      expect(mockFunctions.query).toHaveBeenCalledWith("COMMIT");
    });

    it("should throw ValidationError when pool not initialized", async () => {
      await client.closeDatabase();

      await expect(
        client.transaction(async (txClient) => {
          await txClient.query("SELECT 1");
        })
      ).rejects.toThrow("Database pool not initialized");
    });
  });

  describe("closeDatabase", () => {
    it("should close pool when initialized", async () => {
      const config = {
        connectionString: "postgresql://localhost:5432/testdb",
      };
      client.initDatabase(config);

      await client.closeDatabase();

      expect(mockFunctions.end).toHaveBeenCalled();
    });

    it("should do nothing when pool not initialized", async () => {
      await client.closeDatabase();

      expect(mockFunctions.end).not.toHaveBeenCalled();
    });

    it("should allow getPool to throw after closing", async () => {
      const config = {
        connectionString: "postgresql://localhost:5432/testdb",
      };
      client.initDatabase(config);

      await client.closeDatabase();

      expect(() => client.getPool()).toThrow("Database pool not initialized");
    });
  });

  describe("isDatabaseHealthy", () => {
    beforeEach(() => {
      const config = {
        connectionString: "postgresql://localhost:5432/testdb",
      };
      client.initDatabase(config);
    });

    it("should return true when health check query succeeds", async () => {
      mockFunctions.query.mockResolvedValue({ rows: [{ "?column?": 1 }], rowCount: 1 });

      const healthy = await client.isDatabaseHealthy();

      expect(healthy).toBe(true);
      expect(mockFunctions.query).toHaveBeenCalledWith("SELECT 1");
    });

    it("should return false when health check query fails", async () => {
      mockFunctions.query.mockRejectedValue(new Error("Connection timeout"));

      const healthy = await client.isDatabaseHealthy();

      expect(healthy).toBe(false);
    });

    it("should return false when pool not initialized", async () => {
      await client.closeDatabase();

      const healthy = await client.isDatabaseHealthy();

      expect(healthy).toBe(false);
    });

    it("should not throw error on health check failure", async () => {
      mockFunctions.query.mockRejectedValue(new Error("Database unavailable"));

      await expect(client.isDatabaseHealthy()).resolves.toBe(false);
    });
  });
});

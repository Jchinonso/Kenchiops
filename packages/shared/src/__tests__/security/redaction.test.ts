import { describe, it, expect } from "@jest/globals";
import {
  redactSecrets,
  redactSecretsWithStats,
  redactObject,
  isForbiddenField,
  containsSecrets,
  detectSecretTypes,
  createCustomRedactor,
} from "../../security/index.js";
import { REDACTION_PLACEHOLDER } from "../../constants/index.js";

describe("Security - Secret Redaction", () => {
  describe("redactSecrets", () => {
    it("should return empty/null inputs unchanged", () => {
      expect(redactSecrets("")).toBe("");
      expect(redactSecrets(null as unknown as string)).toBe(null);
      expect(redactSecrets(undefined as unknown as string)).toBe(undefined);
    });

    it("should not modify text without secrets", () => {
      const safeText = "This is a normal log message without any secrets";
      expect(redactSecrets(safeText)).toBe(safeText);
    });

    // AWS Keys
    it("should redact AWS Access Key IDs", () => {
      const text = "Using AWS key AKIAIOSFODNN7EXAMPLE for S3 access";
      const result = redactSecrets(text);
      expect(result).not.toContain("AKIAIOSFODNN7EXAMPLE");
      expect(result).toContain(REDACTION_PLACEHOLDER);
    });

    // GitHub Tokens
    it("should redact GitHub Personal Access Tokens", () => {
      const text = "export GITHUB_TOKEN=ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789";
      const result = redactSecrets(text);
      expect(result).not.toContain("ghp_");
      expect(result).toContain(REDACTION_PLACEHOLDER);
    });

    it("should redact GitHub App installation tokens", () => {
      const text = "Token: ghs_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789";
      const result = redactSecrets(text);
      expect(result).not.toContain("ghs_");
      expect(result).toContain(REDACTION_PLACEHOLDER);
    });

    // Slack Tokens
    it("should redact Slack Bot tokens", () => {
      const text = "SLACK_TOKEN=xoxb-1234567890123-1234567890123-AbCdEfGhIjKlMnOpQrStUvWx";
      const result = redactSecrets(text);
      expect(result).not.toContain("xoxb-");
      expect(result).toContain(REDACTION_PLACEHOLDER);
    });

    // Private Keys
    it("should redact RSA private keys", () => {
      const text = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyF7JLjYpHJO2VhQSiIE1IpdKz
-----END RSA PRIVATE KEY-----`;
      const result = redactSecrets(text);
      expect(result).not.toContain("MIIEpAIBAAKCAQEA");
      expect(result).toContain(REDACTION_PLACEHOLDER);
    });

    it("should redact OpenSSH private keys", () => {
      const text = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmU
-----END OPENSSH PRIVATE KEY-----`;
      const result = redactSecrets(text);
      expect(result).not.toContain("b3BlbnNzaC1rZXktdjE");
      expect(result).toContain(REDACTION_PLACEHOLDER);
    });

    // Database Connection Strings
    it("should redact PostgreSQL connection strings", () => {
      const text = "DATABASE_URL=postgres://admin:secretpassword123@localhost:5432/mydb";
      const result = redactSecrets(text);
      expect(result).not.toContain("secretpassword123");
      expect(result).toContain(REDACTION_PLACEHOLDER);
    });

    it("should redact MongoDB connection strings", () => {
      const text = "MONGO_URI=mongodb+srv://user:password@cluster.mongodb.net/db";
      const result = redactSecrets(text);
      expect(result).not.toContain("password");
      expect(result).toContain(REDACTION_PLACEHOLDER);
    });

    // OpenAI / Anthropic Keys
    it("should redact OpenAI API keys", () => {
      const text = "OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJ";
      const result = redactSecrets(text);
      expect(result).not.toContain("sk-abcdefghijklmnopqrstuvwxyz");
      expect(result).toContain(REDACTION_PLACEHOLDER);
    });

    // JWT Tokens
    it("should redact JWT tokens", () => {
      const text =
        "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
      const result = redactSecrets(text);
      expect(result).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
      expect(result).toContain(REDACTION_PLACEHOLDER);
    });

    // Stripe Keys
    it("should redact Stripe secret keys", () => {
      const text = "STRIPE_SECRET_KEY=sk_live_51abc123XYZabcdefghijklmnopqrstuvwxyz";
      const result = redactSecrets(text);
      expect(result).not.toContain("sk_live_");
      expect(result).toContain(REDACTION_PLACEHOLDER);
    });

    // Password patterns
    it("should redact password assignments", () => {
      const text = 'password="MySecretPassword123!"';
      const result = redactSecrets(text);
      expect(result).not.toContain("MySecretPassword123");
      expect(result).toContain(REDACTION_PLACEHOLDER);
    });

    // Multiple secrets
    it("should redact multiple secrets in one text", () => {
      const text = `
        GITHUB_TOKEN=ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789
        DATABASE_URL=postgres://admin:secretpw@localhost:5432/db
        OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJ
      `;
      const result = redactSecrets(text);
      expect(result).not.toContain("ghp_");
      expect(result).not.toContain("secretpw");
      expect(result).not.toContain("sk-abcdefghijklmnopqrstuvwxyz");
      expect((result.match(/\[REDACTED\]/g) || []).length).toBeGreaterThanOrEqual(3);
    });

    // Bearer tokens
    it("should redact Bearer tokens", () => {
      const text = "Authorization: Bearer abc123xyz456_very-long-token-here";
      const result = redactSecrets(text);
      expect(result).not.toContain("abc123xyz456_very-long-token-here");
      expect(result).toContain(REDACTION_PLACEHOLDER);
    });

    // Basic Auth
    it("should redact Basic Auth headers", () => {
      const text = "Authorization: Basic dXNlcm5hbWU6cGFzc3dvcmQ=";
      const result = redactSecrets(text);
      expect(result).not.toContain("dXNlcm5hbWU6cGFzc3dvcmQ=");
      expect(result).toContain(REDACTION_PLACEHOLDER);
    });
  });

  describe("redactSecretsWithStats", () => {
    it("should return stats for redacted secrets", () => {
      const text = `
        GITHUB_TOKEN=ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789
        OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJ
      `;
      const result = redactSecretsWithStats(text);

      expect(result.redactedCount).toBeGreaterThanOrEqual(2);
      expect(result.redactedTypes).toContain("GitHub Personal Access Token");
      expect(result.redactedTypes).toContain("OpenAI API Key");
      expect(result.text).not.toContain("ghp_");
    });

    it("should return zero count for text without secrets", () => {
      const result = redactSecretsWithStats("Normal log message");
      expect(result.redactedCount).toBe(0);
      expect(result.redactedTypes).toHaveLength(0);
      expect(result.text).toBe("Normal log message");
    });
  });

  describe("isForbiddenField", () => {
    it("should identify forbidden field names", () => {
      expect(isForbiddenField("password")).toBe(true);
      expect(isForbiddenField("api_key")).toBe(true);
      expect(isForbiddenField("access_token")).toBe(true);
      expect(isForbiddenField("secret")).toBe(true);
      expect(isForbiddenField("authorization")).toBe(true);
    });

    it("should be case-insensitive", () => {
      expect(isForbiddenField("PASSWORD")).toBe(true);
      expect(isForbiddenField("Api_Key")).toBe(true);
      expect(isForbiddenField("SECRET")).toBe(true);
    });

    it("should allow safe field names", () => {
      expect(isForbiddenField("username")).toBe(false);
      expect(isForbiddenField("email")).toBe(false);
      expect(isForbiddenField("name")).toBe(false);
      expect(isForbiddenField("description")).toBe(false);
    });

    it("should handle invalid inputs", () => {
      expect(isForbiddenField("")).toBe(false);
      expect(isForbiddenField(null as unknown as string)).toBe(false);
      expect(isForbiddenField(undefined as unknown as string)).toBe(false);
    });
  });

  describe("redactObject", () => {
    it("should redact secrets in object string values", () => {
      const obj = {
        message: "Using token ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789",
        count: 5,
      };
      const result = redactObject(obj);
      expect(result.message).not.toContain("ghp_");
      expect(result.message).toContain(REDACTION_PLACEHOLDER);
      expect(result.count).toBe(5);
    });

    it("should replace forbidden fields with redaction placeholder", () => {
      const obj = {
        username: "john",
        password: "secret123",
        api_key: "key123",
      };
      const result = redactObject(obj);
      expect(result.username).toBe("john");
      expect(result.password).toBe(REDACTION_PLACEHOLDER);
      expect(result.api_key).toBe(REDACTION_PLACEHOLDER);
    });

    it("should handle nested objects", () => {
      const obj = {
        user: {
          name: "John",
          credentials: {
            password: "secret",
            githubToken: "ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789",
          },
        },
      };
      const result = redactObject(obj) as typeof obj;
      expect(result.user.name).toBe("John");
      // password is a forbidden field - replaced entirely
      expect(result.user.credentials.password).toBe(REDACTION_PLACEHOLDER);
      // githubToken value contains a GitHub token - redacted by pattern matching
      expect(result.user.credentials.githubToken).toContain(REDACTION_PLACEHOLDER);
      expect(result.user.credentials.githubToken).not.toContain("ghp_");
    });

    it("should handle arrays", () => {
      const obj = {
        tokens: ["ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789", "normal_value"],
      };
      const result = redactObject(obj) as typeof obj;
      expect(result.tokens[0]).toContain(REDACTION_PLACEHOLDER);
      expect(result.tokens[1]).toBe("normal_value");
    });

    it("should handle null and undefined values", () => {
      const obj = {
        name: "test",
        value: null,
        other: undefined,
      };
      const result = redactObject(obj);
      expect(result.name).toBe("test");
      expect(result.value).toBe(null);
      expect(result.other).toBe(undefined);
    });

    it("should respect maxDepth option", () => {
      // Create deeply nested object
      const createDeep = (depth: number): Record<string, unknown> => {
        if (depth === 0) return { secret: "password=test1234567890" };
        return { nested: createDeep(depth - 1) };
      };

      const deepObj = createDeep(15);
      const result = redactObject(deepObj, { maxDepth: 5 });

      // Should still return an object (not crash)
      expect(result).toBeDefined();
    });
  });

  describe("containsSecrets", () => {
    it("should detect when text contains secrets", () => {
      expect(containsSecrets("token=ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789")).toBe(true);
      expect(containsSecrets("postgres://user:pass@localhost/db")).toBe(true);
    });

    it("should return false for text without secrets", () => {
      expect(containsSecrets("Normal log message")).toBe(false);
      expect(containsSecrets("Error: File not found")).toBe(false);
    });

    it("should handle empty/null inputs", () => {
      expect(containsSecrets("")).toBe(false);
      expect(containsSecrets(null as unknown as string)).toBe(false);
    });
  });

  describe("detectSecretTypes", () => {
    it("should return array of detected secret types", () => {
      const text = `
        GITHUB_TOKEN=ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789
        DATABASE_URL=postgres://admin:pw@localhost:5432/db
      `;
      const types = detectSecretTypes(text);
      expect(types).toContain("GitHub Personal Access Token");
      expect(types).toContain("PostgreSQL Connection String");
    });

    it("should return empty array for text without secrets", () => {
      const types = detectSecretTypes("Normal text");
      expect(types).toHaveLength(0);
    });
  });

  describe("createCustomRedactor", () => {
    it("should create redactor with additional patterns", () => {
      const customRedactor = createCustomRedactor([
        {
          name: "Custom Secret",
          pattern: /CUSTOM_SECRET_[A-Z0-9]{10}/g,
        },
      ]);

      const text = "Using CUSTOM_SECRET_ABC1234567 and ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789";
      const result = customRedactor(text);

      expect(result).not.toContain("CUSTOM_SECRET_ABC1234567");
      expect(result).not.toContain("ghp_");
      expect((result.match(/\[REDACTED\]/g) || []).length).toBe(2);
    });
  });

  describe("Real-world CI log scenarios", () => {
    it("should handle typical CI failure log with accidental secret exposure", () => {
      const ciLog = `
        === Build Started ===
        Cloning repository...
        Setting up environment...
        export GITHUB_TOKEN=ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789
        export DATABASE_URL=postgres://admin:supersecret@prod.db.example.com:5432/app

        Running tests...
        Error: Connection failed to postgres://admin:supersecret@prod.db.example.com:5432/app

        === Build Failed ===
      `;

      const result = redactSecrets(ciLog);
      expect(result).not.toContain("ghp_");
      expect(result).not.toContain("supersecret");
      expect(result).toContain("=== Build Started ===");
      expect(result).toContain("=== Build Failed ===");
      expect(result).toContain("Running tests...");
    });

    it("should preserve log structure while redacting secrets", () => {
      const log = `[2024-01-15 10:30:45] INFO: Starting deployment
[2024-01-15 10:30:46] DEBUG: Using API key api_key=sk-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJ
[2024-01-15 10:30:47] ERROR: Authentication failed`;

      const result = redactSecrets(log);
      expect(result).toContain("[2024-01-15 10:30:45]");
      expect(result).toContain("[2024-01-15 10:30:46]");
      expect(result).toContain("[2024-01-15 10:30:47]");
      expect(result).toContain("INFO:");
      expect(result).toContain("DEBUG:");
      expect(result).toContain("ERROR:");
      expect(result).not.toContain("sk-abcdefghijklmnopqrstuvwxyz");
    });
  });
});

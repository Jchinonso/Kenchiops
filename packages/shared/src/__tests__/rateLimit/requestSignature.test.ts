/**
 * Tests for request signature verification module.
 */

import type { Request } from "express";
import {
  SignatureVerifier,
  createSignatureVerifier,
  createSimpleSignatureVerifier,
} from "../../rateLimit/requestSignature.js";
import { SIGNATURE_DEFAULTS } from "../../rateLimit/types.js";

const SECRET = "test-secret-key-12345";

const createMockRequest = (
  body: unknown,
  signature?: string,
  timestamp?: number,
  path: string = "/api/test",
  method: string = "POST"
): Request => {
  const headers: Record<string, string | undefined> = {
    [SIGNATURE_DEFAULTS.SIGNATURE_HEADER.toLowerCase()]: signature,
    [SIGNATURE_DEFAULTS.TIMESTAMP_HEADER.toLowerCase()]: timestamp?.toString(),
  };

  return {
    body,
    path,
    method,
    query: {},
    headers,
  } as unknown as Request;
};

describe("SignatureVerifier", () => {
  let verifier: SignatureVerifier;

  beforeEach(() => {
    verifier = createSimpleSignatureVerifier(SECRET);
  });

  describe("verify", () => {
    it("should verify valid signature", () => {
      const body = { test: "data" };
      const path = "/api/test";
      const method = "POST";

      const { signature, timestamp } = verifier.sign(body, path, method);
      const req = createMockRequest(body, signature, timestamp, path, method);

      const result = verifier.verify(req);

      expect(result.isValid).toBe(true);
      expect(result.timestamp).toBe(timestamp);
      expect(result.error).toBeUndefined();
    });

    it("should reject missing signature header", () => {
      const req = createMockRequest({ test: "data" }, undefined, Date.now());

      const result = verifier.verify(req);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe("Missing x-signature header");
    });

    it("should reject missing timestamp header", () => {
      const validHexSig = "a".repeat(64);
      const req = createMockRequest({ test: "data" }, validHexSig, undefined);

      const result = verifier.verify(req);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe("Missing x-timestamp header");
    });

    it("should reject invalid timestamp format", () => {
      const validHexSig = "a".repeat(64);
      const req = {
        body: { test: "data" },
        path: "/api/test",
        method: "POST",
        query: {},
        headers: {
          [SIGNATURE_DEFAULTS.SIGNATURE_HEADER.toLowerCase()]: validHexSig,
          [SIGNATURE_DEFAULTS.TIMESTAMP_HEADER.toLowerCase()]: "not-a-number",
        },
      } as unknown as Request;

      const result = verifier.verify(req);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe("Invalid timestamp format");
    });

    it("should reject expired signature", () => {
      const body = { test: "data" };
      const path = "/api/test";
      const method = "POST";

      const { signature } = verifier.sign(body, path, method);
      const oldTimestamp = Date.now() - SIGNATURE_DEFAULTS.MAX_AGE_MS - 1000;
      const req = createMockRequest(body, signature, oldTimestamp, path, method);

      const result = verifier.verify(req);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe("Signature expired");
    });

    it("should reject future timestamp", () => {
      const body = { test: "data" };
      const path = "/api/test";
      const method = "POST";

      const { signature } = verifier.sign(body, path, method);
      const futureTimestamp = Date.now() + SIGNATURE_DEFAULTS.MAX_AGE_MS + 1000;
      const req = createMockRequest(body, signature, futureTimestamp, path, method);

      const result = verifier.verify(req);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe("Invalid timestamp (future)");
    });

    it("should reject invalid signature format", () => {
      const body = { test: "data" };
      const timestamp = Date.now();
      const req = createMockRequest(body, "invalid-signature", timestamp);

      const result = verifier.verify(req);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe("Invalid signature format");
    });

    it("should reject wrong signature value", () => {
      const body = { test: "data" };
      const timestamp = Date.now();
      const wrongSig = "a".repeat(64);
      const req = createMockRequest(body, wrongSig, timestamp);

      const result = verifier.verify(req);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe("Invalid signature");
    });

    it("should reject tampered body", () => {
      const body = { test: "data" };
      const path = "/api/test";
      const method = "POST";

      const { signature, timestamp } = verifier.sign(body, path, method);
      const tamperedBody = { test: "tampered" };
      const req = createMockRequest(tamperedBody, signature, timestamp, path, method);

      const result = verifier.verify(req);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe("Invalid signature");
    });
  });

  describe("sign", () => {
    it("should generate signature and timestamp", () => {
      const result = verifier.sign({ test: "data" }, "/api/test", "POST");

      expect(result.signature).toBeDefined();
      expect(result.signature).toMatch(/^[a-f0-9]+$/);
      expect(result.timestamp).toBeDefined();
      expect(typeof result.timestamp).toBe("number");
    });

    it("should generate different signatures for different bodies", () => {
      const sig1 = verifier.sign({ a: 1 }, "/api/test", "POST");
      const sig2 = verifier.sign({ a: 2 }, "/api/test", "POST");

      expect(sig1.signature).not.toBe(sig2.signature);
    });

    it("should generate different signatures for different paths when path is signed", () => {
      // Create a verifier that includes path in signed fields
      const pathVerifier = createSignatureVerifier({
        secret: SECRET,
        signedFields: ["body", "path", "timestamp"],
      });

      const sig1 = pathVerifier.sign({ a: 1 }, "/api/test1", "POST");
      const sig2 = pathVerifier.sign({ a: 1 }, "/api/test2", "POST");

      expect(sig1.signature).not.toBe(sig2.signature);
    });

    it("should generate different signatures for different methods when method is signed", () => {
      // Create a verifier that includes method in signed fields
      const methodVerifier = createSignatureVerifier({
        secret: SECRET,
        signedFields: ["body", "method", "timestamp"],
      });

      const sig1 = methodVerifier.sign({ a: 1 }, "/api/test", "POST");
      const sig2 = methodVerifier.sign({ a: 1 }, "/api/test", "PUT");

      expect(sig1.signature).not.toBe(sig2.signature);
    });
  });

  describe("multi-key setup", () => {
    const secrets: Record<string, string> = {
      key1: "secret-for-key1",
      key2: "secret-for-key2",
    };

    const multiKeyVerifier = createSignatureVerifier({
      secret: (keyId) => secrets[keyId] ?? null,
    });

    it("should verify with correct key ID", () => {
      const body = { test: "data" };
      const path = "/api/test";
      const method = "POST";

      const { signature, timestamp } = multiKeyVerifier.sign(body, path, method, { keyId: "key1" });

      const req = {
        body,
        path,
        method,
        query: {},
        headers: {
          [SIGNATURE_DEFAULTS.SIGNATURE_HEADER.toLowerCase()]: signature,
          [SIGNATURE_DEFAULTS.TIMESTAMP_HEADER.toLowerCase()]: timestamp.toString(),
          [SIGNATURE_DEFAULTS.KEY_ID_HEADER.toLowerCase()]: "key1",
        },
      } as unknown as Request;

      const result = multiKeyVerifier.verify(req);

      expect(result.isValid).toBe(true);
      expect(result.keyId).toBe("key1");
    });

    it("should reject missing key ID", () => {
      const validHexSig = "a".repeat(64);
      const req = {
        body: { test: "data" },
        path: "/api/test",
        method: "POST",
        query: {},
        headers: {
          [SIGNATURE_DEFAULTS.SIGNATURE_HEADER.toLowerCase()]: validHexSig,
          [SIGNATURE_DEFAULTS.TIMESTAMP_HEADER.toLowerCase()]: Date.now().toString(),
        },
      } as unknown as Request;

      const result = multiKeyVerifier.verify(req);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe("Missing x-key-id header");
    });

    it("should reject unknown key ID", () => {
      const validHexSig = "a".repeat(64);
      const req = {
        body: { test: "data" },
        path: "/api/test",
        method: "POST",
        query: {},
        headers: {
          [SIGNATURE_DEFAULTS.SIGNATURE_HEADER.toLowerCase()]: validHexSig,
          [SIGNATURE_DEFAULTS.TIMESTAMP_HEADER.toLowerCase()]: Date.now().toString(),
          [SIGNATURE_DEFAULTS.KEY_ID_HEADER.toLowerCase()]: "unknown-key",
        },
      } as unknown as Request;

      const result = multiKeyVerifier.verify(req);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe("Unknown key ID");
    });

    it("should throw when signing without key ID in multi-key setup", () => {
      expect(() => {
        multiKeyVerifier.sign({ test: "data" }, "/api/test", "POST");
      }).toThrow("Key ID required for multi-key setup");
    });

    it("should throw when signing with unknown key ID", () => {
      expect(() => {
        multiKeyVerifier.sign({ test: "data" }, "/api/test", "POST", { keyId: "unknown" });
      }).toThrow("Unknown key ID");
    });
  });

  describe("custom configuration", () => {
    it("should use custom headers", () => {
      const customVerifier = createSignatureVerifier({
        secret: SECRET,
        signatureHeader: "X-Custom-Sig",
        timestampHeader: "X-Custom-Time",
      });

      const body = { test: "data" };
      const path = "/api/test";
      const method = "POST";
      const { signature, timestamp } = customVerifier.sign(body, path, method);

      const req = {
        body,
        path,
        method,
        query: {},
        headers: {
          "x-custom-sig": signature,
          "x-custom-time": timestamp.toString(),
        },
      } as unknown as Request;

      const result = customVerifier.verify(req);
      expect(result.isValid).toBe(true);
    });

    it("should use custom max age", () => {
      const shortMaxAgeVerifier = createSignatureVerifier({
        secret: SECRET,
        maxAge: 1000, // 1 second
      });

      const body = { test: "data" };
      const path = "/api/test";
      const method = "POST";
      const { signature } = shortMaxAgeVerifier.sign(body, path, method);

      // Timestamp 2 seconds ago
      const oldTimestamp = Date.now() - 2000;
      const req = createMockRequest(body, signature, oldTimestamp, path, method);

      const result = shortMaxAgeVerifier.verify(req);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("Signature expired");
    });

    it("should use custom signed fields", () => {
      // Only sign body and timestamp
      const partialVerifier = createSignatureVerifier({
        secret: SECRET,
        signedFields: ["body", "timestamp"],
      });

      const body = { test: "data" };
      const { signature, timestamp } = partialVerifier.sign(body, "/path1", "POST");

      // Different path and method should still verify
      const req = createMockRequest(body, signature, timestamp, "/path2", "GET");
      const result = partialVerifier.verify(req);

      expect(result.isValid).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("should handle empty body", () => {
      const body = {};
      const path = "/api/test";
      const method = "POST";

      const { signature, timestamp } = verifier.sign(body, path, method);
      const req = createMockRequest(body, signature, timestamp, path, method);

      const result = verifier.verify(req);
      expect(result.isValid).toBe(true);
    });

    it("should handle null body", () => {
      const body = null;
      const path = "/api/test";
      const method = "POST";

      const { signature, timestamp } = verifier.sign(body, path, method);
      const req = createMockRequest(body, signature, timestamp, path, method);

      const result = verifier.verify(req);
      expect(result.isValid).toBe(true);
    });

    it("should handle string body", () => {
      const stringVerifier = createSimpleSignatureVerifier(SECRET);

      const body = "plain text body";
      const path = "/api/test";
      const method = "POST";

      const { signature, timestamp } = stringVerifier.sign(body, path, method);

      const req = {
        body,
        path,
        method,
        query: {},
        headers: {
          [SIGNATURE_DEFAULTS.SIGNATURE_HEADER.toLowerCase()]: signature,
          [SIGNATURE_DEFAULTS.TIMESTAMP_HEADER.toLowerCase()]: timestamp.toString(),
        },
      } as unknown as Request;

      const result = stringVerifier.verify(req);
      expect(result.isValid).toBe(true);
    });

    it("should reject multiple signature headers (header injection protection)", () => {
      const body = { test: "data" };
      const path = "/api/test";
      const method = "POST";
      const { signature, timestamp } = verifier.sign(body, path, method);

      const req = {
        body,
        path,
        method,
        query: {},
        headers: {
          [SIGNATURE_DEFAULTS.SIGNATURE_HEADER.toLowerCase()]: [signature, "other"],
          [SIGNATURE_DEFAULTS.TIMESTAMP_HEADER.toLowerCase()]: [timestamp.toString(), "other"],
        },
      } as unknown as Request;

      const result = verifier.verify(req);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("Multiple x-signature headers not allowed");
    });

    it("should accept single-element array header value", () => {
      const body = { test: "data" };
      const path = "/api/test";
      const method = "POST";
      const { signature, timestamp } = verifier.sign(body, path, method);

      const req = {
        body,
        path,
        method,
        query: {},
        headers: {
          [SIGNATURE_DEFAULTS.SIGNATURE_HEADER.toLowerCase()]: [signature],
          [SIGNATURE_DEFAULTS.TIMESTAMP_HEADER.toLowerCase()]: [timestamp.toString()],
        },
      } as unknown as Request;

      const result = verifier.verify(req);
      expect(result.isValid).toBe(true);
    });
  });
});

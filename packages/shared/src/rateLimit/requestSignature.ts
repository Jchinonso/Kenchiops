/**
 * Request Signature Verification (HMAC)
 *
 * Verifies request authenticity using HMAC signatures.
 *
 * Features:
 * - HMAC-SHA256/384/512 signature verification
 * - Timestamp validation with separate replay window and clock skew tolerance
 * - Multi-key support with secure key ID logging
 * - Configurable signed fields
 * - RFC 3986 compliant query canonicalization (URL-encoded, sorted, repeated params)
 * - Raw body support for webhook-style verification
 * - Configurable path source (req.path vs req.originalUrl)
 *
 * SECURITY:
 * - Multiple signature/timestamp/keyId headers rejected (header injection)
 * - Empty header values rejected
 * - Algorithm restricted to whitelist (sha256, sha384, sha512)
 * - Signature format validated (hex, correct length for algorithm)
 * - Key IDs hashed before logging (privacy)
 * - Constant-time signature comparison (timing attack protection)
 *
 * QUERY CANONICALIZATION (RFC 3986 compliant):
 * - Keys sorted alphabetically
 * - Arrays represented as repeated params: a=1&a=2 (not a=1,2)
 * - Keys and values URL-encoded with encodeURIComponent
 * - Nested objects not supported (rejected as invalid)
 *
 * @module rateLimit/requestSignature
 */

import type { Request } from "express";
import crypto from "crypto";
import { createLogger } from "../core/logger.js";
import { ValidationError } from "../core/errors.js";
import {
  SIGNATURE_DEFAULTS,
  ALLOWED_SIGNATURE_ALGORITHMS,
  SIGNATURE_HEX_LENGTHS,
  HEX_SIGNATURE_PATTERN,
  TIMESTAMP_PATTERN,
  KEY_ID_LOG_PREFIX_LENGTH,
  type SignatureConfig,
  type SignatureVerificationResult,
  type SignedField,
  type SignatureAlgorithm,
  type PathSource,
  type SignaturePayloadOptions,
  type SignOptions,
  type RequestWithRawBody,
  type HeaderExtractionResult,
  type QueryValue,
} from "./types.js";

const logger = createLogger("request-signature");

// ==================== Result Helpers ====================

const fail = (
  error: string,
  extra?: Partial<SignatureVerificationResult>
): SignatureVerificationResult => ({ isValid: false, error, ...extra });

const success = (extra?: Partial<SignatureVerificationResult>): SignatureVerificationResult => ({
  isValid: true,
  ...extra,
});

// ==================== Header Extraction ====================

const extractSingleHeader = (req: Request, headerName: string): HeaderExtractionResult => {
  const headerValue = req.headers[headerName.toLowerCase()];
  const isMultiple = Array.isArray(headerValue) && headerValue.length > 1;

  if (isMultiple) {
    return { error: `Multiple ${headerName} headers not allowed` };
  }

  const rawValue = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  const trimmed = typeof rawValue === "string" ? rawValue.trim() : "";

  return trimmed ? { value: trimmed } : { error: `Missing ${headerName} header` };
};

const hasError = (result: HeaderExtractionResult): result is { error: string } => "error" in result;

// ==================== Validation ====================

const isValidSignatureFormat = (signature: string, algorithm: SignatureAlgorithm): boolean =>
  signature.length === SIGNATURE_HEX_LENGTHS[algorithm] && HEX_SIGNATURE_PATTERN.test(signature);

const isValidTimestampFormat = (timestamp: string): boolean => TIMESTAMP_PATTERN.test(timestamp);

const isAllowedAlgorithm = (algorithm: string): algorithm is SignatureAlgorithm =>
  (ALLOWED_SIGNATURE_ALGORITHMS as readonly string[]).includes(algorithm);

const isNestedObject = (value: unknown): boolean =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// ==================== Query Canonicalization ====================

const encodeParam = (key: string, value: string): string =>
  `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;

const formatQueryEntry = (key: string, value: QueryValue): string[] =>
  value === undefined
    ? []
    : (Array.isArray(value) ? value : [value]).map((v) => encodeParam(key, String(v)));

const canonicalizeQuery = (query: Request["query"]): string | null => {
  const queryObj = query ?? {};
  const keys = Object.keys(queryObj).sort();

  // Check for nested objects (unsupported)
  const hasNested = keys.some((key) => isNestedObject(queryObj[key]));
  if (hasNested) {
    return null;
  }

  return keys.flatMap((key) => formatQueryEntry(key, queryObj[key] as QueryValue)).join("&");
};

// ==================== Payload Building ====================

const stringifyBody = (body: unknown): string =>
  typeof body === "string" ? body : JSON.stringify(body ?? "");

const bufferToString = (buf: Buffer | string): string =>
  typeof buf === "string" ? buf : buf.toString("utf8");

const getBodyContent = (req: RequestWithRawBody, useRawBody: boolean): string =>
  useRawBody && req.rawBody !== undefined ? bufferToString(req.rawBody) : stringifyBody(req.body);

const extractPathFromUrl = (url: string): string => {
  const queryIndex = url.indexOf("?");
  return queryIndex >= 0 ? url.slice(0, queryIndex) : url;
};

const getRequestPath = (req: Request, pathSource: PathSource): string =>
  pathSource === "originalUrl"
    ? extractPathFromUrl(req.originalUrl ?? req.url ?? req.path)
    : req.path;

const FIELD_EXTRACTORS: Record<
  SignedField,
  (req: RequestWithRawBody, ts: string, opts: SignaturePayloadOptions) => string | null
> = {
  body: (req, _, opts) => getBodyContent(req, opts.useRawBody),
  path: (req, _, opts) => getRequestPath(req, opts.pathSource),
  method: (req) => req.method,
  timestamp: (_, ts) => ts,
  query: (req, _, opts) =>
    opts.sortQueryParams ? canonicalizeQuery(req.query) : JSON.stringify(req.query ?? {}),
};

const buildSignaturePayload = (
  req: RequestWithRawBody,
  timestamp: string,
  fields: readonly SignedField[],
  options: SignaturePayloadOptions
): string | null => {
  const parts: Array<string | null> = fields.map((field) =>
    FIELD_EXTRACTORS[field](req, timestamp, options)
  );

  return parts.includes(null) ? null : (parts as string[]).join("\n");
};

// ==================== Crypto ====================

const computeSignature = (payload: string, secret: string, algorithm: SignatureAlgorithm): string =>
  crypto.createHmac(algorithm, secret).update(payload).digest("hex");

const secureCompare = (a: string, b: string): boolean =>
  a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

const hashKeyIdForLogging = (keyId: string): string =>
  `${crypto.createHash("sha256").update(keyId).digest("hex").slice(0, KEY_ID_LOG_PREFIX_LENGTH)}...`;

const safeKeyIdHash = (keyId: string | undefined): string | undefined =>
  keyId ? hashKeyIdForLogging(keyId) : undefined;

// ==================== Signature Verifier ====================

export class SignatureVerifier {
  private readonly signatureHeader: string;
  private readonly timestampHeader: string;
  private readonly keyIdHeader: string;
  private readonly secret: string | ((keyId: string) => string | null);
  private readonly algorithm: SignatureAlgorithm;
  private readonly maxAge: number;
  private readonly clockSkewMs: number;
  private readonly signedFields: readonly SignedField[];
  private readonly useRawBody: boolean;
  private readonly sortQueryParams: boolean;
  private readonly pathSource: PathSource;

  constructor(config: SignatureConfig) {
    const algorithm = config.algorithm ?? SIGNATURE_DEFAULTS.ALGORITHM;

    if (!isAllowedAlgorithm(algorithm)) {
      throw new ValidationError(
        `Invalid signature algorithm: ${algorithm}. Allowed: ${ALLOWED_SIGNATURE_ALGORITHMS.join(", ")}`,
        { metadata: { provided: algorithm, allowed: ALLOWED_SIGNATURE_ALGORITHMS } }
      );
    }

    this.signatureHeader = config.signatureHeader ?? SIGNATURE_DEFAULTS.SIGNATURE_HEADER;
    this.timestampHeader = config.timestampHeader ?? SIGNATURE_DEFAULTS.TIMESTAMP_HEADER;
    this.keyIdHeader = config.keyIdHeader ?? SIGNATURE_DEFAULTS.KEY_ID_HEADER;
    this.secret = config.secret;
    this.algorithm = algorithm;
    this.maxAge = config.maxAge ?? SIGNATURE_DEFAULTS.MAX_AGE_MS;
    this.clockSkewMs = config.clockSkewMs ?? SIGNATURE_DEFAULTS.CLOCK_SKEW_MS;
    this.signedFields = config.signedFields ?? SIGNATURE_DEFAULTS.SIGNED_FIELDS;
    this.useRawBody = config.useRawBody ?? false;
    this.sortQueryParams = config.sortQueryParams ?? true;
    this.pathSource = config.pathSource ?? SIGNATURE_DEFAULTS.PATH_SOURCE;
  }

  verify(req: Request): SignatureVerificationResult {
    // 1. Extract and validate signature
    const sigHeader = extractSingleHeader(req, this.signatureHeader);
    if (hasError(sigHeader)) {
      logger.warn("Signature header issue", { error: sigHeader.error });
      return fail(sigHeader.error);
    }

    if (!isValidSignatureFormat(sigHeader.value, this.algorithm)) {
      logger.warn("Invalid signature format", {
        algorithm: this.algorithm,
        expectedLength: SIGNATURE_HEX_LENGTHS[this.algorithm],
        actualLength: sigHeader.value.length,
      });
      return fail("Invalid signature format");
    }

    // 2. Extract and validate timestamp
    const tsHeader = extractSingleHeader(req, this.timestampHeader);
    if (hasError(tsHeader)) {
      logger.warn("Timestamp header issue", { error: tsHeader.error });
      return fail(tsHeader.error);
    }

    if (!isValidTimestampFormat(tsHeader.value)) {
      return fail("Invalid timestamp format");
    }

    const timestamp = parseInt(tsHeader.value, 10);
    const age = Date.now() - timestamp;

    if (age > this.maxAge) {
      logger.warn("Signature expired", { age, maxAge: this.maxAge });
      return fail("Signature expired", { timestamp, age });
    }

    if (age < -this.clockSkewMs) {
      logger.warn("Signature from future", { age, clockSkewMs: this.clockSkewMs });
      return fail("Invalid timestamp (future)", { timestamp, age });
    }

    // 3. Resolve secret (static or multi-key)
    const secretResult = this.resolveSecret(req);
    if (!secretResult.ok) {
      return secretResult.error;
    }

    const { secret, keyId } = secretResult;

    // 4. Build payload and verify signature
    const payload = buildSignaturePayload(
      req as RequestWithRawBody,
      tsHeader.value,
      this.signedFields,
      {
        useRawBody: this.useRawBody,
        sortQueryParams: this.sortQueryParams,
        pathSource: this.pathSource,
      }
    );

    if (payload === null) {
      logger.warn("Invalid payload data", { keyIdHash: safeKeyIdHash(keyId) });
      return fail("Invalid payload data (unsupported query format)", { keyId, timestamp, age });
    }

    const expected = computeSignature(payload, secret, this.algorithm);

    if (!secureCompare(sigHeader.value, expected)) {
      logger.warn("Invalid signature", { keyIdHash: safeKeyIdHash(keyId) });
      return fail("Invalid signature", { keyId, timestamp, age });
    }

    return success({ keyId, timestamp, age });
  }

  private resolveSecret(
    req: Request
  ):
    | { ok: true; secret: string; keyId: string | undefined }
    | { ok: false; error: SignatureVerificationResult } {
    // Static secret - no key ID needed
    if (typeof this.secret !== "function") {
      return { ok: true, secret: this.secret, keyId: undefined };
    }

    // Multi-key setup - extract key ID
    const keyIdHeader = extractSingleHeader(req, this.keyIdHeader);
    if (hasError(keyIdHeader)) {
      logger.warn("Key ID header issue", { error: keyIdHeader.error });
      return { ok: false, error: fail(keyIdHeader.error) };
    }

    const secret = this.secret(keyIdHeader.value);
    if (!secret) {
      logger.warn("Unknown key ID", { keyIdHash: hashKeyIdForLogging(keyIdHeader.value) });
      return { ok: false, error: fail("Unknown key ID", { keyId: keyIdHeader.value }) };
    }

    return { ok: true, secret, keyId: keyIdHeader.value };
  }

  sign(
    body: unknown,
    path: string,
    method: string,
    options?: SignOptions
  ): { signature: string; timestamp: number } {
    const timestamp = Date.now();
    const secret = this.resolveSecretForSigning(options?.keyId);

    const mockReq: RequestWithRawBody = {
      body,
      path,
      originalUrl: path,
      url: path,
      method,
      query: options?.query ?? {},
      rawBody: options?.rawBody,
    } as RequestWithRawBody;

    const payload = buildSignaturePayload(mockReq, String(timestamp), this.signedFields, {
      useRawBody: options?.rawBody !== undefined,
      sortQueryParams: this.sortQueryParams,
      pathSource: this.pathSource,
    });

    if (payload === null) {
      throw new ValidationError("Invalid payload data (unsupported query format)");
    }

    return { signature: computeSignature(payload, secret, this.algorithm), timestamp };
  }

  private resolveSecretForSigning(keyId?: string): string {
    if (typeof this.secret !== "function") {
      return this.secret;
    }

    if (!keyId) {
      throw new ValidationError("Key ID required for multi-key setup");
    }

    const secret = this.secret(keyId);
    if (!secret) {
      throw new ValidationError("Unknown key ID", { metadata: { keyId } });
    }

    return secret;
  }

  getAlgorithm(): SignatureAlgorithm {
    return this.algorithm;
  }

  getExpectedSignatureLength(): number {
    return SIGNATURE_HEX_LENGTHS[this.algorithm];
  }

  getPathSource(): PathSource {
    return this.pathSource;
  }
}

// ==================== Factory Functions ====================

export const createSignatureVerifier = (config: SignatureConfig): SignatureVerifier =>
  new SignatureVerifier(config);

export const createSimpleSignatureVerifier = (secret: string): SignatureVerifier =>
  new SignatureVerifier({ secret });

// ==================== Middleware Helper ====================

export const captureRawBody = (
  req: RequestWithRawBody,
  _res: unknown,
  buf: Buffer,
  _encoding: string
): void => {
  req.rawBody = buf;
};

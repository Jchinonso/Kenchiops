# Rate Limiting System Documentation

## Overview

The rate limiting system provides comprehensive protection against abuse, denial-of-service attacks, and unauthorized access. It implements multiple layers of defense that work together to protect API endpoints while maintaining a good experience for legitimate users.

---

## Threat Model & Non-Goals

### What This Protects Against

- Application-layer abuse (credential stuffing, scraping, API abuse)
- Per-tenant/user rate enforcement
- Bot and automation detection
- Geographic-based access control
- Request authenticity verification

### What This Does NOT Protect Against

- Volumetric L3/L4 DDoS attacks (use CDN/WAF)
- Network-layer flooding
- Distributed attacks from millions of IPs (use edge protection)

---

## Architecture

The system is organized into focused modules:

```
rateLimit/
├── index.ts           # Main entry point and rate limiter classes
├── types.ts           # Type definitions and configuration constants
├── security.ts        # IP validation, fingerprinting, key generation
├── stores.ts          # Redis and in-memory storage backends
├── burstDetection.ts  # Behavioral analysis for request patterns
├── botDetection.ts    # User-Agent analysis and bot identification
├── geoRestriction.ts  # Geographic-based access control
├── apiKey.ts          # API key validation and per-key quotas
├── endpointLimits.ts  # Per-endpoint rate limit configuration
└── requestSignature.ts # HMAC-based request authentication
```

---

## Order of Operations (Defense Layers)

Process requests in this order for optimal performance (reject early with cheap checks):

```
┌─────────────────────────────────────────────┐
│ 1. Geographic Restriction                    │ ← Cheapest: header lookup
│    Block/rate-limit by country code          │
└─────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────┐
│ 2. API Key Validation                        │ ← Header extraction
│    Validate format, apply per-key limits     │
└─────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────┐
│ 3. Bot Detection                             │ ← User-Agent regex
│    Identify bots, apply rate multiplier      │
└─────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────┐
│ 4. Per-Endpoint Limits                       │ ← Path matching
│    Apply endpoint-specific limits            │
└─────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────┐
│ 5. Burst Detection                           │ ← Timestamp tracking
│    Detect abnormal request patterns          │
└─────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────┐
│ 6. Request Signature (HMAC)                  │ ← Most expensive: crypto
│    Verify request authenticity               │
└─────────────────────────────────────────────┘
```

---

## Critical Configuration: Distributed Fallback Policy

### The Problem

When Redis is unavailable in multi-instance deployments, falling back to in-memory rate limiting creates a **bypass vulnerability**. Attackers can spray requests across instances, each with separate counters.

### Fallback Behaviors

| Behavior         | Description                    | When to Use                       |
| ---------------- | ------------------------------ | --------------------------------- |
| `"memory"`       | Use in-memory fallback         | Development only, single instance |
| `"fail"`         | Return 503 Service Unavailable | **Production (recommended)**      |
| `"conservative"` | Apply 10 req/min global limit  | Degraded service with protection  |

### Configuration

```typescript
const limiter = createRedisRateLimiter({
  windowMs: 60000,
  max: 100,
  // CRITICAL: Set to "fail" in production multi-instance deployments
  distributedFallback: "fail",
});
```

### Policy Matrix

| Scenario                            | Recommended Action                    |
| ----------------------------------- | ------------------------------------- |
| Redis down at startup               | `"fail"` → 503, or `"conservative"`   |
| Redis times out mid-request         | Circuit breaker, then fallback policy |
| Multi-instance + fallback to memory | **DANGEROUS** - use `"fail"`          |

---

## Trusted Proxy Configuration

### The Problem

Headers like `X-Forwarded-For` and `CF-IPCountry` are **attacker-controlled** unless the request came from a trusted proxy.

### Solution

Only trust forwarded headers when `remoteAddress` is in trusted CIDR ranges:

```typescript
import { CLOUDFLARE_IPV4_CIDRS } from "@kenchi/shared/rateLimit";

const trustedProxyConfig: TrustedProxyConfig = {
  enabled: true,
  cidrs: CLOUDFLARE_IPV4_CIDRS,
  trustedHeaders: ["x-forwarded-for", "cf-ipcountry", "cf-connecting-ip"],
};
```

### Logic

```
if (remoteAddress ∈ trustedProxyCidrs) {
  // Trust X-Forwarded-For, CF-IPCountry, etc.
  clientIP = parseXForwardedFor(headers)
} else {
  // Ignore forwarded headers (attacker-controlled)
  clientIP = remoteAddress
}
```

### Pre-configured CDN CIDRs

- `CLOUDFLARE_IPV4_CIDRS` - Cloudflare IPv4 ranges (update periodically)

---

## Core Components

### Rate Limiter Classes

#### Redis-Backed Rate Limiter

- Uses Redis sliding window counter for accurate, distributed rate limiting
- Works across multiple server instances in a cluster
- Configurable fallback behavior when Redis unavailable
- Implements exponential backoff for Redis reconnection

#### Synchronous In-Memory Rate Limiter

- Uses a local Map for storing rate limit entries
- Provides synchronous middleware (no async overhead)
- Includes deterministic cleanup to prevent memory leaks
- **WARNING**: Only use for single-instance deployments

### Storage Backends

#### Redis Store

- Distributed across server instances
- Uses atomic Lua scripts for increment operations
- Supports sliding window algorithm
- Automatic key expiration via Redis TTL

#### In-Memory Store

- Local to each server instance
- Periodic cleanup of expired entries
- Maximum entry limit (default: 50,000)
- **Not suitable for distributed deployments**

---

## Security Features

### 1. Burst Detection (Behavioral Analysis)

Identifies abnormal request patterns that indicate automated attacks.

**Algorithm Options**:

| Algorithm       | Memory       | Accuracy | Use Case           |
| --------------- | ------------ | -------- | ------------------ |
| Timestamp array | O(n) per key | High     | Low-traffic APIs   |
| Token bucket    | O(1) per key | Medium   | High-traffic APIs  |
| EWMA            | O(1) per key | Medium   | Memory-constrained |

**Current Implementation**: Timestamp array with configurable max size.

**Configuration**:

```typescript
const detector = createBurstDetector({
  windowMs: 1000, // 1 second window
  maxBurst: 10, // Max 10 requests per window
  penaltyMultiplier: 2, // 2x rate limit penalty
  blockOnBurst: false, // Don't block, just penalize
});
```

### 2. Bot Detection (Signal-Based)

Analyzes User-Agent headers to detect bots and automation.

**IMPORTANT**: Bot detection should be **signal-based**, not automatic blocking. Blocking `curl`, `python`, etc. breaks:

- Legitimate partner integrations
- Internal scripts and tools
- Webhook testing

**Recommended Approach**:

- Use bot detection as a **signal** for rate limiting
- Only block unauthenticated requests
- Provide bypass for trusted API keys

**Configuration**:

```typescript
const detector = createBotDetector({
  allowSearchEngines: true,
  allowMonitoring: true,
  blockMalicious: false, // Don't auto-block (breaks integrations)
  botRateMultiplier: 0.5, // Half rate limit for detected bots
  onlyBlockUnauthenticated: true,
  bypassApiKeys: ["trusted-partner-key", "internal-tool-key"],
});
```

**Bot Categories**:

- **Search Engines**: Google, Bing, Yahoo, Baidu, DuckDuckGo, Yandex
- **Monitoring**: Pingdom, UptimeRobot, NewRelic, Datadog
- **Suspicious** (signal only): curl, wget, python-requests, scrapy

### 3. Geographic Restrictions

Controls access based on geographic location via CDN headers.

**Modes**:

- **Allowlist**: Only specified countries can access
- **Blocklist**: Specified countries are blocked or rate-limited

**Configuration**:

```typescript
// Allow only US and EU
const geoRestriction = createGeoAllowlist(["US", "GB", "DE", "FR"], {
  unknownCountryAction: "rate_limit",
  restrictedRateMultiplier: 0.25,
});
```

### 4. API Key Validation

Authenticates requests and applies per-key rate limits.

**Configuration**:

```typescript
const validator = createApiKeyValidator({
  headerName: "x-api-key",
  keyLimits: {
    "premium-customer-key": { max: 1000, windowMs: 60000 },
    "free-tier-key": { max: 10, windowMs: 60000 },
  },
  defaultLimit: { max: 100, windowMs: 60000 },
});
```

### 5. Per-Endpoint Limits (with Cost Weights)

Applies different rate limits based on endpoint path and method.

**Weighted Rate Limiting**:

For expensive operations (LLM analysis, file uploads), use cost weights:

```typescript
const limiter = createEndpointLimiter({
  endpoints: [
    {
      pattern: "/api/analyze",
      methods: ["POST"],
      max: 100, // 100 cost units per window
      windowMs: 60000,
      weight: 10, // Each request costs 10 units
    },
    {
      pattern: "/api/health",
      max: 1000,
      windowMs: 1000,
      weight: 0, // Free (no cost)
    },
    {
      pattern: /^\/api\//,
      max: 100,
      windowMs: 60000,
      weight: 1, // Default: 1 unit per request
    },
  ],
  defaultLimit: { max: 100, windowMs: 60000 },
});
```

### 6. Request Signature Verification (HMAC)

Verifies request authenticity using cryptographic signatures.

**Canonical String Format**:

```
METHOD\n
PATH\n
CANONICAL_QUERY\n
TIMESTAMP\n
SHA256(BODY)\n
```

**Canonicalization Rules**:

- Query params: sorted alphabetically, URL-encoded
- Body: SHA-256 hash of raw bytes as received
- Headers: lowercase, trimmed

**Configuration**:

```typescript
const verifier = createSignatureVerifier({
  secret: process.env.HMAC_SECRET,
  maxAge: 300000, // 5 minutes
  signedFields: ["method", "path", "query", "body", "timestamp"],
  strictBodyHash: true, // Hash raw bytes, not JSON
  sortQueryParams: true, // Canonical query string
});
```

**Handling Streaming Bodies**:

- Require `Content-Length` header
- Buffer body before processing
- Or compute hash incrementally with known length

---

## Identity & Key Generation

### Priority Order

1. Authenticated user ID (from request context)
2. Tenant ID (from request context)
3. API key (hashed)
4. Validated IP address
5. Request fingerprint (fallback)

### Key Structure

```
With identity + IP:     "tenant:abc|ip:1.2.3.4"
With identity + FP:     "tenant:abc|fp:a1b2c3d4"
IP only:                "ip:1.2.3.4"
Fingerprint only:       "fp:a1b2c3d4"
```

---

## HTTP Response Headers

| Header                  | Description                            |
| ----------------------- | -------------------------------------- |
| `X-RateLimit-Limit`     | Maximum requests allowed in window     |
| `X-RateLimit-Remaining` | Requests remaining in current window   |
| `X-RateLimit-Reset`     | Unix timestamp when window resets      |
| `Retry-After`           | Seconds to wait (only on 429 response) |

**Reset Semantics**:

- For sliding window: reset time is "when oldest request expires"
- Value is Unix timestamp in **seconds** (not milliseconds)

---

## Configuration Example (Production)

```typescript
import {
  createRedisRateLimiter,
  createEndpointLimiterWithDefaults,
  createBotDetector,
  createGeoBlocklist,
  createSignatureVerifier,
  CLOUDFLARE_IPV4_CIDRS,
} from "@kenchi/shared/rateLimit";

// 1. Geo restriction (block high-risk countries)
const geoRestriction = createGeoBlocklist(["CN", "RU", "KP"], {
  unknownCountryAction: "rate_limit",
});

// 2. Bot detection (signal-based, not blocking)
const botDetector = createBotDetector({
  blockMalicious: false,
  botRateMultiplier: 0.5,
  bypassApiKeys: [process.env.INTERNAL_API_KEY],
});

// 3. Endpoint limits with weights
const endpointLimiter = createEndpointLimiterWithDefaults([
  {
    pattern: "/api/analyze",
    methods: ["POST"],
    max: 50,
    windowMs: 60000,
    weight: 10, // Expensive LLM operation
  },
]);

// 4. Main rate limiter (production-safe)
const rateLimiter = createRedisRateLimiter({
  windowMs: 60000,
  max: 100,
  keyPrefix: "rl:api:",
  distributedFallback: "fail", // CRITICAL for production
});

// 5. Signature verification (for webhooks)
const signatureVerifier = createSignatureVerifier({
  secret: (keyId) => getSecretForKey(keyId),
  maxAge: 300000,
  strictBodyHash: true,
});
```

---

## Testing Strategy

### Unit Tests

- Key derivation: identity extraction, IP validation
- Header trust: proxy validation, forwarded header parsing
- Endpoint matching: pattern precedence, method filtering
- Burst detection: threshold behavior, penalty application

### Property Tests

- Rate limit remaining is never negative
- Reset time is always in the future
- Key generation is deterministic for same input

### Load Tests

- Redis latency under load
- Lua script atomicity
- Cleanup behavior with millions of keys
- Memory store limits

### Chaos Tests

- Redis connection flapping
- Clock skew for signature verification
- CDN header manipulation
- Concurrent retry attempts

---

## Monitoring & Observability

### Logged Events

| Event               | Level | When                        |
| ------------------- | ----- | --------------------------- |
| Redis unavailable   | WARN  | Initial connection failure  |
| Redis fallback      | WARN  | Mid-operation Redis failure |
| Redis restored      | INFO  | Successful reconnection     |
| Rate limit exceeded | ERROR | Client exceeds limit        |
| Burst detected      | WARN  | Abnormal request pattern    |
| Bot detected        | INFO  | Bot signature matched       |
| Geo restricted      | INFO  | Country-based restriction   |
| Invalid signature   | WARN  | HMAC verification failed    |
| Store full          | WARN  | Memory store at capacity    |

### Key Metrics to Track

- Rate limit hits per endpoint
- Redis latency (p50, p95, p99)
- Fallback activation count
- Bot detection rate
- Signature verification failures

---

## Security Considerations

### Defense Against Common Attacks

| Attack              | Mitigation                          |
| ------------------- | ----------------------------------- |
| IP Spoofing         | Trusted proxy validation            |
| Header Injection    | CIDR-based header trust             |
| Credential Stuffing | Burst detection, strict auth limits |
| Scraping            | Bot detection, rate multipliers     |
| Replay Attacks      | Signature timestamps, max age       |
| Timing Attacks      | Constant-time comparison            |
| Distributed DDoS    | Edge protection (CDN/WAF)           |
| Memory Exhaustion   | Store size limits, cleanup          |
| Rate Limit Bypass   | Distributed fallback policy         |

### Fail-Secure Behavior

- Unknown errors → deny request (fail closed)
- Store failures → apply fallback policy (not bypass)
- Invalid config → throw at startup
- Suspicious patterns → always logged

---

## Error Semantics: 429 vs 503

| Status  | Meaning                                                       | Client Action                   |
| ------- | ------------------------------------------------------------- | ------------------------------- |
| **429** | Client is rate limited                                        | Respect `Retry-After`, back off |
| **503** | Infrastructure failure (Redis unavailable with `fail` policy) | Retry with exponential backoff  |

Clients should handle these differently:

- **429**: Slow down, you're sending too fast
- **503**: System issue, retry later (not your fault)

---

## Safe Production Defaults

Copy-paste safe configuration for production:

```typescript
import {
  createRedisRateLimiter,
  createBotDetector,
  createBurstDetector,
  CLOUDFLARE_IPV4_CIDRS,
} from "@kenchi/shared/rateLimit";

// Production-safe defaults
const SAFE_PRODUCTION_CONFIG = {
  // CRITICAL: Never use "memory" in multi-instance production
  distributedFallback: "fail" as const,

  // Trusted proxy (enable if behind CDN)
  trustedProxy: {
    enabled: true,
    cidrs: CLOUDFLARE_IPV4_CIDRS,
  },

  // Bot detection as signal, not block
  botDetection: {
    blockMalicious: false, // Don't break integrations
    botRateMultiplier: 0.5,
  },

  // Burst detection enabled
  burstDetection: {
    enabled: true,
    maxBurst: 10,
    penaltyMultiplier: 2,
  },

  // Conservative limits
  rateLimit: {
    windowMs: 60000,
    max: 100,
  },
};
```

---

## Operational Requirements

### Clock Synchronization (NTP)

**All nodes must have synchronized clocks via NTP.**

This is critical for:

- Request signature verification (timestamp validation)
- Sliding window accuracy
- `X-RateLimit-Reset` header correctness

Clock skew > 5 seconds can cause:

- False signature rejections
- Incorrect rate limit calculations
- Reset time confusion for clients

### Redis Key Cardinality

**Warning**: Unbounded identity combinations can exhaust Redis memory.

Key structure `tenant:X|ip:Y|endpoint:Z` can produce millions of keys if:

- Many tenants
- Many client IPs
- Many endpoints

**Mitigations** (already implemented):

- TTL on all keys (auto-expire)
- Key prefix for namespace isolation
- Memory store size limits

**Monitoring**: Track `DBSIZE` and set alerts for unexpected growth.

---

## Best Practices

1. **Use `distributedFallback: "fail"` in production** - Prevents rate limit bypass across instances

2. **Configure trusted proxies** - Don't trust forwarded headers from untrusted sources

3. **Bot detection is a signal, not a block** - Use rate multipliers, not automatic rejection

4. **Weight expensive endpoints** - LLM analysis should cost more than health checks

5. **Monitor fallback activations** - High count indicates Redis issues

6. **Test with chaos engineering** - Redis flapping, network partitions

7. **Update CDN CIDRs periodically** - Cloudflare IPs change

8. **Use strict signature canonicalization** - Prevents body manipulation attacks

9. **Ensure NTP sync across all nodes** - Required for signatures and sliding windows

10. **Monitor Redis key cardinality** - Alert on unexpected growth

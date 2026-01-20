# Claude AI Configuration for Kenchi

## Project Context

TypeScript monorepo for an AI-driven DevOps assistant. Strict separation of concerns with shared package for all common functionality.

---

## Rules of the Road (Quick Reference)

### 10 Hard Rules (Non-Negotiable)

1. **Check `@kenchi/shared` first** - never duplicate utilities, errors, types, or constants
2. **Typed errors only** - use `ValidationError`, `NotFoundError`, `ExternalServiceError`, etc. Exception: `invariant()` for programmer bugs
3. **Structured logging only** - use `createLogger(scope, context)`, never `console.*`
4. **No vendor SDKs in services** - services depend on port interfaces, adapters contain SDK calls
5. **All outbound calls need**: timeout, structured logs, error classification. Use shared `httpClient` utilities (exceptions require explicit comment + ticket)
6. **Every handler must**: validate → call service → map response (mapping lives at the boundary)
7. **RequestContext propagation** - pass `{ requestId, tenantId }` from handler → service → adapter. Every async function doing I/O accepts `context` as last param (except pure helpers/mappers)
8. **No unbounded logs** - use `redactSecrets()` and `truncate()` before logging any external data
9. **Log errors at the correct boundary** - see Error Logging Boundaries section
10. **No empty catch blocks** - always log or rethrow with context

### 10 Preferred Patterns (With Exceptions)

1. **Array methods for transforms** - `for...of` allowed for early-exit/streaming/perf
2. **Lookup tables for stable mappings** - `if/else` allowed when clearer (2-3 conditions)
3. **Immutable data flow** - local mutation allowed when it improves clarity/perf
4. **Early returns** - reduce nesting, fail fast
5. **Small functions** - single responsibility, <50 lines ideal
6. **Explicit types** - on function params/returns, avoid `any`
7. **Async/await** - not Promise chains
8. **Parallel execution** - `Promise.all()` for independent operations
9. **Descriptive names** - no single-letter params in public APIs; `i`/`j` allowed in local loops only
10. **JSDoc for public APIs** - skip for obvious internal functions

### 5 Allowed Exceptions

1. **For loops**: streaming, early-break, parsing, performance-critical hot paths
2. **Local mutation**: inside function scope when clearer than spread/reduce
3. **If/else chains**: when more readable than lookup tables (2-3 conditions)
4. **Plain Error**: only via `invariant(condition, msg)` for "should never happen" programmer bugs
5. **any type**: only when interfacing with untyped libraries (must cast immediately)

---

## Request Context

### Type Definition

```typescript
// packages/shared/src/types/request.ts
export interface RequestContext {
  readonly requestId: string; // UUID generated per request
  readonly tenantId: string; // From auth/header (or "system" for jobs)
  readonly actor?: string; // User/service identity
  readonly traceId?: string; // OpenTelemetry trace ID if available
}

// Express augmentation (in shared or service types)
declare global {
  namespace Express {
    interface Request {
      context: RequestContext;
    }
  }
}
```

**Rule:** No `as any` for `req.context`. Use the Express augmentation above.

### HTTP Entrypoints

```typescript
app.use((req, res, next) => {
  req.context = {
    requestId: crypto.randomUUID(),
    tenantId: extractTenantId(req),
  };
  next();
});
```

### Non-HTTP Entrypoints (Jobs, Cron, Queue Consumers)

```typescript
const processJob = async (job: Job) => {
  const context: RequestContext = {
    requestId: crypto.randomUUID(),
    tenantId: job.tenantId ?? "system",
    actor: "worker",
  };

  const logger = createLogger("job-processor", context);
  await handleJob(job, context);
};
```

**Rule:** Every entrypoint (HTTP, webhook, cron, queue) must create and propagate `RequestContext`.

---

## Shared HTTP Client Contract

### Response Shape

`httpClient` returns a consistent response object:

```typescript
interface HttpResponse<T> {
  status: number;
  data: T;
  headers: Record<string, string>;
}

// Usage
const response = await httpClient.get<User>("/users/123", { context });
// response.status = 200
// response.data = { id: "123", name: "..." }
```

### Error Classification

`classifyHttpError()` standardizes error handling:

```typescript
interface ClassifiedError {
  statusCode: number | undefined;
  category: "retryable" | "non_retryable" | "auth_config" | "unknown";
  retryable: boolean;
  message: string;
}

// Usage in adapters
catch (error) {
  const classified = classifyHttpError(error);
  logger.error("External call failed", {
    ...classified,
    provider: "github",
    operation: "createCheckRun",
    durationMs,
    ...context,
  });
  throw new ExternalServiceError("github", classified.message, {
    retryable: classified.retryable,
  });
}
```

### Timing

Use shared timer for consistency:

```typescript
import { startTimer } from "@kenchi/shared";

const timer = startTimer();
const response = await httpClient.get(url, { context });
const durationMs = timer.elapsedMs();
```

Or consistently use `Date.now()`:

```typescript
const startTime = Date.now();
// ... operation
const durationMs = Date.now() - startTime;
```

**Rule:** Pick one timing pattern per codebase and use it everywhere.

---

## Error Logging Boundaries

**Who logs what:**

| Layer                | Logs                                                                                                   | Throws                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| **Adapters**         | External call failures with: provider, operation, durationMs, statusCode, context                      | `ExternalServiceError` with retryable flag |
| **Repositories**     | Nothing (silent)                                                                                       | Typed DB errors with metadata              |
| **Services**         | Business lifecycle (info/warn). Only log errors when catching to add business context before wrapping. | Typed errors (`NotFoundError`, etc.)       |
| **Error Middleware** | Only unexpected errors (`!isAppError()`)                                                               | N/A - returns HTTP response                |

### Provider & Operation Naming

**Provider keys** (use consistently in all logs):

```typescript
type Provider = "github" | "slack" | "openai" | "postgres" | "redis";
```

**Operation names** (camelCase, verb + noun):

```typescript
// ✅ Consistent naming
("createCheckRun", "postMessage", "generateCompletion", "fetchPullRequest");

// ❌ Inconsistent
("check_run_create", "post-message", "PR.fetch");
```

### Adapter Logging (Mandatory Fields)

```typescript
// Every outbound call log MUST include these fields
logger.info("GitHub API call completed", {
  provider: "github", // Required
  operation: "createCheckRun", // Required
  durationMs, // Required
  statusCode: response.status, // Required (if available)
  ...context, // Required (requestId, tenantId)
});

// On failure, also include classified error info:
logger.error("GitHub API call failed", {
  provider: "github",
  operation: "createCheckRun",
  durationMs,
  statusCode: classified.statusCode,
  category: classified.category,
  retryable: classified.retryable,
  ...context,
});
```

---

## Secrets & PII Policy

### Hard Rules

- `redactSecrets()` **must** run on any string/object derived from external sources before logging
- **Never log**: tokens, API keys, secrets, passwords, email addresses, phone numbers, access tokens
- Webhook payloads: extract only the fields you need, never log raw body

### Enforcement

```typescript
// ❌ WRONG - raw external data
logger.info("Webhook received", { body: req.body });
logger.info("User data", { user: externalUser });

// ✅ CORRECT - sanitized
logger.info("Webhook received", {
  type: payload.type,
  action: payload.action,
  prNumber: payload.pull_request?.number,
});

// If you must log more, sanitize first
logger.debug("Payload details", {
  body: truncate(redactSecrets(payload), 1000),
});
```

---

## Architecture Boundaries

### Dependency Direction Rules

```
┌─────────────────────────────────────────────────────────────┐
│                    Routes / Handlers                         │
│        (HTTP concerns, validation, response mapping)         │
└─────────────────────────┬───────────────────────────────────┘
                          │ depends on
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                      Services                                │
│              (Business logic, orchestration)                 │
│         Depends on PORTS (interfaces), not adapters          │
└───────────┬─────────────────────────────────────┬───────────┘
            │ depends on                           │ depends on
            ▼                                      ▼
┌───────────────────────┐          ┌──────────────────────────┐
│    Repositories       │          │   Adapters (via Ports)   │
│   (Data access)       │          │  (GitHub, Slack, OpenAI) │
└───────────────────────┘          └──────────────────────────┘
```

**Rules:**

- Routes/handlers → depend on services
- Services → depend on port interfaces + repositories
- Repositories → depend on db client only, return domain objects (never raw rows)
- Adapters → implement port interfaces, contain vendor SDK calls
- **Never**: vendor SDK imports in services, business logic in handlers

### Repository Contract

```typescript
// ✅ CORRECT - repository returns domain object
class AnalysisRepository {
  async findById(id: string): Promise<Analysis | null> {
    const row = await query<AnalysisRow>(SQL, [id]);
    return row ? mapRowToAnalysis(row) : null; // Mapping happens HERE
  }
}

// ❌ WRONG - leaking DB row types to service
async findById(id: string): Promise<AnalysisRow | null> { ... }
```

**Rule:** Row → domain mapping lives in repository/helpers. Services never see snake_case.

### Port Interface Contract

```typescript
// ✅ CORRECT - Kenchi-defined types only
interface GitHubChecksPort {
  createCheckRun(input: CreateCheckRunInput, context: RequestContext): Promise<CheckRun>;
}

// ❌ WRONG - vendor types in interface
interface GitHubChecksPort {
  createCheckRun(input: Octokit.ChecksCreateParams): Promise<Octokit.ChecksCreateResponse>;
}
```

**Rule:** Adapters translate Kenchi types ↔ vendor types internally. Vendor types never cross port boundaries.

### Composition Root

```
services/*/src/container.ts    # Dependency wiring lives here
```

```typescript
export const createContainer = (config: Config) => {
  const octokit = new Octokit({ auth: config.githubToken });
  const githubChecks = new GitHubChecksAdapter(octokit);

  return {
    analysisService: new AnalysisService(githubChecks),
  };
};
```

**Rule:** Services receive dependencies via constructor. No `new Adapter()` inside services.

---

## Request Lifecycle

```typescript
export const handleCreateAnalysis = asyncHandler(async (req, res) => {
  // 1. Validate input
  const input = validateCreateAnalysisInput(req.body);

  // 2. Call service with context
  const result = await analysisService.create(input, req.context);

  // 3. Map domain → DTO at boundary
  const response = mapAnalysisToResponse(result);

  // 4. Return typed response
  res.status(201).json(response);
});
```

**Rules:**

- Mapping lives at the handler boundary (domain → DTO)
- Services return domain objects, never HTTP response shapes
- Never skip validation
- Never mix HTTP concerns with business logic

---

## Idempotency & Replay Protection

### Webhook Replay Protection

All state-changing webhook handlers must store the delivery ID and short-circuit duplicates:

```typescript
export const handleWebhook = asyncHandler(async (req, res) => {
  const deliveryId = req.headers["x-github-delivery"]; // or x-slack-event-id

  // Check for duplicate BEFORE doing work
  const alreadyProcessed = await idempotencyStore.exists(deliveryId);
  if (alreadyProcessed) {
    logger.info("Duplicate webhook, skipping", { deliveryId, ...req.context });
    return res.status(200).json({ status: "duplicate" });
  }

  // Process the webhook
  await processWebhook(req.body, req.context);

  // Mark as processed
  await idempotencyStore.set(deliveryId, { processedAt: new Date() });

  res.status(200).json({ status: "processed" });
});
```

### Idempotency Store Requirements

```typescript
// packages/shared/src/idempotency/store.ts
interface IdempotencyStore {
  exists(key: string): Promise<boolean>;
  set(key: string, metadata: IdempotencyMetadata, ttlDays?: number): Promise<void>;
  get(key: string): Promise<IdempotencyMetadata | null>;
}

// Default TTL: 7-30 days (matches typical webhook replay windows)
const DEFAULT_TTL_DAYS = 7;
```

**Rules:**

- Store delivery IDs with TTL (7-30 days) to prevent unbounded growth
- Use `@kenchi/shared/idempotency` if multiple services need replay protection
- No automatic retry for non-idempotent operations unless idempotency key is present

### Retry with Idempotency Keys

```typescript
// ❌ WRONG - retrying POST without idempotency
await withRetry(() => httpClient.post("/actions", data));

// ✅ CORRECT - idempotency key present
await withRetry(() =>
  httpClient.post("/actions", data, {
    headers: { "Idempotency-Key": idempotencyKey },
  })
);
```

---

## Error Classification & Design for Failure

### Error Categories

| Category          | Examples                                    | Action             |
| ----------------- | ------------------------------------------- | ------------------ |
| **Retryable**     | 429, 5xx, network timeout, connection reset | Retry with backoff |
| **Non-retryable** | 400, 404, 422, validation errors            | Fail immediately   |
| **Auth/Config**   | 401, 403, invalid credentials               | Alert, don't retry |

### ExternalServiceError Pattern

```typescript
throw new ExternalServiceError("github", "Failed to create check run", {
  metadata: {
    operation: "createCheckRun",
    statusCode: response.status,
    owner,
    repo,
  },
  retryable: response.status >= 500 || response.status === 429,
});
```

### Invariants (Programmer Bugs)

```typescript
import { invariant, assertUnreachable } from "@kenchi/shared";

invariant(user !== null, "User must exist after authentication");

function handleStatus(status: Status): string {
  switch (status) {
    case "pending":
      return "Waiting";
    case "active":
      return "Running";
    case "completed":
      return "Done";
    default:
      assertUnreachable(status);
  }
}
```

---

## Concurrency & Retry Policy

### Timeouts (Required)

```typescript
// Shared httpClient has default 30s timeout
const response = await httpClient.get(url, { context });

// Override if needed
const response = await httpClient.get(url, { context, timeout: 60_000 });
```

### Retry Config

```typescript
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30_000,
  backoffMultiplier: 2,
  retryableStatuses: [429, 500, 502, 503, 504],
} as const;
```

---

## Public API & DTO Rules

### Separate Domain from DTOs

```typescript
// Internal domain type (rich, may change)
interface Analysis {
  id: string;
  tenantId: string;
  internalScore: number;
  createdAt: Date;
}

// Public DTO (stable contract)
interface AnalysisResponse {
  id: string;
  score: number;
  createdAt: string; // ISO string for JSON
}
```

### Mapping Lives at the Boundary

- **Handler boundary**: domain → DTO (for responses)
- **Repository boundary**: row → domain (for DB results)

**Rule:** Services work with domain objects only. Never raw rows, never DTOs.

---

## Observability Requirements

### Required Fields for External Calls

| Field        | Required   | Description                                 |
| ------------ | ---------- | ------------------------------------------- |
| `provider`   | Yes        | "github", "slack", "openai", "postgres"     |
| `operation`  | Yes        | camelCase: "createCheckRun", "postMessage"  |
| `durationMs` | Yes        | Time taken for the call                     |
| `statusCode` | Yes\*      | HTTP status (\*if available)                |
| `category`   | On failure | "retryable", "non_retryable", "auth_config" |
| `retryable`  | On failure | Whether error is retryable                  |
| `requestId`  | Yes        | From context                                |
| `tenantId`   | Yes        | From context                                |

---

## Code Review Bar

**These will fail code review:**

- [ ] Business logic inside route handler
- [ ] Direct fetch/SDK call in adapter (must use shared httpClient)
- [ ] Vendor SDK imported in service layer
- [ ] Vendor types in port interfaces
- [ ] Service instantiates adapter (must use composition root)
- [ ] Repository returns raw DB rows (must return domain objects)
- [ ] Unbounded log payloads (must use truncate/redact)
- [ ] External call log missing durationMs or context spread
- [ ] No timeout on outbound requests
- [ ] `throw new Error()` instead of typed errors (except invariant)
- [ ] New utility in service that should be in shared
- [ ] Missing RequestContext (including in background jobs)
- [ ] `as any` for `req.context` (use Express augmentation)
- [ ] Service logging errors that adapter already logged
- [ ] `console.log` in committed code
- [ ] `any` type without immediate type guard
- [ ] Retry on non-idempotent operation without idempotency key
- [ ] Webhook handler without replay protection (delivery ID check)
- [ ] Idempotency store without TTL
- [ ] DTO mapping inside service (must be at handler boundary)
- [ ] Logging email, tokens, or PII

---

## Automated Enforcement

### ESLint Rules

```javascript
// .eslintrc.js
{
  "rules": {
    // Ban console.* except in /scripts
    "no-console": ["error", { "allow": [] }],

    // Ban direct fetch/axios and vendor SDKs in services
    "no-restricted-imports": ["error", {
      "patterns": [
        { "group": ["node-fetch", "axios"], "message": "Use @kenchi/shared httpClient" },
        { "group": ["@octokit/*", "@slack/*", "openai"], "message": "Vendor SDKs not allowed in services. Use adapters." }
      ]
    }]
  },
  "overrides": [
    { "files": ["**/adapters/**"], "rules": { "no-restricted-imports": "off" } },
    { "files": ["**/scripts/**"], "rules": { "no-console": "off" } }
  ]
}
```

### CI Checks

- **No duplicate constants**: grep for patterns that should be in constants.ts
- **Barrel exports**: new shared modules must be exported from index.ts
- **Type coverage**: maintain minimum threshold (e.g., 95%)

---

## Monorepo Structure

```
kenchi/
├── packages/shared/
│   └── src/
│       ├── index.ts              # Barrel exports (check FIRST)
│       ├── core/                 # Config, logger, errors
│       ├── database/             # Repositories, types
│       ├── constants.ts          # ALL constants (single file)
│       ├── http/                 # httpClient, retry, timeout utilities
│       ├── idempotency/          # Replay protection store
│       └── types/                # Shared type definitions + Express augmentation
├── services/
│   ├── api/
│   │   └── src/
│   │       ├── container.ts      # Composition root
│   │       ├── routes/           # HTTP handlers
│   │       ├── services/         # Business logic
│   │       ├── ports/            # Interface definitions
│       │   └── adapters/         # External integrations
│   ├── slack-bot/
│   └── github-app/
└── docs/
```

---

## Zero Duplication Policy

**Before writing ANY code:**

1. Check `packages/shared/src/index.ts` for existing exports
2. Search codebase for similar functionality
3. If it exists, import from `@kenchi/shared`
4. If reusable, add to shared package first

**Shared Utility Promotion Rule:**

If a helper is used twice OR is clearly domain-invariant, promote it to shared within the same PR.

---

## Database Module Organization

```
packages/shared/src/database/<module>/
├── types.ts       # Type definitions (required)
├── helpers.ts     # Validation, row mappers, constants (required)
├── repository.ts  # Database operations (optional)
└── index.ts       # Barrel exports (required)
```

**Import Pattern (within shared package):**

```typescript
// ✅ CORRECT - relative imports within shared
import { ValidationError, SOME_CONSTANT } from "../common.js";

// ❌ WRONG - never self-reference the package
import { ValidationError } from "@kenchi/shared";
```

---

## TypeScript Standards

- Explicit types on function parameters and returns
- `unknown` instead of `any`, with type guards
- `readonly` for immutable data
- `import type` for type-only imports
- Discriminated unions for event types

---

## Error Handling

| Error Class            | HTTP | Use Case                    |
| ---------------------- | ---- | --------------------------- |
| `ValidationError`      | 400  | Invalid input               |
| `AuthenticationError`  | 401  | Missing/invalid credentials |
| `AuthorizationError`   | 403  | Insufficient permissions    |
| `NotFoundError`        | 404  | Resource doesn't exist      |
| `ExternalServiceError` | 502  | External API failures       |
| `RateLimitError`       | 429  | Rate limiting               |

---

## Code Style Preferences

### Loops & Conditionals

```typescript
// ✅ Preferred: Array methods for transforms
const activeUsers = users.filter((user) => user.isActive);

// ✅ Allowed: for...of for early exit
for (const item of items) {
  if (item.isMatch) return item;
}

// ✅ Allowed: Simple if/else when clearer (2-3 conditions)
if (count === 0) return "none";
else if (count === 1) return "single";
else return "multiple";
```

### Mutation

```typescript
// ✅ Preferred: Immutable patterns
const updated = { ...original, newField: value };

// ✅ Allowed: Local mutation for clarity/perf
const results: Item[] = [];
for (const raw of rawItems) {
  const parsed = parseItem(raw);
  if (parsed.isValid) {
    results.push(parsed);
  }
}
return results;
```

---

## Templates

### Route Handler

```typescript
export const handleOperation = asyncHandler(async (req, res) => {
  const input = validateInput(req.body);
  const result = await service.operation(input, req.context);
  res.status(200).json(mapToResponse(result));
});
```

### Service Method

```typescript
export const performOperation = async (
  input: OperationInput,
  context: RequestContext
): Promise<OperationResult> => {
  validateOperationInput(input);
  const logger = createLogger("operation-service", context);

  const data = await repository.fetch(input.id);
  if (!data) {
    throw new NotFoundError("Resource not found", { metadata: { id: input.id } });
  }

  const result = await externalAdapter.process(data, context);

  logger.info("Operation completed", { operationId: input.id });
  return result;
};
```

### Adapter

```typescript
export class ExternalServiceAdapter implements ExternalServicePort {
  constructor(private readonly httpClient: HttpClient) {}

  async fetchData(id: string, context: RequestContext): Promise<Data> {
    const logger = createLogger("external-adapter", context);
    const startTime = Date.now();

    try {
      const response = await this.httpClient.get<VendorResponse>(`/data/${id}`, { context });
      const durationMs = Date.now() - startTime;

      logger.info("External call completed", {
        provider: "external",
        operation: "fetchData",
        durationMs,
        statusCode: response.status,
        ...context,
      });

      return mapVendorResponseToData(response.data);
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const classified = classifyHttpError(error);

      logger.error("External call failed", {
        provider: "external",
        operation: "fetchData",
        durationMs,
        statusCode: classified.statusCode,
        category: classified.category,
        retryable: classified.retryable,
        ...context,
      });

      throw new ExternalServiceError("external", "Failed to fetch data", {
        metadata: { id, durationMs },
        retryable: classified.retryable,
      });
    }
  }
}
```

---

## Definition of Done (New Modules)

Before merging new module/feature:

- [ ] Tests included (unit + integration for critical paths)
- [ ] Structured logs include requestId/tenantId (spread `...context`)
- [ ] External call logs include durationMs
- [ ] New exports added to shared barrel (`index.ts`)
- [ ] Uses shared httpClient for outbound calls
- [ ] Error classification (retryable/non-retryable) for external calls
- [ ] RequestContext propagated through all layers
- [ ] No vendor SDK imports in service layer
- [ ] No vendor types in port interfaces
- [ ] Repository returns domain objects (not rows)
- [ ] DTO mapping at handler boundary only
- [ ] Webhook handlers have replay protection with TTL
- [ ] Secrets/PII never logged
- [ ] Docs updated if public behavior changes

---

## Available Shared Utilities

```typescript
import {
  // Config
  config,

  // Logging
  createLogger,

  // Errors
  ValidationError,
  NotFoundError,
  ExternalServiceError,
  getErrorMessage,
  invariant,
  assertUnreachable,

  // HTTP utilities
  httpClient,
  fetchWithTimeout,
  withRetry,
  classifyHttpError,
  startTimer,

  // Sanitization
  redactSecrets,
  truncate,

  // Idempotency
  idempotencyStore,

  // Middleware
  errorHandler,
  asyncHandler,

  // Types
  type RequestContext,
  type HttpResponse,
  type ClassifiedError,
  type WebhookEvent,
} from "@kenchi/shared";
```

---

## References

- `docs/ARCHITECTURE.md` - System architecture
- `docs/SYSTEM_ARCHITECTURE.md` - Detailed design
- `docs/DATA_MODELS.md` - Data structures
- `packages/shared/src/index.ts` - Available utilities

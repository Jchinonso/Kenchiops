# Claude AI Configuration for Kenchi

## Project Context

TypeScript monorepo for an AI-driven DevOps assistant. Strict separation of concerns with shared package for all common functionality.

---

## Agent Delegation (Mandatory)

Custom agents live in `.claude/agents/`. You MUST delegate to them by launching a Task with `subagent_type` matching the agent name and including the task context in the prompt. Read the agent file first, then embed its core instructions in the Task prompt.

| Agent                             | Trigger Condition                                                                                | Agent File                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| `git-commit-staged`               | **Every commit.** Never commit manually with raw git commands. Always delegate.                  | `.claude/agents/git-commit-staged.md`               |
| `principal-engineer`              | Implementing new features, bug fixes, or non-trivial code changes.                               | `.claude/agents/principal-engineer.md`              |
| `test-engineer`                   | After writing new modules, services, adapters, or utilities. After bug fixes (regression tests). | `.claude/agents/test-engineer.md`                   |
| `kenchi-refactor-analyst`         | After significant code changes — audit for CLAUDE.md compliance and code smells.                 | `.claude/agents/kenchi-refactor-analyst.md`         |
| `vulnerability-scanner`           | Before committing code that handles auth, secrets, user input, or external data.                 | `.claude/agents/vulnerability-scanner.md`           |
| `database-migration-query-expert` | Creating/reviewing migrations, writing SQL, or detecting N+1 queries.                            | `.claude/agents/database-migration-query-expert.md` |
| `docs-generator`                  | When documentation needs to be created, updated, or improved.                                    | `.claude/agents/docs-generator.md`                  |

**Workflow for implementation tasks:**

1. Implement the change (or delegate to `principal-engineer` for complex tasks)
2. Delegate to `test-engineer` to write tests (if applicable)
3. Delegate to `kenchi-refactor-analyst` to audit (if significant change)
4. **Always** delegate to `git-commit-staged` to commit

Users can also invoke agents directly as slash commands: `/git-commit-staged`, `/principal-engineer`, etc.

---

## Rules of the Road (Quick Reference)

### 12 Hard Rules (Non-Negotiable)

1. **Check `@kenchi/shared` first** - never duplicate utilities, errors, types, or constants
2. **Types in types.ts only** - never define interfaces/types inline in module files. All types go in the module's `types.ts` file and are exported from the barrel
3. **Typed errors only** - use `ValidationError`, `NotFoundError`, `ExternalServiceError`, etc. Exception: `invariant()` for programmer bugs
4. **Structured logging only** - use `createLogger(scope, context)`, never `console.*`
5. **No vendor SDKs in services** - services depend on port interfaces, adapters contain SDK calls
6. **All outbound calls need**: timeout, structured logs, error classification. Use shared `httpClient` utilities (exceptions require explicit comment + ticket)
7. **Every handler must**: validate → call service → map response (mapping lives at the boundary)
8. **RequestContext propagation** - pass `{ requestId, tenantId }` from handler → service → adapter. Every async function doing I/O accepts `context` as last param (except pure helpers/mappers)
9. **No unbounded logs** - use `redactSecrets()` and `truncate()` before logging any external data
10. **Log errors at the correct boundary** - see Error Logging Boundaries section
11. **No empty catch blocks** - always log or rethrow with context
12. **Verify webhook signatures first** - validate `x-hub-signature-256` (GitHub) or `x-slack-signature` (Slack) before parsing body or checking idempotency. Reject invalid with 401

### 13 Preferred Patterns (With Exceptions)

1. **`const` only** - `let` allowed only for: loop counters in `for...of` with early-exit, genuinely iterative algorithms. Every `let` requires a comment justifying why `const` won't work
2. **Array methods for transforms** - `map`/`filter`/`reduce`/`flatMap` over imperative loops. `for...of` allowed only for: early-exit, streaming/async iteration, performance-critical hot paths with measured benchmarks
3. **Pure functions by default** - functions should be deterministic (same input → same output) with no side effects. Side effects isolated to: adapters (I/O), handlers (HTTP), entrypoints (setup). Helpers, services, mappers, and validators must be pure
4. **Immutable data flow** - spread/destructure to derive new values, never reassign or mutate. `readonly` on all type properties and function parameters. `Readonly<T>`, `ReadonlyArray<T>`, `ReadonlyMap<K,V>` for collection types
5. **Expression-oriented code** - prefer expressions over statements: ternaries for simple conditionals, `??`/`?.` over null-check blocks, immediately-invoked arrow functions or helper calls over multi-statement blocks
6. **Lookup tables for stable mappings** - `if/else` allowed when clearer (2-3 conditions)
7. **Early returns** - reduce nesting, fail fast
8. **Small, single-purpose functions** - single responsibility, <50 lines ideal. Extract named helpers over inline logic
9. **Explicit types** - on function params/returns, avoid `any`
10. **Async/await** - not Promise chains
11. **Parallel execution** - `Promise.all()` for independent operations
12. **Descriptive names** - no single-letter params in public APIs; `i`/`j` allowed in local loops only
13. **JSDoc for public APIs** - skip for obvious internal functions

### 5 Allowed Exceptions

1. **`for...of` loops**: early-break, streaming/async iteration, measured performance-critical hot paths only. Never for simple transforms — use `map`/`filter`
2. **`let` bindings**: loop counters in `for...of`, genuinely iterative state machines. Must include `// let: <reason>` comment
3. **If/else chains**: when more readable than lookup tables (2-3 conditions)
4. **Plain Error**: only via `invariant(condition, msg)` for "should never happen" programmer bugs
5. **`any` type**: only when interfacing with untyped libraries (must cast immediately)

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
// ✅ CORRECT - repository as factory returning domain objects
export const createAnalysisRepository = (db: DbClient) => ({
  findById: async (id: string): Promise<Analysis | null> => {
    const row = await db.query<AnalysisRow>(SQL, [id]);
    return row ? mapRowToAnalysis(row) : null; // Mapping happens HERE
  },
});

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
    analysisService: createAnalysisService(githubChecks),
  };
};
```

**Rule:** Services receive dependencies via factory args (closures), not constructors. Adapters may use classes (SDK instances need `this`). No `new Adapter()` inside services.

---

## Configuration Rules

- All env vars accessed through `@kenchi/shared` config module — never `process.env` directly
- Config validated at startup (fail fast on missing required vars)
- Secrets loaded from environment, never hardcoded or committed
- Feature flags: use typed config, not string comparisons
- No environment-specific branching in business logic (`if (env === 'prod')` → use config values instead)

---

## Database Conventions

- Parameterized queries only — never string interpolation for SQL
- Transactions: use shared `withTransaction(db, async (tx) => { ... })` helper
- Migrations: sequential, timestamped, idempotent (e.g., `IF NOT EXISTS`)
- Column naming: `snake_case` in DB, `camelCase` in domain — mapping in repository layer
- No raw SQL in services — all queries live in repository modules
- Connection pooling managed at composition root, not per-request

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

## Webhook Security

- **Verify signatures FIRST** — before parsing body or checking idempotency
- GitHub: verify `x-hub-signature-256` using shared `verifyGitHubSignature()`
- Slack: verify `x-slack-signature` using shared `verifySlackSignature()`
- Reject invalid signatures with 401, log with `provider` and `operation` fields
- Never trust webhook payload content without signature verification

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

### Bounded Concurrency

```typescript
// ✅ CORRECT - bounded parallel requests
import { pMap } from "@kenchi/shared";
await pMap(items, processItem, { concurrency: 5 });

// ❌ WRONG - unbounded parallel requests to external APIs
await Promise.all(items.map(processItem));
```

**Rule:** Use `Promise.all()` for independent internal operations. Use `pMap` with concurrency limit for batch external API calls.

### Inbound Rate Limiting

- Rate limiting middleware at route level (use shared middleware)
- Webhook endpoints: validate signatures before any processing

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

## API Response Contract

### Standard Envelope

```typescript
// Success
{ "data": T }

// Error
{ "error": { "code": string, "message": string, "requestId": string } }
```

### Versioning

- URL-based: `/api/v1/...`
- Breaking changes require new version
- Deprecation: minimum 30-day notice via response header `Deprecation: true`

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
- [ ] `let` without justification comment (`// let: <reason>`)
- [ ] Imperative loop (`for`/`for...of`) for a simple transform — use `map`/`filter`/`reduce`
- [ ] Mutable interface properties — must use `readonly` on all fields
- [ ] Mutable array/collection parameters — must use `ReadonlyArray<T>` or `readonly T[]`
- [ ] Class for business logic/services/helpers — use plain functions + closures
- [ ] Impure helper/mapper/validator — side effects only in adapters, handlers, entrypoints
- [ ] Object mutation (`obj.key = value`) — derive new objects with spread
- [ ] Missing webhook signature verification before processing
- [ ] Unbounded `Promise.all()` without concurrency limit for batch external calls
- [ ] `process.env` accessed directly instead of through shared config
- [ ] Raw SQL string interpolation (must use parameterized queries)
- [ ] Missing health/readiness endpoint in new service

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

## Module Organization

### General Module Structure

All modules with types must follow this structure:

```
packages/shared/src/<domain>/<module>/
├── types.ts       # Type definitions (REQUIRED - all interfaces/types go here)
├── helpers.ts     # Pure utility functions, constants (optional)
├── <feature>.ts   # Feature implementation (imports types from types.ts)
└── index.ts       # Barrel exports (required)
```

**Type Location Rule:**

```typescript
// ❌ WRONG - types defined inline in module file
interface MyResult {
  readonly value: number;
}

const calculate = (): MyResult => { ... }

// ✅ CORRECT - types in types.ts, imported where needed
// In types.ts:
export interface MyResult {
  readonly value: number;
}

// In feature.ts:
import type { MyResult } from "./types.js";
const calculate = (): MyResult => { ... }
```

### Database Module Structure

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
import type { MyType } from "./types.js";

// ❌ WRONG - never self-reference the package
import { ValidationError } from "@kenchi/shared";
```

---

## TypeScript Standards

- Explicit types on function parameters and returns
- `unknown` instead of `any`, with type guards
- `readonly` on all interface properties and function parameters — mutable types require justification comment
- `ReadonlyArray<T>` (or `readonly T[]`) for array types in interfaces and parameters
- `Readonly<Record<K,V>>` and `ReadonlyMap<K,V>` for collection types
- `import type` for type-only imports
- Discriminated unions for event types
- `as const` for literal objects and tuples that should not be widened
- Prefer `type` aliases for function signatures and unions; `interface` for object shapes

---

## Naming Conventions

| Thing            | Convention          | Example               |
| ---------------- | ------------------- | --------------------- |
| Files            | kebab-case          | `analysis-service.ts` |
| Types/Interfaces | PascalCase          | `AnalysisResult`      |
| Functions/vars   | camelCase           | `createAnalysis`      |
| Constants        | SCREAMING_SNAKE     | `MAX_RETRY_COUNT`     |
| DB columns       | snake_case          | `created_at`          |
| Log operations   | camelCase verb+noun | `createCheckRun`      |
| Provider keys    | lowercase           | `github`, `slack`     |
| Env vars         | SCREAMING_SNAKE     | `GITHUB_APP_ID`       |
| Route paths      | kebab-case          | `/api/v1/check-runs`  |

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

## Functional Style Rules

### `const` Over `let`

```typescript
// ✅ CORRECT - derive values with const
const total = items.reduce((sum, item) => sum + item.price, 0);
const label = count === 0 ? "none" : count === 1 ? "single" : "multiple";
const config = { ...defaults, ...overrides };

// ❌ WRONG - unnecessary let
let total = 0;
for (const item of items) {
  total += item.price;
}

// ✅ ALLOWED - let with justification
for (const item of items) {
  // let: early-exit search
  if (item.isMatch) return item;
}
```

### Pure Functions

```typescript
// ✅ CORRECT - pure: same input → same output, no side effects
const calculateScore = (metrics: readonly Metric[]): number =>
  metrics.reduce((sum, m) => sum + m.weight * m.value, 0);

const formatAnalysis = (analysis: Analysis): AnalysisResponse => ({
  id: analysis.id,
  score: analysis.internalScore,
  createdAt: analysis.createdAt.toISOString(),
});

// ❌ WRONG - impure helper (side effect: logging)
const calculateScore = (metrics: Metric[]): number => {
  console.log("calculating...");
  return metrics.reduce((sum, m) => sum + m.weight * m.value, 0);
};

// ✅ Side effects allowed in: adapters, handlers, entrypoints
```

### Immutable Data & `readonly`

```typescript
// ✅ CORRECT - readonly types
interface Analysis {
  readonly id: string;
  readonly tenantId: string;
  readonly scores: ReadonlyArray<number>;
  readonly metadata: Readonly<Record<string, string>>;
}

// ✅ CORRECT - readonly function parameters
const processItems = (items: ReadonlyArray<Item>): ReadonlyArray<Result> =>
  items.map(transformItem);

// ❌ WRONG - mutable types
interface Analysis {
  id: string;
  scores: number[];
}

// ✅ CORRECT - derive new objects, never mutate
const updated = { ...original, status: "complete" } as const;

// ❌ WRONG - mutation
original.status = "complete";
```

### Array Methods Over Loops

```typescript
// ✅ CORRECT - array methods for transforms
const activeNames = users.filter((user) => user.isActive).map((user) => user.name);

const grouped = items.reduce<Record<string, Item[]>>(
  (acc, item) => ({
    ...acc,
    [item.category]: [...(acc[item.category] ?? []), item],
  }),
  {}
);

// ❌ WRONG - imperative loop for a transform
const activeNames: string[] = [];
for (const user of users) {
  if (user.isActive) activeNames.push(user.name);
}

// ✅ ALLOWED - for...of for early-exit only
for (const item of items) {
  if (item.isMatch) return item;
}
```

### Expression-Oriented Code

```typescript
// ✅ CORRECT - expressions
const status = isActive ? "running" : "stopped";
const name = user?.displayName ?? user?.email ?? "anonymous";
const value = maybeCompute() ?? fallback;

// ❌ WRONG - statement blocks for simple derivations
let status: string;
if (isActive) {
  status = "running";
} else {
  status = "stopped";
}

// ✅ CORRECT - extract helper for complex branching
const resolvePermission = (role: Role, resource: Resource): Permission => {
  if (role === "admin") return "full";
  if (resource.isPublic) return "read";
  return "none";
};
```

### No Classes for Business Logic

```typescript
// ✅ CORRECT - plain functions + closures for services/helpers
export const createAnalysisService = (
  repo: AnalysisRepository,
  githubPort: GitHubChecksPort,
) => ({
  create: async (input: CreateInput, context: RequestContext) => { ... },
  findById: async (id: string, context: RequestContext) => { ... },
});

// ✅ ALLOWED - classes for adapters (need this for SDK instance)
export class GitHubChecksAdapter implements GitHubChecksPort {
  constructor(private readonly httpClient: HttpClient) {}
  // ...
}

// ❌ WRONG - class for business logic
export class AnalysisService {
  analyze(input: Input) { this.helper(); }
  private helper() { ... }
}
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

### Service Factory

```typescript
export const createOperationService = (
  repository: OperationRepository,
  externalAdapter: ExternalServicePort
) => ({
  perform: async (input: OperationInput, context: RequestContext): Promise<OperationResult> => {
    validateOperationInput(input);
    const logger = createLogger("operation-service", context);

    const data = await repository.fetch(input.id);
    if (!data) {
      throw new NotFoundError("Resource not found", { metadata: { id: input.id } });
    }

    const result = await externalAdapter.process(data, context);

    logger.info("Operation completed", { operationId: input.id });
    return result;
  },
});
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

## Testing Standards

### Test Structure

- Co-locate tests: `module.ts` → `module.test.ts` (same directory)
- Use `describe` blocks matching module/function names
- Test names: `it("should <expected behavior> when <condition>")`

### What to Test

- **Services**: Unit test with mocked ports/repositories
- **Adapters**: Integration test against real API (or recorded fixtures)
- **Validators**: Edge cases, boundary values, invalid input shapes
- **Mappers/Helpers**: Pure function → pure tests, no mocks needed

### Mocking Rules

- Mock at port boundaries, never mock internal functions
- Use factory functions for test fixtures: `createTestAnalysis(overrides)`
- Always pass a test `RequestContext`:
  ```typescript
  const testContext: RequestContext = {
    requestId: "test-request-id",
    tenantId: "test-tenant",
  };
  ```

### Anti-Patterns

- No testing implementation details (internal method calls)
- No snapshot tests for non-UI code
- No mocking what you don't own without an adapter boundary

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

  // Concurrency
  pMap,

  // Webhook security
  verifyGitHubSignature,
  verifySlackSignature,

  // Database
  withTransaction,

  // Config
  validateConfig,

  // Types
  type RequestContext,
  type HttpResponse,
  type ClassifiedError,
  type WebhookEvent,
} from "@kenchi/shared";
```

---

## Graceful Shutdown

- All services handle `SIGTERM`/`SIGINT`
- Drain in-flight requests before exiting (configurable timeout)
- Close DB pools, Redis connections, and HTTP servers in order
- Log shutdown lifecycle events with structured logger

---

## Health Checks

- Every service exposes `GET /health` (liveness) and `GET /ready` (readiness)
- Readiness checks DB connectivity and critical dependencies
- Health endpoints excluded from auth middleware
- Return `{ "status": "ok" | "degraded" | "unhealthy" }` with dependency details

---

## Git Conventions

- Branch: `feat/`, `fix/`, `chore/`, `refactor/` prefix
- Commits: conventional commits (`feat: add analysis endpoint`)
- One logical change per commit
- PR must pass CI (lint, type-check, tests) before review
- Shared package changes require explicit callout in PR description

---

## References

- `docs/ARCHITECTURE.md` - System architecture
- `docs/SYSTEM_ARCHITECTURE.md` - Detailed design
- `docs/DATA_MODELS.md` - Data structures
- `packages/shared/src/index.ts` - Available utilities

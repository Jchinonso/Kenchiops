# Claude AI Configuration for Kenchi

## Project Context

This is a **TypeScript monorepo** for an AI-driven DevOps assistant. The architecture follows strict separation of concerns with a shared package for all common functionality.

## Critical Architecture Rules

### 1. Monorepo Structure

```
kenchi/
├── packages/shared/     # ALL shared code goes here
│   └── src/
│       ├── index.ts     # Check this FIRST for available exports
│       ├── config.ts
│       ├── logger.ts
│       ├── errors.ts
│       ├── middleware.ts
│       ├── validation.ts
│       ├── types.ts
│       └── ...
├── services/            # Service-specific code ONLY
│   ├── api/
│   ├── slack-bot/
│   └── github-app/
└── n8n/workflows/       # Workflow definitions
```

### 2. Zero Duplication Policy

**No duplication of reusable domain logic, shared utilities, or cross-service types. Service-local glue/adapters are allowed.**

**Before writing ANY code:**

1. Check `packages/shared/src/index.ts` for existing exports
2. Search codebase for similar functionality
3. If it exists, import from `@kenchi/shared`
4. If it doesn't exist and is shared, add to shared package first

**Practical Heuristics:**

- **If used in 2+ services** → shared
- **If it's domain invariant** (logger, errors, config, schemas) → shared
- **If it's integration adapter** (Slack/GitHub-specific glue) → keep in service
- **Tiny one-off helpers** truly local to one service → keep in service

### 3. Available Shared Utilities

**Always import from `@kenchi/shared` (see `packages/shared/src/index.ts`):**

- **Configuration**: `config`, `Config`
- **Logging**: `logger`, `createLogger`, `LogLevel`
- **Error Handling**: `AppError`, `ValidationError`, `AuthenticationError`, `NotFoundError`, `ExternalServiceError`, `LLMError`, `isAppError`
- **Express Middleware**: `errorHandler`, `asyncHandler`, `requestLogger`
- **Validation**: `validate`, `validators`, `ValidationSchema`
- **Rate Limiting**: `createRateLimiter`, `defaultRateLimiter`
- **AI/ML**: `OpenAIClient`, `VectorStore`, `InMemoryVectorStore`
- **Safety**: `confidenceScore`, `shouldActOnResult`
- **Types**: `LLMAnalysisResult`, `WebhookEvent`, `CIFailureEvent`, `SlackMessageEvent`, `GitHubPREvent`

### 4. Code Generation Rules

**When generating code:**

1. **Check shared package first**: Always look at `packages/shared/src/index.ts` before creating new utilities
2. **Import from shared**: Use `import { ... } from '@kenchi/shared'`
3. **No duplication**: Never create utilities that exist in shared package
4. **Service-specific only**: Services should only contain routes, handlers, and service-specific logic
5. **Update exports**: When adding to shared package, update `packages/shared/src/index.ts`

**Example:**

```typescript
// ✅ CORRECT - Use shared utilities
import { createLogger, config, errorHandler } from '@kenchi/shared';
const logger = createLogger('api'); // Service-scoped logger

// ✅ CORRECT - Service-local glue code is allowed
// services/slack-bot/src/adapters/slackAdapter.ts
const adaptSlackPayload = (payload: SlackPayload): WebhookEvent => {
  // Service-specific adapter logic
};

// ❌ WRONG - Don't duplicate reusable utilities
const logger = { info: () => {}, error: () => {} }; // Hand-rolled logger

// ❌ WRONG - Don't duplicate cross-service types
interface WebhookEvent { ... } // Should be in shared
```

### 5. File Organization

**Shared Package (`packages/shared/src/`):**

- All utilities, helpers, formatters
- Cross-service contract types (events, core domain, public DTOs)
- All middleware
- All clients (OpenAI, Vector DB, etc.)
- **ALL constants and enums** - Must be in `constants.ts`, never scattered across files

**Services (`services/*/src/`):**

- Service entry point (`index.ts`)
- Service-specific routes/handlers
- Service-specific business logic
- Service-specific integrations (Slack Bolt, GitHub Octokit)
- Integration-specific types (Slack payload quirks, Octokit shapes, internal DB models)
- Service-private types

**Shared vs Service Types Rule:**

- **Shared** = cross-service contracts + core domain types
- **Service** = integration-specific + internal-only types

**NEVER:**

- Put reusable utilities in services
- Duplicate cross-service types across services
- Create local helpers that should be shared
- Put service-specific logic in shared package

### 6. Adding New Features

**Process:**

1. **Is it shared?** → Add to `packages/shared/src/`
2. **Is it service-specific?** → Add to `services/*/src/`
3. **Export from shared**: Update `packages/shared/src/index.ts`
4. **Import in services**: Use `@kenchi/shared` import

### 7. TypeScript Patterns

```typescript
// Type imports
import type { WebhookEvent, LLMAnalysisResult } from "@kenchi/shared";

// Value imports
import { createLogger, config, errorHandler } from "@kenchi/shared";

// Service code
import express from "express";
import { createLogger, errorHandler, asyncHandler } from "@kenchi/shared";

const logger = createLogger("api"); // Service-scoped logger
const app = express();
app.use(errorHandler);

app.post(
  "/endpoint",
  asyncHandler(async (req, res) => {
    logger.info("Processing request");
    // Service logic
  })
);
```

### 8. Documentation References

Before making architectural decisions, read:

- `docs/ARCHITECTURE.md` - System architecture
- `docs/SYSTEM_ARCHITECTURE.md` - Detailed design
- `docs/DATA_MODELS.md` - Data structures
- `packages/shared/src/index.ts` - Available utilities

### 9. Code Generation Checklist

Before generating code, verify:

- [ ] Checked `packages/shared/src/index.ts` for existing utilities?
- [ ] Using imports from `@kenchi/shared`?
- [ ] Not duplicating existing functionality?
- [ ] Following service structure (minimal service-specific code)?
- [ ] Updated shared package exports if adding new shared code?

### 10. Constants Organization Rule

**CRITICAL: ALL constants must be in `packages/shared/src/constants.ts`**

**Rules:**

1. **No constants scattered across files** - All numeric thresholds, regex patterns, arrays, Sets, Maps, and configuration values must be in `constants.ts`
2. **Import from constants** - Always import constants from `@kenchi/shared` or `./constants.js`
3. **Group by domain** - Organize constants by domain (validation, safety, OpenAI, etc.) with clear section headers
4. **Export everything** - All constants should be exported so they can be reused
5. **Use const assertions** - Use `as const` for immutable constant objects/arrays

**Examples:**

```typescript
// ✅ CORRECT - Constants in constants.ts
// packages/shared/src/constants.ts
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const DANGEROUS_KEYWORDS = ['delete', 'drop', ...] as const;

// packages/shared/src/validation.ts
import { EMAIL_REGEX } from './constants.js';

// ❌ WRONG - Constants scattered in files
// packages/shared/src/validation.ts
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // Should be in constants.ts

// packages/shared/src/openaiClient/validation.ts
const DANGEROUS_KEYWORDS = ['delete', ...]; // Should be in constants.ts
```

**What counts as a constant:**

- Regex patterns (`EMAIL_REGEX`, `SHA_PATTERN`)
- Arrays of strings/numbers (`DANGEROUS_KEYWORDS`, `VALID_STATUSES`)
- Sets and Maps (`METRIC_KEYWORDS`, `VALID_SAFETY_LEVELS`)
- Numeric thresholds (`MAX_RETRIES`, `TIMEOUT_MS`)
- String constants (`DEFAULT_ERROR_MESSAGE`)
- Configuration objects (`MATCHING_CONFIG`, `OPENAI_DEFAULTS`)
- Type definitions for constants (`UncertaintyPattern`, `RelevanceRule`)

**What doesn't need to be in constants:**

- Local variables in functions
- Computed values based on function parameters
- Module-level variables that are implementation details (not reusable)

### 11. Common Mistakes to Avoid

❌ **Hand-rolling logger implementation**

```typescript
// WRONG - Don't implement logging locally
const logger = { info: () => {}, error: () => {} };
```

✅ **Using shared logger factory**

```typescript
// CORRECT - Create service-scoped logger from shared
import { createLogger } from "@kenchi/shared";
const logger = createLogger("api"); // Service name in every log line
```

❌ **Duplicating error classes**

```typescript
// WRONG
class ValidationError extends Error { ... }
```

✅ **Using shared errors**

```typescript
// CORRECT
import { ValidationError } from "@kenchi/shared";
```

❌ **Creating local types**

```typescript
// WRONG
interface Config { ... }
```

✅ **Using shared types**

```typescript
// CORRECT
import type { Config } from "@kenchi/shared";
```

❌ **Scattering constants across files**

```typescript
// WRONG - Constants in multiple files
// validation.ts
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// openaiClient/validation.ts
const DANGEROUS_KEYWORDS = ['delete', ...];
```

✅ **Centralizing constants**

```typescript
// CORRECT - All constants in constants.ts
// constants.ts
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const DANGEROUS_KEYWORDS = ['delete', ...] as const;

// validation.ts
import { EMAIL_REGEX } from './constants.js';
```

### 12. Shared Package Rules

**Keep shared package clean and stable:**

- **Shared must be dependency-light and stable** - No service-specific dependencies
- **No importing service code from shared** - Shared should not depend on services
- **No Slack/GitHub-specific logic inside shared** - Only generic clients/interfaces
- **Shared is for reusable domain logic** - Not a dumping ground for everything

**Decision Process:**

1. Is it used by 2+ services? → Shared
2. Is it domain-invariant (config, errors, logger)? → Shared
3. Is it integration-specific glue? → Service
4. Is it a tiny one-off helper? → Service

## Remember

**The folder structure is a guide, not a constraint. The shared package is the single source of truth for reusable functionality. Always check it first, always use it for reusable code, but allow service-local glue code.**

---

# Senior-Level TypeScript & Node.js Coding Standards

This section defines senior-level coding standards for the Kenchi project, following industry best practices for TypeScript and Node.js development.

## Table of Contents

1. [TypeScript Standards](#typescript-standards)
2. [Node.js Standards](#nodejs-standards)
3. [Code Organization](#code-organization)
4. [Error Handling](#error-handling)
5. [Async/Await Patterns](#asyncawait-patterns)
6. [Type Safety](#type-safety)
7. [Performance](#performance)
8. [Security](#security)
9. [Testing](#testing)
10. [Documentation](#documentation)

## TypeScript Standards

### Type Definitions

#### ✅ DO: Use Explicit Types

```typescript
// ✅ Good - Explicit types
function processEvent(event: WebhookEvent): Promise<LLMAnalysisResult> {
  // Implementation
}

// ❌ Bad - Implicit any
function processEvent(event) {
  // Implementation
}
```

#### ✅ DO: Use Type Aliases for Complex Types

```typescript
// ✅ Good - Reusable type alias
type EventHandler<T extends WebhookEvent> = (event: T) => Promise<void>;

// ❌ Bad - Inline complex types
function handle(event: { type: string; payload: Record<string, unknown> }) {}
```

#### ✅ DO: Use Interfaces for Public/Extensible Object Shapes

```typescript
// ✅ Good - Interface for public/extensible object shape
interface ServiceConfig {
  readonly host: string;
  readonly port: number;
  readonly timeout: number;
}

// ✅ Good - Type alias for unions, mapped types, intersections
type WebhookEvent = CIFailureEvent | GitHubPREvent | SlackMessageEvent;
type PartialConfig = Partial<ServiceConfig>;
type ConfigKeys = keyof ServiceConfig;

// Both interfaces and type aliases are fine - choose based on use case
```

#### ✅ DO: Use `readonly` for Immutability

```typescript
// ✅ Good - Immutable configuration
interface Config {
  readonly apiKey: string;
  readonly timeout: number;
  readonly retries: number;
}
```

#### ✅ DO: Use Discriminated Unions

```typescript
// ✅ Good - Discriminated union
type WebhookEvent =
  | { type: "ci_failure"; log: string; repository: string }
  | { type: "pr_opened"; prNumber: number; repository: string }
  | { type: "deployment"; environment: string; version: string };

function handleEvent(event: WebhookEvent) {
  switch (event.type) {
    case "ci_failure":
      // TypeScript knows event.log exists
      return processFailure(event.log);
    case "pr_opened":
      // TypeScript knows event.prNumber exists
      return processPR(event.prNumber);
  }
}
```

#### ✅ DO: Use Generic Types Appropriately

```typescript
// ✅ Good - Generic with constraints
interface Repository<T extends { id: string }> {
  findById(id: string): Promise<T | null>;
  save(entity: T): Promise<T>;
}

// ✅ Good - Generic utility type
type Result<T, E = Error> = { success: true; data: T } | { success: false; error: E };
```

#### ❌ DON'T: Use `any` Type

```typescript
// ❌ Bad - any defeats type safety
function process(data: any): any {
  return data.processed;
}

// ✅ Good - Use unknown and type guards
function process(data: unknown): ProcessedData {
  if (isValidData(data)) {
    return transform(data);
  }
  throw new ValidationError("Invalid data");
}
```

#### ❌ DON'T: Use Type Assertions Unnecessarily

```typescript
// ❌ Bad - Unsafe type assertion
const result = data as Result;

// ✅ Good - Type guard
function isResult(data: unknown): data is Result {
  return typeof data === "object" && data !== null && "success" in data;
}

if (isResult(data)) {
  // TypeScript knows data is Result
}
```

### Type Guards

#### ✅ DO: Create Type Guards for Runtime Validation

```typescript
// ✅ Good - Type guard function
function isWebhookEvent(data: unknown): data is WebhookEvent {
  return (
    typeof data === "object" &&
    data !== null &&
    "type" in data &&
    "timestamp" in data &&
    typeof (data as WebhookEvent).type === "string"
  );
}

// Usage
if (isWebhookEvent(req.body)) {
  // TypeScript knows req.body is WebhookEvent
  processEvent(req.body);
}
```

### Utility Types

#### ✅ DO: Use Built-in Utility Types

```typescript
// ✅ Good - Use utility types
type PartialConfig = Partial<Config>;
type RequiredConfig = Required<Config>;
type ReadonlyConfig = Readonly<Config>;
type ConfigKeys = keyof Config;
type ConfigValues = Config[keyof Config];

// ✅ Good - Custom utility types
type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};
```

## Node.js Standards

### Module System

#### ✅ DO: Use ES Modules

```typescript
// ✅ Good - ES modules
import { createLogger, config } from "@kenchi/shared";
import type { WebhookEvent } from "@kenchi/shared";

const logger = createLogger("service"); // Service-scoped logger

export const processEvent = async (event: WebhookEvent): Promise<void> => {
  // Implementation
};
```

#### ✅ DO: Separate Type and Value Imports

```typescript
// ✅ Good - Separate type imports
import { createLogger, config } from "@kenchi/shared";
import type { WebhookEvent, LLMAnalysisResult } from "@kenchi/shared";

const logger = createLogger("service"); // Service-scoped logger

// ❌ Bad - Mixed imports (though TypeScript allows this)
import { createLogger, type WebhookEvent } from "@kenchi/shared";
```

### Error Handling

#### ✅ DO: Use Custom Error Classes

```typescript
// ✅ Good - Custom error with context
class ValidationError extends AppError {
  constructor(
    message: string,
    public readonly field: string,
    public readonly value: unknown
  ) {
    super(message, "VALIDATION_ERROR");
    this.name = "ValidationError";
  }
}

// Usage
throw new ValidationError("Invalid email format", "email", userInput);
```

#### ✅ DO: Use Result Types for Expected Errors

```typescript
// ✅ Good - Result type pattern
type Result<T, E = Error> = { success: true; data: T } | { success: false; error: E };

async function fetchData(id: string): Promise<Result<Data, NotFoundError>> {
  try {
    const data = await repository.findById(id);
    if (!data) {
      return { success: false, error: new NotFoundError(`Data ${id} not found`) };
    }
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error as Error };
  }
}
```

#### ✅ DO: Handle Errors at Appropriate Levels

```typescript
// ✅ Good - Error handling middleware
app.use(errorHandler);

// ✅ Good - Service-level error handling
async function processRequest(req: Request): Promise<Response> {
  try {
    const result = await service.process(req.body);
    return Response.json(result);
  } catch (error) {
    if (error instanceof ValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error; // Let middleware handle unexpected errors
  }
}
```

#### ✅ DO: Prefer the Clearest Approach for Error Handling

```typescript
// ✅ Good - Use Map/Set when you have a real lookup table
interface ErrorLike {
  readonly status?: number;
  readonly code?: string;
  readonly message?: string;
}

type ErrorMessageFactory = (message?: string) => string;

// Use Map for O(1) status code lookups
const STATUS_ERROR_MESSAGES: Readonly<Map<number, ErrorMessageFactory>> = new Map([
  [400, (message?: string) => `Request invalid: ${message || "Bad request"}`],
  [401, () => "Authentication failed. Check API key configuration."],
  [429, () => "Rate limit exceeded after retries. Please try again later."],
]);

// Use Set for O(1) error code lookups
const TIMEOUT_ERROR_CODES: Readonly<Set<string>> = new Set(["ECONNABORTED", "ETIMEDOUT"]);

const handleError = (error: unknown, timeout: number): Error => {
  if (!isErrorLike(error)) {
    return new Error("Unknown error occurred");
  }

  // O(1) lookup instead of if-else chain
  if (error.status !== undefined) {
    const messageFactory = STATUS_ERROR_MESSAGES.get(error.status);
    if (messageFactory) {
      return new Error(messageFactory(error.message));
    }
  }

  // O(1) lookup instead of multiple OR conditions
  if (error.code !== undefined && TIMEOUT_ERROR_CODES.has(error.code)) {
    return new Error(`Request timed out after ${timeout}ms`);
  }

  if (error.message) {
    return new Error(`Error: ${error.message}`);
  }

  return new Error("Unknown error occurred");
};

// ❌ Bad - If-else chain with repeated conditions
const handleErrorBad = (error: unknown, timeout: number): Error => {
  if (error.status === 400) {
    return new Error(`Request invalid: ${error.message || "Bad request"}`);
  }
  if (error.status === 401) {
    return new Error("Authentication failed. Check API key configuration.");
  }
  if (error.status === 429) {
    return new Error("Rate limit exceeded after retries. Please try again later.");
  }
  if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
    return new Error(`Request timed out after ${timeout}ms`);
  }
  // ... more if-else statements
};
```

**Benefits:**

- **O(1) lookups** instead of O(n) if-else chains
- **More maintainable** - easy to add new status codes
- **Type-safe** - proper interfaces and type guards
- **Readonly constants** - prevents mutations
- **Cleaner code** - Map/Set initialization is declarative

**Note:** Sometimes a plain `switch` statement is clearer and faster to read. Use Map/Set when you have a real lookup table or membership test, not as a blanket rule.

### Function Declarations vs Arrow Functions

**Default to arrow functions. Use function declarations when required (overloads, generators) or when it improves API ergonomics.**

#### ✅ DO: Default to Arrow Functions

```typescript
// ✅ Good - Arrow functions for callbacks
const users = data.map((user) => transformUser(user));
const filtered = items.filter((item) => item.active);
const sorted = items.sort((a, b) => a.priority - b.priority);

// ✅ Good - Arrow functions for short, single-purpose functions
const formatDate = (date: Date): string => date.toISOString();
const calculateTotal = (items: Item[]): number => items.reduce((sum, item) => sum + item.price, 0);

// ✅ Good - Arrow functions in class methods (when appropriate)
class EventProcessor {
  private processEvent = async (event: WebhookEvent): Promise<void> => {
    await this.repository.save(event);
  };
}
```

#### ✅ DO: Use Function Declarations When Required

```typescript
// ✅ Good - Function declaration for overloads (required by TypeScript)
function processEvent(event: CIFailureEvent): Promise<CIFailureResult>;
function processEvent(event: GitHubPREvent): Promise<GitHubPRResult>;
function processEvent(event: WebhookEvent): Promise<ProcessResult> {
  // Implementation
}

// ✅ Good - Generator functions must use function declarations
async function* processStream(stream: ReadableStream): AsyncGenerator<Chunk> {
  // Implementation
}

// ✅ Good - Function declaration when it improves API ergonomics
function validateInput(input: unknown): input is UserInput {
  return typeof input === "object" && input !== null && "email" in input;
}
```

#### ✅ DO: Use Arrow Functions for Preserving `this` Context

```typescript
// ✅ Good - Arrow function preserves 'this'
class EventHandler {
  private events: Event[] = [];

  // Arrow function preserves 'this' context
  handleEvent = (event: Event): void => {
    this.events.push(event);
    this.processEvent(event);
  };

  // ❌ Bad - Regular method loses 'this' when passed as callback
  handleEventBad(event: Event): void {
    this.events.push(event); // 'this' might be undefined
  }
}

// Usage
const handler = new EventHandler();
document.addEventListener("click", handler.handleEvent); // ✅ Works
document.addEventListener("click", handler.handleEventBad); // ❌ 'this' is lost
```

#### ❌ DON'T: Use Arrow Functions When Overriding is Needed

```typescript
// ❌ Bad - Arrow function in class method can't be overridden properly
class BaseProcessor {
  process = (data: unknown): void => {
    // Can't be properly overridden in subclasses
  };
}

// ✅ Good - Regular method can be overridden
class BaseProcessor {
  process(data: unknown): void {
    // Can be properly overridden in subclasses
  }
}
```

### Async/Await Patterns

#### ✅ DO: Use Async/Await (Not Promises)

```typescript
// ✅ Good - Async/await with arrow function
const fetchUserData = async (userId: string): Promise<UserData> => {
  const user = await userRepository.findById(userId);
  const profile = await profileRepository.findByUserId(userId);
  return { user, profile };
};

// ✅ Good - Async/await with function declaration
async function fetchUserData(userId: string): Promise<UserData> {
  const user = await userRepository.findById(userId);
  const profile = await profileRepository.findByUserId(userId);
  return { user, profile };
}

// ❌ Bad - Promise chains
const fetchUserData = (userId: string): Promise<UserData> => {
  return userRepository
    .findById(userId)
    .then((user) => profileRepository.findByUserId(userId).then((profile) => ({ user, profile })));
};
```

#### ✅ DO: Handle Concurrent Operations

```typescript
// ✅ Good - Parallel execution
async function fetchAllData(userId: string): Promise<AllData> {
  const [user, profile, settings] = await Promise.all([
    userRepository.findById(userId),
    profileRepository.findByUserId(userId),
    settingsRepository.findByUserId(userId),
  ]);
  return { user, profile, settings };
}

// ✅ Good - With error handling
async function fetchAllData(userId: string): Promise<Result<AllData>> {
  try {
    const [user, profile, settings] = await Promise.allSettled([
      userRepository.findById(userId),
      profileRepository.findByUserId(userId),
      settingsRepository.findByUserId(userId),
    ]);

    if (user.status === "rejected" || profile.status === "rejected") {
      return { success: false, error: new Error("Failed to fetch data") };
    }

    return { success: true, data: { user: user.value, profile: profile.value } };
  } catch (error) {
    return { success: false, error: error as Error };
  }
}
```

#### ✅ DO: Use Async Iterators for Streams

```typescript
// ✅ Good - Async iterator (generator functions)
async function* processStream(stream: ReadableStream): AsyncGenerator<Chunk> {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield processChunk(value);
    }
  } finally {
    reader.releaseLock();
  }
}

// Note: Generator functions must use function declarations, not arrow functions
```

### Resource Management

#### ✅ DO: Use Try-Finally for Cleanup

```typescript
// ✅ Good - Resource cleanup
async function processFile(filePath: string): Promise<void> {
  const fileHandle = await fs.open(filePath, "r");
  try {
    const content = await fileHandle.readFile();
    await processContent(content);
  } finally {
    await fileHandle.close();
  }
}
```

#### ✅ DO: Use AbortController for Cancellation

```typescript
// ✅ Good - Cancellable operations with arrow function
const fetchWithTimeout = async (url: string, timeout: number): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
};

// ✅ Good - Alternative with function declaration
async function fetchWithTimeout(url: string, timeout: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}
```

## Code Organization

### Function Design

#### ✅ DO: Keep Functions Small and Focused

```typescript
// ✅ Good - Single responsibility with arrow function
const validateUserInput = async (input: UserInput): Promise<ValidationResult> => {
  const errors: ValidationError[] = [];

  if (!input.email || !isValidEmail(input.email)) {
    errors.push(new ValidationError("Invalid email", "email", input.email));
  }

  if (!input.password || input.password.length < 8) {
    errors.push(new ValidationError("Password too short", "password"));
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
};

// ✅ Good - Single responsibility with function declaration
async function validateUserInput(input: UserInput): Promise<ValidationResult> {
  const errors: ValidationError[] = [];

  if (!input.email || !isValidEmail(input.email)) {
    errors.push(new ValidationError("Invalid email", "email", input.email));
  }

  if (!input.password || input.password.length < 8) {
    errors.push(new ValidationError("Password too short", "password"));
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

// ❌ Bad - Multiple responsibilities
const processUser = async (input: unknown): Promise<User> => {
  // Validation, transformation, persistence all mixed together
};
```

#### ✅ DO: Use Pure Functions When Possible

```typescript
// ✅ Good - Pure function with arrow function
const calculateTotal = (items: Item[]): number => items.reduce((sum, item) => sum + item.price, 0);

// ✅ Good - Pure function with function declaration
function calculateTotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}

// ❌ Bad - Side effects
let total = 0;
const calculateTotal = (items: Item[]): void => {
  items.forEach((item) => {
    total += item.price;
  });
};
```

#### ✅ DO: Use Function Overloading for Type Safety

```typescript
// ✅ Good - Function overloading (must use function declaration)
function processEvent(event: CIFailureEvent): Promise<CIFailureResult>;
function processEvent(event: GitHubPREvent): Promise<GitHubPRResult>;
function processEvent(event: WebhookEvent): Promise<ProcessResult> {
  switch (event.type) {
    case "ci_failure":
      return processCIFailure(event);
    case "pr_opened":
      return processPR(event);
  }
}

// Note: Arrow functions don't support overloading, use function declarations
```

### Class Design

#### ✅ DO: Prefer Composition Over Inheritance

```typescript
// ✅ Good - Composition
class EventProcessor {
  constructor(
    private readonly logger: Logger,
    private readonly validator: Validator,
    private readonly repository: Repository
  ) {}

  async process(event: WebhookEvent): Promise<void> {
    this.validator.validate(event);
    await this.repository.save(event);
    this.logger.info("Event processed", { eventId: event.id });
  }
}

// ❌ Bad - Inheritance
class EventProcessor extends BaseProcessor {
  // Tight coupling, harder to test
}
```

#### ✅ DO: Use Dependency Injection

```typescript
// ✅ Good - Dependency injection
class AnalysisService {
  constructor(
    private readonly openaiClient: OpenAIClient,
    private readonly vectorStore: VectorStore,
    private readonly logger: Logger
  ) {}

  async analyze(failureLog: string): Promise<AnalysisResult> {
    // Use injected dependencies
  }
}
```

### Constants and Configuration

#### ✅ DO: Use const Assertions

```typescript
// ✅ Good - Const assertion
const API_ENDPOINTS = {
  ANALYZE: "/api/analyze",
  WEBHOOK: "/webhook",
  HEALTH: "/health",
} as const;

type ApiEndpoint = (typeof API_ENDPOINTS)[keyof typeof API_ENDPOINTS];

// ✅ Good - Readonly configuration
const DEFAULT_CONFIG = {
  timeout: 5000,
  retries: 3,
  maxConnections: 10,
} as const satisfies Config;
```

## Performance

### Memory Management

#### ✅ DO: Avoid Memory Leaks

```typescript
// ✅ Good - Clean up event listeners
class EventEmitter {
  private listeners = new Map<string, Set<Function>>();

  on(event: string, listener: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  off(event: string, listener: Function): void {
    this.listeners.get(event)?.delete(listener);
  }

  removeAllListeners(event?: string): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}
```

#### ✅ DO: Use Streaming for Large Data

```typescript
// ✅ Good - Streaming
import { pipeline } from "stream/promises";

async function processLargeFile(inputPath: string, outputPath: string): Promise<void> {
  const readStream = createReadStream(inputPath);
  const transformStream = new Transform({
    transform(chunk, encoding, callback) {
      const processed = processChunk(chunk);
      callback(null, processed);
    },
  });
  const writeStream = createWriteStream(outputPath);

  await pipeline(readStream, transformStream, writeStream);
}
```

### Optimization

#### ✅ DO: Use Lazy Evaluation

```typescript
// ✅ Good - Lazy evaluation with arrow function factory
class LazyValue<T> {
  private value: T | null = null;
  private factory: () => T;

  constructor(factory: () => T) {
    this.factory = factory;
  }

  get = (): T => {
    if (this.value === null) {
      this.value = this.factory();
    }
    return this.value;
  };
}

// ✅ Good - Alternative with regular method
class LazyValue<T> {
  private value: T | null = null;
  private factory: () => T;

  constructor(factory: () => T) {
    this.factory = factory;
  }

  get(): T {
    if (this.value === null) {
      this.value = this.factory();
    }
    return this.value;
  }
}
```

#### ✅ DO: Debounce/Throttle Expensive Operations

```typescript
// ✅ Good - Debounce with arrow function
const debounce = <T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): ((...args: Parameters<T>) => void) => {
  let timeoutId: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
};

// ✅ Good - Throttle with arrow function
const throttle = <T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): ((...args: Parameters<T>) => void) => {
  let lastCall = 0;
  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      fn(...args);
    }
  };
};
```

## Security

### Input Validation

#### ✅ DO: Validate All Inputs

```typescript
// ✅ Good - Input validation with arrow function (type guard)
const validateEmail = (email: unknown): email is string => {
  if (typeof email !== "string") return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
};

// ✅ Good - Input validation with function declaration (type guard)
function validateEmail(email: unknown): email is string {
  if (typeof email !== "string") return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
}

// ✅ Good - Complex validation with arrow function
const validateUserInput = (input: unknown): input is UserInput => {
  if (typeof input !== "object" || input === null) return false;
  const obj = input as Record<string, unknown>;
  return validateEmail(obj.email) && typeof obj.password === "string" && obj.password.length >= 8;
};
```

#### ✅ DO: Sanitize User Input

```typescript
// ✅ Good - Sanitization with arrow function
const sanitizeString = (input: string): string =>
  input
    .trim()
    .replace(/[<>]/g, "") // Remove potential HTML
    .slice(0, 1000); // Limit length

// ✅ Good - Alternative with function declaration
function sanitizeString(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, "") // Remove potential HTML
    .slice(0, 1000); // Limit length
}
```

### Secrets Management

#### ✅ DO: Never Commit Secrets

```typescript
// ✅ Good - Use environment variables
const config = {
  apiKey: process.env.OPENAI_API_KEY,
  databaseUrl: process.env.DATABASE_URL,
} as const;

// Validate required env vars
if (!config.apiKey) {
  throw new Error("OPENAI_API_KEY is required");
}
```

#### ✅ DO: Use Type-Safe Configuration

```typescript
// ✅ Good - Type-safe config
interface Config {
  readonly apiKey: string;
  readonly databaseUrl: string;
  readonly port: number;
  readonly nodeEnv: "development" | "production" | "test";
}

function loadConfig(): Config {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY required");

  return {
    apiKey,
    databaseUrl: process.env.DATABASE_URL ?? "postgres://localhost",
    port: parseInt(process.env.PORT ?? "3000", 10),
    nodeEnv: (process.env.NODE_ENV as Config["nodeEnv"]) ?? "development",
  };
}
```

## Testing

### Test Structure

#### ✅ DO: Use Descriptive Test Names

```typescript
// ✅ Good - Descriptive test names
describe("EventProcessor", () => {
  it("should validate event before processing", async () => {
    // Test implementation
  });

  it("should throw ValidationError for invalid event type", async () => {
    // Test implementation
  });
});
```

#### ✅ DO: Use Arrange-Act-Assert Pattern

```typescript
// ✅ Good - AAA pattern
it("should process valid event", async () => {
  // Arrange
  const processor = new EventProcessor(mockLogger, mockValidator, mockRepo);
  const event: WebhookEvent = {
    type: "ci_failure",
    timestamp: new Date(),
    payload: { log: "error" },
  };

  // Act
  const result = await processor.process(event);

  // Assert
  expect(result.success).toBe(true);
  expect(mockRepo.save).toHaveBeenCalledWith(event);
});
```

### Mocking

#### ✅ DO: Use Type-Safe Mocks

```typescript
// ✅ Good - Type-safe mocks
const mockLogger: jest.Mocked<Logger> = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
} as jest.Mocked<Logger>;

// Usage
expect(mockLogger.info).toHaveBeenCalledWith("Event processed", expect.any(Object));
```

## Documentation

### Code Comments

#### ✅ DO: Document Public APIs

````typescript
/**
 * Processes a webhook event and returns analysis results.
 *
 * @param event - The webhook event to process
 * @returns Promise resolving to analysis result
 * @throws {ValidationError} If event is invalid
 * @throws {ExternalServiceError} If external service fails
 *
 * @example
 * ```typescript
 * const event: CIFailureEvent = { type: 'ci_failure', log: '...' };
 * const result = await processEvent(event);
 * ```
 */
async function processEvent(event: WebhookEvent): Promise<LLMAnalysisResult> {
  // Implementation
}
````

#### ✅ DO: Use JSDoc for Complex Types

```typescript
/**
 * Configuration for the analysis service.
 *
 * @interface AnalysisConfig
 * @property {number} timeout - Request timeout in milliseconds
 * @property {number} maxRetries - Maximum number of retry attempts
 * @property {string} model - OpenAI model to use
 */
interface AnalysisConfig {
  readonly timeout: number;
  readonly maxRetries: number;
  readonly model: string;
}
```

## Modularity and Code Organization

### Module Size Standards

#### ✅ DO: Keep Modules Focused and Reasonable Size

```typescript
// ✅ Good - Focused module (50-200 lines)
// services/api/src/routes/events.ts
export const eventRoutes = {
  create: asyncHandler(async (req, res) => {
    // Implementation
  }),
  list: asyncHandler(async (req, res) => {
    // Implementation
  }),
};

// ❌ Bad - Monolithic module (1000+ lines)
// services/api/src/index.ts - Everything in one file
```

**Module Size Guidelines:**

- **Small modules**: 50-150 lines (utilities, helpers, types)
- **Medium modules**: 150-300 lines (services, handlers, controllers)
- **Large modules**: 300-500 lines (complex services, main entry points)
- **Maximum**: 500 lines per file (split if larger)

#### ✅ DO: Split Large Modules

```typescript
// ❌ Bad - Too large (600+ lines)
// services/api/src/index.ts
// Contains: routes, middleware, validation, error handling, etc.

// ✅ Good - Split into focused modules
// services/api/src/index.ts (50 lines) - Entry point
// services/api/src/routes/events.ts (150 lines) - Event routes
// services/api/src/routes/webhooks.ts (120 lines) - Webhook routes
// services/api/src/middleware/auth.ts (80 lines) - Auth middleware
// services/api/src/validators/eventValidator.ts (100 lines) - Validators
```

### Naming Conventions

#### ✅ DO: Use Descriptive Variable Names

```typescript
// ✅ Good - Descriptive and clear
const userEmailAddress = user.email;
const isUserAuthenticated = checkAuth(user);
const eventProcessingResult = await processEvent(event);
const maxRetryAttempts = 3;
const apiRequestTimeout = 5000;

// ❌ Bad - Abbreviated or unclear
const ue = user.email;
const auth = checkAuth(user);
const res = await processEvent(event);
const max = 3;
const to = 5000;
```

#### ✅ DO: Use Descriptive Function Names

```typescript
// ✅ Good - Verb-based, descriptive
const validateUserEmail = (email: string): boolean => {
  /* ... */
};
const calculateTotalPrice = (items: Item[]): number => {
  /* ... */
};
const fetchUserProfileById = async (userId: string): Promise<Profile> => {
  /* ... */
};
const transformEventToWebhookPayload = (event: Event): WebhookPayload => {
  /* ... */
};

// ❌ Bad - Unclear or abbreviated
const validate = (e: string): boolean => {
  /* ... */
};
const calc = (i: Item[]): number => {
  /* ... */
};
const get = async (id: string): Promise<Profile> => {
  /* ... */
};
const xform = (e: Event): WebhookPayload => {
  /* ... */
};
```

#### ✅ DO: Use Consistent Naming Patterns

```typescript
// ✅ Good - Consistent patterns
// Boolean variables: is/has/should/can prefix
const isAuthenticated = checkAuth(user);
const hasPermission = user.permissions.includes("admin");
const shouldRetry = attemptCount < maxRetries;
const canEdit = user.role === "editor";

// Functions: verb + noun
const createUser = (data: UserData): User => {
  /* ... */
};
const updateUser = (id: string, data: Partial<User>): User => {
  /* ... */
};
const deleteUser = (id: string): void => {
  /* ... */
};
const getUserById = (id: string): User | null => {
  /* ... */
};

// Constants: UPPER_SNAKE_CASE
const MAX_RETRY_ATTEMPTS = 3;
const API_BASE_URL = "https://api.example.com";
const DEFAULT_TIMEOUT_MS = 5000;

// Types/Interfaces: PascalCase
interface UserProfile {
  /* ... */
}
type EventHandler = (event: Event) => Promise<void>;
```

#### ✅ DO: Use Descriptive Folder Names

```
// ✅ Good - Clear, descriptive folder structure
packages/shared/src/
├── config/              # Configuration utilities
│   ├── env.ts          # Environment variables
│   └── constants.ts    # Constants
├── validation/         # Validation utilities
│   ├── validators.ts   # Validator functions
│   └── schemas.ts      # Validation schemas
├── errors/             # Error classes
│   ├── appError.ts     # Base error class
│   └── customErrors.ts # Custom error types
└── utils/              # General utilities
    ├── formatters.ts   # Formatting functions
    └── helpers.ts      # Helper functions

// ❌ Bad - Unclear or abbreviated
packages/shared/src/
├── cfg/                # What is cfg?
├── val/                # Unclear
├── err/                # Abbreviated
└── util/               # Too generic
```

### File and Module Organization

#### ✅ DO: One Concept Per File

```typescript
// ✅ Good - Single responsibility
// packages/shared/src/errors/appError.ts
export class AppError extends Error {
  // Only AppError class
}

// packages/shared/src/errors/validationError.ts
export class ValidationError extends AppError {
  // Only ValidationError class
}

// ❌ Bad - Multiple concepts in one file
// packages/shared/src/errors.ts
export class AppError extends Error {
  /* ... */
}
export class ValidationError extends AppError {
  /* ... */
}
export class NotFoundError extends AppError {
  /* ... */
}
export class AuthenticationError extends AppError {
  /* ... */
}
// Too many concepts in one file
```

#### ✅ DO: Use Index Files for Clean Imports

```typescript
// ✅ Good - Index file for clean imports
// packages/shared/src/errors/index.ts
export { AppError } from "./appError.js";
export { ValidationError } from "./validationError.js";
export { NotFoundError } from "./notFoundError.js";

// Usage
import { AppError, ValidationError } from "@kenchi/shared/errors";

// ❌ Bad - Deep imports
import { ValidationError } from "@kenchi/shared/src/errors/validationError";
```

#### ✅ DO: Group Related Functionality

```typescript
// ✅ Good - Grouped by feature/domain
services/api/src/
├── routes/
│   ├── events.ts       # Event-related routes
│   ├── webhooks.ts     # Webhook routes
│   └── health.ts       # Health check routes
├── handlers/
│   ├── eventHandler.ts # Event processing logic
│   └── webhookHandler.ts # Webhook processing logic
├── validators/
│   ├── eventValidator.ts # Event validation
│   └── webhookValidator.ts # Webhook validation
└── types/
    ├── eventTypes.ts   # Event-related types
    └── webhookTypes.ts # Webhook-related types

// ❌ Bad - Flat structure, hard to navigate
services/api/src/
├── events.ts
├── webhooks.ts
├── eventHandler.ts
├── webhookHandler.ts
├── validateEvents.ts
├── validateWebhooks.ts
// Too many files at root level
```

### Code Organization Principles

#### ✅ DO: Follow Single Responsibility Principle

```typescript
// ✅ Good - Each module has one responsibility
// packages/shared/src/validation/validators.ts - Only validation logic
export const validators = {
  email: (value: unknown): value is string => {
    /* ... */
  },
  required: (value: unknown): boolean => {
    /* ... */
  },
};

// packages/shared/src/validation/schemas.ts - Only schema definitions
export const userSchema = {
  email: validators.email,
  name: validators.required,
};

// ❌ Bad - Multiple responsibilities
// packages/shared/src/validation.ts
export const validators = {
  /* ... */
};
export const schemas = {
  /* ... */
};
export const validate = (data: unknown) => {
  /* ... */
};
export class ValidationError extends Error {
  /* ... */
}
// Too many responsibilities
```

#### ✅ DO: Use Clear Module Boundaries

```typescript
// ✅ Good - Clear boundaries, explicit exports
// packages/shared/src/logger.ts
export interface Logger {
  info(message: string, metadata?: Record<string, unknown>): void;
  error(message: string, error?: Error): void;
}

export const logger: Logger = {
  info: (message, metadata) => {
    /* ... */
  },
  error: (message, error) => {
    /* ... */
  },
};

// Only exports what's needed, clear interface

// ❌ Bad - Unclear boundaries, exports everything
// packages/shared/src/logger.ts
export const logger = {
  /* ... */
};
export const createLogger = () => {
  /* ... */
};
export const logLevels = {
  /* ... */
};
export const formatLog = () => {
  /* ... */
};
export const parseLog = () => {
  /* ... */
};
// Too many exports, unclear what's public API
```

### Folder Structure Standards

#### ✅ DO: Use Consistent Folder Structure

```
// ✅ Good - Consistent structure across services
services/
├── api/
│   ├── src/
│   │   ├── index.ts          # Entry point
│   │   ├── routes/            # Route definitions
│   │   ├── handlers/          # Business logic
│   │   ├── middleware/        # Express middleware
│   │   ├── validators/        # Input validation
│   │   └── types/             # Type definitions
│   └── package.json
├── slack-bot/
│   ├── src/
│   │   ├── index.ts          # Entry point
│   │   ├── commands/         # Slack commands
│   │   ├── handlers/         # Event handlers
│   │   ├── middleware/       # Slack middleware
│   │   └── types/            # Type definitions
│   └── package.json
└── github-app/
    ├── src/
    │   ├── index.ts          # Entry point
    │   ├── webhooks/         # Webhook handlers
    │   ├── handlers/        # PR/issue handlers
    │   └── types/           # Type definitions
    └── package.json
```

#### ✅ DO: Use Descriptive Folder Names

```typescript
// ✅ Good - Descriptive folder names
src/
├── routes/           # HTTP routes
├── handlers/         # Request handlers
├── middleware/       # Express middleware
├── validators/       # Validation logic
├── services/         # Business logic services
├── repositories/     # Data access layer
├── types/            # TypeScript types
└── utils/            # Utility functions

// ❌ Bad - Unclear or abbreviated
src/
├── r/                # What is r?
├── h/                # Unclear
├── mw/               # Abbreviated
├── v/                # Too short
├── srv/              # Abbreviated
├── repo/             # Could be clearer
├── t/                # Too short
└── u/                # Too short
```

### Module Cohesion

#### ✅ DO: Keep Related Code Together

```typescript
// ✅ Good - Related functionality grouped
// packages/shared/src/validation/
├── validators.ts     # Validator functions
├── schemas.ts        # Schema definitions
├── types.ts          # Validation types
└── index.ts          # Public API

// All validation-related code in one place

// ❌ Bad - Related code scattered
// packages/shared/src/
├── validators.ts     # Validators
├── schemas.ts        # Schemas (but in different location)
├── validationTypes.ts # Types (different naming)
└── validate.ts      # Main function (different location)
// Hard to find related code
```

#### ✅ DO: Minimize Module Dependencies

```typescript
// ✅ Good - Minimal, clear dependencies
// services/api/src/routes/events.ts
import { asyncHandler, validate } from "@kenchi/shared";
import { eventHandler } from "../handlers/eventHandler.js";
import type { EventRequest } from "../types/eventTypes.js";

// Clear, minimal dependencies

// ❌ Bad - Too many dependencies
// services/api/src/routes/events.ts
import { asyncHandler, validate, createLogger, config, errorHandler } from "@kenchi/shared";
const logger = createLogger("api");
import { eventHandler } from "../handlers/eventHandler.js";
import { eventValidator } from "../validators/eventValidator.js";
import { eventRepository } from "../repositories/eventRepository.js";
import { eventService } from "../services/eventService.js";
import type { EventRequest, EventResponse, EventType } from "../types/eventTypes.js";
// Too many dependencies, tight coupling
```

### Code Metrics and Limits

#### Module Size Guidelines

| Module Type      | Recommended Lines | Maximum Lines | Action if Exceeded               |
| ---------------- | ----------------- | ------------- | -------------------------------- |
| Utility/Helper   | 50-150            | 200           | Split into smaller utilities     |
| Service/Handler  | 150-300           | 400           | Extract sub-services or handlers |
| Controller/Route | 100-250           | 350           | Split routes by resource         |
| Main Entry Point | 50-200            | 300           | Move logic to separate modules   |
| Type Definitions | 100-300           | 500           | Split by domain/feature          |
| Test Files       | 100-300           | 500           | Split test suites                |

#### ✅ DO: Monitor and Refactor Large Modules

```typescript
// ✅ Good - Refactor when module grows
// Before: services/api/src/index.ts (600 lines)
// After refactoring:
// services/api/src/index.ts (50 lines) - Entry point only
// services/api/src/routes/index.ts (100 lines) - Route setup
// services/api/src/middleware/index.ts (80 lines) - Middleware setup
// services/api/src/config/app.ts (70 lines) - App configuration
```

## Separation of Concerns

### Core Principle

**Separation of Concerns (SoC)** means each module, class, or function should have a single, well-defined responsibility. Different concerns should be handled by different components.

### Layered Architecture

#### ✅ DO: Separate Layers Clearly

```typescript
// ✅ Good - Clear layer separation
// Layer 1: Presentation/API Layer
// services/api/src/routes/events.ts
import { asyncHandler, validate } from "@kenchi/shared";
import { eventService } from "../services/eventService.js";

export const createEvent = asyncHandler(async (req, res) => {
  const validatedData = validate(eventSchema, req.body);
  const result = await eventService.createEvent(validatedData);
  res.status(201).json(result);
});

// Layer 2: Business Logic Layer
// services/api/src/services/eventService.ts
import { eventRepository } from "../repositories/eventRepository.js";
import { createLogger } from "@kenchi/shared";

const logger = createLogger("event-service"); // Service-scoped logger

export const eventService = {
  createEvent: async (data: EventData): Promise<Event> => {
    logger.info("Creating event", { eventType: data.type });
    const event = await eventRepository.save(data);
    await eventService.notifySubscribers(event);
    return event;
  },

  notifySubscribers: async (event: Event): Promise<void> => {
    // Business logic for notifications
  },
};

// Layer 3: Data Access Layer
// services/api/src/repositories/eventRepository.ts
import { db } from "../database/connection.js";

export const eventRepository = {
  save: async (data: EventData): Promise<Event> => {
    return db.events.create(data);
  },

  findById: async (id: string): Promise<Event | null> => {
    return db.events.findById(id);
  },
};

// ❌ Bad - All concerns mixed together
// services/api/src/routes/events.ts
export const createEvent = asyncHandler(async (req, res) => {
  // Validation mixed with route handler
  if (!req.body.type || !req.body.payload) {
    return res.status(400).json({ error: "Invalid data" });
  }

  // Business logic mixed with route handler
  const event = {
    id: generateId(),
    type: req.body.type,
    payload: req.body.payload,
    timestamp: new Date(),
  };

  // Data access mixed with route handler
  await db.query("INSERT INTO events VALUES (?, ?, ?, ?)", [
    event.id,
    event.type,
    event.payload,
    event.timestamp,
  ]);

  // Notification logic mixed with route handler
  await sendNotification(event);

  res.status(201).json(event);
});
```

### Service Layer Separation

#### ✅ DO: Separate Business Logic from Presentation

```typescript
// ✅ Good - Business logic in service layer
// services/api/src/services/analysisService.ts
export class AnalysisService {
  constructor(
    private readonly openaiClient: OpenAIClient,
    private readonly vectorStore: VectorStore,
    private readonly logger: Logger
  ) {}

  async analyzeFailure(failureLog: string, repository: string): Promise<AnalysisResult> {
    // Business logic only - no HTTP concerns
    this.logger.info("Starting analysis", { repository });

    const context = await this.vectorStore.querySimilar(failureLog);
    const analysis = await this.openaiClient.analyze({
      failureLog,
      repository,
      context,
    });

    return {
      analysis: analysis.content,
      confidence: analysis.confidence,
      repository,
    };
  }
}

// ✅ Good - Route handler delegates to service
// services/api/src/routes/analysis.ts
import { analysisService } from "../services/analysisService.js";

export const analyzeFailure = asyncHandler(async (req, res) => {
  const { failure_log, repository } = validate(analysisSchema, req.body);
  const result = await analysisService.analyzeFailure(failure_log, repository);
  res.json(result);
});

// ❌ Bad - Business logic in route handler
// services/api/src/routes/analysis.ts
export const analyzeFailure = asyncHandler(async (req, res) => {
  const { failure_log, repository } = req.body;

  // Business logic should not be here
  const context = await vectorStore.querySimilar(failureLog);
  const analysis = await openaiClient.analyze({
    failureLog: failure_log,
    repository,
    context,
  });

  res.json({
    analysis: analysis.content,
    confidence: analysis.confidence,
  });
});
```

### Data Access Separation

#### ✅ DO: Separate Data Access from Business Logic

```typescript
// ✅ Good - Repository pattern for data access
// services/api/src/repositories/userRepository.ts
export class UserRepository {
  constructor(private readonly db: Database) {}

  async findById(id: string): Promise<User | null> {
    return this.db.users.findById(id);
  }

  async save(user: User): Promise<User> {
    return this.db.users.save(user);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.db.users.findOne({ email });
  }
}

// ✅ Good - Service uses repository, not direct DB access
// services/api/src/services/userService.ts
import { createLogger } from "@kenchi/shared";

const logger = createLogger("user-service"); // Service-scoped logger

export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  async getUserById(id: string): Promise<User> {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new NotFoundError(`User ${id} not found`);
    }
    logger.info("User retrieved", { userId: id });
    return user;
  }
}

// ❌ Bad - Direct database access in service
// services/api/src/services/userService.ts
export class UserService {
  async getUserById(id: string): Promise<User> {
    // Direct DB access - violates separation
    const user = await db.query("SELECT * FROM users WHERE id = ?", [id]);
    if (!user) {
      throw new NotFoundError(`User ${id} not found`);
    }
    return user;
  }
}
```

### Validation Separation

#### ✅ DO: Separate Validation Logic

```typescript
// ✅ Good - Validation in separate layer
// services/api/src/validators/eventValidator.ts
import { validate, validators } from "@kenchi/shared";

export const eventSchema = {
  type: (v: unknown) => validators.required(v) && validators.string(v),
  payload: (v: unknown) => validators.required(v) && validators.object(v),
  timestamp: (v: unknown) => !v || validators.string(v),
};

export const validateEvent = (data: unknown): EventData => {
  return validate(eventSchema, data) as EventData;
};

// ✅ Good - Route uses validator
// services/api/src/routes/events.ts
import { validateEvent } from "../validators/eventValidator.js";

export const createEvent = asyncHandler(async (req, res) => {
  const eventData = validateEvent(req.body);
  const event = await eventService.createEvent(eventData);
  res.status(201).json(event);
});

// ❌ Bad - Validation mixed with route handler
// services/api/src/routes/events.ts
export const createEvent = asyncHandler(async (req, res) => {
  // Validation logic mixed with route handler
  if (typeof req.body.type !== "string") {
    return res.status(400).json({ error: "Type is required" });
  }
  if (typeof req.body.payload !== "object") {
    return res.status(400).json({ error: "Payload is required" });
  }

  const event = await eventService.createEvent(req.body);
  res.status(201).json(event);
});
```

### Error Handling Separation

#### ✅ DO: Separate Error Handling Concerns

```typescript
// ✅ Good - Error handling middleware
// services/api/src/middleware/errorHandler.ts
import { errorHandler } from "@kenchi/shared";

export const apiErrorHandler = errorHandler;

// ✅ Good - Service throws domain errors
// services/api/src/services/eventService.ts
export class EventService {
  async createEvent(data: EventData): Promise<Event> {
    if (await this.eventExists(data.id)) {
      throw new ValidationError("Event already exists", "id", data.id);
    }

    try {
      return await this.repository.save(data);
    } catch (error) {
      throw new ExternalServiceError("Failed to save event", error);
    }
  }
}

// ✅ Good - Route handler doesn't handle errors
// services/api/src/routes/events.ts
export const createEvent = asyncHandler(async (req, res) => {
  const eventData = validateEvent(req.body);
  const event = await eventService.createEvent(eventData);
  res.status(201).json(event);
  // Error handling is done by middleware
});

// ❌ Bad - Error handling mixed with business logic
// services/api/src/routes/events.ts
export const createEvent = asyncHandler(async (req, res) => {
  try {
    const eventData = validateEvent(req.body);
    const event = await eventService.createEvent(eventData);
    res.status(201).json(event);
  } catch (error) {
    // Error handling in route handler
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message });
    }
    if (error instanceof NotFoundError) {
      return res.status(404).json({ error: error.message });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
});
```

### Configuration Separation

#### ✅ DO: Separate Configuration from Application Logic

```typescript
// ✅ Good - Configuration in separate module
// services/api/src/config/appConfig.ts
import { config } from "@kenchi/shared";

export const appConfig = {
  port: config.PORT || 3000,
  environment: config.NODE_ENV,
  apiKeys: {
    openai: config.OPENAI_API_KEY,
  },
  database: {
    url: config.DATABASE_URL,
    poolSize: parseInt(config.DB_POOL_SIZE || "10", 10),
  },
} as const;

// ✅ Good - Application uses config, doesn't access env directly
// services/api/src/index.ts
import { appConfig } from "./config/appConfig.js";

const app = express();
app.listen(appConfig.port, () => {
  logger.info(`Server started on port ${appConfig.port}`);
});

// ❌ Bad - Environment variables accessed directly
// services/api/src/index.ts
const app = express();
app.listen(process.env.PORT || 3000, () => {
  console.log(`Server started on port ${process.env.PORT || 3000}`);
  // Configuration mixed with application logic
});
```

### Testing Separation

#### ✅ DO: Separate Test Concerns

```typescript
// ✅ Good - Unit tests for business logic
// services/api/src/services/__tests__/eventService.test.ts
describe("EventService", () => {
  it("should create event", async () => {
    const mockRepository = createMockRepository();
    const service = new EventService(mockRepository);

    const result = await service.createEvent(mockEventData);

    expect(result).toBeDefined();
    expect(mockRepository.save).toHaveBeenCalled();
  });
});

// ✅ Good - Integration tests for routes
// services/api/src/routes/__tests__/events.integration.test.ts
describe("Event Routes", () => {
  it("should create event via API", async () => {
    const response = await request(app).post("/api/events").send(validEventData);

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty("id");
  });
});

// ❌ Bad - Testing concerns mixed
// services/api/src/__tests__/everything.test.ts
describe("Everything", () => {
  it("should do everything", async () => {
    // Unit test, integration test, and e2e test all mixed
    const service = new EventService(mockRepo);
    const result = await service.createEvent(data);
    const response = await request(app).post("/api/events").send(data);
    // Too many concerns in one test
  });
});
```

### Domain-Driven Separation

#### ✅ DO: Separate by Domain/Feature

```typescript
// ✅ Good - Domain-based separation
services/api/src/
├── domains/
│   ├── events/
│   │   ├── eventService.ts      # Event business logic
│   │   ├── eventRepository.ts   # Event data access
│   │   ├── eventRoutes.ts       # Event routes
│   │   ├── eventValidators.ts   # Event validation
│   │   └── eventTypes.ts        # Event types
│   ├── users/
│   │   ├── userService.ts
│   │   ├── userRepository.ts
│   │   ├── userRoutes.ts
│   │   └── userTypes.ts
│   └── webhooks/
│       ├── webhookService.ts
│       ├── webhookRepository.ts
│       └── webhookRoutes.ts

// Each domain is self-contained with clear boundaries

// ❌ Bad - Everything mixed together
services/api/src/
├── services.ts        # All services in one file
├── repositories.ts    # All repositories in one file
├── routes.ts          # All routes in one file
├── validators.ts      # All validators in one file
// Hard to maintain, tight coupling
```

### Dependency Direction

#### ✅ DO: Maintain Proper Dependency Direction

```typescript
// ✅ Good - Dependencies flow inward
// Presentation Layer (outermost)
// services/api/src/routes/events.ts
import { eventService } from "../services/eventService.js"; // Depends on service

// Business Logic Layer (middle)
// services/api/src/services/eventService.ts
import { eventRepository } from "../repositories/eventRepository.js"; // Depends on repository

// Data Access Layer (innermost)
// services/api/src/repositories/eventRepository.ts
import { db } from "../database/connection.js"; // Depends on database

// Inner layers don't know about outer layers

// ❌ Bad - Circular or wrong-direction dependencies
// services/api/src/repositories/eventRepository.ts
import { eventService } from "../services/eventService.js"; // ❌ Repository depends on service
// This creates circular dependency and violates SoC
```

### Kenchi Monorepo Separation

#### ✅ DO: Maintain Service Boundaries

```typescript
// ✅ Good - Services are independent
// services/api/src/index.ts - API service
// Handles HTTP requests, delegates to shared utilities

// services/slack-bot/src/index.ts - Slack bot service
// Handles Slack events, uses shared utilities

// packages/shared/src/ - Shared utilities
// No service-specific logic, only common functionality

// ❌ Bad - Services depend on each other
// services/api/src/index.ts
import { slackBot } from "../slack-bot/src/index.js"; // ❌ Service depends on another service
// Should use shared package or message queue instead
```

### Common Anti-Patterns to Avoid

#### ❌ DON'T: God Object/Class

```typescript
// ❌ Bad - One class does everything
class EventManager {
  validate(data: unknown) {
    /* ... */
  }
  save(data: EventData) {
    /* ... */
  }
  sendNotification(event: Event) {
    /* ... */
  }
  formatResponse(event: Event) {
    /* ... */
  }
  logEvent(event: Event) {
    /* ... */
  }
  // Too many responsibilities
}

// ✅ Good - Separate concerns
class EventValidator {
  validate(data: unknown): EventData {
    /* ... */
  }
}

class EventRepository {
  save(data: EventData): Promise<Event> {
    /* ... */
  }
}

class NotificationService {
  send(event: Event): Promise<void> {
    /* ... */
  }
}
```

#### ❌ DON'T: Feature Envy

```typescript
// ❌ Bad - Class uses another class's data excessively
class EventFormatter {
  format(event: Event): string {
    // Too much knowledge about Event's internals
    return `${event.user.name} (${event.user.email}) created ${event.type} at ${event.timestamp}`;
  }
}

// ✅ Good - Event provides formatted data
class Event {
  formatSummary(): string {
    return `${this.user.name} (${this.user.email}) created ${this.type} at ${this.timestamp}`;
  }
}

class EventFormatter {
  format(event: Event): string {
    return event.formatSummary(); // Uses Event's own method
  }
}
```

## Code Optimization and Performance

### Core Principle

**Write optimal, efficient code from the start.** Performance is not premature optimization—it's a fundamental requirement. Code should be both readable AND efficient.

### Common Optimization Patterns

#### ❌ DON'T: Nested Loops with Inefficient Operations

```typescript
// ❌ Bad - O(n*m) complexity, toLowerCase() called repeatedly
for (const action of response.recommendedActions || []) {
  const actionText = action.description.toLowerCase();

  for (const keyword of dangerousKeywords) {
    if (actionText.includes(keyword)) {
      errors.push(`Action contains dangerous keyword "${keyword}": ${action.description}`);
    }
  }
}
```

**Problems:**

- Nested loops create O(n\*m) complexity
- `toLowerCase()` called for every action (even if no keywords match)
- `includes()` is less efficient for multiple keyword matching
- No early exit when keyword is found

#### ✅ DO: Use Efficient Data Structures and Early Exits

```typescript
// ✅ Good - O(n) complexity, Set for O(1) lookups, early exit
const dangerousKeywordsSet = new Set(dangerousKeywords.map((keyword) => keyword.toLowerCase()));

for (const action of response.recommendedActions || []) {
  const actionText = action.description.toLowerCase();

  // Use Set for O(1) lookup instead of array iteration
  const foundKeyword = dangerousKeywordsSet.has(actionText)
    ? actionText
    : Array.from(dangerousKeywordsSet).find((keyword) => actionText.includes(keyword));

  if (foundKeyword) {
    errors.push(`Action contains dangerous keyword "${foundKeyword}": ${action.description}`);
    // Early exit if you only need to find one match
    continue;
  }
}
```

**Or even better - use a single pass with regex:**

```typescript
// ✅ Better - Single pass, compiled regex pattern
const dangerousKeywordsPattern = new RegExp(
  dangerousKeywords.map((k) => k.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
  "i"
);

for (const action of response.recommendedActions || []) {
  const match = action.description.match(dangerousKeywordsPattern);
  if (match) {
    errors.push(`Action contains dangerous keyword "${match[0]}": ${action.description}`);
  }
}
```

### Optimization Guidelines

#### ✅ DO: Use Appropriate Data Structures

```typescript
// ✅ Good - Use Set for membership testing
const userIds = new Set(existingUserIds);
if (userIds.has(newUserId)) {
  // O(1) lookup
}

// ✅ Good - Use Map for key-value lookups
const userCache = new Map<string, User>();
const user = userCache.get(userId); // O(1) lookup

// ❌ Bad - Array for membership testing
const userIds = existingUserIds;
if (userIds.includes(newUserId)) {
  // O(n) lookup
}
```

#### ✅ DO: Minimize Repeated Computations

```typescript
// ❌ Bad - Repeated computation
for (const item of items) {
  const processed = expensiveOperation(item);
  if (condition1(processed)) {
    /* ... */
  }
  if (condition2(processed)) {
    /* ... */
  }
  if (condition3(processed)) {
    /* ... */
  }
}

// ✅ Good - Compute once, reuse
for (const item of items) {
  const processed = expensiveOperation(item);
  if (condition1(processed) || condition2(processed) || condition3(processed)) {
    // Use processed value
  }
}
```

#### ✅ DO: Use Early Exits and Short-Circuit Evaluation

```typescript
// ❌ Bad - Unnecessary processing
function validateUser(user: User): ValidationResult {
  const errors: string[] = [];

  if (!user.email) {
    errors.push("Email required");
  }
  if (!user.name) {
    errors.push("Name required");
  }
  if (!user.password) {
    errors.push("Password required");
  }

  return { valid: errors.length === 0, errors };
}

// ✅ Good - Early exit
function validateUser(user: User): ValidationResult {
  if (!user.email) {
    return { valid: false, errors: ["Email required"] };
  }
  if (!user.name) {
    return { valid: false, errors: ["Name required"] };
  }
  if (!user.password) {
    return { valid: false, errors: ["Password required"] };
  }

  return { valid: true, errors: [] };
}
```

#### ✅ DO: Batch Operations and Avoid N+1 Queries

```typescript
// ❌ Bad - N+1 query problem
async function processUsers(userIds: string[]): Promise<User[]> {
  const users: User[] = [];
  for (const id of userIds) {
    const user = await userRepository.findById(id); // N queries
    if (user) users.push(user);
  }
  return users;
}

// ✅ Good - Single batch query
async function processUsers(userIds: string[]): Promise<User[]> {
  return userRepository.findByIds(userIds); // 1 query
}
```

#### ✅ DO: Use Lazy Evaluation and Memoization

```typescript
// ❌ Bad - Eager evaluation, recomputed every time
function getExpensiveData(): ExpensiveData {
  return performExpensiveComputation();
}

// ✅ Good - Lazy evaluation with memoization
class DataCache {
  private cachedData: ExpensiveData | null = null;

  getData(): ExpensiveData {
    if (this.cachedData === null) {
      this.cachedData = performExpensiveComputation();
    }
    return this.cachedData;
  }

  invalidate(): void {
    this.cachedData = null;
  }
}
```

#### ✅ DO: Optimize String Operations

```typescript
// ❌ Bad - String concatenation in loop
let result = "";
for (const item of items) {
  result += item.toString() + ", ";
}

// ✅ Good - Array join
const result = items.map((item) => item.toString()).join(", ");

// ✅ Better - For very large arrays, use StringBuilder pattern
const parts: string[] = [];
for (const item of items) {
  parts.push(item.toString());
}
const result = parts.join(", ");
```

#### ✅ DO: Use Streaming for Large Data

```typescript
// ❌ Bad - Load all data into memory
async function processLargeFile(filePath: string): Promise<void> {
  const content = await fs.readFile(filePath, "utf-8"); // Loads entire file
  const processed = processContent(content);
  await fs.writeFile(outputPath, processed);
}

// ✅ Good - Stream processing
import { pipeline } from "stream/promises";
import { createReadStream, createWriteStream } from "fs";

async function processLargeFile(filePath: string): Promise<void> {
  const readStream = createReadStream(filePath);
  const transformStream = new Transform({
    transform(chunk, encoding, callback) {
      const processed = processChunk(chunk);
      callback(null, processed);
    },
  });
  const writeStream = createWriteStream(outputPath);

  await pipeline(readStream, transformStream, writeStream);
}
```

#### ✅ DO: Parallelize Independent Operations

```typescript
// ❌ Bad - Sequential execution
async function fetchAllData(): Promise<AllData> {
  const user = await fetchUser();
  const profile = await fetchProfile();
  const settings = await fetchSettings();
  return { user, profile, settings };
}

// ✅ Good - Parallel execution
async function fetchAllData(): Promise<AllData> {
  const [user, profile, settings] = await Promise.all([
    fetchUser(),
    fetchProfile(),
    fetchSettings(),
  ]);
  return { user, profile, settings };
}
```

### Performance Checklist

Before writing code, consider:

- [ ] **Time Complexity**: What's the Big O complexity? Can it be improved?
- [ ] **Space Complexity**: Are we using memory efficiently?
- [ ] **Data Structures**: Are we using the most efficient data structure (Set vs Array, Map vs Object)?
- [ ] **Repeated Computations**: Are we computing the same value multiple times?
- [ ] **Early Exits**: Can we exit early to avoid unnecessary processing?
- [ ] **Batch Operations**: Are we making N+1 queries or can we batch?
- [ ] **Lazy Evaluation**: Can we defer expensive operations until needed?
- [ ] **Caching**: Should we cache expensive computations?
- [ ] **Streaming**: For large data, are we using streams instead of loading everything?
- [ ] **Parallelization**: Can independent operations run in parallel?

### Anti-Patterns to Avoid

- **Nested loops** when a single pass or better data structure would work
- **Repeated string operations** (toLowerCase, includes) in loops
- **N+1 query problems** (querying in loops instead of batching)
- **Loading entire datasets** into memory when streaming would work
- **Sequential async operations** when they could be parallel
- **Recomputing values** that could be cached or memoized
- **Using `Array.from().some()`** when Set/Map iteration would be more efficient
- **Recreating constants/patterns** in methods instead of class-level constants
- **Using `console.warn/error`** instead of proper logger from `@kenchi/shared`
- **Building expensive objects** multiple times when they could be computed once

### Specific Optimization Patterns for Kenchi Codebase

#### ✅ DO: Use Class-Level Constants for Repeated Values

```typescript
// ✅ Good - Constants defined once at class level
export class OpenAIClient {
  private static readonly DANGEROUS_KEYWORDS = [
    'delete',
    'drop',
    'truncate',
    // ...
  ] as const;

  private static readonly DANGEROUS_KEYWORDS_PATTERN = ((): RegExp => {
    const escaped = OpenAIClient.DANGEROUS_KEYWORDS.map(k =>
      k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    );
    return new RegExp(`\\b(${escaped.join('|')})\\b`, 'i');
  })();

  private validateKeywords(actions: Action[]): void {
    // Use pre-compiled pattern - no recreation
    const match = action.description.match(OpenAIClient.DANGEROUS_KEYWORDS_PATTERN);
  }
}

// ❌ Bad - Recreated on every method call
private validateKeywords(actions: Action[]): void {
  const keywords = ['delete', 'drop', ...]; // Recreated every time
  const pattern = new RegExp(...); // Recompiled every time
}
```

#### ✅ DO: Use Proper Logger Instead of console

```typescript
// ✅ Good - Use service-scoped logger from shared
import { createLogger } from "@kenchi/shared";
const logger = createLogger("api"); // Service name in every log line

logger.warn("Validation failed", { eventId, errors });
logger.error("API call failed", { error, attempt });

// ❌ Bad - Direct console usage
console.warn("[Service] Validation failed:", errors);
console.error("[Service] Error:", error);

// ❌ Bad - Hand-rolled logger implementation
const logger = { info: () => {}, error: () => {} };
```

#### ✅ DO: Avoid Array.from().some() When Iterating Sets/Maps

```typescript
// ❌ Bad - Converts Set to Array then iterates
private isCommitValid(sha: string, commitSet: Set<string>): boolean {
  return Array.from(commitSet).some((provided) =>
    provided.startsWith(sha)
  );
}

// ✅ Good - Direct Set iteration
private isCommitValid(sha: string, commitSet: Set<string>): boolean {
  if (commitSet.has(sha)) return true; // O(1) check first

  // Only iterate if needed
  for (const provided of commitSet) {
    if (provided.startsWith(sha)) return true;
  }
  return false;
}
```

#### ✅ DO: Pre-compute Lookup Structures Once

```typescript
// ✅ Good - Build lookup structures once, reuse
private validateResponse(response: LLMAnalysisResult, context: Context): ValidationResult {
  // Pre-compute once
  const commitsSet = this.buildCommitPrefixSet(context.evidence.gitHistory);
  const incidentsSet = new Set(context.evidence.relatedDocs?.map(d => d.id) || []);
  const logsMap = this.buildLogLookupMap(context.evidence.logs);

  // Use pre-computed structures in all validations
  this.validateCommits(response, commitsSet);
  this.validateIncidents(response, incidentsSet);
  this.validateLogs(response, logsMap);
}

// ❌ Bad - Recompute on every validation
private validateCommits(response: LLMAnalysisResult, context: Context): void {
  const commits = context.evidence.gitHistory?.map(c => c.sha) || []; // Recreated
  // ...
}
```

#### ✅ DO: Avoid Duplicate Expensive Operations

```typescript
// ❌ Bad - buildAnalysisPrompt called twice
private manageTokenBudget(event: Event, evidence: Evidence, maxTokens: number): Evidence {
  const prompt = buildAnalysisPrompt(event, evidence); // First call
  const tokens = estimateTokens(prompt);
  if (tokens <= maxTokens) return evidence;
  // Later, buildAnalysisPrompt is called again in analyzeIncident
}

// ✅ Good - Quick estimate first, only build full prompt if needed
private manageTokenBudget(event: Event, evidence: Evidence, maxTokens: number): Evidence {
  const estimatedSize = this.estimateEvidenceSize(evidence);
  if (estimatedSize + 1000 <= maxTokens) {
    // Only build full prompt if estimate suggests it might fit
    const prompt = buildAnalysisPrompt(event, evidence);
    const tokens = estimateTokens(prompt);
    if (tokens <= maxTokens) return evidence;
  }
  return truncateEvidence(evidence, maxTokens - 1000);
}
```

#### ✅ DO: Pass Pre-computed Structures to Helper Methods

```typescript
// ✅ Good - Pass pre-computed structures
private validateEvidenceReference(
  evidence: EvidenceReference,
  context: Context,
  commitsSet: Set<string>,      // Pre-computed
  incidentsSet: Set<string>,     // Pre-computed
  logsMap: Map<string, string>   // Pre-computed
): boolean {
  // Use O(1) lookups
  if (commitsSet.has(sha)) return true;
  if (incidentsSet.has(id)) return true;
  if (logsMap.has(prefix)) return true;
}

// ❌ Bad - Recompute in helper method
private validateEvidenceReference(
  evidence: EvidenceReference,
  context: Context
): boolean {
  // Recomputes on every call
  const commits = context.evidence.gitHistory?.map(c => c.sha) || [];
  return commits.some(c => c.startsWith(sha));
}
```

#### ✅ DO: Use Early Exits in Validation Loops

```typescript
// ✅ Good - Early exit on first match
private isQuotedTextValid(quoted: string, logsMap: Map<string, string>): boolean {
  const prefix = quoted.substring(0, 50);
  if (logsMap.has(prefix)) return true; // Early exit

  for (const log of logsMap.values()) {
    if (log.includes(quoted)) return true; // Early exit
  }
  return false;
}

// ❌ Bad - Continues even after finding match
private isQuotedTextValid(quoted: string, logsMap: Map<string, string>): boolean {
  let found = false;
  for (const log of logsMap.values()) {
    if (log.includes(quoted)) found = true; // Continues iterating
  }
  return found;
}
```

## Summary Checklist

Before writing code, ensure:

- [ ] Types are explicit and well-defined
- [ ] No `any` types (use `unknown` with type guards)
- [ ] Errors are handled appropriately
- [ ] Async/await is used correctly
- [ ] Resources are properly cleaned up
- [ ] Input is validated and sanitized
- [ ] Functions are small and focused
- [ ] Dependencies are injected
- [ ] Code is documented
- [ ] Tests are written
- [ ] Shared code is in `packages/shared/`
- [ ] No code duplication
- [ ] **Module size is reasonable (under 500 lines)**
- [ ] **Variable and function names are descriptive**
- [ ] **Folder structure is clear and consistent**
- [ ] **One concept per file/module**
- [ ] **Related code is grouped together**
- [ ] **Layers are clearly separated (presentation, business logic, data access)**
- [ ] **Business logic is not in route handlers**
- [ ] **Data access is separated from business logic**
- [ ] **Validation is in separate layer**
- [ ] **Error handling is separated (middleware)**
- [ ] **Configuration is separated from application logic**
- [ ] **Dependencies flow inward (presentation → business → data)**
- [ ] **No circular dependencies**
- [ ] **Services maintain clear boundaries**
- [ ] **Code is optimized** (efficient algorithms, appropriate data structures, no unnecessary computations)
- [ ] **Performance considerations** (time/space complexity, batching, caching, parallelization)

## References

- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)
- [Clean Code JavaScript](https://github.com/ryanmcdermott/clean-code-javascript)
- Project docs: `docs/CODE_ORGANIZATION.md`
- Shared exports: `packages/shared/src/index.ts`

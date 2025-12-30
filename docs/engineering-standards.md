# Engineering Standards

## Overview

This document defines the engineering standards for the Kenchi codebase. All code must adhere to these principles to maintain consistency, reliability, and maintainability.

---

## Code Quality Standards

### Principal Engineer Mindset

Write every line of code as if a principal engineer will review it:

1. **Clarity over cleverness** - Prefer readable code over "clever" solutions
2. **Explicit over implicit** - Make behavior obvious, avoid hidden side effects
3. **Defensive programming** - Anticipate and handle edge cases
4. **Self-documenting code** - Names and structure should explain intent

### Error Handling

```typescript
// ✅ CORRECT - Comprehensive error handling
try {
  const result = await externalService.call();
  return { success: true, data: result };
} catch (error) {
  logger.error("External service call failed", {
    error: getErrorMessage(error),
    service: "externalService",
    operation: "call",
  });
  return { success: false, error: "Service unavailable" };
}

// ❌ WRONG - Empty catch block
try {
  await riskyOperation();
} catch (error) {
  // Swallowing errors silently
}

// ❌ WRONG - Console logging
catch (error) {
  console.log(error); // Use logger instead
}
```

### Logging & Observability

All code must use structured logging from `@kenchi/shared`:

```typescript
import { logger } from "@kenchi/shared";

// ✅ CORRECT - Structured logging with context
logger.info("Processing webhook event", {
  eventType: event.type,
  repository: event.repository,
  correlationId: event.id,
});

logger.error("Failed to process event", {
  error: getErrorMessage(error),
  eventId: event.id,
  stack: error.stack,
});

// ❌ WRONG - Unstructured logging
logger.info(`Processing ${event.type} for ${event.repository}`);

// ❌ WRONG - Console usage
console.log("Processing event", event);
```

---

## Architecture Standards

### SOLID Principles

#### Single Responsibility Principle (SRP)

Each module/class should have one reason to change:

```typescript
// ✅ CORRECT - Separate concerns
// webhookValidator.ts - only validates
export const validateWebhook = (payload: unknown): ValidationResult => {...};

// webhookProcessor.ts - only processes
export const processWebhook = (event: WebhookEvent): ProcessResult => {...};

// ❌ WRONG - Mixed responsibilities
export class WebhookHandler {
  validate() {...}
  process() {...}
  sendNotification() {...}
  updateDatabase() {...}
}
```

#### Open/Closed Principle (OCP)

Extend behavior without modifying existing code:

```typescript
// ✅ CORRECT - Handler pattern for extensibility
const EVENT_HANDLERS: Record<EventType, EventHandler> = {
  check_run: handleCheckRun,
  pull_request: handlePullRequest,
  push: handlePush,
};

// Add new handler without modifying existing code
EVENT_HANDLERS.workflow_run = handleWorkflowRun;
```

#### Dependency Inversion Principle (DIP)

Depend on abstractions, not concretions:

```typescript
// ✅ CORRECT - Inject dependencies
export const createAnalysisService = (
  llmClient: LLMClient,
  cache: CacheClient,
  logger: Logger
): AnalysisService => ({
  analyze: async (event) => {...},
});

// ❌ WRONG - Hard-coded dependencies
export const analyzeEvent = async (event: Event) => {
  const client = new OpenAIClient(); // Hard-coded
  const cache = new RedisCache();    // Hard-coded
};
```

### Composition Over Inheritance

Build complex behavior from simple, composable pieces:

```typescript
// ✅ CORRECT - Composition
const createEnhancedService = (
  baseService: BaseService,
  cache: CacheService,
  metrics: MetricsService
) => ({
  execute: async (input) => {
    const cached = await cache.get(input);
    if (cached) return cached;

    const result = await baseService.execute(input);
    await cache.set(input, result);
    metrics.recordExecution();
    return result;
  },
});

// ❌ WRONG - Deep inheritance
class CachedMetricsEnhancedService extends MetricsService extends CachedService extends BaseService {...}
```

---

## Functional Programming Patterns

### Pure Functions

Prefer functions without side effects:

```typescript
// ✅ CORRECT - Pure function
const calculateConfidence = (factors: FactorBreakdown): number =>
  Object.values(factors).reduce((sum, value) => sum + value, 0) / Object.keys(factors).length;

// ❌ WRONG - Side effects
let totalConfidence = 0;
const calculateConfidence = (factors: FactorBreakdown): number => {
  totalConfidence = 0; // Mutating external state
  Object.values(factors).forEach((v) => (totalConfidence += v));
  return totalConfidence / Object.keys(factors).length;
};
```

### Immutability

Use `readonly` and avoid mutations:

```typescript
// ✅ CORRECT - Immutable
interface AnalysisResult {
  readonly id: string;
  readonly failures: readonly AnalyzedFailure[];
  readonly timestamp: Date;
}

const addFailure = (result: AnalysisResult, failure: AnalyzedFailure): AnalysisResult => ({
  ...result,
  failures: [...result.failures, failure],
});

// ❌ WRONG - Mutable
interface AnalysisResult {
  id: string;
  failures: AnalyzedFailure[]; // Mutable array
}

result.failures.push(failure); // Mutation
```

### Functional Array Methods

Always use functional methods instead of loops:

```typescript
// ✅ CORRECT - Functional
const activeUsers = users.filter((user) => user.isActive);
const userNames = users.map((user) => user.name);
const totalAge = users.reduce((sum, user) => sum + user.age, 0);
const hasAdmin = users.some((user) => user.role === "admin");

// ❌ WRONG - Imperative loops
const activeUsers = [];
for (const user of users) {
  if (user.isActive) {
    activeUsers.push(user);
  }
}
```

---

## Performance Standards

### Data Structure Selection

Use appropriate data structures for O(1) operations:

```typescript
// ✅ CORRECT - Set for membership testing
const VALID_TYPES = new Set(["check_run", "pull_request", "push"]);
if (VALID_TYPES.has(eventType)) {...}

// ✅ CORRECT - Map for key-value lookups
const userCache = new Map<string, User>();
const user = userCache.get(userId);

// ❌ WRONG - Array for lookups (O(n))
const VALID_TYPES = ["check_run", "pull_request", "push"];
if (VALID_TYPES.includes(eventType)) {...}
```

### Parallel Execution

Use `Promise.all` for independent async operations:

```typescript
// ✅ CORRECT - Parallel execution
const [user, permissions, settings] = await Promise.all([
  fetchUser(userId),
  fetchPermissions(userId),
  fetchSettings(userId),
]);

// ❌ WRONG - Sequential (3x slower)
const user = await fetchUser(userId);
const permissions = await fetchPermissions(userId);
const settings = await fetchSettings(userId);
```

### Early Returns

Exit functions as soon as possible:

```typescript
// ✅ CORRECT - Early returns
const processEvent = (event: Event): Result => {
  if (!event) return { success: false, error: "No event" };
  if (!isValidType(event.type)) return { success: false, error: "Invalid type" };
  if (!hasPermission(event)) return { success: false, error: "No permission" };

  // Main logic only reached if all guards pass
  return { success: true, data: process(event) };
};

// ❌ WRONG - Nested conditionals
const processEvent = (event: Event): Result => {
  if (event) {
    if (isValidType(event.type)) {
      if (hasPermission(event)) {
        return { success: true, data: process(event) };
      } else {
        return { success: false, error: "No permission" };
      }
    } else {
      return { success: false, error: "Invalid type" };
    }
  } else {
    return { success: false, error: "No event" };
  }
};
```

---

## Testing Standards

### Test Structure (AAA Pattern)

```typescript
describe("AnalysisService", () => {
  describe("analyze", () => {
    it("should return high confidence for clear failures", async () => {
      // Arrange
      const event = createMockEvent({ type: "check_run" });
      const service = createAnalysisService(mockLLM, mockCache);

      // Act
      const result = await service.analyze(event);

      // Assert
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.failures).toHaveLength(1);
    });
  });
});
```

### Test Naming

Use descriptive names that explain the scenario:

```typescript
// ✅ CORRECT - Descriptive names
it("should reject events with invalid signatures", () => {...});
it("should retry failed API calls up to 3 times", () => {...});
it("should aggregate failures within 30-second window", () => {...});

// ❌ WRONG - Vague names
it("works correctly", () => {...});
it("handles error", () => {...});
it("test1", () => {...});
```

### Coverage Requirements

- **Critical paths**: 90%+ coverage (business logic, error handling)
- **Utilities**: 80%+ coverage
- **Integration points**: Comprehensive happy path + error cases

---

## Security Standards

### Input Validation

Validate all external inputs:

```typescript
// ✅ CORRECT - Validate and sanitize
const processUserInput = (input: unknown): Result => {
  if (!isValidInput(input)) {
    return { success: false, error: "Invalid input" };
  }

  const sanitized = sanitizeInput(input);
  return { success: true, data: process(sanitized) };
};
```

### Secret Management

Never hardcode secrets:

```typescript
// ✅ CORRECT - Environment variables
const apiKey = config.get("OPENAI_API_KEY");

// ❌ WRONG - Hardcoded
const apiKey = "sk-abc123...";
```

---

## Documentation Standards

### JSDoc for Public APIs

```typescript
/**
 * Analyzes a CI failure event and returns recommendations.
 *
 * @param event - The CI failure event to analyze
 * @param options - Optional configuration for analysis
 * @returns Analysis result with confidence score and recommendations
 * @throws {ValidationError} If event format is invalid
 *
 * @example
 * const result = await analyzeFailure(event, { maxRetries: 3 });
 * if (result.confidence > 0.8) {
 *   await executeRecommendations(result.actions);
 * }
 */
export const analyzeFailure = async (
  event: CIFailureEvent,
  options?: AnalysisOptions
): Promise<AnalysisResult> => {...};
```

### Comment Guidelines

- **DO** explain "why", not "what"
- **DO** document complex algorithms or business rules
- **DON'T** state the obvious
- **DON'T** leave commented-out code

```typescript
// ✅ CORRECT - Explains why
// Use 30-second window to aggregate rapid successive failures
// from the same commit, reducing notification noise
const AGGREGATION_WINDOW_MS = 30_000;

// ❌ WRONG - States the obvious
// Set the timeout to 30000
const AGGREGATION_WINDOW_MS = 30_000;
```

---

## Code Review Checklist

Before submitting code for review, verify:

- [ ] No `any` types - use `unknown` with type guards
- [ ] No `for`/`while` loops - use functional methods
- [ ] All callbacks have descriptive parameter names
- [ ] Error handling is comprehensive (no empty catches)
- [ ] Logging uses structured logger, not console
- [ ] TODOs reference ticket numbers
- [ ] Public APIs have JSDoc comments
- [ ] Tests cover happy path and error cases
- [ ] No hardcoded secrets or magic numbers
- [ ] Functions are small and focused (<50 lines)
- [ ] Modules are under 500 lines

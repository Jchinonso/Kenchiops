# API Service Test Suite

Comprehensive unit tests for the API service covering all routes and services.

## Test Files

1. **analysisService.test.ts** - Tests for the analysis service including:
   - Context creation from requests
   - Response formatting
   - OpenAI integration
   - Error handling
   - Edge cases (unicode, long strings, etc.)

2. **analysisRoutes.test.ts** - Tests for `/api/analyze` endpoint including:
   - Valid request handling
   - Request validation
   - Response structure
   - Error cases
   - Concurrent requests
   - Various payload types

3. **eventRoutes.test.ts** - Tests for `/events` endpoint including:
   - Event ingestion
   - Multiple event types (CICD_FAILURE, MANUAL_TRIGGER)
   - Multiple sources (github, slack, api)
   - Complex payloads
   - Validation

4. **healthRoutes.test.ts** - Tests for `/health` endpoint including:
   - Response structure
   - Uptime tracking
   - Environment information
   - Concurrent health checks
   - HTTP method validation

5. **webhookRoutes.test.ts** - Tests for `/webhook/:source` endpoint including:
   - Multiple sources
   - Various payload types
   - Concurrent webhooks
   - Error handling
   - Edge cases

## Prerequisites

The test suite requires the following dependencies to be installed:

```bash
npm install --save-dev supertest @types/supertest
```

Add to root `package.json`:

```json
{
  "devDependencies": {
    "supertest": "^6.3.3",
    "@types/supertest": "^6.0.2"
  }
}
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run only API service tests
npm test -- services/api
```

## Test Coverage

The test suite provides comprehensive coverage of:

- **Happy paths**: All normal operations work correctly
- **Error cases**: Proper error handling and validation
- **Edge cases**: Unicode, special characters, empty values, large payloads
- **Concurrent operations**: Multiple simultaneous requests
- **Validation**: Input validation and sanitization
- **Mocking**: All external dependencies are properly mocked

## Mocking Strategy

All external dependencies are mocked to ensure:

- Tests are isolated and fast
- No external API calls during testing
- Predictable test results
- No need for test credentials

Mocked dependencies include:

- `@kenchi/shared` - Logger, validators, error handlers
- `OpenAIClient` - LLM analysis
- Service modules - Business logic isolation

## Test Patterns

Tests follow consistent patterns:

1. **AAA Pattern**: Arrange, Act, Assert
2. **Descriptive names**: `should [expected behavior] when [condition]`
3. **Focused tests**: One assertion per test where possible
4. **Type safety**: Full TypeScript support with proper types

## Notes

- All tests use Jest with `@jest/globals` imports
- Express routes are tested using `supertest` library
- Mocks are cleared in `beforeEach` hooks
- Tests are independent and can run in any order

---
name: Chat/Copilot Feature Test Coverage
description: Test coverage for the Kenchi Copilot Drawer chat feature (backend) - helpers, service, adapters
type: project
---

## Chat Feature Test Coverage (2026-03-19)

- 90 tests across 4 co-located test files, ~3s total runtime

### Files

- `packages/shared/src/chat/helpers.test.ts` - 34 tests (estimateTokens, buildSystemPrompt, extractRAGSources, buildLLMMessages, trimMessagesToFit, deriveTitle)
- `packages/shared/src/chat/chatService.test.ts` - 30 tests (streamCompletion flow, fail-safe context/RAG, delegation methods, trimming)
- `services/api/src/adapters/chatContextAdapter.test.ts` - 16 tests (getAnalysisContext, getIncidentContext, searchRAG with fail-safe + logging)
- `services/api/src/adapters/chatLLMAdapter.test.ts` - 10 tests (streaming deltas, ExternalServiceError, retryable classification, logging)

### Chat Service Mock Pattern

- Mock `../core/logger.js`, `../core/config.js`, `../llm/providers/llmProvider/clientFactory.js` (for `isOpenRouterProvider`)
- Create mock ports as objects with `jest.fn()` for each method: `createMockRepository()`, `createMockLLMPort()`, `createMockContextPort()`
- Use `async function* toAsyncIterable(items)` helper to create mock LLM streams
- Use `collectChunks(gen)` helper to gather all ChatStreamChunk from async generator
- Generator mock for LLM errors: `mockLLM.createStreamingCompletion.mockImplementation(function* () { throw ... })`

### Chat Context Adapter Mock Pattern

- Mock `@kenchi/shared` with `jest.requireActual` spread + override `getAnalysisById`, `getAlertById`, `searchKnowledgeDocs`, `createLogger`
- Wrap mock fns: `(...args: unknown[]) => mockFn(...args)` inside `jest.mock()` factory

### Key Gotchas

- `toEndWith` is NOT available in Jest -- use `result.endsWith("...").toBe(true)` instead
- chatLLMAdapter timeout uses `setTimeout` in `Promise.race` -- causes "open handles" warning (harmless, CI uses `forceExit`)
- chatService `streamCompletion` re-runs RAG with enriched query when page context found -- test must assert `searchRAG` called twice

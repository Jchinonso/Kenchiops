# Documentation Generator Memory

## JSDoc Audit (2026-02-09)

### Coverage Summary

Audited all ~200+ TypeScript source files in `packages/shared/src/`. The codebase has excellent JSDoc coverage overall. Only 6 files needed additions.

### Files Modified

- `rag/ingestionHelpers.ts` - Added JSDoc to `mapDiffChunksToInputs`, `mapKnowledgeChunksToInputs`
- `llm/providers/llmProvider/client.ts` - Added class-level JSDoc to `LLMClient`
- `rateLimit/apiKey.ts` - Added JSDoc to `ApiKeyValidator` class, `validate` method, `createApiKeyValidator`, `defaultApiKeyValidator`, `extractApiKey`
- `rateLimit/botDetection.ts` - Added JSDoc to `BotDetector` class, `createBotDetector`, `defaultBotDetector`
- `rateLimit/burstDetection.ts` - Added JSDoc to `BurstDetector` class, `reset`, `resetAll`, `getStats`, `createBurstDetector`, `defaultBurstDetector`
- `rateLimit/requestSignature.ts` - Added JSDoc to `SignatureVerifier` class, `verify`, `sign`, `getAlgorithm`, `getExpectedSignatureLength`, `getPathSource`, `createSignatureVerifier`, `createSimpleSignatureVerifier`, `captureRawBody`

### False Positive: core/errors.ts

`invariant` and `assertUnreachable` in `core/errors.ts` appeared to lack JSDoc when scanning with regex because there is an `// eslint-disable-next-line` comment between the JSDoc block and the function declaration. They DO have proper JSDoc.

### Well-Documented Modules (no changes needed)

- `core/` (config, errors, logger, utils, types, concurrency)
- `http/` (circuitBreaker, middleware, resilientClient, validation)
- `health/`, `shutdown/`, `security/`
- `queue/` (messageQueue, redisClient, slackNotificationProcessor)
- `database/` (client, analysis, diffChunk, tenantService)
- `llm/` (jsonExtraction, responseParser, responseParserValidation, structuredDataParsers, tokenManager, validation)
- `integrations/` (githubAppClient, prompts, tenantPromptConfig, promptEvidenceFormatters, promptArtifactAnalysis, promptArtifactHelpers, promptArtifactValidation)
- `formatting/` (extraction, aggregation, analysis)
- `rag/` (most files well-documented)
- `safety/` (scoring, validation)
- `finetuning/`

### Patterns Observed

- Module-level JSDoc with `@module` tags is consistently used across the codebase
- Private/internal functions generally have brief one-line JSDoc comments
- Factory functions (`createXxx`) and their default singleton instances often lacked JSDoc
- Class-level JSDoc was sometimes missing even when methods were documented
- Existing JSDoc style: concise descriptions, `@param`/`@returns`/`@throws` tags, occasional `@example`
- Section markers like `// ==================== Section Name ====================` used throughout

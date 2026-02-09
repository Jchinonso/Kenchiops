# Principal Engineer Memory

## Project Structure

- Monorepo: `packages/shared`, `services/api`, `services/github-app`, `services/slack-bot`
- Root `jest.config.js` — no per-service jest configs. Run tests via `npx jest <path>`
- TypeScript project references: `services/api/tsconfig.json` references `packages/shared`
- Build: `npx tsc --build --force` from repo root

## Type Extraction Pattern

When moving inline types to `types.ts` files:

1. Create `types.ts` in the same directory as the source file
2. Add `import type { ... } from "./types.js"` in the source file
3. For **exported** types that consumers import from the source file, add `export type { ... } from "./types.js"` re-export in the source file to maintain backward compatibility
4. For **internal** types (not exported), just import — no re-export needed
5. Always verify consumer imports still resolve: check tests, index.ts, and cross-module imports

## Key Files

- `services/api/src/types/apiTypes.ts` — central API service types
- `services/api/src/routes/types.ts` — route handler types (JobRow, AnalyzeJobResponse, JobStatusResponse)
- `services/api/src/workers/types.ts` — worker types (JobStatus, AnalysisJob, WorkerState, AnalysisWorkerControl)
- `services/api/src/adapters/types.ts` — adapter types (ExtractionOptions, ExtractorFunction)

## Gotchas

- Jest open handles warning on analysisWorker tests is pre-existing (async worker loop)
- `WorkerState` interface has mutable properties (exception: worker polling loop requires mutation)
- `llmExtraction.ts` uses singleton pattern with `let clientInstance` (exception: vendor SDK caching)

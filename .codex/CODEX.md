# Codex AI Configuration for Kenchi

## Project Snapshot

TypeScript monorepo for an AI-driven DevOps assistant. Three services (API, Slack bot, GitHub app) share one safety-critical package. LLMs only analyze — deterministic gates and humans own execution. See `docs/ARCHITECTURE.md`, `docs/SYSTEM_ARCHITECTURE.md`, and `docs/AI_TOOL_GUIDELINES.md` for context before touching code.

## Repository Layout

```
kenchi/
├── packages/shared/        # Single source of truth for all reusable code
│   └── src/
│       ├── index.ts        # Enumerates every shared export – read first
│       ├── config.ts, logger.ts, errors.ts, middleware.ts, validation.ts, safety.ts, types.ts, constants.ts
├── services/               # Service-specific entry points + integrations only
│   ├── api/
│   ├── slack-bot/
│   └── github-app/
└── docs/                   # Documentation
```

## Non‑Negotiable Guardrails

1. **Shared-first development**
   - Inspect `packages/shared/src/index.ts` before writing any code.
   - Import from `@kenchi/shared`; never re-implement utilities, types, loggers, errors, middleware, or validators inside services.
   - If functionality should exist across services, add it to `packages/shared/src/` and export it immediately.

2. **Duplication zero tolerance**
   - Run targeted searches (`rg`, `npm run check:duplication`, `jscpd`) when adding utilities.
   - Delete local helpers/constants if the shared package already provides them.
   - No `utils/`, `helpers/`, or duplicated type/interface definitions inside `services/*`.

3. **Single constants registry**
   - All regexes, thresholds, arrays, and configuration objects belong in `packages/shared/src/constants.ts` (or a single shared module).
   - Export via `@kenchi/shared` and reuse; never redeclare literals across files.

4. **Safety alignment**
   - LLM-facing modules must respect the defense-in-depth plan in `docs/ANTI_HALLUCINATION_REVIEW.md` and `docs/CONFIDENCE_SCORING.md`.
   - Code must keep LLM logic read-only, feed outputs through deterministic confidence scoring, validation, and safety gates, and gate dangerous actions behind human approval.

5. **Documentation-driven changes**
   - Any feature that touches prompts, scoring, or validation must stay consistent with `docs/PROMPT_TEMPLATES.md`, `docs/DATA_MODELS.md`, and `docs/IMPLEMENTATION_BLUEPRINT.md`.
   - Update documentation when behavior changes.

## Shared Toolkit (import from `@kenchi/shared`)

- **Configuration**: `config`, `Config`
- **Logging**: `logger`, `createLogger`, `LogLevel`
- **Errors**: `AppError`, `ValidationError`, `AuthenticationError`, `NotFoundError`, `ExternalServiceError`, `LLMError`, `isAppError`
- **Middleware**: `errorHandler`, `asyncHandler`, `requestLogger`
- **Validation & Rate limiting**: `validate`, `validators`, `ValidationSchema`, `createRateLimiter`, `defaultRateLimiter`
- **AI & Safety**: `OpenAIClient`, `VectorStore`, `InMemoryVectorStore`, `confidenceScore`, `shouldActOnResult`
- **Types & Models**: `LLMAnalysisResult`, `WebhookEvent`, `CIFailureEvent`, `SlackMessageEvent`, `GitHubPREvent`, shared DTOs defined in `types.ts`
- **Constants**: import once from the shared constants module; do not inline strings or numeric thresholds.

If you need something absent from this list, add it to `packages/shared/src/` with tests, export it through `index.ts`, and then consume it.

## Code Placement Rules

| Scenario                                                        | Location                  | Notes                                                                                     |
| --------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------- |
| Multi-service utility, type, constant, validation, safety logic | `packages/shared/src/`    | Update `index.ts` immediately.                                                            |
| API/Slack/GitHub routing, handlers, integration glue            | `services/<service>/src/` | Keep files under ~300 lines; delegate shared work.                                        |
| Prompt/validation/safety heuristics used by multiple components | Shared package            | Build deterministic helpers for hallucination detection, evidence alignment, and scoring. |

## TypeScript & Design Expectations

- Use explicit parameter/return types and `import type { ... }` where possible.
- Prefer arrow functions; reserve declarations for overloads/type guards.
- Replace imperative loops with `map/filter/reduce`, and replace long conditional chains with lookup tables or handler registries.
- Utilize `Set`/`Map` for membership checks and handlers to keep code O(1).
- Keep modules cohesive (utilities 50-150 LOC, handlers ≤300 LOC, never exceed 500 LOC — split files when approaching the ceiling).
- Keep business logic in service modules, validation in shared helpers, and IO boundaries clean (routes → services → repositories).
- No `any`; use `unknown` + type guards when shape is uncertain.

## Safety & Validation Hooks

- LLM output consumers must:
  1. Validate evidence references (commits, incidents, logs) against provided context.
  2. Run deterministic confidence scoring (base score + uncertainty + evidence alignment + completeness + knowledge base adjustment).
  3. Block or escalate actions based on `docs/CONFIDENCE_SCORING.md` thresholds (0.0‑0.29 block, 0.30‑0.49 approval, etc.).
  4. Reject dangerous actions containing destructive keywords before they reach execution layers.
  5. Capture `uncertainties`, `evidenceUsed`, and metadata defined in `docs/DATA_MODELS.md`.

- Architecturally, ensure the LLM stays isolated to analysis steps (∼7% of total functions). Deterministic code executes actions; humans review low-confidence paths.

## Performance & Reliability Habits

- Parallelize independent async operations with `Promise.all`.
- Pre-compute expensive regex/patterns once (static properties or module-level constants).
- Use `AbortController` for cancelable tasks.
- Sanitize and validate all external input; throw shared errors and let middleware centralize responses.
- Keep logging structured via shared logger; never instantiate ad-hoc loggers.

## Testing + Verification

- Follow Arrange/Act/Assert; name tests descriptively (`should detect hallucinated commit sha`).
- Add unit coverage for shared utilities and hallucination detection helpers.
- For new safety logic, craft integration tests simulating hallucination scenarios and ensure action gating respects confidence thresholds.
- Run relevant npm scripts (`npm test`, `npm run check:duplication`) before handing work back.

## Quick Checklist (run mentally every task)

- [ ] Read or re-read the relevant doc in `docs/` that governs the area you’re editing.
- [ ] Look in `packages/shared/src/index.ts` for existing exports before coding.
- [ ] Keep constants/types/utilities centralized.
- [ ] Enforce defense-in-depth (validation → scoring → safety gating).
- [ ] Favor functional/lookup patterns over loops and `if` chains.
- [ ] Write or update tests + docs.
- [ ] Ensure new shared code is exported and consumed via `@kenchi/shared`.

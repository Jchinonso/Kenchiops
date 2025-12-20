# AI-Powered DevOps Co-Pilot: Implementation Blueprint

## Executive Summary

This blueprint maps the vision outlined in the AI-Powered DevOps Co-Pilot concept document to the current Kenchi implementation, identifying what has been accomplished, what remains to be built, and the roadmap for achieving full capability.

**Key Design Principles**:
- **Data Minimization**: Only send what's necessary to the LLM
- **Security First**: Never send secrets, tokens, or sensitive data to AI
- **Two-Stage Pipeline**: Deterministic filtering before LLM reasoning
- **Dual Confidence Scoring**: Separate diagnosis confidence from action confidence
- **False Positive Prevention**: Fingerprinting, flakiness detection, self-consistency

---

## Table of Contents

1. [Vision vs. Implementation Status](#vision-vs-implementation-status)
2. [What Has Been Accomplished](#what-has-been-accomplished)
3. [Architecture Gap Analysis](#architecture-gap-analysis)
4. [Security & Data Minimization Design](#security--data-minimization-design)
5. [RAG Pipeline: Chunking & Embedding Strategy](#rag-pipeline-chunking--embedding-strategy)
6. [Enhanced Confidence Scoring Model](#enhanced-confidence-scoring-model)
7. [False Positive Prevention](#false-positive-prevention)
8. [Code Review & Fix Suggestions](#code-review--fix-suggestions)
9. [Feature Roadmap](#feature-roadmap)
10. [Technical Implementation Plan](#technical-implementation-plan)
11. [MVP Path to Production](#mvp-path-to-production)
12. [Investment in Infrastructure](#investment-in-infrastructure)

---

## Vision vs. Implementation Status

### The Six Key Features from Concept Document

| Feature | Concept Goal | Current Status | Completion |
|---------|--------------|----------------|------------|
| **1. Smart CI/CD Failure Assistant** | Analyze CI failures, explain in plain English, suggest fixes | **IMPLEMENTED** - Core functionality complete | 85% |
| **2. Infrastructure-as-Code Copilot** | Explain IaC, suggest improvements, generate configs | **NOT STARTED** | 0% |
| **3. Deployment Risk Analyzer** | Predict deployment risk, gate deployments | **NOT STARTED** | 0% |
| **4. Incident Triage & Auto-Remediation** | 24/7 SRE assistant with auto-remediation | **PARTIAL** - Analysis only, no auto-remediation | 25% |
| **5. Configuration Drift Detection** | Compare live vs. Git, detect drift | **NOT STARTED** | 0% |
| **6. Documentation & Knowledge Assistant** | Smart knowledge base Q&A | **PARTIAL** - Vector store infrastructure ready | 15% |

---

## What Has Been Accomplished

### Core Infrastructure (Fully Implemented)

#### 1. Monorepo Architecture
```
kenchi/
├── packages/shared/          # ✅ Comprehensive shared utilities
├── services/
│   ├── api/                  # ✅ Webhook ingestion & analysis API
│   ├── slack-bot/            # ✅ Slack integration
│   └── github-app/           # ✅ GitHub webhook handling
├── n8n/workflows/            # ✅ Workflow orchestration
└── docs/                     # ✅ Detailed system documentation
```

#### 2. Shared Package (`@kenchi/shared`) - Complete
- **Configuration**: Environment-based config management
- **Logging**: Structured JSON logging with service scoping
- **Error Handling**: Custom error classes (ValidationError, LLMError, etc.)
- **Middleware**: Express error handling, async handlers, request logging
- **Validation**: Schema-based request validation
- **Rate Limiting**: Configurable rate limiter

#### 3. OpenAI Integration - Production Ready
- **OpenAI Client** (`packages/shared/src/openaiClient/`)
  - Token budget management
  - Retry logic with exponential backoff
  - Response parsing and validation
  - Anti-hallucination validation
- **Prompt Engineering** (`packages/shared/src/prompts.ts`)
  - Full system prompts with safety constraints
  - Evidence formatting functions
  - Token estimation and truncation

#### 4. Safety & Confidence Scoring - Complete
- **Confidence Scoring** (`packages/shared/src/safety/`)
  - Base score from LLM confidence
  - Uncertainty detection (hedging language)
  - Evidence alignment checking
  - Completeness assessment
  - Knowledge base validation
  - Consistency checking
- **Action Gating**
  - Safety level classification
  - Approval requirements based on confidence
  - Dangerous action blocking

#### 5. Type System - Comprehensive
- **Event Types**: Event, EventType, EventPayload, EventMetadata
- **Evidence Types**: Evidence, LogEntry, Metrics, GitCommit, SystemState
- **Analysis Types**: LLMAnalysisResult, ActionProposal, ActionType
- **Confidence Types**: ConfidenceScoreResult, ValidationResult

### Services Implementation

#### API Service (services/api/) - Functional
- `/webhook/:source` - Generic webhook receiver
- `/events` - Event ingestion
- `/api/analyze` - CI failure analysis endpoint
- `/health` - Health check
- **Analysis Service**: Complete CI failure analysis pipeline

#### Slack Bot Service (services/slack-bot/) - Functional
- `/kenchi` slash command handling
- Message event handling
- App mention handling
- `POST /slack/message` for n8n integration
- Rich message formatting

#### GitHub App Service (services/github-app/) - Advanced
- **Check Run Handler**: Enriched CI failure context gathering
  - Workflow logs extraction
  - PR diff retrieval
  - Commit info gathering
  - Test failure parsing
  - Dependency change detection
  - Build config change detection
- PR webhook handling
- n8n forwarding pipeline

### Documentation - Excellent
- `ARCHITECTURE.md` - Complete system architecture
- `SYSTEM_ARCHITECTURE.md` - Detailed component design
- `DATA_MODELS.md` - JSON schemas and TypeScript interfaces
- `CONFIDENCE_SCORING.md` - Scoring algorithm documentation
- `PROMPT_TEMPLATES.md` - LLM prompt engineering guide
- `ANTI_HALLUCINATION_REVIEW.md` - Safety measures documentation

---

## Architecture Gap Analysis

### What's Missing vs. Concept Document

| Gap | Severity | Current State | Required |
|-----|----------|---------------|----------|
| **Secret Redaction** | **CRITICAL** | Not implemented | Pattern-based redaction before LLM |
| **Persistence Layer** | **CRITICAL** | In-memory only | PostgreSQL + pgvector |
| **Knowledge Base / RAG** | Major | Interface only | Full implementation |
| **Action Execution** | Major | Analysis only | GitHub API integration |
| **Human-in-the-Loop** | Major | No interactivity | Slack Block Kit buttons |
| **Flakiness Detection** | Medium | Not implemented | Fingerprinting + tracking |
| **Customer Toggles** | Medium | Not implemented | Per-installation settings |
| **Monitoring Integration** | Low (Phase 2) | Not started | Datadog/Prometheus webhooks |

---

## Security & Data Minimization Design

### Two-Stage Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        STAGE 1: DETERMINISTIC FILTERING                  │
│                           (No LLM - Pure Code Logic)                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  GitHub Webhook                                                          │
│       │                                                                  │
│       ▼                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐              │
│  │   Parse &    │───►│   Decide if  │───►│    Redact    │              │
│  │   Validate   │    │  LLM needed  │    │   Secrets    │              │
│  └──────────────┘    └──────────────┘    └──────────────┘              │
│                             │                    │                       │
│                             │ No LLM needed      │                       │
│                             ▼                    ▼                       │
│                      [Quick Response]    ┌──────────────┐              │
│                                          │   Extract    │              │
│                                          │  Relevant    │              │
│                                          │   Slices     │              │
│                                          └──────┬───────┘              │
│                                                 │                       │
└─────────────────────────────────────────────────┼───────────────────────┘
                                                  │
                                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        STAGE 2: LLM REASONING                            │
│                         (Bounded, Safe Input)                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Only Receive:                                                           │
│  ✓ Specific failed step logs (trimmed, redacted)                        │
│  ✓ Small diff hunks around changed lines                                │
│  ✓ Minimal PR metadata (no sensitive fields)                            │
│  ✓ Anonymized identifiers where possible                                │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Hard Rules: What NEVER Goes to LLM

```typescript
// packages/shared/src/security/redaction.ts

/**
 * Patterns that MUST be redacted before any LLM call.
 * Order matters: more specific patterns first.
 */
export const SECRET_PATTERNS: readonly RegExp[] = [
  // AWS
  /\bAKIA[0-9A-Z]{16}\b/g,                              // AWS Access Key ID
  /\b[A-Za-z0-9/+=]{40}\b(?=.*aws)/gi,                  // AWS Secret Key (contextual)

  // GitHub
  /\bghp_[a-zA-Z0-9]{36}\b/g,                           // GitHub PAT
  /\bghr_[a-zA-Z0-9]{36}\b/g,                           // GitHub refresh token
  /\bghu_[a-zA-Z0-9]{36}\b/g,                           // GitHub user token
  /\bghs_[a-zA-Z0-9]{36}\b/g,                           // GitHub server token
  /\bgho_[a-zA-Z0-9]{36}\b/g,                           // GitHub OAuth token

  // OpenAI
  /\bsk-[a-zA-Z0-9]{32,}\b/g,                           // OpenAI API key

  // Slack
  /\bxox[baprs]-[\w-]+/g,                               // Slack tokens

  // Generic patterns
  /-----BEGIN\s+(?:RSA|EC|DSA|OPENSSH|PGP|ENCRYPTED)?\s*PRIVATE\s+KEY-----[\s\S]*?-----END/g,
  /\beyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,  // JWT tokens

  // Environment variable patterns
  /(?:SECRET|TOKEN|KEY|PASSWORD|CREDENTIAL|AUTH|API_KEY)[_-]?[\w]*\s*[:=]\s*['"]?[^\s'"]{8,}['"]?/gi,

  // Database connection strings
  /(?:mongodb|postgres|mysql|redis):\/\/[^\s]+/gi,

  // Generic high-entropy strings (potential secrets)
  /(?:secret|token|key|password|pwd|pass|auth)['"]?\s*[:=]\s*['"]?[a-zA-Z0-9/+=_-]{20,}['"]?/gi,
] as const;

/**
 * Fields that should NEVER be included in LLM context
 */
export const FORBIDDEN_FIELDS: readonly string[] = [
  'authorization',
  'x-api-key',
  'x-auth-token',
  'cookie',
  'set-cookie',
  'x-csrf-token',
  'private_key',
  'secret_key',
  'access_token',
  'refresh_token',
  'id_token',
  'session_id',
  'password',
  'passwd',
  'credential',
] as const;

/**
 * Redact all secrets from text before LLM processing
 */
export const redactSecrets = (text: string): string => {
  let redacted = text;
  for (const pattern of SECRET_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    redacted = redacted.replace(pattern, '[REDACTED]');
  }
  return redacted;
};

/**
 * Redact secrets from an object recursively
 */
export const redactObject = <T extends Record<string, unknown>>(obj: T): T => {
  const result = { ...obj };

  for (const [key, value] of Object.entries(result)) {
    const lowerKey = key.toLowerCase();

    // Check if key is forbidden
    if (FORBIDDEN_FIELDS.some(f => lowerKey.includes(f))) {
      (result as Record<string, unknown>)[key] = '[REDACTED]';
      continue;
    }

    // Recursively handle nested objects
    if (typeof value === 'object' && value !== null) {
      (result as Record<string, unknown>)[key] = redactObject(value as Record<string, unknown>);
    } else if (typeof value === 'string') {
      (result as Record<string, unknown>)[key] = redactSecrets(value);
    }
  }

  return result;
};
```

### Customer-Controlled Privacy Toggles

```typescript
// packages/shared/src/config/privacySettings.ts

export interface PrivacySettings {
  /** Allow posting AI analysis as PR comments */
  readonly allowPRComment: boolean;

  /** Allow uploading logs to AI for analysis */
  readonly allowLogUpload: boolean;

  /** Allow sending code snippets to AI */
  readonly allowCodeSnippets: boolean;

  /** Allow sending diff hunks to AI */
  readonly allowDiffHunks: boolean;

  /** Allow using analysis data for model improvement feedback */
  readonly allowFeedbackTraining: boolean;

  /** Hash identifiers (usernames, branch names) for privacy */
  readonly hashIdentifiers: boolean;

  /** Maximum log retention period in hours */
  readonly logRetentionHours: number;

  /** Allowed file extensions for code analysis */
  readonly allowedFileExtensions: readonly string[];
}

export const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  allowPRComment: true,
  allowLogUpload: true,
  allowCodeSnippets: true,
  allowDiffHunks: true,
  allowFeedbackTraining: false,  // Opt-in by default
  hashIdentifiers: false,
  logRetentionHours: 24,
  allowedFileExtensions: ['.ts', '.js', '.tsx', '.jsx', '.py', '.go', '.yml', '.yaml', '.json'],
} as const;
```

### Access Control Model

```typescript
// packages/shared/src/security/accessControl.ts

/**
 * Minimal data storage policy
 */
export interface StoragePolicy {
  /** Store only: installation_id, repo_id, webhook_delivery_id */
  readonly minimalIdentifiers: boolean;

  /** Encrypt all stored data at rest */
  readonly encryptAtRest: boolean;

  /** Enable strict audit logging */
  readonly auditLogging: boolean;

  /** Use least-privilege service roles */
  readonly leastPrivilege: boolean;
}

/**
 * GitHub App installation token management
 * - Tokens are short-lived (1 hour max)
 * - Scoped to specific repository
 * - Never stored, only cached briefly
 */
export interface TokenPolicy {
  /** Maximum token cache duration in seconds */
  readonly maxCacheDuration: number;

  /** Refresh tokens before expiry (seconds) */
  readonly refreshBuffer: number;
}

export const DEFAULT_TOKEN_POLICY: TokenPolicy = {
  maxCacheDuration: 3000,  // 50 minutes (tokens last 60)
  refreshBuffer: 600,      // Refresh 10 minutes before expiry
} as const;
```

---

## RAG Pipeline: Chunking & Embedding Strategy

### What to Embed (Selective, Not Everything)

```typescript
// packages/shared/src/rag/chunkingConfig.ts

/**
 * Supported file types for embedding
 * Start with a focused set, expand based on need
 */
export const EMBEDDABLE_FILE_TYPES: readonly string[] = [
  // TypeScript/JavaScript
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',

  // Configuration
  '.yml', '.yaml', '.json', '.toml',

  // Infrastructure
  '.tf', '.tfvars',           // Terraform
  '.helm',                     // Helm charts
  '.dockerfile', 'Dockerfile',

  // Python
  '.py',

  // Go
  '.go',

  // Documentation
  '.md',
] as const;

/**
 * Files to always skip (security/noise)
 */
export const SKIP_PATTERNS: readonly RegExp[] = [
  /node_modules\//,
  /\.git\//,
  /dist\//,
  /build\//,
  /\.env/,
  /secrets?\./i,
  /credentials?\./i,
  /\.pem$/,
  /\.key$/,
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
] as const;
```

### Diff Chunking Strategy

```typescript
// packages/shared/src/rag/diffChunker.ts

export interface DiffChunk {
  /** Unique identifier for this chunk */
  readonly id: string;

  /** File path relative to repo root */
  readonly path: string;

  /** Hunk header (function/class context if parseable) */
  readonly hunkHeader: string;

  /** The actual diff content with context */
  readonly content: string;

  /** Token count for this chunk */
  readonly tokenCount: number;

  /** Metadata for retrieval filtering */
  readonly metadata: DiffChunkMetadata;
}

export interface DiffChunkMetadata {
  readonly repo: string;
  readonly prNumber?: number;
  readonly commitSha: string;
  readonly language: string;
  readonly changeType: 'add' | 'remove' | 'modify';
  readonly symbolName?: string;  // Function/class name if extractable
  readonly isTestFile: boolean;
  readonly isConfigFile: boolean;
}

/**
 * Chunking configuration
 */
export const CHUNK_CONFIG = {
  /** Maximum tokens per chunk */
  MAX_TOKENS: 800,

  /** Lines of context around each change */
  CONTEXT_LINES: 30,

  /** Minimum chunk size (avoid tiny fragments) */
  MIN_TOKENS: 50,

  /** Overlap between chunks for context continuity */
  OVERLAP_LINES: 5,
} as const;

/**
 * Chunk a unified diff into embeddable pieces
 */
export const chunkDiff = (
  diff: string,
  metadata: Omit<DiffChunkMetadata, 'changeType'>
): DiffChunk[] => {
  const chunks: DiffChunk[] = [];
  const files = parseDiffByFile(diff);

  for (const file of files) {
    // Skip files that shouldn't be embedded
    if (shouldSkipFile(file.path)) continue;

    // Skip if not an embeddable file type
    if (!isEmbeddableFileType(file.path)) continue;

    const hunks = parseHunks(file.content);

    for (const hunk of hunks) {
      // Add context lines around the hunk
      const contextualContent = addContext(hunk, CHUNK_CONFIG.CONTEXT_LINES);

      // Check token count
      const tokenCount = estimateTokens(contextualContent);

      if (tokenCount > CHUNK_CONFIG.MAX_TOKENS) {
        // Split large hunks
        const subChunks = splitLargeHunk(hunk, CHUNK_CONFIG.MAX_TOKENS);
        chunks.push(...subChunks.map((sub, i) => createChunk(file, sub, metadata, i)));
      } else if (tokenCount >= CHUNK_CONFIG.MIN_TOKENS) {
        chunks.push(createChunk(file, contextualContent, metadata, 0));
      }
    }
  }

  return chunks;
};

/**
 * Create embedding header for better retrieval
 */
export const createEmbeddingHeader = (chunk: DiffChunk): string => {
  const parts = [
    `path: ${chunk.path}`,
    chunk.metadata.symbolName ? `symbol: ${chunk.metadata.symbolName}` : null,
    `change: ${chunk.metadata.changeType}`,
    chunk.metadata.isTestFile ? 'type: test' : null,
    chunk.metadata.isConfigFile ? 'type: config' : null,
  ].filter(Boolean);

  return parts.join(' | ');
};
```

### Embedding Strategy

```typescript
// packages/shared/src/rag/embeddingService.ts

export interface EmbeddingService {
  /** Generate embedding for text */
  embed(text: string): Promise<number[]>;

  /** Generate embeddings for multiple texts (batched) */
  embedBatch(texts: string[]): Promise<number[][]>;
}

export class OpenAIEmbeddingService implements EmbeddingService {
  private readonly client: OpenAI;
  private readonly model = 'text-embedding-3-small';

  constructor(client: OpenAI) {
    this.client = client;
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: text,
    });
    return response.data[0].embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: texts,
    });
    return response.data.map(d => d.embedding);
  }
}

/**
 * Embed a diff chunk with its header for better retrieval
 */
export const embedChunk = async (
  chunk: DiffChunk,
  service: EmbeddingService
): Promise<{ chunk: DiffChunk; embedding: number[] }> => {
  const header = createEmbeddingHeader(chunk);
  const textToEmbed = `${header}\n\n${chunk.content}`;

  const embedding = await service.embed(textToEmbed);

  return { chunk, embedding };
};
```

### Hybrid Retrieval

```typescript
// packages/shared/src/rag/retrieval.ts

export interface RetrievalQuery {
  /** Natural language query or error message */
  readonly text: string;

  /** Filter by file path pattern */
  readonly pathFilter?: string;

  /** Filter by service/module labels */
  readonly serviceLabels?: readonly string[];

  /** Filter by change recency (hours) */
  readonly maxAgeHours?: number;

  /** Number of results to return */
  readonly limit: number;
}

export interface RetrievalResult {
  readonly chunk: DiffChunk;
  readonly similarity: number;
  readonly matchType: 'vector' | 'keyword' | 'hybrid';
}

/**
 * Hybrid retrieval: vector similarity + keyword filters
 */
export const retrieveRelevantChunks = async (
  query: RetrievalQuery,
  vectorStore: VectorStore,
  embeddingService: EmbeddingService
): Promise<RetrievalResult[]> => {
  // 1. Generate query embedding
  const queryEmbedding = await embeddingService.embed(query.text);

  // 2. Build metadata filters
  const filters: Record<string, unknown> = {};
  if (query.pathFilter) {
    filters.pathPattern = query.pathFilter;
  }
  if (query.serviceLabels?.length) {
    filters.serviceLabels = query.serviceLabels;
  }
  if (query.maxAgeHours) {
    filters.minTimestamp = new Date(Date.now() - query.maxAgeHours * 3600000).toISOString();
  }

  // 3. Query vector store with hybrid approach
  const results = await vectorStore.querySimilarWithFilters(
    queryEmbedding,
    filters,
    query.limit * 2  // Over-fetch for re-ranking
  );

  // 4. Re-rank with keyword boosting
  const reranked = reRankResults(results, query.text);

  return reranked.slice(0, query.limit);
};
```

---

## Enhanced Confidence Scoring Model

### Dual Confidence Architecture

The system uses **two separate confidence scores** to enable nuanced decision-making:

1. **C_diag (Diagnosis Confidence)**: How sure are we about the root cause?
2. **C_act (Action Confidence)**: How safe is it to act on this diagnosis?

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        CONFIDENCE SCORING FLOW                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  LLM Analysis                                                            │
│       │                                                                  │
│       ▼                                                                  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    C_diag (Diagnosis Confidence)                  │  │
│  │                                                                    │  │
│  │  σ(w₀ + w₁·s_log + w₂·s_hist + w₃·s_diff + w₄·s_ci - w₅·s_flake) │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│       │                                                                  │
│       ▼                                                                  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    C_act (Action Confidence)                      │  │
│  │                                                                    │  │
│  │  C_diag × (1 - r_blast) × (1 - r_priv) × (1 - r_irreversible)    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│       │                                                                  │
│       ▼                                                                  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                      Decision Policy                              │  │
│  │                                                                    │  │
│  │  C_diag < 0.70  → Ask question / Request more info               │  │
│  │  C_act  < 0.85  → Recommend with rationale (require approval)    │  │
│  │  C_act  ≥ 0.85  → Auto-act (if action is on safe list)          │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Feature Signals from GitHub

```typescript
// packages/shared/src/safety/confidenceSignals.ts

/**
 * All signals are normalized to [0, 1]
 */
export interface ConfidenceSignals {
  /** Log evidence strength (pattern match + LLM self-consistency) */
  readonly s_log: number;

  /** Historical recurrence match (same failure fingerprint) */
  readonly s_hist: number;

  /** Diff relevance (retrieved chunks overlap failing modules) */
  readonly s_diff: number;

  /** Test signal reliability (inverse of flakiness probability) */
  readonly s_test: number;

  /** Flakiness probability for this specific test */
  readonly s_flake: number;

  /** CI context quality (logs complete? steps available?) */
  readonly s_ci: number;

  /** Blast radius estimate (files touched / critical areas) */
  readonly s_scope: number;
}

/**
 * Risk factors for action confidence
 */
export interface ActionRiskFactors {
  /** Blast radius risk (auth, payments, core infra = high) */
  readonly r_blast: number;

  /** Required privilege level (write permissions, prod env) */
  readonly r_priv: number;

  /** Irreversibility risk (rollback easy vs data migration hard) */
  readonly r_irreversible: number;
}
```

### Diagnosis Confidence Calculation

```typescript
// packages/shared/src/safety/diagnosisConfidence.ts

/**
 * Weights for diagnosis confidence model
 * These should be tuned based on historical accuracy data
 */
export const DIAGNOSIS_WEIGHTS = {
  w0: -0.5,    // Bias term (starts pessimistic)
  w1: 1.2,     // Log evidence (strong positive signal)
  w2: 0.8,     // Historical match (good signal)
  w3: 0.6,     // Diff relevance (moderate signal)
  w4: 0.4,     // CI context quality
  w5: 0.9,     // Flakiness penalty (strong negative)
} as const;

/**
 * Sigmoid function for bounded output
 */
const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

/**
 * Calculate diagnosis confidence using logistic model
 */
export const calculateDiagnosisConfidence = (signals: ConfidenceSignals): number => {
  const { w0, w1, w2, w3, w4, w5 } = DIAGNOSIS_WEIGHTS;

  const logit = w0
    + w1 * signals.s_log
    + w2 * signals.s_hist
    + w3 * signals.s_diff
    + w4 * signals.s_ci
    - w5 * signals.s_flake;

  return sigmoid(logit);
};

/**
 * Extract confidence signals from analysis context
 */
export const extractConfidenceSignals = (
  analysis: LLMAnalysisResult,
  evidence: Evidence,
  historicalData: HistoricalContext
): ConfidenceSignals => {
  return {
    s_log: calculateLogEvidenceStrength(analysis, evidence),
    s_hist: calculateHistoricalMatch(analysis, historicalData),
    s_diff: calculateDiffRelevance(analysis, evidence),
    s_test: 1 - calculateFlakinessProbability(evidence, historicalData),
    s_flake: calculateFlakinessProbability(evidence, historicalData),
    s_ci: calculateCIContextQuality(evidence),
    s_scope: calculateBlastRadius(evidence),
  };
};
```

### Action Confidence Calculation

```typescript
// packages/shared/src/safety/actionConfidence.ts

/**
 * Calculate action confidence with risk penalties
 *
 * C_act = C_diag × (1 - r_blast) × (1 - r_priv) × (1 - r_irreversible)
 */
export const calculateActionConfidence = (
  diagnosisConfidence: number,
  risks: ActionRiskFactors
): number => {
  return diagnosisConfidence
    * (1 - risks.r_blast)
    * (1 - risks.r_priv)
    * (1 - risks.r_irreversible);
};

/**
 * Determine risk factors for a proposed action
 */
export const assessActionRisks = (
  action: ActionProposal,
  context: ActionContext
): ActionRiskFactors => {
  return {
    r_blast: assessBlastRadius(action, context),
    r_priv: assessPrivilegeLevel(action),
    r_irreversible: assessIrreversibility(action),
  };
};

/**
 * Assess blast radius risk
 */
const assessBlastRadius = (action: ActionProposal, context: ActionContext): number => {
  const criticalPaths = ['auth', 'payment', 'database', 'core', 'security'];

  // Check if action affects critical paths
  const affectedPaths = context.affectedFiles || [];
  const touchesCritical = affectedPaths.some(path =>
    criticalPaths.some(critical => path.toLowerCase().includes(critical))
  );

  if (touchesCritical) return 0.8;
  if (context.isProduction) return 0.6;
  if (context.affectedServices > 3) return 0.5;
  if (context.affectedServices > 1) return 0.3;

  return 0.1;
};

/**
 * Assess privilege level required
 */
const assessPrivilegeLevel = (action: ActionProposal): number => {
  const privilegeMap: Record<string, number> = {
    'post_comment': 0.0,
    'add_label': 0.1,
    'create_issue': 0.1,
    'rerun_workflow': 0.2,
    'add_environment_variable': 0.4,
    'update_configuration': 0.5,
    'rollback_deployment': 0.7,
    'scale_service': 0.6,
    'modify_infrastructure': 0.8,
  };

  return privilegeMap[action.actionType] ?? 0.5;
};

/**
 * Assess irreversibility risk
 */
const assessIrreversibility = (action: ActionProposal): number => {
  const irreversibilityMap: Record<string, number> = {
    'post_comment': 0.0,      // Can delete
    'add_label': 0.0,         // Can remove
    'create_issue': 0.1,      // Can close
    'rerun_workflow': 0.1,    // Just re-runs
    'add_environment_variable': 0.2,  // Can remove
    'rollback_deployment': 0.3,       // Can re-deploy
    'update_configuration': 0.4,      // Can revert
    'scale_service': 0.2,             // Can scale back
    'delete_resource': 0.9,           // Very hard to undo
    'data_migration': 0.95,           // Extremely hard to undo
  };

  return irreversibilityMap[action.actionType] ?? 0.5;
};
```

### Decision Policy

```typescript
// packages/shared/src/safety/decisionPolicy.ts

export type Decision =
  | { type: 'ask_question'; reason: string }
  | { type: 'recommend'; requiresApproval: true; reason: string }
  | { type: 'auto_act'; reason: string }
  | { type: 'block'; reason: string };

/**
 * Decision thresholds
 */
export const DECISION_THRESHOLDS = {
  /** Minimum diagnosis confidence to proceed */
  MIN_DIAGNOSIS: 0.70,

  /** Minimum action confidence for auto-execution */
  MIN_AUTO_ACT: 0.85,

  /** Minimum confidence to make any recommendation */
  MIN_RECOMMEND: 0.50,
} as const;

/**
 * Actions that can be auto-executed when confidence is high
 */
export const SAFE_AUTO_ACTIONS: readonly string[] = [
  'rerun_workflow',
  'add_label',
  'post_comment',
  'create_issue',
] as const;

/**
 * Determine decision based on confidence scores
 */
export const makeDecision = (
  diagnosisConfidence: number,
  actionConfidence: number,
  action: ActionProposal
): Decision => {
  // Block if diagnosis confidence is too low
  if (diagnosisConfidence < DECISION_THRESHOLDS.MIN_RECOMMEND) {
    return {
      type: 'block',
      reason: `Diagnosis confidence (${(diagnosisConfidence * 100).toFixed(0)}%) is below minimum threshold`,
    };
  }

  // Ask for more info if diagnosis is uncertain
  if (diagnosisConfidence < DECISION_THRESHOLDS.MIN_DIAGNOSIS) {
    return {
      type: 'ask_question',
      reason: `Need more information. Current diagnosis confidence: ${(diagnosisConfidence * 100).toFixed(0)}%`,
    };
  }

  // Check if action can be auto-executed
  const isSafeAction = SAFE_AUTO_ACTIONS.includes(action.actionType);
  const highActionConfidence = actionConfidence >= DECISION_THRESHOLDS.MIN_AUTO_ACT;

  if (isSafeAction && highActionConfidence) {
    return {
      type: 'auto_act',
      reason: `High confidence (${(actionConfidence * 100).toFixed(0)}%) safe action`,
    };
  }

  // Recommend with approval required
  return {
    type: 'recommend',
    requiresApproval: true,
    reason: `Action confidence: ${(actionConfidence * 100).toFixed(0)}%. Requires human approval.`,
  };
};
```

---

## False Positive Prevention

### Failure Fingerprinting

```typescript
// packages/shared/src/fingerprinting/failureFingerprint.ts

export interface TestFingerprint {
  /** Normalized test name */
  readonly testName: string;

  /** Exception/error type */
  readonly exceptionType: string;

  /** Top N stack frames (normalized) */
  readonly stackFrames: readonly string[];

  /** CI step/job name */
  readonly stepName: string;

  /** Computed hash */
  readonly hash: string;
}

/**
 * Create a canonical fingerprint for a test failure
 */
export const createFingerprint = (failure: TestFailure): TestFingerprint => {
  const testName = normalizeTestName(failure.testName);
  const exceptionType = extractExceptionType(failure.error);
  const stackFrames = extractTopStackFrames(failure.error, 3);
  const stepName = failure.stepName || 'unknown';

  const fingerprint: TestFingerprint = {
    testName,
    exceptionType,
    stackFrames,
    stepName,
    hash: '', // Will be computed
  };

  // Create deterministic hash
  const hashInput = JSON.stringify({
    testName,
    exceptionType,
    stackFrames,
    stepName,
  });

  return {
    ...fingerprint,
    hash: createHash('sha256').update(hashInput).digest('hex').slice(0, 16),
  };
};
```

### Flakiness Tracking

```typescript
// packages/shared/src/fingerprinting/flakinessTracker.ts

export interface FlakeRecord {
  /** Fingerprint hash */
  readonly fingerprint: string;

  /** Total occurrences */
  readonly occurrences: number;

  /** Times it passed after rerun */
  readonly passesAfterRerun: number;

  /** Computed flakiness probability */
  readonly flakeProbability: number;

  /** Last seen timestamp */
  readonly lastSeen: string;

  /** Repository */
  readonly repository: string;
}

/**
 * Calculate flakiness probability from historical data
 */
export const calculateFlakeProbability = (record: FlakeRecord): number => {
  if (record.occurrences < 3) {
    // Not enough data, assume not flaky
    return 0;
  }

  // Flaky if it often passes on rerun
  return record.passesAfterRerun / record.occurrences;
};

/**
 * Update flake record with new occurrence
 */
export const updateFlakeRecord = (
  existing: FlakeRecord | null,
  fingerprint: string,
  repository: string,
  passedOnRerun: boolean
): FlakeRecord => {
  if (!existing) {
    return {
      fingerprint,
      occurrences: 1,
      passesAfterRerun: passedOnRerun ? 1 : 0,
      flakeProbability: 0,
      lastSeen: new Date().toISOString(),
      repository,
    };
  }

  const updated = {
    ...existing,
    occurrences: existing.occurrences + 1,
    passesAfterRerun: existing.passesAfterRerun + (passedOnRerun ? 1 : 0),
    lastSeen: new Date().toISOString(),
  };

  return {
    ...updated,
    flakeProbability: calculateFlakeProbability(updated),
  };
};
```

### Self-Consistency Checks

```typescript
// packages/shared/src/validation/selfConsistency.ts

/**
 * Run multiple LLM passes with different prompts to check consistency
 */
export const checkSelfConsistency = async (
  event: Event,
  evidence: Evidence,
  client: OpenAIClient
): Promise<{ consistent: boolean; confidence: number; explanations: string[] }> => {
  // Run 3 passes with slightly different prompts
  const prompts = [
    buildAnalysisPrompt(event, evidence),
    buildAnalysisPromptAlternate1(event, evidence),
    buildAnalysisPromptAlternate2(event, evidence),
  ];

  const results = await Promise.all(
    prompts.map(prompt => client.analyzeWithPrompt(prompt))
  );

  // Extract identified causes
  const causes = results.map(r => r.identifiedCause?.toLowerCase() || '');

  // Check if causes are semantically similar
  const similarities = calculatePairwiseSimilarity(causes);
  const avgSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;

  return {
    consistent: avgSimilarity > 0.7,
    confidence: avgSimilarity,
    explanations: results.map(r => r.identifiedCause || 'Unknown'),
  };
};
```

### Rerun-Aware Logic

```typescript
// packages/shared/src/validation/rerunDetection.ts

export interface RerunContext {
  /** Original run ID */
  readonly originalRunId: number;

  /** Is this a rerun of a previous failure? */
  readonly isRerun: boolean;

  /** Did the rerun pass? */
  readonly rerunPassed: boolean;

  /** Fingerprint of the original failure */
  readonly originalFingerprint?: string;
}

/**
 * Handle rerun-aware logic for CI failures
 */
export const handleRerunAwareAnalysis = (
  failure: CIFailure,
  rerunContext: RerunContext,
  flakeRecords: Map<string, FlakeRecord>
): { shouldAnalyze: boolean; reason: string; confidence: number } => {
  // If this is a rerun that passed, update flake record
  if (rerunContext.isRerun && rerunContext.rerunPassed && rerunContext.originalFingerprint) {
    const record = flakeRecords.get(rerunContext.originalFingerprint);
    if (record && record.flakeProbability > 0.5) {
      return {
        shouldAnalyze: false,
        reason: `Likely flaky test (${(record.flakeProbability * 100).toFixed(0)}% flake rate). Passed on rerun.`,
        confidence: 0.3,
      };
    }
  }

  // Check if this fingerprint is known flaky
  const fingerprint = createFingerprint(failure);
  const flakeRecord = flakeRecords.get(fingerprint.hash);

  if (flakeRecord && flakeRecord.flakeProbability > 0.7) {
    return {
      shouldAnalyze: false,
      reason: `Known flaky test (${(flakeRecord.flakeProbability * 100).toFixed(0)}% flake rate). Recommend quarantine.`,
      confidence: 0.2,
    };
  }

  return {
    shouldAnalyze: true,
    reason: 'Proceeding with analysis',
    confidence: 1.0,
  };
};
```

### Minimum Evidence Threshold

```typescript
// packages/shared/src/validation/evidenceThreshold.ts

export interface EvidenceQuality {
  readonly hasLogs: boolean;
  readonly logsComplete: boolean;
  readonly hasDiff: boolean;
  readonly hasCommitInfo: boolean;
  readonly hasTestOutput: boolean;
  readonly qualityScore: number;
}

/**
 * Assess evidence quality before proceeding with analysis
 */
export const assessEvidenceQuality = (evidence: Evidence): EvidenceQuality => {
  const hasLogs = (evidence.logs?.length ?? 0) > 0;
  const logsComplete = !evidence.logs?.some(log =>
    log.message.includes('[truncated]') || log.message.includes('...')
  );
  const hasDiff = !!evidence.gitHistory?.length;
  const hasCommitInfo = evidence.gitHistory?.some(c => c.message && c.filesChanged?.length) ?? false;
  const hasTestOutput = evidence.logs?.some(log =>
    log.source === 'test' || log.message.includes('FAIL') || log.message.includes('PASS')
  ) ?? false;

  let qualityScore = 0;
  if (hasLogs) qualityScore += 0.3;
  if (logsComplete) qualityScore += 0.2;
  if (hasDiff) qualityScore += 0.2;
  if (hasCommitInfo) qualityScore += 0.15;
  if (hasTestOutput) qualityScore += 0.15;

  return {
    hasLogs,
    logsComplete,
    hasDiff,
    hasCommitInfo,
    hasTestOutput,
    qualityScore,
  };
};

/**
 * Check if evidence meets minimum threshold for analysis
 */
export const meetsEvidenceThreshold = (
  quality: EvidenceQuality,
  threshold: number = 0.5
): { meets: boolean; reason?: string } => {
  if (!quality.hasLogs) {
    return {
      meets: false,
      reason: 'Insufficient evidence: No logs available. Request rerun or manual investigation.',
    };
  }

  if (quality.qualityScore < threshold) {
    return {
      meets: false,
      reason: `Insufficient evidence quality (${(quality.qualityScore * 100).toFixed(0)}%). Need more context.`,
    };
  }

  return { meets: true };
};
```

### Human Feedback Loop

```typescript
// packages/shared/src/feedback/feedbackTypes.ts

export type FeedbackType = 'correct' | 'incorrect' | 'flaky' | 'needs_more_context';

export interface AnalysisFeedback {
  /** Analysis ID being rated */
  readonly analysisId: string;

  /** User's assessment */
  readonly feedback: FeedbackType;

  /** Optional correction */
  readonly correction?: string;

  /** User who provided feedback */
  readonly userId: string;

  /** Timestamp */
  readonly timestamp: string;
}

/**
 * Update model weights based on feedback
 */
export const processFeedback = (
  feedback: AnalysisFeedback,
  currentWeights: typeof DIAGNOSIS_WEIGHTS
): typeof DIAGNOSIS_WEIGHTS => {
  // This would update weights based on whether predictions were correct
  // In practice, you'd accumulate feedback and retrain periodically

  switch (feedback.feedback) {
    case 'correct':
      // Reinforce current weights slightly
      return currentWeights;

    case 'incorrect':
      // Log for later analysis and weight adjustment
      logFeedbackForRetraining(feedback);
      return currentWeights;

    case 'flaky':
      // Update flake database
      updateFlakeFromFeedback(feedback);
      return currentWeights;

    default:
      return currentWeights;
  }
};
```

### Type-Safe Action Categories

```typescript
// packages/shared/src/actions/actionTypes.ts

/**
 * Actions that can be auto-executed with high confidence
 * These are reversible and low-risk
 */
export type SafeAction =
  | { readonly type: 'rerun_workflow'; readonly workflowId: number; readonly runId: number }
  | { readonly type: 'add_label'; readonly label: string }
  | { readonly type: 'post_comment'; readonly body: string }
  | { readonly type: 'create_issue'; readonly title: string; readonly body: string };

/**
 * Actions that require human approval
 * These have moderate risk or privilege requirements
 */
export type ApprovalRequiredAction =
  | { readonly type: 'add_secret'; readonly name: string; readonly description: string }
  | { readonly type: 'rollback_deployment'; readonly targetVersion: string }
  | { readonly type: 'scale_service'; readonly service: string; readonly replicas: number }
  | { readonly type: 'update_configuration'; readonly file: string; readonly changes: string };

/**
 * Actions that should NEVER be automated
 * These are destructive or irreversible
 */
export type ForbiddenAction =
  | { readonly type: 'force_merge' }
  | { readonly type: 'delete_branch'; readonly branch: string }
  | { readonly type: 'delete_resource'; readonly resource: string }
  | { readonly type: 'force_push' }
  | { readonly type: 'disable_protection' }
  | { readonly type: 'drop_database' }
  | { readonly type: 'execute_arbitrary_code'; readonly code: string };

/**
 * Union of actions that can be proposed by the system
 * ForbiddenAction is explicitly excluded at the type level
 */
export type ProposableAction = SafeAction | ApprovalRequiredAction;

/**
 * Type guard to check if an action is safe for auto-execution
 */
export const isSafeAction = (action: ProposableAction): action is SafeAction => {
  const safeTypes: readonly string[] = ['rerun_workflow', 'add_label', 'post_comment', 'create_issue'];
  return safeTypes.includes(action.type);
};

/**
 * Type guard to check if an action requires approval
 */
export const requiresApproval = (action: ProposableAction): action is ApprovalRequiredAction => {
  return !isSafeAction(action);
};
```

---

## Code Review & Fix Suggestions

A critical capability for the AI DevOps Co-Pilot is the ability to not just **diagnose** CI failures, but to **suggest specific code fixes** that developers can apply.

### Current Capability Gap

| Capability | Status | Notes |
|------------|--------|-------|
| Explain why CI failed | ✅ Yes | Summary + identified cause |
| Show which files/lines failed | ✅ Yes | Annotations from GitHub |
| Retrieve source code context | ✅ Partial | Gets files around annotations |
| Suggest high-level actions | ✅ Yes | "Re-run", "Add env var", etc. |
| **Suggest specific code fixes** | ❌ No | Missing |
| **Generate code patches** | ❌ No | Missing |
| **Post fix as PR suggestion** | ❌ No | Missing |

### Code Fix Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CODE FIX SUGGESTION FLOW                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  CI Failure                                                                  │
│      │                                                                       │
│      ▼                                                                       │
│  ┌──────────────┐                                                           │
│  │ github-app   │                                                           │
│  │              │                                                           │
│  │ • Get error  │                                                           │
│  │   annotations│                                                           │
│  │ • Fetch full │                                                           │
│  │   source files│                                                          │
│  │ • Parse AST  │                                                           │
│  │   (optional) │                                                           │
│  └──────┬───────┘                                                           │
│         │                                                                    │
│         ▼                                                                    │
│  ┌──────────────┐       ┌──────────────┐                                   │
│  │     API      │◄──────│  Code Fix    │                                   │
│  │              │       │   Prompt     │                                   │
│  │ • LLM with   │       │              │                                   │
│  │   fix prompt │       │ • Source     │                                   │
│  │ • Validate   │       │   context    │                                   │
│  │   fixes      │       │ • Error info │                                   │
│  └──────┬───────┘       └──────────────┘                                   │
│         │                                                                    │
│         ▼                                                                    │
│  ┌──────────────┐                                                           │
│  │ Fix Validator│                                                           │
│  │              │                                                           │
│  │ • Verify code│                                                           │
│  │   exists     │                                                           │
│  │ • Check line │                                                           │
│  │   numbers    │                                                           │
│  │ • Syntax     │                                                           │
│  │   validation │                                                           │
│  │ • Dangerous  │                                                           │
│  │   pattern    │                                                           │
│  │   detection  │                                                           │
│  └──────┬───────┘                                                           │
│         │                                                                    │
│         ▼                                                                    │
│  ┌──────────────────────────────────────────────────────────┐              │
│  │                    OUTPUT OPTIONS                         │              │
│  ├──────────────────────────────────────────────────────────┤              │
│  │                                                           │              │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │              │
│  │  │   GitHub    │  │    Slack    │  │   Auto-     │      │              │
│  │  │   PR Review │  │   Message   │  │   Apply     │      │              │
│  │  │             │  │             │  │   (needs    │      │              │
│  │  │ ```suggest  │  │ • Summary   │  │   approval) │      │              │
│  │  │ fixed code  │  │ • Link to   │  │             │      │              │
│  │  │ ```         │  │   PR review │  │ • Commit    │      │              │
│  │  └─────────────┘  └─────────────┘  └─────────────┘      │              │
│  │       ▲                                    ▲             │              │
│  │       │                                    │             │              │
│  │    Safe Action                     Requires Approval     │              │
│  │  (auto if high                                           │              │
│  │   confidence)                                            │              │
│  └──────────────────────────────────────────────────────────┘              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Source Context Collection

```typescript
// services/github-app/src/services/codeContextService.ts

export interface SourceFileContext {
  /** Full file content (for small files) or relevant section */
  readonly content: string;

  /** Lines specifically mentioned in error */
  readonly errorLines: { start: number; end: number };

  /** Surrounding context lines */
  readonly contextLines: { start: number; end: number };

  /** AST information if parseable */
  readonly symbols?: {
    readonly functions: string[];
    readonly classes: string[];
    readonly imports: string[];
  };

  /** File metadata */
  readonly metadata: {
    readonly path: string;
    readonly language: string;
    readonly size: number;
  };
}

/**
 * Get targeted source context for code fix generation
 */
export const getSourceContextForFix = async (
  octokit: Octokit,
  owner: string,
  repo: string,
  ref: string,
  annotations: Annotation[]
): Promise<Map<string, SourceFileContext>> => {
  const contexts = new Map<string, SourceFileContext>();

  for (const annotation of annotations) {
    try {
      // Get the full file content
      const { data } = await octokit.repos.getContent({
        owner,
        repo,
        path: annotation.path,
        ref,
      });

      if ('content' in data) {
        const content = Buffer.from(data.content, 'base64').toString('utf-8');
        const language = detectLanguage(annotation.path);

        // Parse for symbols if it's a supported language
        const symbols = parseSymbols(annotation.path, content);

        contexts.set(annotation.path, {
          content,
          errorLines: {
            start: annotation.start_line || annotation.line || 1,
            end: annotation.end_line || annotation.line || 1,
          },
          contextLines: {
            start: Math.max(1, (annotation.start_line || 1) - 50),
            end: (annotation.end_line || annotation.line || 1) + 50,
          },
          symbols,
          metadata: {
            path: annotation.path,
            language,
            size: content.length,
          },
        });
      }
    } catch (error) {
      // File might not exist at this ref, skip it
      logger.warn('Failed to fetch source file for fix context', {
        path: annotation.path,
        ref,
        error: error instanceof Error ? error.message : 'Unknown',
      });
    }
  }

  return contexts;
};
```

### Code Fix Types

```typescript
// packages/shared/src/types/codeFix.ts

export interface CodeFix {
  /** File path relative to repo root */
  readonly file: string;

  /** Starting line of code to replace (1-indexed) */
  readonly lineStart: number;

  /** Ending line of code to replace (1-indexed, inclusive) */
  readonly lineEnd: number;

  /** Current code that needs fixing (for verification) */
  readonly currentCode: string;

  /** Suggested replacement code */
  readonly suggestedCode: string;

  /** Human-readable explanation of the fix */
  readonly explanation: string;

  /** Whether this change could break other code */
  readonly isBreakingChange: boolean;

  /** Suggested test to add for this fix */
  readonly testSuggestion?: string;

  /** Confidence in this fix */
  readonly confidence: 'high' | 'medium' | 'low';

  /** Category of fix */
  readonly fixType: 'syntax' | 'type' | 'logic' | 'null-safety' | 'import' | 'config' | 'other';
}

export interface CodeFixAnalysis {
  /** Event ID this analysis is for */
  readonly eventId: string;

  /** Overall diagnosis */
  readonly diagnosis: {
    readonly summary: string;
    readonly errorType: 'syntax' | 'type' | 'logic' | 'dependency' | 'config' | 'test' | 'other';
    readonly confidence: 'high' | 'medium' | 'low';
    readonly rootCause: string;
  };

  /** List of suggested fixes */
  readonly fixes: readonly CodeFix[];

  /** Additional context for reviewers */
  readonly additionalContext: {
    /** Other files that might need changes */
    readonly relatedFiles: readonly string[];
    /** Potential side effects of applying fixes */
    readonly potentialSideEffects: readonly string[];
    /** Notes for human reviewers */
    readonly reviewNotes: string;
  };

  /** Metadata */
  readonly metadata: {
    readonly analyzedAt: string;
    readonly modelUsed: string;
    readonly promptTokens: number;
    readonly completionTokens: number;
  };
}
```

### Code Fix Prompt Template

```typescript
// packages/shared/src/prompts/codeFixPrompt.ts

export const buildCodeFixPrompt = (
  event: Event,
  evidence: Evidence,
  sourceContexts: Map<string, SourceFileContext>
): string => {
  const sourceFilesSection = formatSourceContexts(sourceContexts);

  return `You are a senior software engineer reviewing a CI failure. Your task is to analyze the failure and provide SPECIFIC, ACTIONABLE code fixes.

## CI Failure Context
**Event Type**: ${event.type}
**Repository**: ${event.payload.repository || 'Unknown'}
**Severity**: ${event.severity}
**Timestamp**: ${event.timestamp}

## Error Output
${formatLogs(evidence.logs)}

## Source Files with Errors
${sourceFilesSection}

## Your Task
Analyze the failure and provide specific code fixes that will resolve the issue.

## Requirements
1. **Be Specific**: Provide exact line numbers and code changes
2. **Be Conservative**: Only suggest changes you are confident about
3. **Verify Context**: Only suggest fixes for code you can see in the source files
4. **Explain Clearly**: Each fix should have a clear explanation
5. **Consider Side Effects**: Note any potential breaking changes
6. **Suggest Tests**: Where appropriate, suggest tests to prevent regression

## Output Format (JSON)
{
  "diagnosis": {
    "summary": "One-sentence summary of the root cause",
    "errorType": "syntax|type|logic|dependency|config|test|other",
    "confidence": "high|medium|low",
    "rootCause": "Detailed explanation of why this error occurred"
  },
  "fixes": [
    {
      "file": "path/to/file.ts",
      "lineStart": 42,
      "lineEnd": 45,
      "currentCode": "exact current code from the file",
      "suggestedCode": "the fixed code",
      "explanation": "Why this fix resolves the issue",
      "isBreakingChange": false,
      "testSuggestion": "Optional: test to add",
      "confidence": "high|medium|low",
      "fixType": "syntax|type|logic|null-safety|import|config|other"
    }
  ],
  "additionalContext": {
    "relatedFiles": ["other files that might need review"],
    "potentialSideEffects": ["any side effects to be aware of"],
    "reviewNotes": "Additional notes for human reviewers"
  }
}

## IMPORTANT SAFETY RULES
- NEVER suggest fixes for files you haven't seen
- NEVER introduce new dependencies without explicit justification
- NEVER remove error handling or validation
- NEVER suggest changes that could introduce security vulnerabilities
- If you're unsure about a fix, set confidence to "low" and explain your uncertainty
- If you cannot determine a fix, return an empty fixes array with an explanation in reviewNotes
`;
};

/**
 * Format source contexts for the prompt
 */
const formatSourceContexts = (contexts: Map<string, SourceFileContext>): string => {
  const sections: string[] = [];

  for (const [path, context] of contexts) {
    const lines = context.content.split('\n');
    const relevantLines = lines.slice(
      Math.max(0, context.contextLines.start - 1),
      context.contextLines.end
    );

    // Add line numbers
    const numberedLines = relevantLines.map((line, i) => {
      const lineNum = context.contextLines.start + i;
      const isErrorLine = lineNum >= context.errorLines.start && lineNum <= context.errorLines.end;
      const prefix = isErrorLine ? '>>> ' : '    ';
      return `${prefix}${lineNum.toString().padStart(4)}: ${line}`;
    });

    sections.push(`### File: ${path}
**Language**: ${context.metadata.language}
**Error at lines**: ${context.errorLines.start}-${context.errorLines.end}
${context.symbols ? `**Symbols**: ${context.symbols.functions.join(', ')}` : ''}

\`\`\`${context.metadata.language}
${numberedLines.join('\n')}
\`\`\`
`);
  }

  return sections.join('\n---\n');
};
```

### Code Fix Validation

```typescript
// packages/shared/src/validation/codeFixValidation.ts

export interface FixValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

/**
 * Validate that a suggested fix is grounded in reality
 * and safe to apply
 */
export const validateCodeFix = (
  fix: CodeFix,
  sourceContext: SourceFileContext | undefined
): FixValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Check that the file exists in our context
  if (!sourceContext) {
    errors.push(`File "${fix.file}" not found in source context - cannot verify fix`);
    return { valid: false, errors, warnings };
  }

  const lines = sourceContext.content.split('\n');

  // 2. Check that line numbers are valid
  if (fix.lineStart < 1) {
    errors.push(`Invalid start line: ${fix.lineStart} (must be >= 1)`);
  }

  if (fix.lineEnd > lines.length) {
    errors.push(`End line ${fix.lineEnd} exceeds file length (${lines.length} lines)`);
  }

  if (fix.lineStart > fix.lineEnd) {
    errors.push(`Start line (${fix.lineStart}) is after end line (${fix.lineEnd})`);
  }

  // 3. Check that currentCode matches actual file content
  if (errors.length === 0) {
    const actualCode = lines.slice(fix.lineStart - 1, fix.lineEnd).join('\n').trim();
    const expectedCode = fix.currentCode.trim();

    // Normalize whitespace for comparison
    const normalizedActual = actualCode.replace(/\s+/g, ' ');
    const normalizedExpected = expectedCode.replace(/\s+/g, ' ');

    if (!normalizedActual.includes(normalizedExpected) &&
        !normalizedExpected.includes(normalizedActual)) {
      errors.push(`Current code doesn't match file content at lines ${fix.lineStart}-${fix.lineEnd}`);
      warnings.push(`Expected to find: "${expectedCode.slice(0, 80)}${expectedCode.length > 80 ? '...' : ''}"`);
      warnings.push(`Actually found: "${actualCode.slice(0, 80)}${actualCode.length > 80 ? '...' : ''}"`);
    }
  }

  // 4. Check for dangerous patterns in suggested code
  const dangerousPatterns: Array<{ pattern: RegExp; description: string }> = [
    { pattern: /\beval\s*\(/, description: 'eval() usage' },
    { pattern: /\bFunction\s*\(/, description: 'Function constructor' },
    { pattern: /\brequire\s*\(\s*[^'"]/,  description: 'dynamic require' },
    { pattern: /process\.exit/, description: 'process.exit' },
    { pattern: /rm\s+-rf/, description: 'rm -rf command' },
    { pattern: /DROP\s+TABLE/i, description: 'DROP TABLE statement' },
    { pattern: /DELETE\s+FROM.*WHERE\s+1\s*=\s*1/i, description: 'DELETE without proper WHERE' },
  ];

  for (const { pattern, description } of dangerousPatterns) {
    if (pattern.test(fix.suggestedCode) && !pattern.test(fix.currentCode)) {
      errors.push(`Suggested fix introduces dangerous pattern: ${description}`);
    }
  }

  // 5. Check for removed safety patterns
  const safetyPatterns: Array<{ pattern: RegExp; description: string }> = [
    { pattern: /try\s*\{/, description: 'try-catch block' },
    { pattern: /if\s*\([^)]*null|undefined/, description: 'null/undefined check' },
    { pattern: /\?\.\s*/, description: 'optional chaining' },
    { pattern: /\?\?\s*/, description: 'nullish coalescing' },
  ];

  for (const { pattern, description } of safetyPatterns) {
    if (pattern.test(fix.currentCode) && !pattern.test(fix.suggestedCode)) {
      warnings.push(`Suggested fix removes ${description} - verify this is intentional`);
    }
  }

  // 6. Low confidence fixes get extra scrutiny
  if (fix.confidence === 'low') {
    warnings.push('Low confidence fix - requires careful manual review');
  }

  // 7. Check if fix is essentially empty
  if (fix.suggestedCode.trim() === '') {
    warnings.push('Suggested fix is empty - this will delete code');
  }

  // 8. Check for significant size changes
  const originalLength = fix.currentCode.length;
  const newLength = fix.suggestedCode.length;
  const sizeDiff = Math.abs(newLength - originalLength) / Math.max(originalLength, 1);

  if (sizeDiff > 0.5 && originalLength > 50) {
    warnings.push(`Fix changes code size by ${(sizeDiff * 100).toFixed(0)}% - verify this is correct`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
};

/**
 * Validate all fixes in an analysis
 */
export const validateCodeFixAnalysis = (
  analysis: CodeFixAnalysis,
  sourceContexts: Map<string, SourceFileContext>
): Map<number, FixValidationResult> => {
  const results = new Map<number, FixValidationResult>();

  analysis.fixes.forEach((fix, index) => {
    const context = sourceContexts.get(fix.file);
    results.set(index, validateCodeFix(fix, context));
  });

  return results;
};
```

### GitHub PR Review Integration

```typescript
// services/github-app/src/services/reviewService.ts

import { Octokit } from '@octokit/rest';
import type { CodeFix, CodeFixAnalysis } from '@kenchi/shared';
import { createLogger } from '@kenchi/shared';

const logger = createLogger('github-app');

export class GitHubReviewService {
  constructor(private readonly octokit: Octokit) {}

  /**
   * Post code fix suggestions as a GitHub PR review
   * Uses GitHub's suggestion syntax for one-click apply
   */
  async postCodeFixReview(
    owner: string,
    repo: string,
    prNumber: number,
    commitSha: string,
    analysis: CodeFixAnalysis
  ): Promise<{ reviewId: number; commentsPosted: number }> {
    const { diagnosis, fixes, additionalContext } = analysis;

    // Filter to only valid, high/medium confidence fixes
    const validFixes = fixes.filter(f => f.confidence !== 'low');

    if (validFixes.length === 0) {
      // Post summary comment without suggestions
      await this.octokit.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body: this.formatAnalysisOnlyComment(diagnosis, additionalContext),
      });

      return { reviewId: 0, commentsPosted: 0 };
    }

    // Build review comments with suggestions
    const comments = validFixes.map(fix => ({
      path: fix.file,
      line: fix.lineEnd,
      side: 'RIGHT' as const,
      body: this.formatFixComment(fix),
    }));

    // Create the review
    const { data: review } = await this.octokit.pulls.createReview({
      owner,
      repo,
      pull_number: prNumber,
      commit_id: commitSha,
      event: 'COMMENT',
      body: this.formatReviewSummary(diagnosis, validFixes, additionalContext),
      comments,
    });

    logger.info('Posted code fix review', {
      owner,
      repo,
      prNumber,
      reviewId: review.id,
      fixCount: validFixes.length,
    });

    return {
      reviewId: review.id,
      commentsPosted: validFixes.length,
    };
  }

  /**
   * Format a single fix as a GitHub suggestion comment
   */
  private formatFixComment(fix: CodeFix): string {
    const confidenceEmoji = {
      high: '🟢',
      medium: '🟡',
      low: '🔴',
    }[fix.confidence];

    const fixTypeLabel = {
      syntax: '📝 Syntax',
      type: '🔷 Type',
      logic: '🧠 Logic',
      'null-safety': '🛡️ Null Safety',
      import: '📦 Import',
      config: '⚙️ Config',
      other: '🔧 Fix',
    }[fix.fixType];

    // GitHub suggestion syntax allows one-click apply
    return `${confidenceEmoji} **${fixTypeLabel}** (${fix.confidence} confidence)

${fix.explanation}

\`\`\`suggestion
${fix.suggestedCode}
\`\`\`

${fix.isBreakingChange ? '⚠️ **Warning**: This may be a breaking change. Review carefully.' : ''}
${fix.testSuggestion ? `\n📝 **Suggested test**: ${fix.testSuggestion}` : ''}
`;
  }

  /**
   * Format the overall review summary
   */
  private formatReviewSummary(
    diagnosis: CodeFixAnalysis['diagnosis'],
    fixes: readonly CodeFix[],
    context: CodeFixAnalysis['additionalContext']
  ): string {
    const highConfidence = fixes.filter(f => f.confidence === 'high').length;
    const mediumConfidence = fixes.filter(f => f.confidence === 'medium').length;

    return `## 🤖 Kenchi CI Failure Analysis

### Summary
${diagnosis.summary}

### Root Cause
${diagnosis.rootCause}

### Suggested Fixes
- **${fixes.length}** fix${fixes.length !== 1 ? 'es' : ''} suggested
- 🟢 ${highConfidence} high confidence
- 🟡 ${mediumConfidence} medium confidence

${context.potentialSideEffects.length > 0 ? `
### ⚠️ Potential Side Effects
${context.potentialSideEffects.map(s => `- ${s}`).join('\n')}
` : ''}

${context.relatedFiles.length > 0 ? `
### 📁 Related Files to Review
${context.relatedFiles.map(f => `- \`${f}\``).join('\n')}
` : ''}

${context.reviewNotes ? `
### 📝 Reviewer Notes
${context.reviewNotes}
` : ''}

---
*🤖 Generated by [Kenchi](https://github.com/your-org/kenchi) - AI DevOps Co-Pilot*
*Click "Apply suggestion" on any fix to apply it directly*
`;
  }

  /**
   * Format comment when no specific fixes can be suggested
   */
  private formatAnalysisOnlyComment(
    diagnosis: CodeFixAnalysis['diagnosis'],
    context: CodeFixAnalysis['additionalContext']
  ): string {
    return `## 🤖 Kenchi CI Failure Analysis

### Summary
${diagnosis.summary}

### Root Cause
${diagnosis.rootCause}

### Confidence
${diagnosis.confidence === 'low' ? '🔴 Low' : diagnosis.confidence === 'medium' ? '🟡 Medium' : '🟢 High'}

${context.reviewNotes ? `
### Notes
${context.reviewNotes}
` : ''}

*Unable to suggest specific code fixes. Manual investigation required.*

---
*🤖 Generated by [Kenchi](https://github.com/your-org/kenchi) - AI DevOps Co-Pilot*
`;
  }
}
```

### Updated Action Types

```typescript
// packages/shared/src/actions/actionTypes.ts (additions)

/**
 * Actions that can be auto-executed with high confidence
 * Including code review posting (safe because it's just comments)
 */
export type SafeAction =
  | { readonly type: 'rerun_workflow'; readonly workflowId: number; readonly runId: number }
  | { readonly type: 'add_label'; readonly label: string }
  | { readonly type: 'post_comment'; readonly body: string }
  | { readonly type: 'create_issue'; readonly title: string; readonly body: string }
  // NEW: Post code fix suggestions as PR review comments
  | {
      readonly type: 'post_code_review';
      readonly prNumber: number;
      readonly fixes: readonly CodeFix[];
      readonly diagnosis: CodeFixAnalysis['diagnosis'];
    };

/**
 * Actions that require human approval
 */
export type ApprovalRequiredAction =
  | { readonly type: 'add_secret'; readonly name: string; readonly description: string }
  | { readonly type: 'rollback_deployment'; readonly targetVersion: string }
  | { readonly type: 'scale_service'; readonly service: string; readonly replicas: number }
  | { readonly type: 'update_configuration'; readonly file: string; readonly changes: string }
  // NEW: Auto-apply code fixes (creates a commit)
  | {
      readonly type: 'apply_code_fix';
      readonly fix: CodeFix;
      readonly prNumber: number;
      readonly createCommit: boolean;
      readonly commitMessage: string;
    };
```

### Integration with Analysis Pipeline

```typescript
// services/api/src/services/codeFixService.ts

import {
  OpenAIClient,
  type Event,
  type Evidence,
  type CodeFixAnalysis,
  createLogger,
} from '@kenchi/shared';
import { buildCodeFixPrompt } from '@kenchi/shared/prompts/codeFixPrompt';
import { validateCodeFixAnalysis } from '@kenchi/shared/validation/codeFixValidation';

const logger = createLogger('api');

export class CodeFixService {
  constructor(private readonly openaiClient: OpenAIClient) {}

  /**
   * Analyze failure and generate code fix suggestions
   */
  async analyzeForFixes(
    event: Event,
    evidence: Evidence,
    sourceContexts: Map<string, SourceFileContext>
  ): Promise<CodeFixAnalysis> {
    // Build the code fix prompt
    const prompt = buildCodeFixPrompt(event, evidence, sourceContexts);

    // Get analysis from LLM
    const response = await this.openaiClient.analyzeWithPrompt(prompt);

    // Parse the response
    const analysis = this.parseCodeFixResponse(response, event.id);

    // Validate all suggested fixes
    const validationResults = validateCodeFixAnalysis(analysis, sourceContexts);

    // Filter out invalid fixes and add validation warnings
    const validatedFixes = analysis.fixes.filter((_, index) => {
      const result = validationResults.get(index);
      if (!result?.valid) {
        logger.warn('Code fix failed validation', {
          eventId: event.id,
          fixIndex: index,
          errors: result?.errors,
        });
        return false;
      }
      return true;
    });

    // Log warnings for valid fixes
    validatedFixes.forEach((fix, index) => {
      const result = validationResults.get(index);
      if (result?.warnings.length) {
        logger.info('Code fix has warnings', {
          eventId: event.id,
          file: fix.file,
          warnings: result.warnings,
        });
      }
    });

    return {
      ...analysis,
      fixes: validatedFixes,
    };
  }

  private parseCodeFixResponse(response: string, eventId: string): CodeFixAnalysis {
    // Parse JSON from response, with fallback handling
    // Similar to existing OpenAI response parsing
    // ...
  }
}
```

---

## Feature Roadmap

### Phase 1: Security & MVP Completion (Smart CI/CD Failure Assistant)
**Goal**: Complete the first feature with proper security to production quality

```
Current State → Target State
─────────────────────────────────────────────
[✅] CI failure webhook receipt
[✅] Context enrichment (logs, diff, commit)
[✅] OpenAI analysis
[✅] Confidence scoring (basic)
[✅] Slack notification
[🔲] SECRET REDACTION (CRITICAL)
[🔲] PostgreSQL + pgvector storage
[🔲] Enhanced dual confidence scoring
[🔲] Interactive approval buttons
[🔲] Action execution (add env vars, re-run)
[🔲] Flakiness detection & fingerprinting
[🔲] GitHub PR comments with analysis
[🔲] CODE FIX SUGGESTIONS (PR review with suggestions)
[🔲] Learning from past incidents (RAG)
[🔲] Customer privacy toggles
```

### Phase 2: Incident Triage & Auto-Remediation
**Goal**: Extend to production monitoring alerts

```
[🔲] Datadog/Prometheus alert webhook receivers
[🔲] Metrics correlation service
[🔲] Service health monitoring integration
[🔲] Runbook execution framework
[🔲] Automatic rollback capability
[🔲] On-call escalation integration
```

### Phase 3: Documentation & Knowledge Assistant
**Goal**: Internal knowledge Q&A

```
[🔲] Document ingestion pipeline
[🔲] Runbook parsing and storage
[🔲] Post-mortem ingestion
[🔲] Natural language Q&A interface
[🔲] Citation and source linking
```

### Phase 4-6: Future Phases
- Deployment Risk Analyzer
- Infrastructure-as-Code Copilot
- Configuration Drift Detection

---

## Technical Implementation Plan

### Implementation Order (Based on Dependencies)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     IMPLEMENTATION DEPENDENCY GRAPH                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   WEEK 1: Foundation                                                     │
│   ┌─────────────────┐                                                   │
│   │ Secret Redaction │ ← No dependencies, add immediately               │
│   └────────┬────────┘                                                   │
│            │                                                             │
│   ┌────────▼────────┐                                                   │
│   │   PostgreSQL    │ ← Unlocks persistence for everything              │
│   │   + pgvector    │                                                   │
│   └────────┬────────┘                                                   │
│            │                                                             │
│   WEEK 2-3: Core Features                                                │
│   ┌────────▼────────┐     ┌─────────────────┐                          │
│   │ Diff Chunking   │     │   Fingerprint   │                          │
│   │ + Embeddings    │     │   + Flakiness   │                          │
│   └────────┬────────┘     └────────┬────────┘                          │
│            │                       │                                     │
│            └───────────┬───────────┘                                     │
│                        │                                                 │
│   ┌────────────────────▼────────────────────┐                           │
│   │        Enhanced Confidence Scoring       │                           │
│   │        (C_diag + C_act + signals)        │                           │
│   └────────────────────┬────────────────────┘                           │
│                        │                                                 │
│   WEEK 4: User Experience                                                │
│   ┌────────────────────▼────────────────────┐                           │
│   │        Interactive Slack Messages        │                           │
│   │        + Approval Workflow               │                           │
│   └────────────────────┬────────────────────┘                           │
│                        │                                                 │
│   ┌────────────────────▼────────────────────┐                           │
│   │          Action Execution                │                           │
│   │          (GitHub API integration)        │                           │
│   └────────────────────┬────────────────────┘                           │
│                        │                                                 │
│   WEEK 5: Polish                                                         │
│   ┌────────────────────▼────────────────────┐                           │
│   │     Customer Toggles + Privacy          │                           │
│   │     Feedback Loop + Metrics             │                           │
│   └─────────────────────────────────────────┘                           │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Milestone 0: Secret Redaction (Immediate - Day 1)

**No dependencies. Add now.**

```typescript
// packages/shared/src/security/index.ts
export { redactSecrets, redactObject, SECRET_PATTERNS, FORBIDDEN_FIELDS } from './redaction.js';
```

**Integration point** in `services/github-app/src/services/contextService.ts`:

```typescript
import { redactSecrets } from '@kenchi/shared';

export const gatherEnrichedContext = async (webhook: CheckRunWebhook): Promise<EnrichedContext> => {
  // ... gather context ...

  // CRITICAL: Redact before returning
  return {
    ...context,
    workflowLogs: context.workflowLogs ? redactSecrets(context.workflowLogs) : undefined,
    prDiff: context.prDiff ? redactSecrets(context.prDiff) : undefined,
    // ... redact all string fields
  };
};
```

### Milestone 1: Database Setup (Week 1)

```sql
-- Core tables
CREATE TABLE events (
  id VARCHAR(50) PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  source VARCHAR(100) NOT NULL,
  severity VARCHAR(20),
  timestamp TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE analyses (
  id VARCHAR(50) PRIMARY KEY,
  event_id VARCHAR(50) REFERENCES events(id),
  summary TEXT NOT NULL,
  identified_cause TEXT,
  diagnosis_confidence FLOAT NOT NULL,
  action_confidence FLOAT,
  confidence_signals JSONB,
  full_analysis JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE action_proposals (
  id VARCHAR(50) PRIMARY KEY,
  analysis_id VARCHAR(50) REFERENCES analyses(id),
  action_type VARCHAR(50) NOT NULL,
  action_payload JSONB NOT NULL,
  diagnosis_confidence FLOAT NOT NULL,
  action_confidence FLOAT NOT NULL,
  risk_factors JSONB NOT NULL,
  decision VARCHAR(20) NOT NULL,  -- 'auto_act', 'recommend', 'block'
  status VARCHAR(20) DEFAULT 'proposed',
  approved_by VARCHAR(100),
  approved_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  execution_result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Flakiness tracking
CREATE TABLE flake_records (
  fingerprint VARCHAR(32) PRIMARY KEY,
  repository VARCHAR(200) NOT NULL,
  test_name TEXT NOT NULL,
  occurrences INTEGER NOT NULL DEFAULT 1,
  passes_after_rerun INTEGER NOT NULL DEFAULT 0,
  flake_probability FLOAT NOT NULL DEFAULT 0,
  last_seen TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_flake_records_repo ON flake_records(repository);
CREATE INDEX idx_flake_records_probability ON flake_records(flake_probability DESC);

-- Vector extension for RAG
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE diff_chunks (
  id VARCHAR(50) PRIMARY KEY,
  repository VARCHAR(200) NOT NULL,
  pr_number INTEGER,
  commit_sha VARCHAR(40) NOT NULL,
  file_path TEXT NOT NULL,
  hunk_header TEXT,
  content TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_diff_chunks_repo ON diff_chunks(repository);
CREATE INDEX idx_diff_chunks_embedding ON diff_chunks USING ivfflat (embedding vector_cosine_ops);

-- Feedback for model improvement
CREATE TABLE analysis_feedback (
  id VARCHAR(50) PRIMARY KEY,
  analysis_id VARCHAR(50) REFERENCES analyses(id),
  feedback_type VARCHAR(20) NOT NULL,  -- 'correct', 'incorrect', 'flaky', 'needs_more_context'
  correction TEXT,
  user_id VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Customer privacy settings
CREATE TABLE installation_settings (
  installation_id VARCHAR(50) PRIMARY KEY,
  privacy_settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Milestone 2: Enhanced Confidence Scoring (Week 2)

Update `packages/shared/src/safety/` with the new dual-confidence model:

```typescript
// packages/shared/src/safety/index.ts
export { calculateDiagnosisConfidence, extractConfidenceSignals } from './diagnosisConfidence.js';
export { calculateActionConfidence, assessActionRisks } from './actionConfidence.js';
export { makeDecision, DECISION_THRESHOLDS, SAFE_AUTO_ACTIONS } from './decisionPolicy.js';
export type { ConfidenceSignals, ActionRiskFactors, Decision } from './types.js';
```

### Milestone 3: Fingerprinting & Flakiness (Week 2)

Add new module for failure fingerprinting:

```typescript
// packages/shared/src/fingerprinting/index.ts
export { createFingerprint } from './failureFingerprint.js';
export { calculateFlakeProbability, updateFlakeRecord } from './flakinessTracker.js';
export type { TestFingerprint, FlakeRecord } from './types.js';
```

### Milestone 4: RAG Pipeline (Week 3)

```typescript
// packages/shared/src/rag/index.ts
export { chunkDiff, CHUNK_CONFIG } from './diffChunker.js';
export { OpenAIEmbeddingService, embedChunk } from './embeddingService.js';
export { retrieveRelevantChunks } from './retrieval.js';
export { PgVectorStore } from './pgVectorStore.js';
```

### Milestone 5: Interactive Slack + Action Execution (Week 4)

See previous sections for Slack Block Kit and GitHub API integration code.

---

## MVP Path to Production

### Updated MVP Architecture

```
GitHub Actions                 Kenchi System                        Outputs
──────────────────────────────────────────────────────────────────────────────

CI Failure
    │
    ▼
┌─────────────────┐
│   github-app    │
│                 │
│ • Enrich context│
│ • REDACT SECRETS│◄──── NEW: Stage 1 filtering
│ • Fingerprint   │
│ • Check flakiness│
└────────┬────────┘
         │
         ▼
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│      n8n        │──────►│       API       │──────►│    slack-bot    │
│                 │       │                 │       │                 │
│ • Orchestrate   │       │ • Analyze (LLM) │       │ • Format        │
│ • Route         │       │ • Dual scoring  │       │ • Interactive   │
│                 │       │ • RAG retrieval │       │   buttons       │
└─────────────────┘       │ • Store analysis│       └────────┬────────┘
                          └────────┬────────┘                │
                                   │                         │
                                   ▼                         ▼
                          ┌─────────────────┐       ┌─────────────────┐
                          │   PostgreSQL    │       │  User Approval  │
                          │   + pgvector    │       │                 │
                          │                 │       │ [Approve] [Deny]│
                          │ • Events        │       └────────┬────────┘
                          │ • Analyses      │                │
                          │ • Flake records │                ▼
                          │ • Diff chunks   │       ┌─────────────────┐
                          └─────────────────┘       │ Action Executor │
                                                    │                 │
                                                    │ • GitHub API    │
                                                    │ • Add secrets   │
                                                    │ • Rerun workflow│
                                                    └─────────────────┘
```

### MVP Milestones (Updated)

| Milestone | Duration | Description |
|-----------|----------|-------------|
| **0. Secret Redaction** | Day 1 | Add redaction before any LLM call |
| **1. PostgreSQL + pgvector** | Week 1 | Database setup, migrations, repository pattern |
| **2. Enhanced Confidence** | Week 2 | Dual scoring (C_diag + C_act), signals |
| **3. Fingerprinting + Flakiness** | Week 2 | Failure fingerprints, flake detection |
| **4. RAG Pipeline** | Week 3 | Diff chunking, embeddings, retrieval |
| **5. Code Fix Suggestions** | Week 3-4 | Source context, fix prompts, PR review integration |
| **6. Interactive Slack** | Week 4 | Block Kit, approval buttons, feedback |
| **7. Action Execution** | Week 5 | GitHub API integration, safe action list |
| **8. Production Hardening** | Week 6 | Error handling, monitoring, customer toggles |

### Code Fix Suggestions - Implementation Details

| Component | File | Effort |
|-----------|------|--------|
| Source context collection | `services/github-app/src/services/codeContextService.ts` | 1 day |
| Code fix types | `packages/shared/src/types/codeFix.ts` | 0.5 day |
| Code fix prompt template | `packages/shared/src/prompts/codeFixPrompt.ts` | 1 day |
| Fix validation | `packages/shared/src/validation/codeFixValidation.ts` | 1 day |
| GitHub PR review service | `services/github-app/src/services/reviewService.ts` | 2 days |
| Code fix service | `services/api/src/services/codeFixService.ts` | 1 day |
| Action type updates | `packages/shared/src/actions/actionTypes.ts` | 0.5 day |

**Total: ~1 week of focused development**

---

## Investment in Infrastructure

### Required Resources

#### Cloud Infrastructure
- **Compute**: 3 small VMs/containers for services + 1 for n8n
- **Database**: PostgreSQL with pgvector (managed recommended)
- **Secrets**: GitHub App credentials, OpenAI API key, Slack tokens

#### Third-Party Services
- **OpenAI API**: ~$50-200/month depending on volume
- **Slack**: Standard plan (or Enterprise Grid for larger orgs)
- **GitHub**: GitHub App registration (free)

#### Development Effort
| Phase | Effort | Team Size |
|-------|--------|-----------|
| MVP Completion (with security) | 5-6 weeks | 1-2 developers |
| Incident Triage | 4-6 weeks | 1-2 developers |
| Knowledge Assistant | 3-4 weeks | 1 developer |
| Deployment Risk | 4-6 weeks | 1-2 developers |
| IaC Copilot | 6-8 weeks | 2 developers |
| Drift Detection | 4-6 weeks | 1-2 developers |

### Return on Investment

Based on the concept document's ROI arguments:

1. **Reduced MTTR**: Even 15 minutes saved per incident * 50 incidents/month = 12.5 hours saved
2. **Developer Productivity**: Automated analysis replaces 30-60 minutes of manual log reading
3. **Reduced Alert Fatigue**: Correlation and smart prioritization reduces noise by 60-80%
4. **Knowledge Retention**: Institutional knowledge captured and accessible
5. **Reduced False Positives**: Flakiness detection prevents chasing phantoms

---

## Conclusion

### Current State Summary
Kenchi has a **solid foundation** with:
- Complete shared infrastructure (logging, errors, validation, safety)
- Working CI failure analysis pipeline
- OpenAI integration with anti-hallucination measures
- Comprehensive documentation

### Critical Path to MVP (Updated)
1. **Add secret redaction immediately** - Zero downside, critical security
2. **Add persistence** (PostgreSQL + pgvector) - Unlocks everything else
3. **Implement dual confidence scoring** - Better decision making
4. **Add fingerprinting + flakiness detection** - Reduce false positives
5. **Add code fix suggestions** - Actionable fixes, not just diagnosis
6. **Add RAG pipeline** - "Repo expert" capability
7. **Add interactive Slack messages** - User engagement
8. **Add action execution** - Close the loop

### Competitive Advantage
The architecture emphasizes **safety-first AI** with:
- **Data minimization**: Only send what's necessary to LLM
- **Secret redaction**: Never expose sensitive data
- **Two-stage pipeline**: Deterministic filtering before AI reasoning
- **Dual confidence scoring**: Separate diagnosis from action confidence
- **Flakiness awareness**: Don't chase false positives
- **Type-safe actions**: Forbidden actions cannot be proposed
- **Human-in-the-loop**: Approval required for risky actions
- **Actionable code fixes**: Not just diagnosis, but validated fix suggestions with one-click apply
- **GitHub-native integration**: PR review comments with suggestion blocks for seamless workflow

This positions Kenchi as a **trustworthy AI DevOps co-pilot** that teams can rely on for production systems—one that doesn't just tell you what's wrong, but shows you exactly how to fix it.

---

**Document Version**: 2.1
**Created**: 2025-12-20
**Updated**: 2025-12-20
**Related Documents**:
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture
- [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) - Detailed design
- [DATA_MODELS.md](./DATA_MODELS.md) - Data structures
- [CONFIDENCE_SCORING.md](./CONFIDENCE_SCORING.md) - Safety scoring

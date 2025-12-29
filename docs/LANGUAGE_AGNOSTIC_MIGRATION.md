# Language-Agnostic Migration - AI-First Approach

## Overview

This document describes the migration of Kenchi from a JavaScript/TypeScript-focused CI analyzer to a universal, language-agnostic CI analyzer using an AI-first architecture.

**Completed**: Phase 1 - Constants and Code Cleanup
**Completed**: Phase 2 - Log Parser Simplification and Prompt Updates
**Completed**: Phase 3 - Structured AI Extraction in LLM Response
**Completed**: Phase 4 - Integration & Validation

---

## Migration Status

| Phase   | Scope                                                    | State       | Notes                                                                                               |
| ------- | -------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------- |
| Phase 1 | Remove language-specific constants + legacy diff parsing | ✅ Complete | `BUILD_CONFIG_FILES`, `DEPENDENCY_FILES`, and old diff parsers removed.                             |
| Phase 2 | Prompt + log-parser rewrite                              | ✅ Complete | `logParser.ts` simplified from ~500 to ~175 lines. Prompts updated for universal language support.  |
| Phase 3 | Structured AI extraction in LLM response                 | ✅ Complete | AI now returns structured `detectedDependencyChanges` and `detectedBuildConfigChanges` in analysis. |
| Phase 4 | Integration + validation                                 | ✅ Complete | Multi-language fixtures (Python, Go, Rust, Ruby, Java), telemetry, and formatter updates complete.  |

---

## AI-First Architecture

### Core Principle

Instead of maintaining regex patterns for every programming language and framework, we:

1. **Keep minimal preprocessing** (ANSI stripping, secret redaction, token management)
2. **Let AI analyze** the raw data (logs, diffs, file paths)
3. **Remove language-specific** constants and parsing logic

### What Was Removed

#### Phase 1 (Constants & Diff Parsing)

| Component                         | Lines Removed | Reason                                   |
| --------------------------------- | ------------- | ---------------------------------------- |
| `BUILD_CONFIG_FILES`              | 16 lines      | JS-only file list, AI detects from diff  |
| `DEPENDENCY_FILES`                | 6 lines       | npm-only file list, AI detects from diff |
| `fetchDependencyChanges()`        | 100+ lines    | Regex parsing, AI extracts from diff     |
| `fetchBuildConfigChanges()`       | 50+ lines     | Regex parsing, AI extracts from diff     |
| Complex `FILE_REFERENCE_PATTERNS` | 20+ lines     | Replaced with 2 universal patterns       |

#### Phase 2 (Log Parser Simplification)

| Component             | Lines Removed | Reason                            |
| --------------------- | ------------- | --------------------------------- |
| `JEST_PATTERNS`       | 20 lines      | Framework-specific, AI handles    |
| `MOCHA_PATTERN`       | 5 lines       | Framework-specific, AI handles    |
| `PYTEST_PATTERNS`     | 15 lines      | Framework-specific, AI handles    |
| `GO_TEST_PATTERNS`    | 15 lines      | Framework-specific, AI handles    |
| `RSPEC_PATTERNS`      | 15 lines      | Framework-specific, AI handles    |
| `JUNIT_PATTERNS`      | 15 lines      | Framework-specific, AI handles    |
| `RUST_TEST_PATTERNS`  | 15 lines      | Framework-specific, AI handles    |
| Framework extractors  | 150+ lines    | Complex parsing logic, AI handles |
| Test file map caching | 50 lines      | No longer needed                  |

**Total Phase 2 reduction**: ~300 lines removed from `logParser.ts`

### What Was Kept

| Component                 | Reason                                      |
| ------------------------- | ------------------------------------------- |
| `EXCLUDED_PATH_PATTERNS`  | Universal vendor directories (minimal list) |
| `FILE_REFERENCE_PATTERNS` | 2 universal patterns for basic extraction   |
| `stripAnsiCodes()`        | Universal noise removal                     |
| `stripCITimestamps()`     | Universal noise removal                     |
| `truncateWithContext()`   | Token budget management                     |
| `extractFileReferences()` | Universal file path extraction              |
| `extractTestFailures()`   | Minimal fallback with 4 universal patterns  |
| Secret redaction          | Security requirement                        |

---

## Implementation Details

### Phase 2 Changes

#### Log Parser (`services/github-app/src/services/context/logParser.ts`)

**Before** (Framework-specific, ~500 lines):

```typescript
// 7 framework-specific pattern sets
const JEST_PATTERNS: readonly RegExp[] = [...];
const MOCHA_PATTERN = /...$/gm;
const PYTEST_PATTERNS: readonly RegExp[] = [...];
const GO_TEST_PATTERNS: readonly RegExp[] = [...];
const RSPEC_PATTERNS: readonly RegExp[] = [...];
const JUNIT_PATTERNS: readonly RegExp[] = [...];
const RUST_TEST_PATTERNS: readonly RegExp[] = [...];

// Complex extractors for each framework
const extractJestMatch = (match, logs) => {...};
const extractMochaMatch = (match) => {...};
// ... 5 more extractors

// Framework detection and iteration
const FRAMEWORK_PATTERNS: readonly FrameworkPattern[] = [...];
const tryExtractFromFramework = (logs, framework) => {...};
```

**After** (AI-first, ~175 lines):

```typescript
// 4 universal patterns for fallback detection
const UNIVERSAL_FAILURE_PATTERNS = [
  /(?:FAIL(?:ED)?|✕|✗|×)\s+(\S+\.(?:test|spec)\.\w+)/gim,
  /FAILED\s+(\S+\.py::\S+)/gim,
  /---\s+FAIL:\s+(\w+(?:\/\w+)*)/gim,
  /thread\s+'([^']+)'\s+panicked/gim,
] as const;

// Simple extraction with deduplication
export const extractTestFailures = (logs: string): TestFailure[] => {
  const cleanLogs = stripCITimestamps(stripAnsiCodes(logs));
  // Extract using universal patterns, deduplicate by name
  // AI handles detailed analysis of raw logs
};
```

#### LLM Prompts (`packages/shared/src/integrations/prompts.ts`)

**Updated** with language-agnostic guidance:

```typescript
### Universal File Reference Patterns (Language-Agnostic):
Look for file paths with line numbers in ANY of these formats:
- `path/to/file.ext:line:column` (TypeScript, Python, Go, Rust, etc.)
- `path/to/file.ext(line,column)` (C#, TypeScript compiler)
- `at path/to/file.ext:line` (stack traces)
- `File "path/to/file.py", line N` (Python tracebacks)

### Test Failure Detection (Any Framework):
Identify test failures from ANY test framework by looking for:
- **JavaScript/TypeScript**: `FAIL`, `✕`, `●` markers (Jest/Vitest/Mocha)
- **Python**: `FAILED`, `E       assert`, pytest output
- **Go**: `--- FAIL:`, `FAIL` with package names
- **Rust**: `---- test_name stdout ----`, `thread '...' panicked`
- **Ruby**: `Failure/Error:`, RSpec numbered failures
- **Java**: `FAILURE`, JUnit stack traces with `.java:line`
- **C#**: `Failed`, NUnit/xUnit output

### Dependency & Build Config Detection:
When PR diff is provided, identify:
- **Dependency files**: package.json, requirements.txt, go.mod, Cargo.toml, etc.
- **Build configs**: tsconfig.json, pyproject.toml, Makefile, CMakeLists.txt, etc.
```

### Phase 3 Changes

#### LLM Analysis Types (`packages/shared/src/core/types.ts`)

**Added** new types for AI-extracted structured data:

```typescript
/**
 * Dependency change detected by AI from PR diff.
 * Matches any package manager format (npm, pip, cargo, go, etc.)
 */
export interface LLMDetectedDependencyChange {
  readonly name: string;
  readonly type: "added" | "removed" | "updated";
  readonly oldVersion?: string;
  readonly newVersion?: string;
  readonly ecosystem?: string; // npm, pip, cargo, go, maven, etc.
}

/**
 * Build config change detected by AI from PR diff.
 * Works with any build system (webpack, tsconfig, pyproject, Makefile, etc.)
 */
export interface LLMDetectedBuildConfigChange {
  readonly file: string;
  readonly changeType: "added" | "modified" | "deleted";
  readonly summary: string; // Brief description of what changed
}

// Added to LLMAnalysisResult:
export interface LLMAnalysisResult {
  // ... existing fields ...
  detectedDependencyChanges?: LLMDetectedDependencyChange[];
  detectedBuildConfigChanges?: LLMDetectedBuildConfigChange[];
}
```

#### Prompt Updates (`packages/shared/src/integrations/prompts.ts`)

**Added** structured extraction schema to JSON output format:

```json
{
  "detectedDependencyChanges": [
    {
      "name": "package-name",
      "type": "added|removed|updated",
      "oldVersion": "1.0.0",
      "newVersion": "2.0.0",
      "ecosystem": "npm|pip|cargo|go|maven|gem|etc"
    }
  ],
  "detectedBuildConfigChanges": [
    {
      "file": "tsconfig.json",
      "changeType": "added|modified|deleted",
      "summary": "Brief description of what changed"
    }
  ]
}
```

#### OpenAI Client (`packages/shared/src/openaiClient/client.ts`)

**Added** parsing methods for new fields:

- `validateDependencyChange()` - Validates individual dependency change
- `validateBuildConfigChange()` - Validates individual build config change
- `parseDependencyChanges()` - Parses array of dependency changes
- `parseBuildConfigChanges()` - Parses array of build config changes

### Phase 1 Changes (Reference)

#### Constants (`packages/shared/src/constants/github.ts`)

```typescript
// Minimal universal exclusions
export const EXCLUDED_PATH_PATTERNS = [
  "node_modules",
  "vendor",
  ".venv",
  "site-packages",
  "dist/",
  "build/",
  "target/",
  ".git/",
  ".test.",
  ".spec.",
  "internal/",
] as const;

// 2 universal patterns - AI handles complex cases
export const FILE_REFERENCE_PATTERNS = [
  /(?:^|[\s("'])([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+):(\d+)(?::\d+)?/gm,
  /([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)\((\d+),\d+\)/gm,
] as const;
```

#### PR Fetcher (`services/github-app/src/services/context/prFetcher.ts`)

**Removed Functions**:

- `fetchDependencyChanges()` - AI extracts from diff
- `fetchBuildConfigChanges()` - AI extracts from diff

**Added Function**:

```typescript
export const fetchChangedFiles = async (
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number
): Promise<string[]>
```

---

## How AI Handles Detection

### Test Failures (Any Framework)

AI recognizes test failure patterns from raw logs:

```
# Jest/Vitest
FAIL src/index.test.ts

# pytest
FAILED tests/test_main.py::test_function

# go test
--- FAIL: TestFunction (0.00s)

# cargo test
thread 'tests::my_test' panicked

# RSpec
1) ClassName#method_name
   Failure/Error: expect(x).to eq(y)

# JUnit
org.junit.ComparisonFailure: expected:<[x]> but was:<[y]>
```

### Dependency Changes

AI receives the full PR diff and identifies dependency changes:

```
# JavaScript (package.json)
+"axios": "^1.0.0"

# Python (requirements.txt)
+requests==2.28.0

# Go (go.mod)
+require github.com/gin-gonic/gin v1.9.0

# Rust (Cargo.toml)
+serde = "1.0"
```

### Build Config Changes

AI detects build config files from the diff context:

```
diff --git a/tsconfig.json b/tsconfig.json
diff --git a/pyproject.toml b/pyproject.toml
diff --git a/Cargo.toml b/Cargo.toml
```

---

## Benefits

1. **Universal Language Support**: Works with Python, Go, Rust, Ruby, Java, C++, and any future language.
2. **Zero Maintenance**: No new regex patterns needed for new frameworks.
3. **Better Accuracy**: AI understands context, not just patterns.
4. **Cleaner Codebase**: Removed 500+ lines of fragile regex patterns.
5. **Future-Proof**: New frameworks/toolchains automatically supported.

---

## Testing

All tests pass after Phase 2 migration:

```
Test Suites: 66 passed, 66 total
Tests:       2391 passed, 2391 total
```

Tests updated for AI-first approach:

- `logParser.test.ts` - Updated for universal patterns (55 tests)
- `contextAggregator.test.ts` - Verifies empty arrays for pre-parsed fields
- `prFetcher.test.ts` - Tests for `fetchChangedFiles`

---

## Files Modified

### Phase 3

| File                                          | Changes                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------- |
| `packages/shared/src/core/types.ts`           | Added `LLMDetectedDependencyChange`, `LLMDetectedBuildConfigChange` types |
| `packages/shared/src/core/index.ts`           | Exported new types                                                        |
| `packages/shared/src/index.ts`                | Exported new types                                                        |
| `packages/shared/src/integrations/prompts.ts` | Added structured extraction schema to output format                       |
| `packages/shared/src/openaiClient/client.ts`  | Added parsing for new extraction fields                                   |

### Phase 2

| File                                                          | Changes                            |
| ------------------------------------------------------------- | ---------------------------------- |
| `services/github-app/src/services/context/logParser.ts`       | Simplified from ~500 to ~175 lines |
| `services/github-app/src/__tests__/context/logParser.test.ts` | Updated for AI-first approach      |
| `packages/shared/src/integrations/prompts.ts`                 | Added universal language guidance  |

### Phase 1

| File                                                                  | Changes                                            |
| --------------------------------------------------------------------- | -------------------------------------------------- |
| `packages/shared/src/constants/github.ts`                             | Removed language-specific constants                |
| `packages/shared/src/constants/index.ts`                              | Updated exports                                    |
| `services/github-app/src/services/context/prFetcher.ts`               | Removed parsing functions, added fetchChangedFiles |
| `services/github-app/src/services/context/contextAggregator.ts`       | Updated to use AI-first approach                   |
| `services/github-app/src/services/context/index.ts`                   | Updated exports                                    |
| `services/github-app/src/__tests__/context/prFetcher.test.ts`         | Updated tests                                      |
| `services/github-app/src/__tests__/context/contextAggregator.test.ts` | Updated tests                                      |

---

## Phase 4 - Integration & Validation (Complete)

### What Was Implemented

- [x] **Testing Matrix**: Multi-language fixture tests for Python (pip), Go (go.mod), Rust (Cargo), Ruby (Bundler), Java (Maven), TypeScript (npm)
- [x] **Telemetry**: Added `logExtractionTelemetry()` in OpenAI client - logs dependency counts by ecosystem and change type
- [x] **Formatter Updates**: Both Slack and GitHub formatters now use AI-extracted data with fallback to legacy
- [x] **Documentation**: Migration documentation updated

### Files Modified in Phase 4

| File                                                                       | Changes                                       |
| -------------------------------------------------------------------------- | --------------------------------------------- |
| `packages/shared/src/__tests__/openaiClient/multiLanguageFixtures.test.ts` | Added 9 multi-language fixture tests          |
| `packages/shared/src/openaiClient/client.ts`                               | Added `logExtractionTelemetry()` for tracking |
| `services/slack-bot/src/types/slackTypes.ts`                               | Added AI-extracted types to CIFailureAnalysis |
| `services/slack-bot/src/formatters/ciFailureFormatter.ts`                  | Uses AI-extracted data with fallback          |
| `services/github-app/src/formatters/commentFormatter.ts`                   | Uses AI-extracted data with fallback          |

### Test Results

```
Test Suites: 67 passed, 67 total
Tests:       2381 passed, 2381 total
```

> **Migration Complete**: The system is now fully language-agnostic. AI analyzes raw logs and diffs from any language/framework, returning structured extraction data that formatters use directly.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    CI Failure Event                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Context Aggregator (contextAggregator.ts)           │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 1. Fetch workflow logs (raw)                            │    │
│  │ 2. Fetch PR diff (raw)                                  │    │
│  │ 3. Strip ANSI codes, timestamps                         │    │
│  │ 4. Redact secrets                                       │    │
│  │ 5. Extract file references (universal patterns)         │    │
│  │ 6. Extract test failures (minimal fallback patterns)    │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   EnrichedContext                                │
│  ┌──────────────────┬──────────────────────────────────────┐    │
│  │ workflowLogs     │ Raw logs (cleaned, truncated)        │    │
│  │ prDiff           │ Raw PR diff                          │    │
│  │ testFailures     │ Basic failures (fallback detection)  │    │
│  │ annotations      │ GitHub check run annotations         │    │
│  │ sourceFiles      │ Relevant source code snippets        │    │
│  └──────────────────┴──────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    OpenAI Analysis                               │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ AI receives raw data and returns:                       │    │
│  │ • summary, identifiedCause, reasoning                   │    │
│  │ • codeAnnotations (file:line with error messages)       │    │
│  │ • recommendedActions (safe, actionable fixes)           │    │
│  │ • detectedDependencyChanges (any package manager)       │    │
│  │ • detectedBuildConfigChanges (any build system)         │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   LLMAnalysisResult                              │
│  ┌──────────────────┬──────────────────────────────────────┐    │
│  │ summary          │ Concise failure explanation          │    │
│  │ identifiedCause  │ Root cause analysis                  │    │
│  │ codeAnnotations  │ [{path, line, level, message}]       │    │
│  │ recommendedActions│ Safe remediation steps              │    │
│  │ detectedDependencyChanges │ [{name, type, version}]     │    │
│  │ detectedBuildConfigChanges│ [{file, changeType, summary}]│   │
│  └──────────────────┴──────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

# Implementation Plan: Simplified CI Log Pipeline

> Comprehensive plan for simplifying the CI failure analysis pipeline from 5 phases/12 formatters to a streamlined 4-stage flow.

## Executive Summary

| Metric                 | Current | Target |
| ---------------------- | ------- | ------ |
| **Pipeline Phases**    | 5       | 4      |
| **Formatter Files**    | 17      | 2      |
| **Total Files**        | ~60     | ~25    |
| **Lines of Code**      | ~8,000  | ~2,500 |
| **Maintenance Burden** | High    | Low    |

## Implementation Phases

### Phase 1: Create New Simplified Components (Non-Breaking)

Create new files that will replace the complex pipeline. Existing code continues to work.

### Phase 2: Update Handler with Feature Flag

Modify `checkRunAnalysis.ts` to use new components behind a feature flag.

### Phase 3: Validate & Compare

Run both pipelines in parallel, compare output quality.

### Phase 4: Delete Old Files

Remove deprecated files after validation.

---

## Phase 1: Create New Simplified Components

### 1.1 Create Simplified Preprocessor

**File:** `packages/shared/src/formatting/logPreprocessor.ts`
**Target LOC:** ~100

```typescript
/**
 * Simplified Log Preprocessor
 *
 * Minimal transformations: strip ANSI, redact secrets, truncate.
 * No test failure extraction, no file reference parsing.
 */

// ==================== Constants ====================

const ANSI_ESCAPE_PATTERN = /\x1b\[[0-9;]*m/g;
const CI_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s*/gm;
const DEFAULT_MAX_LOG_SIZE = 50000; // 50KB

// Error indicators for smart truncation
const ERROR_INDICATORS = [
  "ERROR",
  "Error:",
  "error:",
  "FAIL",
  "FAILED",
  "Failed",
  "Exception",
  "Traceback",
  "panic:",
  "panicked",
  "AssertionError",
  "expect(",
  "Expected:",
  "Received:",
] as const;

// ==================== Core Functions ====================

/**
 * Strip ANSI color codes from log content.
 */
export const stripAnsiCodes = (text: string): string => text.replace(ANSI_ESCAPE_PATTERN, "");

/**
 * Strip CI timestamps from log content.
 */
export const stripCITimestamps = (text: string): string => text.replace(CI_TIMESTAMP_PATTERN, "");

/**
 * Find the best starting position for truncation based on error indicators.
 */
const findErrorPosition = (content: string): number => {
  const positions = ERROR_INDICATORS.map((indicator) => content.indexOf(indicator)).filter(
    (pos) => pos !== -1
  );

  return positions.length > 0 ? Math.min(...positions) : 0;
};

/**
 * Truncate content to max size, centered on first error.
 */
export const truncateWithErrorContext = (
  content: string,
  maxSize: number = DEFAULT_MAX_LOG_SIZE
): string => {
  if (content.length <= maxSize) {
    return content;
  }

  const errorPos = findErrorPosition(content);
  const halfSize = Math.floor(maxSize / 2);
  const start = Math.max(0, errorPos - halfSize);
  const end = Math.min(content.length, start + maxSize);

  const truncated = content.slice(start, end);
  const prefix = start > 0 ? "... [truncated] ...\n" : "";
  const suffix = end < content.length ? "\n... [truncated] ..." : "";

  return prefix + truncated + suffix;
};

/**
 * Main preprocessing pipeline.
 * Applies all transformations in order.
 */
export const preprocessLogs = (rawLogs: string, maxSize: number = DEFAULT_MAX_LOG_SIZE): string => {
  // Step 1: Strip ANSI color codes
  const noAnsi = stripAnsiCodes(rawLogs);

  // Step 2: Strip CI timestamps
  const noTimestamps = stripCITimestamps(noAnsi);

  // Step 3: Redact secrets (import from existing)
  // const redacted = redactSecrets(noTimestamps);
  // Note: Use existing redactSecrets from @kenchi/shared

  // Step 4: Truncate with error context
  const truncated = truncateWithErrorContext(noTimestamps, maxSize);

  return truncated;
};

export interface PreprocessResult {
  readonly logs: string;
  readonly originalSize: number;
  readonly processedSize: number;
  readonly wasTruncated: boolean;
}

/**
 * Preprocess logs with metadata.
 */
export const preprocessLogsWithMetadata = (
  rawLogs: string,
  maxSize: number = DEFAULT_MAX_LOG_SIZE
): PreprocessResult => {
  const processed = preprocessLogs(rawLogs, maxSize);

  return {
    logs: processed,
    originalSize: rawLogs.length,
    processedSize: processed.length,
    wasTruncated: processed.includes("[truncated]"),
  };
};
```

### 1.2 Add JSON Handling to Prompt

**File:** `packages/shared/src/integrations/prompts.ts`
**Change:** Add to `buildAnalysisGuidelinesSection()`

```typescript
// Add after "### Filter Noise" section (around line 149):

### Handling Structured Log Output
If the logs contain JSON-formatted output like:
  {"level":3,"message":"Redis error","metadata":{...}}

Extract the human-readable message ("Redis error") and explain it in plain English.
Do NOT copy raw JSON into root_cause or annotations.
Summarize what the JSON tells you:
- Good: "Redis connection failed due to DNS resolution error (ENOTFOUND)"
- Bad: {"level":3,"message":"Redis error","timestamp":"..."}

If the root cause comes from JSON logs, the annotation snippet should be the extracted message, not the full JSON object.
```

### 1.3 Create Simplified Output Formatter

**File:** `packages/shared/src/formatting/outputFormatter.ts`
**Target LOC:** ~200

```typescript
/**
 * Simplified Output Formatter
 *
 * Formats LLM analysis results for GitHub PR comments and Slack messages.
 * Single source of truth for output formatting.
 */

import type { LLMAnalysisResult } from "../core/types.js";

// ==================== Types ====================

export interface OutputContext {
  readonly repository: string;
  readonly commitSha: string;
  readonly checkName: string;
  readonly prNumber?: number;
  readonly branchName?: string;
}

export interface GitHubCommentOutput {
  readonly body: string;
}

export interface SlackMessageOutput {
  readonly text: string;
  readonly blocks: SlackBlock[];
}

interface SlackBlock {
  readonly type: string;
  readonly text?: { type: string; text: string };
  readonly fields?: Array<{ type: string; text: string }>;
  readonly elements?: Array<{ type: string; text: { type: string; text: string }; url?: string }>;
}

// ==================== GitHub Formatter ====================

const formatGitHubHeader = (context: OutputContext, analysis: LLMAnalysisResult): string => {
  const shortSha = context.commitSha.substring(0, 7);
  const confidencePercent = Math.round((analysis.confidence ?? 0) * 100);

  return `## CI Failure Analysis

**Commit:** \`${shortSha}\`
**Check:** ${context.checkName}
**Confidence:** ${confidencePercent}% (${analysis.confidence_level ?? "unknown"})
${context.branchName ? `**Branch:** ${context.branchName}` : ""}
`;
};

const formatGitHubRootCause = (analysis: LLMAnalysisResult): string => {
  if (!analysis.root_cause) {
    return "";
  }

  return `### Root Cause

${analysis.root_cause}

**Category:** ${analysis.category ?? "unknown"} | **Phase:** ${analysis.phase ?? "unknown"}
`;
};

const formatGitHubAnnotations = (analysis: LLMAnalysisResult): string => {
  const annotations = analysis.annotations ?? [];
  if (annotations.length === 0) {
    return "";
  }

  const annotationLines = annotations
    .slice(0, 5) // Limit to 5 annotations
    .map((annotation, index) => {
      const snippet = annotation.snippet ?? "";
      const explanation = annotation.explanation ?? "";
      return `${index + 1}. \`${snippet.slice(0, 100)}\`
   ${explanation}`;
    })
    .join("\n\n");

  return `### Evidence

${annotationLines}
`;
};

const formatGitHubNextSteps = (analysis: LLMAnalysisResult): string => {
  const steps = analysis.next_steps ?? [];
  if (steps.length === 0) {
    return "";
  }

  const stepLines = steps
    .slice(0, 5) // Limit to 5 steps
    .map((step) => `- ${step}`)
    .join("\n");

  return `### Recommended Actions

${stepLines}
`;
};

const formatGitHubFooter = (): string => `
---
*Generated by KenchiOps DevOps Assistant*
`;

/**
 * Format LLM analysis result as GitHub PR comment.
 */
export const formatGitHubComment = (
  analysis: LLMAnalysisResult,
  context: OutputContext
): GitHubCommentOutput => {
  const sections = [
    formatGitHubHeader(context, analysis),
    formatGitHubRootCause(analysis),
    formatGitHubAnnotations(analysis),
    formatGitHubNextSteps(analysis),
    formatGitHubFooter(),
  ].filter((section) => section.length > 0);

  return {
    body: sections.join("\n"),
  };
};

// ==================== Slack Formatter ====================

const formatSlackHeader = (context: OutputContext, analysis: LLMAnalysisResult): SlackBlock => {
  const confidencePercent = Math.round((analysis.confidence ?? 0) * 100);

  return {
    type: "header",
    text: {
      type: "plain_text",
      text: `CI Failure: ${context.repository}`,
    },
  };
};

const formatSlackSummary = (context: OutputContext, analysis: LLMAnalysisResult): SlackBlock => {
  const shortSha = context.commitSha.substring(0, 7);
  const confidencePercent = Math.round((analysis.confidence ?? 0) * 100);

  return {
    type: "section",
    fields: [
      { type: "mrkdwn", text: `*Commit:* \`${shortSha}\`` },
      { type: "mrkdwn", text: `*Check:* ${context.checkName}` },
      { type: "mrkdwn", text: `*Confidence:* ${confidencePercent}%` },
      { type: "mrkdwn", text: `*Category:* ${analysis.category ?? "unknown"}` },
    ],
  };
};

const formatSlackRootCause = (analysis: LLMAnalysisResult): SlackBlock => ({
  type: "section",
  text: {
    type: "mrkdwn",
    text: `*Root Cause:*\n${analysis.root_cause ?? "Unknown"}`,
  },
});

const formatSlackNextSteps = (analysis: LLMAnalysisResult): SlackBlock | null => {
  const steps = analysis.next_steps ?? [];
  if (steps.length === 0) {
    return null;
  }

  const stepText = steps
    .slice(0, 3)
    .map((step, i) => `${i + 1}. ${step}`)
    .join("\n");

  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*Next Steps:*\n${stepText}`,
    },
  };
};

const formatSlackActions = (context: OutputContext): SlackBlock => {
  const prUrl = context.prNumber
    ? `https://github.com/${context.repository}/pull/${context.prNumber}`
    : null;
  const logsUrl = `https://github.com/${context.repository}/commit/${context.commitSha}`;

  const elements = [];
  if (prUrl) {
    elements.push({
      type: "button",
      text: { type: "plain_text", text: "View PR" },
      url: prUrl,
    });
  }
  elements.push({
    type: "button",
    text: { type: "plain_text", text: "View Commit" },
    url: logsUrl,
  });

  return {
    type: "actions",
    elements,
  };
};

/**
 * Format LLM analysis result as Slack message.
 */
export const formatSlackMessage = (
  analysis: LLMAnalysisResult,
  context: OutputContext
): SlackMessageOutput => {
  const blocks: SlackBlock[] = [
    formatSlackHeader(context, analysis),
    formatSlackSummary(context, analysis),
    formatSlackRootCause(analysis),
  ];

  const nextSteps = formatSlackNextSteps(analysis);
  if (nextSteps) {
    blocks.push(nextSteps);
  }

  blocks.push(formatSlackActions(context));

  // Plain text fallback
  const text = `CI Failure: ${context.repository} - ${analysis.root_cause ?? "Unknown error"}`;

  return { text, blocks };
};
```

### 1.4 Create Simplified Analysis Handler

**File:** `services/github-app/src/handlers/simplifiedAnalysis.ts`
**Target LOC:** ~150

```typescript
/**
 * Simplified CI Failure Analysis
 *
 * New streamlined pipeline:
 * 1. Fetch logs from GitHub
 * 2. Preprocess (strip ANSI, redact, truncate)
 * 3. Send to LLM with simple prompt
 * 4. Format output for GitHub/Slack
 */

import {
  createLogger,
  config,
  resilientPost,
  redactSecretsWithStats,
  getErrorMessage,
} from "@kenchi/shared";
import { preprocessLogsWithMetadata } from "@kenchi/shared/formatting/logPreprocessor";
import { formatGitHubComment, formatSlackMessage } from "@kenchi/shared/formatting/outputFormatter";
import type { OutputContext } from "@kenchi/shared/formatting/outputFormatter";
import type { CheckRunWebhook } from "../types/githubTypes.js";
import { fetchWorkflowLogs } from "../services/context/workflowFetcher.js";

const logger = createLogger("github-app");

// ==================== Types ====================

interface SimplifiedAnalysisResult {
  readonly success: boolean;
  readonly analysis?: LLMAnalysisResult;
  readonly githubComment?: string;
  readonly slackMessage?: SlackMessageOutput;
  readonly error?: string;
}

interface LLMAnalysisResult {
  root_cause?: string;
  confidence?: number;
  confidence_level?: string;
  category?: string;
  phase?: string;
  annotations?: Array<{ snippet?: string; explanation?: string }>;
  next_steps?: string[];
}

// ==================== Main Handler ====================

/**
 * Process CI failure with simplified pipeline.
 */
export const processSimplifiedAnalysis = async (
  webhook: CheckRunWebhook
): Promise<SimplifiedAnalysisResult> => {
  const { check_run, repository, installation } = webhook;

  const context: OutputContext = {
    repository: repository.full_name,
    commitSha: check_run.head_sha,
    checkName: check_run.name,
    prNumber: check_run.pull_requests[0]?.number,
  };

  try {
    // Step 1: Fetch raw logs
    logger.info("Fetching workflow logs", {
      repository: context.repository,
      commitSha: context.commitSha.substring(0, 7),
    });

    const rawLogs = await fetchWorkflowLogs(
      installation.id,
      repository.owner.login,
      repository.name,
      check_run.head_sha
    );

    if (!rawLogs) {
      return {
        success: false,
        error: "No workflow logs available",
      };
    }

    // Step 2: Preprocess logs
    const preprocessed = preprocessLogsWithMetadata(rawLogs);

    // Step 3: Redact secrets
    const { redacted: redactedLogs } = redactSecretsWithStats(preprocessed.logs);

    logger.info("Logs preprocessed", {
      originalSize: preprocessed.originalSize,
      processedSize: preprocessed.processedSize,
      wasTruncated: preprocessed.wasTruncated,
    });

    // Step 4: Send to LLM
    const apiUrl = `${config.API_URL}/api/analyze`;
    const response = await resilientPost<LLMAnalysisResult>(apiUrl, {
      failure_log: redactedLogs,
      repository: context.repository,
    });

    const analysis = response.data;

    // Step 5: Format outputs
    const githubComment = formatGitHubComment(analysis, context);
    const slackMessage = formatSlackMessage(analysis, context);

    return {
      success: true,
      analysis,
      githubComment: githubComment.body,
      slackMessage,
    };
  } catch (error) {
    logger.error("Simplified analysis failed", {
      error: getErrorMessage(error),
      repository: context.repository,
    });

    return {
      success: false,
      error: getErrorMessage(error),
    };
  }
};
```

---

## Phase 2: Update Handler with Feature Flag

### 2.1 Add Feature Flag

**File:** `packages/shared/src/config.ts`

```typescript
// Add to config:
SIMPLIFIED_PIPELINE_ENABLED: process.env.SIMPLIFIED_PIPELINE_ENABLED === 'true',
```

### 2.2 Update Main Handler

**File:** `services/github-app/src/handlers/checkRunAnalysis.ts`

```typescript
// Add import at top:
import { processSimplifiedAnalysis } from "./simplifiedAnalysis.js";
import { config } from "@kenchi/shared";

// Modify processCIFailure function:
export const processCIFailure = async (webhook: CheckRunWebhook): Promise<boolean> => {
  // Feature flag check
  if (config.SIMPLIFIED_PIPELINE_ENABLED) {
    const result = await processSimplifiedAnalysis(webhook);
    return result.success;
  }

  // ... existing complex pipeline code ...
};
```

---

## Phase 3: Validate & Compare

### 3.1 Testing Strategy

| Test Type             | Purpose                        | Method                           |
| --------------------- | ------------------------------ | -------------------------------- |
| **Unit Tests**        | Verify preprocessing functions | Jest unit tests                  |
| **Integration Tests** | Verify end-to-end flow         | Mock GitHub API, real LLM call   |
| **A/B Comparison**    | Compare output quality         | Run both pipelines, human review |
| **Regression Tests**  | Ensure no data loss            | Compare outputs for same input   |

### 3.2 Validation Criteria

| Criterion                   | Threshold | Measurement                 |
| --------------------------- | --------- | --------------------------- |
| **No JSON in root_cause**   | 100%      | Regex check for `{.*:.*}`   |
| **Human-readable output**   | 100%      | Manual review of 20 samples |
| **Correct file references** | >90%      | Compare to known failures   |
| **Latency**                 | <30s      | End-to-end timing           |
| **Token usage**             | <100K     | OpenAI API response         |

### 3.3 A/B Testing Plan

1. Enable feature flag for 10% of repositories
2. Collect feedback for 1 week
3. Compare:
   - Root cause accuracy
   - User thumbs up/down ratio
   - Token usage per analysis
4. If validated, enable for 100%

---

## Phase 4: Delete Old Files

### 4.1 Files to Delete (35 files, ~5,500 LOC)

Execute after validation is complete and feature flag is 100% enabled.

```bash
#!/bin/bash
# delete_deprecated_files.sh

# Evidence ID System
rm packages/shared/src/formatting/evidenceIds.ts

# Complex Test Failure Extraction
rm packages/shared/src/formatting/testFailureUtils.ts
rm packages/shared/src/formatting/failureClassification.ts
rm packages/shared/src/formatting/failureClustering.ts
rm packages/shared/src/formatting/flakyTestDetection.ts

# PR Context & Message Variants
rm packages/shared/src/formatting/prContextCorrelation.ts
rm packages/shared/src/formatting/messageVariants.ts

# Complex GitHub Formatters (The "12 Section System")
rm services/github-app/src/formatters/prCommentFormatter.ts
rm services/github-app/src/formatters/prCommentSections.ts
rm services/github-app/src/formatters/prCommentHelpers.ts
rm services/github-app/src/formatters/prCommentTypes.ts
rm services/github-app/src/formatters/checkRunFormatter.ts
rm services/github-app/src/formatters/commentFormatter.ts
rm services/github-app/src/formatters/commentSectionBuilders.ts
rm services/github-app/src/formatters/commentHelpers.ts
rm services/github-app/src/formatters/commentTypes.ts
rm services/github-app/src/formatters/consolidatedFormatter.ts

# Slack Formatting
rm services/github-app/src/formatters/slackPayloadFormatter.ts
rm services/github-app/src/formatters/slackAnalysisBlocks.ts
rm services/github-app/src/formatters/slackAnnotationBlocks.ts
rm services/github-app/src/formatters/slackFeedbackBlocks.ts
rm services/github-app/src/formatters/slackContentBlocks.ts
rm services/github-app/src/formatters/slackBlockTypes.ts

# Complex Context Fetching
rm services/github-app/src/services/context/contextAggregator.ts
rm services/github-app/src/services/context/prFetcher.ts
rm services/github-app/src/services/context/commitFetcher.ts

# Complex Analysis Guardrails
rm packages/shared/src/openaiClient/analysisGuardrailsActions.ts
rm packages/shared/src/openaiClient/analysisGuardrailsEvidence.ts
rm packages/shared/src/openaiClient/analysisGuardrails.ts

# RAG & Advanced Features
rm packages/shared/src/integrations/vectorStore.ts
rm packages/shared/src/integrations/promptFormatters.ts
rm packages/shared/src/integrations/promptTokenManager.ts

echo "Deleted 35 files (~5,500 LOC)"
```

### 4.2 Files to Simplify (10 files)

| File                  | Current LOC | Target LOC | What to Keep                                                      |
| --------------------- | ----------- | ---------- | ----------------------------------------------------------------- |
| `logParser.ts`        | 464         | ~80        | `stripAnsiCodes`, `stripCITimestamps`, `truncateWithContext` only |
| `formatterUtils.ts`   | 622         | ~100       | `calculateAverageConfidence` only                                 |
| `workflowFetcher.ts`  | 225         | ~150       | Log fetching, remove complex retry                                |
| `causeExtraction.ts`  | 200         | DELETE     | Replaced by LLM                                                   |
| `evidencePatterns.ts` | 362         | DELETE     | Replaced by LLM                                                   |
| `validation.ts`       | 344         | ~100       | JSON parsing only                                                 |
| `responseParser.ts`   | 351         | ~100       | Direct JSON extraction                                            |
| `pathUtils.ts`        | 381         | ~100       | `stripAbsolutePaths` only                                         |
| `uiHelpers.ts`        | 315         | ~100       | `truncateText`, `pluralize` only                                  |

### 4.3 Update Index Files

After deletion, update all `index.ts` files to remove exports for deleted modules.

---

## Implementation Order

### Week 1: Create New Components

| Day | Task                              | Files | LOC             |
| --- | --------------------------------- | ----- | --------------- |
| 1   | Create `logPreprocessor.ts`       | 1     | ~100            |
| 1   | Add JSON handling to `prompts.ts` | 0     | ~15 lines added |
| 2   | Create `outputFormatter.ts`       | 1     | ~200            |
| 3   | Create `simplifiedAnalysis.ts`    | 1     | ~150            |
| 4-5 | Write unit tests                  | 3     | ~300            |

### Week 2: Integration & Validation

| Day | Task                                       |
| --- | ------------------------------------------ |
| 1   | Add feature flag, wire up handler          |
| 2   | Integration testing with mock data         |
| 3   | Deploy to staging, test with real failures |
| 4-5 | A/B comparison, collect feedback           |

### Week 3: Cleanup

| Day | Task                        |
| --- | --------------------------- |
| 1   | Enable feature flag 100%    |
| 2-3 | Delete deprecated files     |
| 4   | Update documentation        |
| 5   | Final review, merge to main |

---

## Rollback Plan

### Immediate Rollback (< 1 minute)

```bash
# Disable feature flag
export SIMPLIFIED_PIPELINE_ENABLED=false
# Restart services
```

### Full Rollback (< 10 minutes)

```bash
# Revert to previous commit
git revert HEAD
git push origin main
# Deploy previous version
```

### Rollback Triggers

| Condition           | Action                         |
| ------------------- | ------------------------------ |
| Error rate > 5%     | Disable feature flag           |
| User complaints > 3 | Disable feature flag           |
| Latency > 60s       | Investigate, consider rollback |
| Token usage > 200K  | Investigate truncation         |

---

## Success Metrics

| Metric                  | Current        | Target          | Measurement        |
| ----------------------- | -------------- | --------------- | ------------------ |
| **JSON in output**      | Sometimes      | Never           | Regex scan         |
| **Root cause accuracy** | ~80%           | >90%            | Human review       |
| **Code complexity**     | ~8,000 LOC     | ~2,500 LOC      | `wc -l`            |
| **Formatter files**     | 17             | 2               | File count         |
| **Maintenance time**    | High           | Low             | Developer feedback |
| **Latency**             | ~25s           | <30s            | P95 timing         |
| **Token cost**          | $0.12/analysis | <$0.15/analysis | OpenAI billing     |

---

## File Summary

### New Files (4 files, ~550 LOC)

| File                                                     | LOC  | Purpose                    |
| -------------------------------------------------------- | ---- | -------------------------- |
| `packages/shared/src/formatting/logPreprocessor.ts`      | ~100 | Preprocess logs            |
| `packages/shared/src/formatting/outputFormatter.ts`      | ~200 | Format GitHub/Slack output |
| `services/github-app/src/handlers/simplifiedAnalysis.ts` | ~150 | New handler                |
| `*/__tests__/*.test.ts`                                  | ~100 | Tests for new files        |

### Modified Files (3 files)

| File                                                   | Change                    |
| ------------------------------------------------------ | ------------------------- |
| `packages/shared/src/integrations/prompts.ts`          | Add JSON handling section |
| `packages/shared/src/config.ts`                        | Add feature flag          |
| `services/github-app/src/handlers/checkRunAnalysis.ts` | Route to new handler      |

### Deleted Files (35 files, ~5,500 LOC)

See Section 4.1 for complete list.

---

## Appendix: Prompt Changes

### Current Analysis Guidelines Section (excerpt)

```
### Filter Noise
Ignore verbose debug info, unrelated warnings, and success messages...
```

### New Addition (insert after "Filter Noise")

```
### Handling Structured Log Output
If the logs contain JSON-formatted output like:
  {"level":3,"message":"Redis error","metadata":{...}}

Extract the human-readable message ("Redis error") and explain it in plain English.
Do NOT copy raw JSON into root_cause or annotations.
Summarize what the JSON tells you:
- Good: "Redis connection failed due to DNS resolution error (ENOTFOUND)"
- Bad: {"level":3,"message":"Redis error","timestamp":"..."}

If the root cause comes from JSON logs, the annotation snippet should be the extracted message, not the full JSON object.
```

---

## Appendix: Test Cases

### Preprocessing Tests

```typescript
describe("logPreprocessor", () => {
  it("should strip ANSI codes", () => {
    const input = "\x1b[31mERROR\x1b[0m: Something failed";
    expect(stripAnsiCodes(input)).toBe("ERROR: Something failed");
  });

  it("should strip CI timestamps", () => {
    const input = "2026-01-11T12:34:56.789Z npm test";
    expect(stripCITimestamps(input)).toBe("npm test");
  });

  it("should truncate with error context", () => {
    const longLog = "A".repeat(100000);
    const withError = longLog.slice(0, 60000) + "ERROR: test failed" + longLog.slice(60018);
    const result = truncateWithErrorContext(withError, 50000);
    expect(result).toContain("ERROR: test failed");
    expect(result.length).toBeLessThanOrEqual(50000 + 50); // Allow for markers
  });
});
```

### Output Formatter Tests

```typescript
describe("outputFormatter", () => {
  const mockAnalysis = {
    root_cause: "Redis connection failed",
    confidence: 0.85,
    category: "infra",
    phase: "test",
    next_steps: ["Check Redis service", "Verify DNS"],
  };

  const mockContext = {
    repository: "owner/repo",
    commitSha: "abc1234567890",
    checkName: "CI",
    prNumber: 123,
  };

  it("should format GitHub comment", () => {
    const result = formatGitHubComment(mockAnalysis, mockContext);
    expect(result.body).toContain("## CI Failure Analysis");
    expect(result.body).toContain("Redis connection failed");
    expect(result.body).not.toMatch(/{.*:.*}/); // No JSON
  });

  it("should format Slack message", () => {
    const result = formatSlackMessage(mockAnalysis, mockContext);
    expect(result.text).toContain("CI Failure");
    expect(result.blocks.length).toBeGreaterThan(0);
  });
});
```

---

## Appendix: Feature Flag Configuration

### Environment Variables

```bash
# Enable simplified pipeline
SIMPLIFIED_PIPELINE_ENABLED=true

# Or per-repository override
SIMPLIFIED_PIPELINE_REPOS=owner/repo1,owner/repo2
```

### Code Implementation

```typescript
// packages/shared/src/config.ts
export const config = {
  // ... existing config ...

  SIMPLIFIED_PIPELINE_ENABLED: process.env.SIMPLIFIED_PIPELINE_ENABLED === "true",

  SIMPLIFIED_PIPELINE_REPOS: process.env.SIMPLIFIED_PIPELINE_REPOS
    ? process.env.SIMPLIFIED_PIPELINE_REPOS.split(",").map((r) => r.trim())
    : [],

  isSimplifiedPipelineEnabled: (repository: string): boolean => {
    if (config.SIMPLIFIED_PIPELINE_ENABLED) {
      return true;
    }
    return config.SIMPLIFIED_PIPELINE_REPOS.includes(repository);
  },
};
```

---

_Last updated: 2026-01-11_
_Author: Claude AI Assistant_

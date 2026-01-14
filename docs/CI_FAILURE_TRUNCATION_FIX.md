# CI Failure Log Truncation Fix

## Problem

CI failure analysis was showing generic messages like "CI job failed but no specific error details available in logs" instead of actual test failure details.

**Example output before fix:**

```
### ❌ Test
> CI job failed but no specific error details available in logs

**🛠️ Actions:**
- Provide full failing step logs and the earliest error lines.
```

## Root Cause Analysis

### Data Flow

1. GitHub webhook triggers on check_run failure
2. `combinedAnalysis.ts` fetches logs from GitHub API (e.g., 482KB)
3. `preprocessLogsWithMetadata()` truncates logs to 50KB (`LOG_PARSING_LIMITS.MAX_LOG_SIZE`)
4. Truncated logs sent to LLM via `/api/analyze`
5. LLM couldn't find failure details in truncated portion → generic fallback message

### The Truncation Problem

- Original logs: 482KB
- After preprocessing: 49KB (truncated to fit 50KB limit)
- The `truncateWithErrorContext()` function centered truncation around the first occurrence of generic error indicators: `["error", "Error", "ERROR", "failed", "Failed", "FAILED"]`
- In large logs, the word "error" or "failed" appears early (often in success messages or setup logs)
- Actual test failure details were later in the logs and got truncated out

### Log Analysis

```
{"level":1,"message":"Combined all failed job logs",...,"combinedLogSize":482432}
{"level":1,"message":"Preprocessed combined logs",...,"originalSize":482432,"processedSize":49870,"wasTruncated":true}
{"level":1,"message":"Combined analysis complete",...,"confidence":0.03}
```

The 0.03 confidence score indicated the LLM couldn't find meaningful failure information.

## Solution

### Approach: Pattern-Based Failure Detection

Instead of hardcoding language-specific test failure strings (bad design, not maintainable), implemented regex patterns that detect common CI failure structures across all languages.

### Files Changed

#### 1. `packages/shared/src/constants/github.ts`

Added `CI_FAILURE_PATTERNS` - language-agnostic regex patterns:

```typescript
export const CI_FAILURE_PATTERNS = [
  // Stack traces with file:line references (universal across languages)
  /(?:at\s+.+:\d+|File\s+["'].+["'],\s*line\s*\d+|\.(?:ts|js|py|go|rs|java|rb|php|cs|swift|kt|ex):\d+)/,

  // Test summary lines (passed/failed counts)
  /(?:\d+\s+(?:passed|failed|skipped|pending|error)|(?:passed|failed|skipped)[:,]\s*\d+)/i,

  // Exit code indicators
  /(?:exit\s*code|exited\s+with|returned)\s*[:\s]*(?:1|[2-9]\d*|\d{3,})/i,

  // Error level markers in structured logs
  /(?:^\s*\[?(?:ERROR|FATAL|CRITICAL|FAILURE)\]?|level["']?\s*[:=]\s*["']?(?:error|fatal|critical))/im,

  // Assertion/panic/exception markers
  /(?:AssertionError|panic:|panicked|Exception|Traceback)/i,

  // CI step failure markers (GitHub Actions, GitLab CI, etc.)
  /(?:##\[error\]|Process completed with exit code [1-9]|Job failed)/i,
] as const;
```

#### 2. `packages/shared/src/constants/index.ts`

Exported the new constant:

```typescript
export {
  // ...
  ERROR_INDICATORS,
  CI_FAILURE_PATTERNS,
  // ...
} from "./github.js";
```

#### 3. `packages/shared/src/formatting/logPreprocessor.ts`

Updated truncation logic:

```typescript
import {
  ERROR_INDICATORS,
  CI_FAILURE_PATTERNS,
  LOG_PARSING_LIMITS,
  TEXT_SANITIZATION_PATTERNS,
} from "../constants/index.js";

/**
 * Find positions where regex patterns match in content.
 */
const findPatternPositions = (content: string, patterns: readonly RegExp[]): number[] =>
  patterns
    .map((pattern) => {
      const match = content.match(pattern);
      return match?.index ?? -1;
    })
    .filter((position) => position !== -1);

/**
 * Find positions of string indicators in content.
 */
const findStringPositions = (content: string, indicators: readonly string[]): number[] =>
  indicators.map((indicator) => content.indexOf(indicator)).filter((position) => position !== -1);

/**
 * Find the best position for truncation by prioritizing CI failure patterns.
 * Uses regex patterns to detect failure sections in a language-agnostic way.
 */
const findBestErrorPosition = (content: string): number => {
  // Priority 1: Look for CI failure patterns (stack traces, test summaries, exit codes)
  const patternPositions = findPatternPositions(content, CI_FAILURE_PATTERNS);
  if (patternPositions.length > 0) {
    return Math.min(...patternPositions);
  }

  // Priority 2: Fall back to generic error indicators
  const errorPositions = findStringPositions(content, ERROR_INDICATORS);
  if (errorPositions.length > 0) {
    return Math.min(...errorPositions);
  }

  // No indicators found - start from beginning
  return LOG_PARSING_LIMITS.DEFAULT_ERROR_POSITION;
};

/**
 * Truncate content to max size, centered on CI failure indicators.
 */
export const truncateWithErrorContext = (
  content: string,
  maxSize: number = LOG_PARSING_LIMITS.MAX_LOG_SIZE
): string => {
  if (content.length <= maxSize) {
    return content;
  }

  // Use prioritized error position (CI failures > generic errors)
  const errorPos = findBestErrorPosition(content);

  // Calculate window: start slightly before error to capture context
  // Use 1/4 before and 3/4 after to capture more of the failure output
  const contextBefore = Math.floor(maxSize / 4);
  const start = Math.max(LOG_PARSING_LIMITS.DEFAULT_ERROR_POSITION, errorPos - contextBefore);
  const end = Math.min(content.length, start + maxSize);

  const truncated = content.slice(start, end);
  const prefix = start > LOG_PARSING_LIMITS.DEFAULT_ERROR_POSITION ? `${TRUNCATION_MARKER}\n` : "";
  const suffix = end < content.length ? `\n${TRUNCATION_MARKER}` : "";

  return prefix + truncated + suffix;
};
```

## How It Works

### Pattern Priority

1. **CI Failure Patterns** (highest priority):
   - Stack traces with file:line references
   - Test summary lines with pass/fail counts
   - Non-zero exit codes
   - Error level markers in structured logs
   - Assertion/panic/exception markers
   - CI platform-specific failure markers

2. **Generic Error Indicators** (fallback):
   - "error", "Error", "ERROR"
   - "failed", "Failed", "FAILED"

### Truncation Window

- **Before fix**: 50% before, 50% after the error position
- **After fix**: 25% before, 75% after the error position
- This captures more of the failure output (stack traces, error messages) rather than setup logs

## Language Support

The patterns are designed to work with any programming language:

| Pattern                             | Languages/Frameworks Covered                  |
| ----------------------------------- | --------------------------------------------- |
| `at\s+.+:\d+`                       | JavaScript, TypeScript, Java, C# stack traces |
| `File\s+["'].+["'],\s*line\s*\d+`   | Python tracebacks                             |
| `\.(?:ts\|js\|py\|go\|...):\d+`     | Any language with file:line format            |
| `\d+\s+(?:passed\|failed\|...)`     | Jest, pytest, Go test, RSpec, etc.            |
| `exit\s*code.*[1-9]`                | Any CI system                                 |
| `AssertionError\|panic:\|Exception` | Python, Go, Rust, Java, etc.                  |
| `##\[error\]`                       | GitHub Actions                                |

## Testing

To test the fix:

1. Trigger a CI failure with test failures
2. Check that the PR comment shows actual test failure details instead of generic message
3. Verify confidence score is higher than 0.03

## Future Improvements

1. **Multi-section extraction**: Extract multiple failure sections if space allows
2. **Weighted scoring**: Score different parts of logs and include highest-scored sections
3. **Adaptive limits**: Increase MAX_LOG_SIZE for complex failures
4. **Structured extraction**: Parse GitHub Actions step structure to extract only failing steps

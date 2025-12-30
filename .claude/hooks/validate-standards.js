#!/usr/bin/env node

/**
 * CLAUDE.md Standards Validation Hook
 *
 * Comprehensive validation against ALL rules defined in CLAUDE.md.
 * Runs as a Claude Code hook to enforce coding standards automatically.
 */

const path = require("path");

// ==================== Configuration ====================

const MAX_MODULE_LINES = 500;
const CONSTANTS_FILE = "packages/shared/src/constants";

// File patterns to validate
const TYPESCRIPT_EXTENSIONS = new Set([".ts", ".tsx"]);
const EXCLUDED_PATHS = new Set([
  "node_modules",
  "dist",
  "build",
  ".git",
  "coverage",
  "__tests__",
  ".test.ts",
  ".test.tsx",
  ".spec.ts",
  ".spec.tsx",
]);

// ==================== Shared Utilities Detection ====================

/**
 * Utilities that must be imported from @kenchi/shared
 */
const SHARED_UTILITIES = new Set([
  "createLogger",
  "logger",
  "config",
  "errorHandler",
  "asyncHandler",
  "requestLogger",
  "validate",
  "validators",
  "createRateLimiter",
  "defaultRateLimiter",
  "OpenAIClient",
  "VectorStore",
  "InMemoryVectorStore",
  "confidenceScore",
  "shouldActOnResult",
  "deduplicateByKey",
  "getErrorMessage",
  "shouldExcludePath",
]);

/**
 * Error classes that must be imported from @kenchi/shared
 */
const SHARED_ERROR_CLASSES = new Set([
  "AppError",
  "ValidationError",
  "AuthenticationError",
  "NotFoundError",
  "ExternalServiceError",
  "LLMError",
]);

/**
 * Types that must be imported from @kenchi/shared
 */
const SHARED_TYPES = new Set([
  "WebhookEvent",
  "CIFailureEvent",
  "SlackMessageEvent",
  "GitHubPREvent",
  "LLMAnalysisResult",
  "AnalyzedFailure",
  "AggregatedFailures",
  "CodeAnnotation",
  "RecommendedAction",
  "TestFailure",
]);

// ==================== Validation Rules ====================

/**
 * All validation rules organized by CLAUDE.md section
 */
const VALIDATION_RULES = [
  // ==================== Zero Duplication Policy ====================

  // Duplicate utility function definitions
  {
    id: "duplicate-utility",
    pattern: new RegExp(
      `(?:const|function)\\s+(${Array.from(SHARED_UTILITIES).join("|")})\\s*[=(<]`,
      "g"
    ),
    message: "Import this utility from @kenchi/shared instead of defining it locally",
    extract: (match) => `Found local definition of '${match[1]}' - import from @kenchi/shared`,
    skipInShared: true,
  },

  // Duplicate error class definitions
  {
    id: "duplicate-error-class",
    pattern: new RegExp(
      `class\\s+(${Array.from(SHARED_ERROR_CLASSES).join("|")})\\s+extends\\s+Error`,
      "g"
    ),
    message: "Use error classes from @kenchi/shared instead of defining duplicates",
    extract: (match) => `Found duplicate '${match[1]}' class - import from @kenchi/shared`,
    skipInShared: true,
  },

  // Duplicate type/interface definitions
  {
    id: "duplicate-type",
    pattern: new RegExp(
      `(?:interface|type)\\s+(${Array.from(SHARED_TYPES).join("|")})\\s*[{=<]`,
      "g"
    ),
    message: "Use types from @kenchi/shared instead of defining duplicates",
    extract: (match) => `Found duplicate type '${match[1]}' - import from @kenchi/shared`,
    skipInShared: true,
  },

  // Hand-rolled logger objects
  {
    id: "hand-rolled-logger",
    pattern: /(?:const|let|var)\s+logger\s*=\s*\{[^}]*(?:info|error|warn|debug)\s*:/g,
    message: "Import logger from @kenchi/shared instead of creating hand-rolled loggers",
    extract: () => "Found hand-rolled logger object - use createLogger from @kenchi/shared",
    skipInShared: true,
  },

  // ==================== TypeScript Standards ====================

  // any type usage
  {
    id: "any-type",
    pattern: /:\s*any\b(?!\s*\[)/g,
    message: "Use 'unknown' instead of 'any' for type safety",
    extract: () => "Found 'any' type - use 'unknown' with type guards instead",
  },

  // Unnecessary type assertion
  {
    id: "unsafe-type-assertion",
    pattern: /as\s+any\b/g,
    message: "Avoid 'as any' type assertions - use proper typing or type guards",
    extract: () => "Found 'as any' assertion - use proper typing instead",
  },

  // ==================== Async Patterns ====================

  // Promise chains (.then())
  {
    id: "promise-chain",
    pattern: /\.then\s*\(/g,
    message: "Use async/await instead of Promise chains",
    extract: () => "Found .then() Promise chain - use async/await instead",
  },

  // .catch() without async/await
  {
    id: "promise-catch",
    pattern: /\.catch\s*\(/g,
    message: "Use try/catch with async/await instead of .catch()",
    extract: () => "Found .catch() - use try/catch with async/await instead",
  },

  // ==================== Code Quality - Loops ====================

  // for loops
  {
    id: "for-loop",
    pattern: /\bfor\s*\(/g,
    message: "Use functional array methods (map, filter, reduce, forEach) instead of for loops",
    extract: () => "Found for loop - use functional array methods (map, filter, reduce, forEach)",
  },

  // while loops
  {
    id: "while-loop",
    pattern: /\bwhile\s*\(/g,
    message: "Use recursion or functional patterns instead of while loops",
    extract: () => "Found while loop - use recursion or functional patterns",
  },

  // ==================== Naming Conventions ====================

  // Single-letter callback parameters in array methods
  {
    id: "single-letter-callback",
    pattern: /\.(map|filter|reduce|forEach|some|every|find|findIndex|flatMap|sort)\s*\(\s*\(([a-zA-Z])\s*[,)]/g,
    message: "Use descriptive callback parameter names instead of single letters",
    extract: (match) => `Found single-letter '${match[2]}' in .${match[1]}() - use descriptive name`,
  },

  // Single-letter parameters in arrow functions
  {
    id: "single-letter-arrow-param",
    pattern: /(?:const|let|var)\s+\w+\s*=\s*\(([a-zA-Z])\s*(?::[^)]+)?\)\s*(?::\s*[^=]+)?\s*=>/g,
    message: "Use descriptive parameter names in arrow functions",
    extract: (match) => `Found single-letter '${match[1]}' parameter - use descriptive name`,
  },

  // Single-letter reduce accumulator
  {
    id: "single-letter-accumulator",
    pattern: /\.reduce\s*\(\s*\(\s*([a-zA-Z])\s*,/g,
    message: "Use 'accumulator' instead of single letter for reduce first parameter",
    extract: (match) => `Found single-letter accumulator '${match[1]}' - use 'accumulator'`,
  },

  // ==================== Constants Rule ====================

  // Regex constants defined outside constants files
  {
    id: "misplaced-regex-constant",
    pattern: /(?:const|let|var)\s+[A-Z][A-Z_0-9]+\s*=\s*\/[^/]+\/[gimsuy]*/g,
    message: "Move regex constants to packages/shared/src/constants",
    extract: () => "Found regex constant - move to packages/shared/src/constants",
    skipInConstants: true,
    skipInShared: true,
  },

  // Numeric threshold constants
  {
    id: "misplaced-numeric-constant",
    pattern: /(?:const|let|var)\s+(?:MAX|MIN|DEFAULT|THRESHOLD|LIMIT|TIMEOUT)[A-Z_0-9]*\s*=\s*\d+/g,
    message: "Move numeric constants to packages/shared/src/constants",
    extract: () => "Found numeric constant - move to packages/shared/src/constants",
    skipInConstants: true,
    skipInShared: true,
  },

  // ==================== Inline Emojis ====================

  // Common emojis that should use UI_EMOJI
  {
    id: "inline-emoji",
    pattern: /["'`][^"'`]*[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}][^"'`]*["'`]/gu,
    message: "Use UI_EMOJI constants from @kenchi/shared instead of inline emojis",
    extract: () => "Found inline emoji - use UI_EMOJI from @kenchi/shared",
    skipInConstants: true,
    skipInShared: true,
  },

  // ==================== Separation of Concerns ====================

  // Services importing other services
  {
    id: "service-importing-service",
    pattern: /from\s+['"]\.\.\/services\//g,
    message: "Services should not import other services - use dependency injection",
    extract: () => "Found service importing another service - use dependency injection",
    onlyInServices: true,
  },

  // ==================== Readonly Enforcement ====================

  // Mutable array type declarations in interfaces/types (should use readonly)
  // Note: Skipped in function signatures to maintain compatibility with existing APIs
  {
    id: "mutable-array-type",
    pattern: /(?:interface|type)\s+\w+[^{]*\{[^}]*:\s*(?:Array<[^>]+>|[A-Za-z]+\[\])\s*[;,]/g,
    message: "Use 'readonly' for array types in interfaces/types to enforce immutability",
    extract: () => "Found mutable array type in interface/type - use 'readonly T[]'",
    skipInTests: true,
  },

  // ==================== Import Type Enforcement ====================

  // Type-only imports not using 'import type'
  // Note: Excludes "Error" suffix since Error classes are used as constructors (values)
  {
    id: "missing-import-type",
    pattern: /import\s+\{\s*(?:type\s+)?([A-Z][A-Za-z]*(?:Type|Interface|Props|State|Config|Options|Params|Result|Response|Request|Event|Data|Info|Context|Schema|Spec|Definition|Descriptor|Metadata|Payload|DTO))\s*(?:,|\})\s*from/g,
    message: "Use 'import type' for type-only imports",
    extract: (match) => `Found '${match[1]}' - use 'import type { ${match[1]} }' for type-only imports`,
  },

  // ==================== Explicit Return Types ====================

  // Arrow functions without return types (exported or assigned to const)
  {
    id: "missing-return-type-arrow",
    pattern: /(?:export\s+)?const\s+[a-zA-Z_][a-zA-Z0-9_]*\s*=\s*(?:async\s+)?\([^)]*\)\s*=>\s*[^:]/g,
    message: "Add explicit return type to arrow functions",
    extract: () => "Found arrow function without return type - add ': ReturnType' after parameters",
    skipInTests: true,
  },

  // Function declarations without return types
  {
    id: "missing-return-type-function",
    pattern: /(?:export\s+)?(?:async\s+)?function\s+[a-zA-Z_][a-zA-Z0-9_]*\s*\([^)]*\)\s*\{/g,
    message: "Add explicit return type to function declarations",
    extract: () => "Found function without return type - add ': ReturnType' after parameters",
    skipInTests: true,
  },

  // ==================== Boolean Naming ====================

  // Boolean variables without proper prefix
  {
    id: "boolean-naming",
    pattern: /(?:const|let|var)\s+([a-z][a-zA-Z]*)\s*:\s*boolean\s*=/g,
    message: "Boolean variables should use is/has/should/can/will/did prefix",
    extract: (match) => {
      const name = match[1];
      const prefixes = ["is", "has", "should", "can", "will", "did", "was", "are", "does"];
      const hasPrefix = prefixes.some((prefix) => name.startsWith(prefix) && name[prefix.length] === name[prefix.length]?.toUpperCase());
      return hasPrefix ? null : `Boolean '${name}' should start with is/has/should/can prefix`;
    },
    skipIfNull: true,
  },

  // ==================== Arrow Function Preference ====================

  // Function declarations (prefer arrow functions)
  {
    id: "prefer-arrow-function",
    pattern: /(?<!export\s+default\s+)function\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g,
    message: "Use arrow functions by default, function declarations only for overloads/generators/type guards",
    extract: (match) => `Found function declaration '${match[1]}' - prefer arrow function: const ${match[1]} = () =>`,
    skipInTests: true,
    skipInShared: true,
  },

  // ==================== JSDoc on Exports ====================

  // Exported functions without JSDoc
  {
    id: "missing-jsdoc-export",
    pattern: /(?<!\*\/\s*\n\s*)export\s+(?:const|function|class)\s+[a-zA-Z]/g,
    message: "Add JSDoc comment for exported functions/classes",
    extract: () => "Found export without JSDoc - add /** description */ above",
    skipInTests: true,
  },

  // ==================== Circular Import Detection ====================

  // Importing from parent directories in a way that could cause cycles
  {
    id: "potential-circular-import",
    pattern: /from\s+['"]\.\.\/\.\.\/[^'"]*['"]/g,
    message: "Deep parent imports may cause circular dependencies - consider restructuring",
    extract: () => "Found deep parent import (../../) - verify no circular dependency",
  },

  // ==================== Principal Engineer Standards ====================

  // Class inheritance (prefer composition)
  {
    id: "prefer-composition",
    pattern: /class\s+\w+\s+extends\s+(?!Error|AppError|ValidationError|AuthenticationError|NotFoundError|ExternalServiceError|LLMError)\w+/g,
    message: "Prefer composition over inheritance - use dependency injection instead",
    extract: () => "Found class inheritance - prefer composition over inheritance (SOLID)",
    skipInTests: true,
  },

  // Empty catch blocks (comprehensive error handling)
  {
    id: "empty-catch-block",
    pattern: /catch\s*\([^)]*\)\s*\{\s*\}/g,
    message: "Empty catch blocks swallow errors - handle or rethrow",
    extract: () => "Found empty catch block - add error handling or rethrow",
  },

  // Catch without logging or rethrowing
  {
    id: "silent-catch",
    pattern: /catch\s*\([^)]*\)\s*\{\s*\/\//g,
    message: "Catch blocks should log errors or rethrow - don't silently ignore",
    extract: () => "Found catch with only comment - add proper error handling",
  },

  // Console.log in production code
  {
    id: "console-log",
    pattern: /console\.(log|debug|info|warn|error)\s*\(/g,
    message: "Use logger from @kenchi/shared instead of console",
    extract: () => "Found console.* - use logger from @kenchi/shared",
    skipInTests: true,
  },

  // TODO/FIXME without ticket reference
  {
    id: "todo-without-ticket",
    pattern: /\/\/\s*(TODO|FIXME|HACK|XXX)(?!:?\s*\[|\s*#|\s*JIRA|\s*GH-)/gi,
    message: "TODOs should reference a ticket or issue number",
    extract: () => "Found TODO/FIXME without ticket reference - add issue number",
  },

  // Magic numbers (numeric literals in logic)
  {
    id: "magic-number",
    pattern: /(?:if|while|for|return|===|!==|>|<|>=|<=|\+|-|\*|\/)\s*\d{2,}(?!\d*[mshdwMY])/g,
    message: "Avoid magic numbers - use named constants",
    extract: () => "Found magic number - extract to named constant in shared/constants",
    skipInTests: true,
    skipInConstants: true,
    stripTemplateLiterals: true,
  },

  // ==================== Performance ====================

  // Array.from(set).some() anti-pattern
  {
    id: "array-from-set-iteration",
    pattern: /Array\.from\s*\([^)]+\)\s*\.\s*(?:some|every|find|filter|map|forEach)/g,
    message: "Iterate Set/Map directly instead of Array.from().method()",
    extract: () => "Found Array.from() with iteration - iterate directly instead",
  },

  // Nested loops (potential O(n^2))
  {
    id: "nested-loop-pattern",
    pattern: /\.(map|forEach|filter)\s*\([^)]*\)\s*\.\s*(?:map|forEach|filter)\s*\(/g,
    message: "Consider using Map/Set for O(1) lookups instead of nested iterations",
    extract: () => "Found nested iteration - consider Map/Set for O(1) lookups",
  },

  // ==================== Security ====================

  // Potential hardcoded secrets
  {
    id: "hardcoded-secret",
    pattern: /(?:password|secret|apiKey|api_key|token|auth)\s*[:=]\s*["'][^"']{8,}["']/gi,
    message: "Never hardcode secrets - use environment variables",
    extract: () => "Found potential hardcoded secret - use environment variables",
  },
];

// ==================== Utility Functions ====================

/**
 * Check if a file should be validated
 */
const shouldValidateFile = (filePath) => {
  const ext = path.extname(filePath);
  if (!TYPESCRIPT_EXTENSIONS.has(ext)) return false;

  const normalizedPath = filePath.replace(/\\/g, "/");
  return !Array.from(EXCLUDED_PATHS).some(
    (excluded) => normalizedPath.includes(excluded)
  );
};

/**
 * Check if file is in constants directory
 */
const isConstantsFile = (filePath) => {
  const normalizedPath = filePath.replace(/\\/g, "/");
  return normalizedPath.includes(CONSTANTS_FILE);
};

/**
 * Check if file is in shared package
 */
const isSharedFile = (filePath) => {
  const normalizedPath = filePath.replace(/\\/g, "/");
  return normalizedPath.includes("packages/shared/src");
};

/**
 * Check if file is a service file
 */
const isServiceFile = (filePath) => {
  const normalizedPath = filePath.replace(/\\/g, "/");
  return normalizedPath.includes("/services/") && normalizedPath.includes("/src/services/");
};

/**
 * Check if file is a test file
 */
const isTestFile = (filePath) => {
  const normalizedPath = filePath.replace(/\\/g, "/");
  return (
    normalizedPath.includes("__tests__") ||
    normalizedPath.includes(".test.") ||
    normalizedPath.includes(".spec.") ||
    normalizedPath.includes("/tests/")
  );
};

/**
 * Count lines in content
 */
const countLines = (content) => content.split("\n").length;

/**
 * Strip template literal content for certain validations.
 * Replaces content inside backticks with spaces to preserve line numbers.
 * Handles escaped backticks within template literals.
 */
const stripTemplateLiterals = (content) => {
  // Match template literals including escaped backticks: `...` or `...\`...`
  // (?:[^`\\]|\\.)* matches: non-backtick/non-backslash chars OR escaped chars
  return content.replace(/`(?:[^`\\]|\\.)*`/gs, (match) => {
    // Preserve newlines, replace other chars with spaces
    return match.replace(/[^\n]/g, " ");
  });
};

/**
 * Get line number for a match position
 */
const getLineNumber = (content, position) => {
  const lines = content.substring(0, position).split("\n");
  return lines.length;
};

// ==================== Main Validation ====================

/**
 * Validate a single file against all rules
 */
const validateFile = (filePath, content) => {
  const violations = [];
  const isConstants = isConstantsFile(filePath);
  const isShared = isSharedFile(filePath);
  const isService = isServiceFile(filePath);
  const isTest = isTestFile(filePath);

  // Check module size
  const lineCount = countLines(content);
  if (lineCount > MAX_MODULE_LINES) {
    violations.push({
      rule: "module-size",
      line: 1,
      message: `File has ${lineCount} lines (max ${MAX_MODULE_LINES}) - split into smaller modules`,
    });
  }

  // Pre-compute stripped content for rules that need it
  const strippedContent = stripTemplateLiterals(content);

  // Check each rule
  VALIDATION_RULES.forEach((rule) => {
    // Skip rules based on file location
    if (rule.skipInConstants && isConstants) return;
    if (rule.skipInShared && isShared) return;
    if (rule.onlyInServices && !isService) return;
    if (rule.skipInTests && isTest) return;

    // Use stripped content for rules that need template literals removed
    const contentToCheck = rule.stripTemplateLiterals ? strippedContent : content;

    // Reset regex lastIndex for global patterns
    rule.pattern.lastIndex = 0;

    const matches = contentToCheck.matchAll(rule.pattern);
    for (const match of matches) {
      const line = getLineNumber(contentToCheck, match.index);
      const message = rule.extract ? rule.extract(match) : rule.message;

      // Skip if extract returns null (for conditional rules like boolean-naming)
      if (rule.skipIfNull && message === null) continue;

      violations.push({
        rule: rule.id,
        line,
        message: message || rule.message,
      });
    }
  });

  return violations;
};

/**
 * Format violations for display
 */
const formatViolations = (violations) => {
  const header = `CLAUDE.md Standards Violations Found (${violations.length}):\n\n`;

  // Group by rule for cleaner output
  const byRule = {};
  violations.forEach((violation) => {
    if (!byRule[violation.rule]) {
      byRule[violation.rule] = [];
    }
    byRule[violation.rule].push(violation);
  });

  const details = Object.entries(byRule)
    .map(([rule, ruleViolations]) => {
      const ruleHeader = `[${rule}] (${ruleViolations.length} occurrence${ruleViolations.length > 1 ? 's' : ''})`;
      const items = ruleViolations
        .slice(0, 5) // Limit to 5 per rule to avoid overwhelming output
        .map((v) => `  - Line ${v.line}: ${v.message}`)
        .join("\n");
      const more = ruleViolations.length > 5
        ? `\n  ... and ${ruleViolations.length - 5} more`
        : "";
      return `${ruleHeader}\n${items}${more}`;
    })
    .join("\n\n");

  return header + details + "\n\nPlease fix these issues to comply with CLAUDE.md standards.";
};

/**
 * Main entry point
 */
const main = () => {
  let input = "";

  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    input += chunk;
  });

  process.stdin.on("end", () => {
    try {
      const data = JSON.parse(input);
      const allViolations = [];

      // Handle tool_input for Edit/Write tools
      if (data.tool_input) {
        const toolInput = data.tool_input;
        const filePath = toolInput.file_path;

        if (filePath && shouldValidateFile(filePath)) {
          // For Edit tool, check the new content
          // For Write tool, check the full content
          const contentToCheck = toolInput.new_string || toolInput.content || "";

          if (contentToCheck) {
            const violations = validateFile(filePath, contentToCheck);
            violations.forEach((violation) => {
              allViolations.push({
                file: filePath,
                ...violation,
              });
            });
          }
        }
      }

      // Output results
      if (allViolations.length > 0) {
        const output = {
          decision: "block",
          reason: formatViolations(allViolations),
        };
        console.log(JSON.stringify(output));
      } else {
        console.log(JSON.stringify({ decision: "approve" }));
      }
      process.exit(0);
    } catch (error) {
      // If we can't parse input, approve by default to not block workflow
      console.log(JSON.stringify({ decision: "approve" }));
      process.exit(0);
    }
  });
};

// Run
main();

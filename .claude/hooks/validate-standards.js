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
  "config",
  "errorHandler",
  "asyncHandler",
  "requestLogger",
  "validate",
  "validators",
  "createRateLimiter",
  "defaultRateLimiter",
  "OpenAIClient",
  "confidenceScore",
  "shouldActOnResult",
  "deduplicateByKey",
  "getErrorMessage",
  "shouldExcludePath",
  "httpClient",
  "fetchWithTimeout",
  "withRetry",
  "classifyHttpError",
  "startTimer",
  "redactSecrets",
  "truncate",
  "invariant",
  "assertUnreachable",
  "idempotencyStore",
]);

/**
 * Error classes that must be imported from @kenchi/shared
 */
const SHARED_ERROR_CLASSES = new Set([
  "AppError",
  "ValidationError",
  "AuthenticationError",
  "AuthorizationError",
  "NotFoundError",
  "ExternalServiceError",
  "LLMError",
  "RateLimitError",
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
  "RequestContext",
  "HttpResponse",
  "ClassifiedError",
]);

/**
 * Vendor SDKs that should NOT be imported in services
 */
const VENDOR_SDK_PATTERNS = [
  "@octokit",
  "@slack/",
  "openai",
  "node-fetch",
  "axios",
];

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

  // ==================== Vendor SDK Restrictions ====================

  // Vendor SDK imports in services (not adapters)
  {
    id: "vendor-sdk-in-service",
    pattern: /import\s+(?:type\s+)?(?:\{[^}]*\}|[^{}\s]+)\s+from\s+['"](?:@octokit|@slack\/|openai|node-fetch|axios)[^'"]*['"]/g,
    message: "Vendor SDKs not allowed in services - use adapters or shared httpClient",
    extract: () => "Found vendor SDK import in service - move to adapter layer",
    onlyInServices: true,
    skipInAdapters: true,
  },

  // Direct fetch calls (should use httpClient)
  {
    id: "direct-fetch",
    pattern: /(?<!http(?:Client|s?)\.)\bfetch\s*\(/g,
    message: "Use shared httpClient instead of direct fetch calls",
    extract: () => "Found direct fetch() call - use httpClient from @kenchi/shared",
    skipInShared: true,
    skipInAdapters: true,
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

  // ==================== Error Handling ====================

  // Plain Error throw (should use typed errors)
  {
    id: "plain-error-throw",
    pattern: /throw\s+new\s+Error\s*\(/g,
    message: "Use typed errors (ValidationError, NotFoundError, etc.) instead of plain Error. Exception: invariant() for programmer bugs",
    extract: () => "Found 'throw new Error()' - use typed errors from @kenchi/shared",
    skipInTests: true,
  },

  // Empty catch blocks
  {
    id: "empty-catch-block",
    pattern: /catch\s*\([^)]*\)\s*\{\s*\}/g,
    message: "Empty catch blocks swallow errors - handle or rethrow",
    extract: () => "Found empty catch block - add error handling or rethrow",
  },

  // ==================== RequestContext Propagation ====================

  // Service methods missing context parameter
  {
    id: "service-missing-context",
    pattern: /export\s+(?:const|async\s+function)\s+\w+\s*=?\s*async\s*\([^)]*\)\s*(?::\s*Promise)?[^{]*\{(?![\s\S]{0,200}context)/g,
    message: "Service methods doing I/O should accept RequestContext as last parameter",
    extract: () => "Found async function without context parameter - add RequestContext",
    onlyInServices: true,
    skipInTests: true,
  },

  // ==================== External Call Logging ====================

  // External call log missing durationMs
  {
    id: "missing-duration-ms",
    pattern: /logger\.(info|error|warn)\s*\(\s*["'`][^"'`]*(?:call|request|response|api|external)[^"'`]*["'`]\s*,\s*\{(?![\s\S]{0,150}durationMs)[^}]*\}/gi,
    message: "External call logs must include durationMs",
    extract: () => "Found external call log without durationMs - add timing measurement",
    skipInTests: true,
  },

  // External call log missing provider
  {
    id: "missing-provider",
    pattern: /logger\.(info|error|warn)\s*\(\s*["'`][^"'`]*(?:call|request|response|api|external)[^"'`]*["'`]\s*,\s*\{(?![\s\S]{0,100}provider)[^}]*\}/gi,
    message: "External call logs must include provider field",
    extract: () => "Found external call log without provider - add provider: 'github'|'slack'|'openai'",
    skipInTests: true,
    onlyInAdapters: true,
  },

  // ==================== Naming Conventions ====================

  // Single-letter callback parameters in array methods
  {
    id: "single-letter-callback",
    pattern: /\.(map|filter|reduce|forEach|some|every|find|findIndex|flatMap|sort)\s*\(\s*\(([a-zA-Z])\s*[,)]/g,
    message: "Use descriptive callback parameter names instead of single letters",
    extract: (match) => `Found single-letter '${match[2]}' in .${match[1]}() - use descriptive name`,
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

  // ==================== Webhook Replay Protection ====================

  // Webhook handler without delivery ID check
  {
    id: "webhook-missing-idempotency",
    pattern: /(?:handleWebhook|webhookHandler|processWebhook)\s*=\s*(?:async\s*)?\([^)]*\)\s*(?::\s*[^=>{]*)?=>\s*\{(?![\s\S]{0,300}(?:deliveryId|delivery_id|eventId|event_id|idempotency))/gi,
    message: "Webhook handlers must check delivery ID for replay protection",
    extract: () => "Found webhook handler without replay protection - add delivery ID check",
    skipInTests: true,
  },

  // ==================== Secrets & PII ====================

  // Logging raw request body
  {
    id: "logging-raw-body",
    pattern: /logger\.\w+\s*\([^,]+,\s*\{[^}]*(?:body:\s*req\.body|payload:\s*(?:req\.body|event|webhook))[^}]*\}/g,
    message: "Never log raw request body - extract only needed fields or use redactSecrets()",
    extract: () => "Found raw body logging - extract specific fields or use redactSecrets()",
    skipInTests: true,
  },

  // Potential hardcoded secrets
  {
    id: "hardcoded-secret",
    pattern: /(?:password|secret|apiKey|api_key|token|auth)\s*[:=]\s*["'][^"']{8,}["']/gi,
    message: "Never hardcode secrets - use environment variables",
    extract: () => "Found potential hardcoded secret - use environment variables",
  },

  // ==================== Console Usage ====================

  // Console.log in production code
  {
    id: "console-log",
    pattern: /console\.(log|debug|info|warn|error)\s*\(/g,
    message: "Use logger from @kenchi/shared instead of console",
    extract: () => "Found console.* - use logger from @kenchi/shared",
    skipInTests: true,
    skipInScripts: true,
  },

  // ==================== Architecture Boundaries ====================

  // Services importing other services
  {
    id: "service-importing-service",
    pattern: /from\s+['"]\.\.\/services\//g,
    message: "Services should not import other services - use dependency injection",
    extract: () => "Found service importing another service - use dependency injection",
    onlyInServices: true,
  },

  // Business logic in handlers (complex processing patterns)
  {
    id: "business-logic-in-handler",
    pattern: /(?:router\.|app\.(?:get|post|put|delete|patch))\s*\([^,]+,\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{[\s\S]{500,}?\}/g,
    message: "Business logic should be in services, not route handlers",
    extract: () => "Found complex logic in handler - move to service layer",
    onlyInRoutes: true,
    skipInTests: true,
  },

  // ==================== Database Module Pattern ====================

  // Self-referencing @kenchi/shared within shared package
  {
    id: "shared-self-import",
    pattern: /import\s+(?:type\s+)?(?:\{[^}]*\}|[^{}\s]+)\s+from\s+['"]@kenchi\/shared['"]/g,
    message: "Within shared package, use relative imports not @kenchi/shared",
    extract: () => "Found @kenchi/shared import in shared package - use relative import",
    onlyInShared: true,
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

  // ==================== TODO/FIXME ====================

  // TODO/FIXME without ticket reference
  {
    id: "todo-without-ticket",
    pattern: /\/\/\s*(TODO|FIXME|HACK|XXX)(?!:?\s*\[|\s*#|\s*JIRA|\s*GH-)/gi,
    message: "TODOs should reference a ticket or issue number",
    extract: () => "Found TODO/FIXME without ticket reference - add issue number",
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
  return (
    normalizedPath.includes("/services/") &&
    normalizedPath.includes("/src/services/")
  );
};

/**
 * Check if file is an adapter file
 */
const isAdapterFile = (filePath) => {
  const normalizedPath = filePath.replace(/\\/g, "/");
  return normalizedPath.includes("/adapters/");
};

/**
 * Check if file is a route/handler file
 */
const isRouteFile = (filePath) => {
  const normalizedPath = filePath.replace(/\\/g, "/");
  return (
    normalizedPath.includes("/routes/") ||
    normalizedPath.includes("/handlers/")
  );
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
 * Check if file is a script file
 */
const isScriptFile = (filePath) => {
  const normalizedPath = filePath.replace(/\\/g, "/");
  return normalizedPath.includes("/scripts/");
};

/**
 * Count lines in content
 */
const countLines = (content) => content.split("\n").length;

/**
 * Strip template literal content for certain validations.
 */
const stripTemplateLiterals = (content) => {
  return content.replace(/`(?:[^`\\]|\\.)*`/gs, (match) => {
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
  const isAdapter = isAdapterFile(filePath);
  const isRoute = isRouteFile(filePath);
  const isTest = isTestFile(filePath);
  const isScript = isScriptFile(filePath);

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
    if (rule.skipInAdapters && isAdapter) return;
    if (rule.onlyInAdapters && !isAdapter) return;
    if (rule.onlyInRoutes && !isRoute) return;
    if (rule.onlyInShared && !isShared) return;
    if (rule.skipInTests && isTest) return;
    if (rule.skipInScripts && isScript) return;

    // Use stripped content for rules that need template literals removed
    const contentToCheck = rule.stripTemplateLiterals ? strippedContent : content;

    // Reset regex lastIndex for global patterns
    rule.pattern.lastIndex = 0;

    const matches = contentToCheck.matchAll(rule.pattern);
    for (const match of matches) {
      const line = getLineNumber(contentToCheck, match.index);
      const message = rule.extract ? rule.extract(match) : rule.message;

      // Skip if extract returns null
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
      const ruleHeader = `[${rule}] (${ruleViolations.length} occurrence${ruleViolations.length > 1 ? "s" : ""})`;
      const items = ruleViolations
        .slice(0, 5)
        .map((violation) => `  - Line ${violation.line}: ${violation.message}`)
        .join("\n");
      const more =
        ruleViolations.length > 5
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
      // If we can't parse input, approve by default
      console.log(JSON.stringify({ decision: "approve" }));
      process.exit(0);
    }
  });
};

// Run
main();

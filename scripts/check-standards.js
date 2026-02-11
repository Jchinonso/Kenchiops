#!/usr/bin/env node
/**
 * Pre-commit Standards Check
 *
 * Validates staged files against CLAUDE.md coding standards.
 * Runs as part of the git pre-commit hook.
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const EXCLUDED_PATHS = ["node_modules", "dist", "coverage", "__tests__", ".test.", ".spec.", "core/logger.ts"];

const RULES = [
  {
    id: "console-log",
    pattern: /console\.(log|debug|info|warn|error)\s*\(/g,
    message: "Use logger from @kenchi/shared instead of console.*",
    skipInTests: true,
    skipInScripts: true,
  },
  {
    id: "empty-catch-block",
    pattern: /catch\s*\([^)]*\)\s*\{\s*\}/g,
    message: "Empty catch block - add error handling or rethrow",
  },
  {
    id: "todo-without-ticket",
    pattern: /\/\/\s*(TODO|FIXME)(?!:?\s*\[|\s*#)/gi,
    message: "TODO/FIXME without ticket reference",
  },
  {
    id: "direct-process-env",
    pattern: /process\.env\.\w+/g,
    message: "Access env vars through @kenchi/shared config module, not process.env",
    skipInTests: true,
    skipInScripts: true,
    skipInConfig: true,
  },
  {
    id: "plain-error-throw",
    pattern: /throw\s+new\s+Error\s*\(/g,
    message: "Use typed errors (ValidationError, NotFoundError, etc.) from @kenchi/shared",
    skipInTests: true,
  },
  {
    id: "sql-string-interpolation",
    pattern: /(?:query|execute|sql)\s*\(\s*`[^`]*\$\{/gi,
    message: "SQL string interpolation detected - use parameterized queries",
    skipInTests: true,
  },
  {
    id: "unsafe-any-type",
    pattern: /as\s+any\b/g,
    message: "Avoid 'as any' - use proper typing or type guards",
    skipInTests: true,
  },
];

function getStagedFiles() {
  try {
    const output = execSync("git diff --cached --name-only --diff-filter=ACM", {
      encoding: "utf8",
    });
    return output
      .split("\n")
      .filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"))
      .filter((file) => !EXCLUDED_PATHS.some((excluded) => file.includes(excluded)));
  } catch {
    return [];
  }
}

function checkFile(filePath) {
  const violations = [];
  const isTest = filePath.includes("__tests__") || filePath.includes(".test.") || filePath.includes(".spec.");
  const isScript = filePath.includes("/scripts/");
  const isConfig = filePath.includes("/config/") || filePath.includes("/config.ts") || filePath.includes("/core/config");

  try {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split("\n");

    RULES.forEach((rule) => {
      if (rule.skipInTests && isTest) return;
      if (rule.skipInScripts && isScript) return;
      if (rule.skipInConfig && isConfig) return;

      lines.forEach((line, index) => {
        if (rule.pattern.test(line)) {
          violations.push({
            file: filePath,
            line: index + 1,
            rule: rule.id,
            message: rule.message,
          });
        }
        rule.pattern.lastIndex = 0;
      });
    });
  } catch {
    // Skip files that can't be read
  }

  return violations;
}

function main() {
  const files = getStagedFiles();

  if (files.length === 0) {
    process.exit(0);
  }

  const allViolations = [];

  files.forEach((file) => {
    const violations = checkFile(file);
    allViolations.push(...violations);
  });

  if (allViolations.length === 0) {
    console.log("✅ Standards check passed");
    process.exit(0);
  }

  console.log(`\n❌ Found ${allViolations.length} standards violation(s):\n`);

  const byRule = {};
  allViolations.forEach((violation) => {
    if (!byRule[violation.rule]) {
      byRule[violation.rule] = [];
    }
    byRule[violation.rule].push(violation);
  });

  Object.entries(byRule).forEach(([rule, ruleViolations]) => {
    console.log(`[${rule}] (${ruleViolations.length})`);
    ruleViolations.forEach((violation) => {
      console.log(`  ${violation.file}:${violation.line} - ${violation.message}`);
    });
    console.log("");
  });

  process.exit(1);
}

main();

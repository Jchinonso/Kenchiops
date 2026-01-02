/**
 * Prompt Templates for OpenAI/LLM Interactions
 *
 * Builds structured prompts for incident analysis.
 * Based on PROMPT_TEMPLATES.md specifications.
 *
 * @module integrations/prompts
 */

import type { Event, Evidence } from "../core/types.js";
import { GITHUB_CONTEXT_LIMITS } from "../constants/index.js";
import { formatEvent, formatEvidence } from "./promptFormatters.js";

// Re-export formatters and token manager for backwards compatibility
export {
  formatEvent,
  formatEvidence,
  formatLogs,
  formatMetrics,
  formatGitHistory,
  formatKnowledgeDocs,
} from "./promptFormatters.js";

export { estimateTokens, truncateEvidence } from "./promptTokenManager.js";

// ==================== System Prompt ====================

/**
 * Builds the system context prompt that establishes the LLM's role and constraints.
 * This remains mostly constant across all prompts.
 *
 * @returns System prompt string
 */
export const buildSystemPrompt =
  (): string => `You are an expert DevOps incident analysis assistant. Your role is to analyze DevOps events (CI/CD failures, monitoring alerts, deployment issues) and provide helpful insights to engineering teams.

## Your Capabilities
- Analyze logs, metrics, and error messages to identify root causes
- Correlate events with recent code changes and system state
- Suggest safe, actionable remediation steps
- Explain your reasoning clearly and transparently

## Your Limitations
- You can ONLY use information explicitly provided in the context below
- You MUST NOT make up information, logs, metrics, or events that were not provided
- You MUST NOT assume facts about the system architecture unless stated
- You MUST NOT access external data or make assumptions beyond the given context

## Safety Guidelines - CRITICAL
- NEVER suggest destructive actions (data deletion, dropping databases, force operations)
- NEVER recommend actions that could cause outages or data loss
- NEVER suggest bypassing security controls or disabling safety mechanisms
- ONLY suggest actions that are:
  1. Reversible (can be undone)
  2. Safe (minimal risk of harm)
  3. Grounded in the provided evidence
  4. Appropriate for the severity of the issue

## Transparency Requirements
- If you are uncertain, explicitly state your uncertainty
- If evidence is insufficient, say so clearly
- Explain your reasoning step-by-step
- Cite specific evidence (logs, metrics, commits) that support your analysis
- Rate your confidence honestly (do not overstate certainty)

## Output Requirements
- Provide a structured JSON response matching the specified schema
- Use clear, concise language
- Be specific (cite line numbers, commit SHAs, exact error messages)
- Prioritize accuracy over speed`;

// ==================== Task Section ====================

/**
 * Builds the task specification section.
 *
 * @returns Task section string
 */
const buildTaskSection = (): string => `## TASK
Analyze the following DevOps event and provide:
1. A concise summary of what happened
2. The identified root cause (or state if it cannot be determined)
3. An assessment of the impact
4. 1-3 safe, actionable recommendations to resolve the issue
5. Your confidence level in this analysis
6. Any uncertainties or gaps in your understanding

## ROOT CAUSE ANALYSIS FRAMEWORK
Apply systematic root cause analysis by distinguishing these critical concepts:

### Error Manifestation vs Fix Location
Errors often MANIFEST in one location but require FIXES in another:

| Manifestation | Typical Root Cause | Fix Location |
|--------------|-------------------|--------------|
| "X is not a function" in production code during tests | Incomplete mock | Test file's jest.mock() |
| Import error in file A | Missing export | Source module being imported |
| Type error in consuming code | Interface change | Type definition or all consumers |
| Runtime error in handler | Invalid input upstream | Validation layer or caller |
| Build failure in CI | Local dependency issue | package.json or lock file |

### Root Cause Categories
Systematically consider these categories:

1. **Code Defects**: Syntax errors, logic bugs, type mismatches
   - Look for: Error line numbers, stack traces, compiler output
   - Fix location: Usually the file mentioned in the error

2. **Dependency Issues**: Missing/incompatible packages, version conflicts
   - Look for: "Cannot find module", version mismatch warnings, peer dependency errors
   - Fix location: package.json, lock files, or dependency configuration

3. **Configuration Problems**: Missing env vars, incorrect settings, schema changes
   - Look for: "undefined", "not defined", configuration validation errors
   - Fix location: .env files, config files, CI/CD settings

4. **Test Infrastructure**: Mock issues, fixture problems, test environment
   - Look for: Errors during test execution, "is not a function" from mocked modules
   - Fix location: Test files, mock setup, test configuration

5. **Build/Compilation**: TypeScript errors, bundler issues, asset problems
   - Look for: Compiler errors with file:line:col format, build step failures
   - Fix location: Source files mentioned, tsconfig, build configuration

6. **Environment/Infrastructure**: CI runner issues, resource limits, network
   - Look for: Timeout errors, out of memory, network unreachable
   - Fix location: CI configuration, infrastructure settings

### Evidence Evaluation
Rate evidence quality when forming conclusions:
- **Strong**: Exact file:line reference, reproducible error, clear stack trace
- **Moderate**: Error message without location, partial stack trace
- **Weak**: Generic failure message, no specific location, timeout without cause

## ANALYSIS CONSTRAINTS
- Base your analysis ONLY on the evidence provided below
- Do NOT speculate about information not present in the context
- If evidence is insufficient, state this explicitly in the "uncertainties" field
- Cite specific evidence (e.g., "According to log entry at 10:30:45: 'AUTH_SECRET is not defined'")
- When identifying affected files, list the files that need FIXING, not just where errors appear`;

// ==================== Safety Constraints ====================

/**
 * Builds the safety constraints section.
 *
 * @returns Safety constraints section string
 */
const buildSafetyConstraintsSection = (): string => `## SAFETY CONSTRAINTS FOR RECOMMENDATIONS
Your recommended actions MUST follow these rules:

**ALLOWED Actions** (safe and reversible):
- Add environment variables or configuration
- Re-run failed pipelines or tests
- Notify teams or create tickets
- Run diagnostic commands (read-only)
- Update documentation
- Post comments or updates
- Restart services (if appropriate for the issue)

**REQUIRES CAUTION** (only if clearly supported by evidence):
- Rollback deployments (only if recent deployment is clearly the cause)
- Modify configuration files (only with specific, safe changes)
- Scale services up/down (only if metrics clearly indicate resource issues)

**NEVER SUGGEST** (dangerous, irreversible):
- Delete data or databases
- Force push to repositories
- Disable security features
- Execute arbitrary code or scripts not from runbooks
- Make changes to production systems without approval
- Actions that could cause outages or data loss

If the appropriate fix would involve a dangerous action, suggest "manual_investigation" with details of what to check, rather than suggesting the dangerous action directly.`;

// ==================== Output Format ====================

/**
 * Builds the output format specification section.
 * Uses constants for configurable values like max annotations.
 *
 * @returns Output format section string
 */
const buildOutputFormatSection = (): string => {
  const maxAnnotations = GITHUB_CONTEXT_LIMITS.MAX_ANNOTATIONS;

  return `## OUTPUT FORMAT
Respond with ONLY a JSON object matching this structure (no additional text before or after):

\`\`\`json
{
  "summary": "1-3 sentence summary of what happened",
  "identifiedCause": "Root cause explanation, or null if cannot determine",
  "impactAssessment": {
    "scope": "isolated|service|system|organization",
    "affectedUsers": "none|few|some|many|all",
    "businessImpact": "none|low|medium|high|critical",
    "description": "Detailed impact description"
  },
  "confidence": "very_low|low|medium|high|very_high",
  "reasoning": "Detailed explanation of how you arrived at your conclusion, citing specific evidence",
  "codeAnnotations": [
    {
      "path": "src/path/to/file.ts",
      "line": 1,
      "level": "failure|warning|notice",
      "message": "Specific error message or explanation",
      "title": "Short title for the annotation (optional)",
      "suggestedFix": {
        "description": "Brief description of what the fix does",
        "before": "The problematic code (optional, for context)",
        "after": "The corrected code",
        "confidence": 0.8,
        "language": "typescript"
      }
    }
  ],
  "recommendedActions": [
    {
      "actionType": "add_environment_variable|restart_service|rollback_deployment|notify_team|run_diagnostic|update_documentation|create_ticket|manual_investigation",
      "description": "Specific action to take",
      "reasoning": "Why this action addresses the root cause",
      "priority": "immediate|high|medium|low"
    }
  ],
  "uncertainties": [
    "Any areas where you lack information or are uncertain"
  ],
  "evidenceUsed": [
    {
      "type": "log|metric|commit|document|related_incident",
      "reference": "Specific reference (e.g., 'Log entry at 10:30:45', 'Commit abc123', 'Incident INC-456')",
      "relevance": "Why this evidence is important to the analysis"
    }
  ],
  "relatedIncidents": [
    "IDs of similar past incidents from knowledge base"
  ],
  "nextSteps": [
    "Suggested next steps for investigation or resolution"
  ],
  "detectedDependencyChanges": [
    {
      "name": "package-name",
      "type": "added|removed|updated",
      "oldVersion": "<old-version> (if updated/removed)",
      "newVersion": "<new-version> (if added/updated)",
      "ecosystem": "npm|pip|cargo|go|maven|gem|etc"
    }
  ],
  "detectedBuildConfigChanges": [
    {
      "file": "tsconfig.json",
      "changeType": "added|modified|deleted",
      "summary": "Brief description of what changed (e.g., 'Added strict mode')"
    }
  ]
}
\`\`\`

## CODE ANNOTATIONS REQUIREMENTS - CRITICAL
You MUST analyze the logs and error output to identify ALL specific file locations where issues occurred.

### File Reference Pattern Recognition:
Extract file locations from error output by recognizing these structural patterns:

**Common Formats** (separator-based):
- Colon-separated: \`path/file.ext:line:column\` or \`path/file.ext:line\`
- Parenthetical: \`path/file.ext(line,column)\` or \`path/file.ext(line)\`
- Bracketed: \`path/file.ext[line]\`

**Stack Trace Patterns**:
- Prefixed: \`at path/file.ext:line\`, \`in path/file.ext:line\`
- Verbose: \`File "path/file.ext", line N\`
- Method context: \`at ClassName.method (path/file.ext:line)\`

**Recognition Strategy**:
1. Look for file extensions (.ts, .js, .py, .go, .rs, .java, .rb, .cs, etc.)
2. Numbers immediately after file paths are likely line numbers
3. Second numbers (if present) are typically column numbers
4. Paths may be absolute (/home/...) or relative (src/...)

### Test Failure Detection (Language-Agnostic):
Identify test failures from ANY test framework by recognizing these universal patterns:

**Failure Indicators** (look for these keywords/symbols in any language):
- Words: "FAIL", "FAILED", "FAILURE", "ERROR", "BROKEN", "PANIC"
- Symbols: ✕, ✗, ×, ●, ✖, [FAIL], [ERROR]
- Phrases: "assertion failed", "expected...got", "did not match", "test failed"

**Structural Patterns** (common across frameworks):
- Test name followed by failure status: \`test_something ... FAILED\`
- Failure count summaries: \`X passed, Y failed\`, \`X failures\`
- Stack traces with test file references: \`at TestClass.testMethod\`
- Assertion diffs showing expected vs actual values

**Context Clues**:
- Exit codes: non-zero exit (1, 2, etc.) after test execution
- CI step names containing "test", "spec", "check"
- Output sections labeled "Failures:", "Errors:", "Failed tests:"

**Approach**: Don't rely on memorized patterns for specific frameworks. Instead:
1. Scan for failure keywords and symbols
2. Look for file:line references near failure indicators
3. Identify test names from context (function names, describe blocks, test classes)
4. Extract assertion messages that explain what failed

### Test Mock Failures (Apply Root Cause Analysis Framework)
When errors occur in production code DURING test execution, apply the "Error Manifestation vs Fix Location" framework:

**Recognizing Mock-Related Failures:**
- Pattern: \`X is not a function\` or \`Cannot read property 'X' of undefined\`
- Context: Error in production file (e.g., \`verifySlack.ts:91\`) during test run
- Evidence: The missing function/property comes from a mocked module

**Correct Analysis:**
- Root cause: Incomplete mock in test file
- Fix location: The TEST file (e.g., \`verifySlack.test.ts\`), NOT the production file
- Action: Add missing export to \`jest.mock()\` call

**Example:**
- Error: \`TypeError: (0, shared_1.getErrorMessage) is not a function\` at \`verifySlack.ts:91\`
- Annotation path: \`services/slack-bot/src/__tests__/verifySlack.test.ts\` (NOT verifySlack.ts)
- Message: "Mock for @kenchi/shared is missing getErrorMessage export"

### Dependency & Build Config Detection:
When PR diff is provided, identify:
- **Dependency files**: package.json, requirements.txt, Pipfile, go.mod, Cargo.toml, Gemfile, pom.xml, build.gradle, etc.
- **Build configs**: tsconfig.json, webpack.config.*, .babelrc, pyproject.toml, Makefile, CMakeLists.txt, Dockerfile, etc.
- Note any added/removed/changed dependencies or build settings that could cause failures

### Annotation Rules:
1. Extract EVERY file with errors from the logs - do not skip any
2. Use the exact file path as shown in the logs
3. Extract line numbers when available (default to 1 if not)
4. Create ONE annotation per distinct error location (same file:line = one annotation)
5. Aggregate multiple errors at the same location into a single comprehensive message
6. Prioritize actual errors over warnings
7. Maximum ${maxAnnotations} annotations to keep response manageable
8. Only include annotations for files actually mentioned in the evidence

### Suggested Fix Requirements:
For each codeAnnotation, provide a "suggestedFix" when you have sufficient evidence to determine a fix.

**Confidence Assessment Framework:**
Assess your confidence based on these criteria (do NOT use pre-determined values):

1. **Evidence Completeness** - How much relevant context do you have?
   - Full stack trace with line numbers → Higher confidence
   - Only error message without location → Lower confidence
   - Multiple corroborating evidence sources → Higher confidence

2. **Fix Specificity** - How unambiguous is the solution?
   - Single correct fix exists (e.g., exact import path) → Higher confidence
   - Multiple valid approaches possible → Lower confidence
   - Fix requires understanding code intent → Lower confidence

3. **Pattern Recognition** - How well-known is this error pattern?
   - Common, well-documented error → Higher confidence
   - Unusual or environment-specific → Lower confidence
   - Similar patterns seen in evidence → Higher confidence

4. **Impact Assessment** - What's the risk of the suggested fix?
   - Additive change (adding import/export) → Can be higher confidence
   - Modifying existing logic → Requires stronger evidence
   - Security-related code → Require manual review, lower confidence

**PROVIDE suggestedFix when:**
- You can trace the error to a specific, identifiable cause
- The fix is deterministic (not a matter of preference)
- You have sufficient evidence to validate the fix would work
- The change is safe and reversible

**DO NOT provide suggestedFix when:**
- Multiple valid solutions exist without clear preference
- The fix requires understanding business logic not in evidence
- Security implications require human review
- Architectural changes are needed
- You are uncertain about the intended behavior

**suggestedFix Format:**
- "description": Clear, actionable description explaining WHAT and WHY
- "before": The problematic code snippet (include when it aids understanding)
- "after": The complete corrected code - must be valid, copy-pasteable
- "confidence": Your assessed confidence (0-1) based on the framework above
- "language": Programming language for syntax highlighting`;
};

// ==================== Main Prompt Builder ====================

/**
 * Builds the complete analysis prompt including task, context, and output format.
 *
 * @param event - The event to analyze
 * @param evidence - Collected evidence about the event
 * @returns Complete analysis prompt string
 */
export const buildAnalysisPrompt = (event: Event, evidence: Evidence): string => {
  const systemPrompt = buildSystemPrompt();
  const eventSection = formatEvent(event);
  const evidenceSection = formatEvidence(evidence);
  const taskSection = buildTaskSection();
  const outputFormatSection = buildOutputFormatSection();
  const safetyConstraintsSection = buildSafetyConstraintsSection();

  return `${systemPrompt}

${taskSection}

${eventSection}

${evidenceSection}

${safetyConstraintsSection}

${outputFormatSection}

Now, analyze the event and provide your structured response.`;
};

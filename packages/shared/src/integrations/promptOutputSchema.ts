/**
 * Output Schema for Analysis Prompts
 *
 * Defines the output format specification and schema for LLM analysis responses.
 * This is a detailed template that guides the LLM on how to structure its output.
 *
 * @module integrations/promptOutputSchema
 */

// ==================== Schema Sections ====================

/**
 * Builds the hard rules and JSON schema structure section.
 */
const buildHardRulesSection = (): string =>
  `Respond with ONLY a raw JSON object (no markdown code fences, no backticks, no text outside JSON).

HARD RULES:
- Output MUST be valid JSON parseable by a strict JSON parser.
- Output MUST start with "{" and end with "}".
- Do NOT include markdown, backticks, comments, or any text outside JSON.
- Do NOT include trailing commas.
- If you cannot comply, output this exact JSON:
  {"root_cause":"unknown","confidence":"low","category":"unknown","phase":"unknown","annotations":[],"next_steps":["Provide full failing step logs and the earliest error lines."],"secondary_findings":[]}
- If you use the fallback, do not include any other keys.

SCHEMA:
{
  "root_cause": "Brief summary of the earliest causal error",
  "confidence": "low|medium|high",
  "category": "dependency|build|test|runtime|config|infra|unknown",
  "phase": "dependency|build|test|deploy|runtime|unknown",
  "annotations": [
    {
      "evidence_id": "log#1",
      "snippet": "Exact text from log (redact secrets with ***REDACTED***)",
      "explanation": "Why this matters"
    }
  ],
  "test_failures": [
    {
      "test_name": "full::test::name or TestClass.testMethod",
      "file": "path/to/file.ext",
      "line": 123,
      "expected": "expected value from assertion",
      "actual": "actual/received value from assertion",
      "error_message": "Brief error description"
    }
  ],
  "lint_errors": [
    {
      "code": "unused_variable or error_code",
      "message": "Specific error message from compiler/linter",
      "file": "path/to/file.ext",
      "line": 123,
      "column": 5,
      "symbol": "variable_name or function_name",
      "suggestion": "Suggested fix if available"
    }
  ],
  "next_steps": [
    { "action": "Run cargo fmt and commit formatting changes", "reason": "CI format check is failing", "priority": 1 },
    { "action": "Fix clippy errors in src/main.rs", "reason": "Lint errors gate merge", "priority": 1 },
    { "action": "Fix off-by-one bug in add/subtract functions", "reason": "12 assertion failures show systematic +1 shift", "priority": 2 }
  ],
  "test_command": "command to run failing tests locally (e.g., cargo test, npm test, pytest)",
  "secondary_findings": [
    { "summary": "Description of independent issue", "evidence_ids": ["log#N"], "severity": "warning" }
  ]
}`;

/**
 * Builds the core field requirements section (root_cause, confidence, category, phase).
 */
const buildCoreFieldRequirementsSection = (): string =>
  `### FIELD REQUIREMENTS

**root_cause** (required): One-line summary of earliest causal error.

**confidence** (required): Based on evidence clarity:
- **high**: ALL of the following must be true:
  - Explicit expected vs actual values shown AND
  - Root cause is directly supported by cited snippets AND
  - File + line + clear error message available AND
  - Single plausible cause (no ambiguity)
  - If "intentional/wrong expected" markers exist, confidence MUST be high
- **medium**: Clear failures visible but:
  - Unclear whether tests or implementation changed OR
  - Multiple plausible causes OR
  - Incomplete stack trace
- **low**: Any of the following:
  - Generic "tests failed" without specifics
  - Missing detail or no assertion lines
  - Timeouts or infrastructure issues without clear cause
  - No file/line location available
Confidence must match annotation strength:
- For **high** confidence, include at least one annotation snippet that contains an explicit error marker (ERROR/Exception/panic/Traceback) and a location (file:line) or other clear causal indicator. Otherwise, cap confidence at "medium".
Confidence alignment:
- Every annotation must directly support the stated root_cause.
- If annotations only support secondary failures, revise root_cause or set confidence="low".
- The first annotation must support the root_cause directly (not a secondary symptom).

**category** (required): Type of failure:
- dependency: Package/module resolution failures
- build: Compilation, transpilation, or build system errors
- test: Assertion or test execution failures
- runtime: Exceptions during execution
- config: Environment variables, settings, schema issues
- infra: CI runner, resources, network issues
- unknown: Cannot determine

**phase** (required): Pipeline phase where failure occurred:
- dependency: Package installation
- build: Compilation/transpilation
- test: Test execution
- deploy: Deployment steps
- runtime: Application runtime
- config: Configuration/environment setup
- unknown: Cannot determine`;

/**
 * Builds the annotations field requirements section.
 */
const buildAnnotationsRequirementsSection = (): string =>
  `**annotations** (required, 0-10 items): Evidence supporting root cause. Must be non-empty when confidence is medium/high; may be empty only when evidence is insufficient and confidence is low. Prefer 1-3 annotations; use up to 10 only when necessary. If you cannot cite at least one evidence_id + snippet for the stated root_cause, you MUST set confidence="low" and category/phase may be "unknown".
- **evidence_id**: Must match an ID from the evidence. **Never invent IDs.**
  - Format: Use the ID without brackets. Write "log#3" not "[log#3]".
  - Valid types: log#<id>, commit#<shortSha>, metric#<key>, state#<section.key>, doc#<id>, event#<id>, check#<id>, anno#<id>, test#<id>, dep#<id>, cfg#<id>, wflog#<id>, diff#<id>, src#<id>, comment#<id>
  - If and only if the evidence has no prefixed IDs at all, use "unknown". Otherwise you MUST use one of the provided IDs.
  - Only use evidence_id types that actually appear in the provided evidence.
- **snippet**: Exact text (1-3 lines). Redact secrets with ***REDACTED***.
- **explanation**: Why this is important.
- If evidence is insufficient, return an empty array rather than guessing snippets or IDs.

ANNOTATION RULES:
- Each annotation must cite exactly ONE evidence_id.
- "snippet" must be copied verbatim from that evidence item (1-3 lines).
- Do not concatenate text from multiple evidence items into one snippet.
- If you need multiple sources, add multiple annotations.

ID NORMALIZATION:
- If evidence contains "[log#abc]", output "log#abc".
- Never include brackets in evidence_id.

**next_steps** (required, 1-5 items): Actionable diagnostic or fix steps. Must be safe and reversible. next_steps must contain at least 1 item even when confidence="low".

GLOBAL PRIORITIZATION RULES - next_steps must be a SINGLE ranked list across ALL failure categories:

**Priority 1 (Fix merge gates FIRST)**:
- Format checks (cargo fmt, prettier, black) - these often gate merges
- Lint/clippy errors - these also gate merges in most CI setups
- Compile/build errors - must pass before tests can run

**Priority 2 (Fix functional bugs)**:
- Test assertion failures
- Runtime errors
- Configuration issues

STRUCTURE each next_step with: action, reason, and priority number.

CRITICAL FOR TEST FAILURES - Provide SURGICAL recommendations based on patterns:

1. **Off-by-one errors**: Name the SPECIFIC function and the EXACT fix:
   - BAD: "Check for off-by-one errors"
   - GOOD: "The \`add\` function appears to return \`a + b + 1\` instead of \`a + b\` - remove the extra increment"
   - GOOD: "add/subtract functions are systematically +1/-1 shifted - check for spurious increment/decrement operations"

2. **Sign errors**: Name the function and the sign handling issue:
   - BAD: "Review sign handling"
   - GOOD: "The \`multiply\` function returns abs() values - it's losing the sign when one operand is negative"
   - GOOD: "subtract_negative_result shows expected 4, actual -4 - the subtraction order may be inverted (b-a instead of a-b)"

3. **Zero/edge case errors**: Identify the specific edge case bug:
   - BAD: "Check edge cases"
   - GOOD: "The \`multiply\` function returns 0 when either operand is 0, but test expects 5 - confirm if this is identity handling vs actual multiplication"

4. **Pattern synthesis**: When multiple tests fail with the same pattern, SYNTHESIZE:
   - "12 test failures introduced in this PR show 3 patterns: (1) off-by-one in add/subtract, (2) sign loss in multiply, (3) zero-handling in divide"

NEW FAILURES CONTEXT - When evidence shows "new failures introduced":
- Start next_steps with: "Review recent changes in \`[file]\` around [function names]"
- This is high-signal - the PR likely introduced the bug

LOCAL COMMANDS - Include a "Run locally" block when applicable:
- For Rust: \`cargo fmt\`, \`cargo clippy\`, \`cargo test\`
- For JS/TS: \`npm run lint\`, \`npm test\`
- For Python: \`black .\`, \`ruff check .\`, \`pytest\`

DO NOT give generic advice like "review expected vs actual values" - the developer can see those. TELL THEM:
- Which function has the bug
- What the pattern means (off-by-one, sign inversion, etc.)
- What specific code change is likely needed

**test_command** (optional, include when category="test"): Shell command to run the failing tests locally. Base this on the detected test framework. Examples:
- For Rust (cargo-test): "cargo test"
- For JavaScript (jest): "npm test" or "npm test -- --testPathPattern=..."
- For Python (pytest): "pytest path/to/test.py"
- For Go: "go test -v ./..."
- For Java (JUnit/Maven): "mvn test"
Do NOT include if the framework is unknown or if there are no test failures.`;

/**
 * Builds the test_failures field requirements and assertion parsing rules.
 */
const buildTestFailuresRequirementsSection = (): string =>
  `**test_failures** (required when category="test", empty otherwise): Structured test failure details.

CRITICAL: You MUST include an entry for EVERY SINGLE test failure found in the artifacts. If there are 12 failing tests, this array MUST have 12 entries. Do NOT summarize or group failures - list each one individually.

For each failing test, extract:
- **test_name** (required): Full test name including module/class path
- **file** (optional): File path where test is defined
- **line** (optional): Line number where failure occurred
- **expected** (required for assertion failures): What the test expected/wanted
- **actual** (required for assertion failures): What the code actually produced
- **error_message** (required): Brief error description

UNIVERSAL ASSERTION PARSING RULES:
The key challenge is identifying which value is "expected" vs "actual". Use these rules in order:

1. **EXPLICIT LABELS** (highest priority) - If the output explicitly labels values:
   - "Expected:", "expected:", "Want:", "want:", "should be:", "must be:" → EXPECTED
   - "Actual:", "actual:", "Received:", "received:", "Got:", "got:", "but was:", "but got:" → ACTUAL
   - Example: "Expected: 5, Received: 3" → expected=5, actual=3
   - Example: "want: true, got: false" → expected=true, actual=false

2. **LABELED PAIRS** - Framework-specific labeled pairs:
   - "left:" / "right:" → left=ACTUAL, right=EXPECTED (Rust convention)
   - "first:" / "second:" → first=ACTUAL, second=EXPECTED
   - Example: "left: 2, right: 3" → actual=2, expected=3

3. **BARE ASSERTIONS** (assert X == Y, assertEqual(X, Y), etc.) - When NO explicit labels exist:
   - In equality assertions: LEFT operand = ACTUAL, RIGHT operand = EXPECTED
   - This follows the common convention: assert actual_result == expected_value
   - Example: "assert 2 == 3" → actual=2, expected=3
   - Example: "assertEqual(12, 11)" → actual=12, expected=11
   - Example: "AssertionError: 0 != 5" → actual=0, expected=5

4. **SEMANTIC ANALYSIS** - When patterns are unclear, use context:
   - Computed/returned values are typically ACTUAL
   - Literal/hardcoded values in tests are typically EXPECTED
   - Variable names like "result", "output", "response" suggest ACTUAL
   - Variable names like "expected", "want", "target" suggest EXPECTED

5. **UNKNOWN FRAMEWORK** - For any unrecognized test framework:
   - Look for comparison operators: ==, !=, ===, !==, eq, ne, equals
   - Look for assertion function patterns: assert*, expect*, should*, must*
   - Apply rule #3 (left=actual, right=expected) as default
   - If truly ambiguous, extract both values and note in error_message

EXAMPLES across languages/frameworks:
- "assert 2 == 3" → actual="2", expected="3"
- "ASSERT_EQ(result, 10)" → actual="result", expected="10"
- "expect(value).toBe(5)" → actual="value", expected="5"
- "AssertionError: 'foo' != 'bar'" → actual="foo", expected="bar"
- "Expected true but was false" → actual="false", expected="true"
- "assertion failed: x == y (left=1, right=2)" → actual="1", expected="2"

CRITICAL RULES:
- Extract ALL failing tests, not just the first few - if artifacts contain 12 test failures, output 12 entries
- Every test_failure artifact in the input MUST have a corresponding entry in the test_failures array
- If test failure is not an assertion (exception, timeout, crash), set expected/actual to null
- DO NOT hallucinate values - only extract what is explicitly shown
- When in doubt, include the raw comparison in error_message for transparency`;

/**
 * Builds the lint_errors field requirements section.
 */
const buildLintErrorsRequirementsSection = (): string =>
  `**lint_errors** (required when category="build", empty otherwise): Structured lint/compile error details. For each error, extract:
- **code** (required): Error code/rule name from compiler/linter
- **message** (required): The specific error message
- **file** (required): File path where error occurred
- **line** (required): Line number
- **column** (optional): Column number if available
- **symbol** (required when applicable): The specific identifier (variable, function, type, import) causing the error
- **suggestion** (optional): Suggested fix if the tool provides one

UNIVERSAL LINT/COMPILE ERROR PARSING:

1. **ERROR CODE EXTRACTION** - Look for these patterns:
   - Bracketed codes: [E0425], [W0611], [no-unused-vars], [unused_variable]
   - Prefixed codes: error[E0425], warning[W0611], E501, F401
   - Rule names: no-unused-vars, unused-imports, dead_code
   - If no code exists, derive from error type: "type_error", "syntax_error", "undefined_reference"

2. **LOCATION EXTRACTION** - Common patterns:
   - "file.ext:line:column" or "file.ext:line"
   - "--> path/to/file.ext:15:9"
   - "at file.ext line 15"
   - "in file.ext (line 15, column 9)"

3. **SYMBOL EXTRACTION** - The specific identifier causing the error:
   - "unused variable: \`x\`" → symbol="x"
   - "'foo' is not defined" → symbol="foo"
   - "cannot find value \`result\`" → symbol="result"
   - "Module 'xyz' has no member 'abc'" → symbol="abc"
   - Look for quoted/backticked identifiers in the message

4. **SUGGESTION EXTRACTION** - If the tool suggests a fix:
   - "help: consider using \`_x\`" → suggestion="consider using \`_x\`"
   - "Did you mean 'bar'?" → suggestion="Did you mean 'bar'?"
   - "try adding \`mut\`" → suggestion="try adding \`mut\`"

CRITICAL RULES:
- Extract ALL errors, not just the first one
- Each error should be a separate entry, even if they share the same code
- Preserve the exact symbol name as shown in the output
- If multiple errors occur on the same line, create separate entries for each`;

/**
 * Builds the secondary_findings and example section.
 */
const buildSecondaryFindingsAndExampleSection = (): string =>
  `**secondary_findings** (required, can be empty): Independent issues unrelated to root cause. Prefer up to 3 secondary_findings. Each has:
- **summary**: Brief description of the issue
- **evidence_ids**: Array of evidence ID references
- **severity**: "warning" | "info"

EXAMPLE 1 - Dependency failure (do not assume incident language from this):
{
  "root_cause": "Dependency resolution failed: unable to resolve utils-lib version 2.0.0",
  "confidence": "high",
  "category": "dependency",
  "phase": "dependency",
  "annotations": [
    {
      "evidence_id": "log#1",
      "snippet": "ERROR: Failed to resolve dependency tree",
      "explanation": "Primary error indicating dependency conflict"
    },
    {
      "evidence_id": "log#2",
      "snippet": "Could not resolve: utils-lib@^2.0.0 - version not found",
      "explanation": "Specific package causing the conflict"
    }
  ],
  "next_steps": [
    { "action": "Verify utils-lib version 2.0.0 exists in the package registry", "reason": "Version may not be published yet", "priority": 1 },
    { "action": "Review package.json for version constraint conflicts", "reason": "May need to relax semver range", "priority": 1 }
  ],
  "secondary_findings": []
}

EXAMPLE 2 - Test failures with format/lint issues (ideal output):
{
  "root_cause": "Arithmetic functions have systematic bugs: off-by-one in add/subtract, sign loss in multiply",
  "confidence": "high",
  "category": "test",
  "phase": "test",
  "annotations": [...],
  "test_failures": [...],
  "lint_errors": [...],
  "next_steps": [
    { "action": "Run cargo fmt and commit formatting changes", "reason": "CI format check is failing on src/main.rs", "priority": 1 },
    { "action": "Fix clippy errors: remove unused variable 'x' or prefix with underscore", "reason": "Lint errors gate merge", "priority": 1 },
    { "action": "Fix add/subtract functions - they return N+1/N-1 instead of correct values", "reason": "8 tests show systematic off-by-one pattern", "priority": 2 },
    { "action": "Fix multiply sign handling - returns abs() value, losing negative sign", "reason": "3 tests show sign inversion", "priority": 2 },
    { "action": "Run locally: cargo fmt && cargo clippy && cargo test", "reason": "Verify all fixes before pushing", "priority": 2 }
  ],
  "secondary_findings": []
}

Ensure valid JSON. Double-quoted keys. Properly escaped strings.`;

/**
 * Builds the final self-check section.
 */
const buildFinalSelfCheckSection = (): string =>
  `## FINAL SELF-CHECK

Before responding, verify:
1. Did I incorrectly label non-intentional tests as intentional? (Only use "intentional" if explicit markers exist)
2. Did I cite exact lines proving intent (suite name/comment) if claiming intentional failure?
3. Did I select a SINGLE root cause and place other failures in secondary_findings?
4. Did I copy snippets VERBATIM from the evidence (not paraphrased)?
5. Did I use neutral language ("assertion mismatch") rather than blaming implementation?
6. Does my confidence level match the evidence strength per the rules above?
7. Are all evidence_id values actually present in the provided evidence?

IMPLEMENTATION BLAME EXCEPTION:
If multiple test failures exhibit the same arithmetic pattern (off-by-one, sign inversion, zero handling),
it IS acceptable to attribute the root cause to implementation logic. Example patterns that justify blame:
- 5+ tests all show expected N, actual N+1 → "The add function has an off-by-one bug"
- Multiple tests show sign inversion → "The multiply function incorrectly handles negative operands"
- Multiple tests fail on zero/boundary → "Edge case handling bug in the implementation"
Do NOT be overly timid when clear patterns exist across multiple failures.`;

// ==================== Main Builder ====================

/**
 * Builds the output format specification for RAW EVIDENCE analysis.
 * Uses log#/commit#/metric# ID formats.
 *
 * WARNING: Do NOT use this with Stage 4 artifact-based analysis.
 * For artifact analysis, use buildAnalysisFromArtifacts() from promptArtifactAnalysis.ts
 *
 * @returns Complete output format section for raw evidence analysis
 */
export const buildOutputFormatSectionForRawEvidence = (): string => {
  const sections = [
    "## OUTPUT FORMAT",
    buildHardRulesSection(),
    buildCoreFieldRequirementsSection(),
    buildAnnotationsRequirementsSection(),
    buildTestFailuresRequirementsSection(),
    buildLintErrorsRequirementsSection(),
    buildSecondaryFindingsAndExampleSection(),
    buildFinalSelfCheckSection(),
  ];

  return sections.join("\n\n");
};

/**
 * @deprecated Use buildOutputFormatSectionForRawEvidence() for raw evidence analysis,
 * or buildAnalysisFromArtifacts() for Stage 4 artifact-based analysis.
 */
export const buildOutputFormatSection = buildOutputFormatSectionForRawEvidence;

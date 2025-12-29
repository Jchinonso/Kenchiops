/**
 * Prompt templates for OpenAI/LLM interactions.
 * Based on PROMPT_TEMPLATES.md specifications.
 */

import type {
  Event,
  Evidence,
  LogEntry,
  GitCommit,
  KnowledgeDocument,
  MetricsSummary,
  SystemState,
} from "../core/types.js";
import {
  SIMILARITY_THRESHOLDS,
  EVIDENCE_TRUNCATION,
  UI_CONSTANTS,
  OPENAI_CONSTANTS,
} from "../constants/index.js";

/**
 * Builds the system context prompt that establishes the LLM's role and constraints.
 * This remains mostly constant across all prompts.
 */
export const buildSystemPrompt = (): string => {
  return `You are an expert DevOps incident analysis assistant. Your role is to analyze DevOps events (CI/CD failures, monitoring alerts, deployment issues) and provide helpful insights to engineering teams.

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
};

/**
 * Builds the complete analysis prompt including task, context, and output format.
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

/**
 * Builds the task specification section.
 */
const buildTaskSection = (): string => {
  return `## TASK
Analyze the following DevOps event and provide:
1. A concise summary of what happened
2. The identified root cause (or state if it cannot be determined)
3. An assessment of the impact
4. 1-3 safe, actionable recommendations to resolve the issue
5. Your confidence level in this analysis
6. Any uncertainties or gaps in your understanding

## ANALYSIS CONSTRAINTS
- Base your analysis ONLY on the evidence provided below
- Do NOT speculate about information not present in the context
- If evidence is insufficient, state this explicitly in the "uncertainties" field
- Cite specific evidence (e.g., "According to log entry at 10:30:45: 'AUTH_SECRET is not defined'")`;
};

/**
 * Builds the safety constraints section.
 */
const buildSafetyConstraintsSection = (): string => {
  return `## SAFETY CONSTRAINTS FOR RECOMMENDATIONS
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
};

/**
 * Builds the output format specification section.
 */
const buildOutputFormatSection = (): string => {
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
      "line": 42,
      "level": "failure|warning|notice",
      "message": "Specific error message or explanation",
      "title": "Short title for the annotation (optional)"
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
      "oldVersion": "1.0.0 (if updated/removed)",
      "newVersion": "2.0.0 (if added/updated)",
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

### Universal File Reference Patterns (Language-Agnostic):
Look for file paths with line numbers in ANY of these formats:
- \`path/to/file.ext:line:column\` (most common - TypeScript, Python, Go, Rust, etc.)
- \`path/to/file.ext(line,column)\` (C#, TypeScript compiler)
- \`at path/to/file.ext:line\` (stack traces)
- \`File "path/to/file.py", line N\` (Python tracebacks)
- \`path/to/file.go:line:\` (Go)
- \`path/to/file.rs:line:column\` (Rust)

### Test Failure Detection (Any Framework):
Identify test failures from ANY test framework by looking for:
- **JavaScript/TypeScript**: \`FAIL\`, \`✕\`, \`●\` markers (Jest/Vitest/Mocha)
- **Python**: \`FAILED\`, \`E       assert\`, pytest output
- **Go**: \`--- FAIL:\`, \`FAIL\` with package names
- **Rust**: \`---- test_name stdout ----\`, \`thread '...' panicked\`
- **Ruby**: \`Failure/Error:\`, RSpec numbered failures
- **Java**: \`FAILURE\`, JUnit stack traces with \`.java:line\`
- **C#**: \`Failed\`, NUnit/xUnit output
- **Generic**: Words like "failed", "error", "assertion" near test names

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
7. Maximum 50 annotations to keep response manageable
8. Only include annotations for files actually mentioned in the evidence`;
};

/**
 * Formats event details for inclusion in the prompt.
 */
export const formatEvent = (event: Event): string => {
  const payload = JSON.stringify(event.payload, null, 2);

  return `## EVENT DETAILS
**Event ID**: ${event.id}
**Type**: ${event.type}
**Source**: ${event.source}
**Timestamp**: ${event.timestamp}
**Severity**: ${event.severity || "medium"}
${event.title ? `\n**Title**: ${event.title}` : ""}

**Event Payload**:
\`\`\`json
${payload}
\`\`\``;
};

/**
 * Evidence section configuration for data-driven formatting.
 */
interface EvidenceSectionConfig {
  readonly title: string;
  readonly emptyMessage: string;
  readonly hasData: (evidence: Evidence) => boolean;
  readonly format: (evidence: Evidence) => string;
}

/**
 * Evidence sections configuration - enables easy addition/removal of sections.
 */
const EVIDENCE_SECTIONS: readonly EvidenceSectionConfig[] = [
  {
    title: "### Error Logs",
    emptyMessage: "No error logs available.",
    hasData: (e) => Boolean(e.logs?.length),
    format: (e) => formatLogs(e.logs!),
  },
  {
    title: "### System Metrics (at time of event)",
    emptyMessage: "No metrics available.",
    hasData: (e) => Boolean(e.metrics?.summary),
    format: (e) => formatMetrics(e.metrics!.summary!),
  },
  {
    title: "### Recent Git History",
    emptyMessage: "No recent commits available.",
    hasData: (e) => Boolean(e.gitHistory?.length),
    format: (e) => formatGitHistory(e.gitHistory!),
  },
  {
    title: "### System State",
    emptyMessage: "",
    hasData: (e) => Boolean(e.systemState),
    format: (e) => formatSystemState(e.systemState!),
  },
  {
    title: "### Related Knowledge Base Documents",
    emptyMessage: "No related documents found in knowledge base.",
    hasData: (e) => Boolean(e.relatedDocs?.length),
    format: (e) => formatKnowledgeDocs(e.relatedDocs!),
  },
];

/**
 * Formats all evidence sections for inclusion in the prompt.
 * Uses data-driven configuration with functional patterns.
 */
export const formatEvidence = (evidence: Evidence): string => {
  const evidenceSections = EVIDENCE_SECTIONS.flatMap((config) => {
    if (config.hasData(evidence)) {
      return [config.title, config.format(evidence)];
    }
    return config.emptyMessage ? [`${config.title}\n${config.emptyMessage}`] : [];
  });

  return ["## COLLECTED EVIDENCE", ...evidenceSections].join("\n\n");
};

/**
 * Formats log entries for inclusion in LLM prompts.
 */
export const formatLogs = (logs: LogEntry[]): string => {
  return logs
    .map((log) => {
      const timestamp = log.timestamp || "unknown time";
      const level = log.level || "INFO";
      const source = log.source || "unknown";
      const stack = log.stackTrace ? `\n${log.stackTrace}` : "";
      return `[${timestamp}] [${level}] ${source}\n${log.message}${stack}\n---`;
    })
    .join("\n");
};

/**
 * Metric field definition for data-driven formatting.
 */
interface MetricField {
  readonly key: keyof MetricsSummary;
  readonly label: string;
  readonly suffix?: string;
}

/**
 * Standard metrics lookup table for consistent formatting.
 */
const STANDARD_METRICS: readonly MetricField[] = [
  { key: "errorRate", label: "Error Rate" },
  { key: "requestRate", label: "Request Rate", suffix: " req/s" },
  { key: "cpuUsage", label: "CPU Usage", suffix: "%" },
  { key: "memoryUsage", label: "Memory Usage", suffix: "%" },
  { key: "latencyP50", label: "Latency P50", suffix: "ms" },
  { key: "latencyP95", label: "Latency P95", suffix: "ms" },
  { key: "latencyP99", label: "Latency P99", suffix: "ms" },
] as const;

/**
 * Set of standard metric keys for efficient lookup.
 */
const STANDARD_METRIC_KEYS = new Set<string>(STANDARD_METRICS.map((m) => m.key as string));

/**
 * Formats metrics summary using data-driven approach with functional patterns.
 */
export const formatMetrics = (summary: MetricsSummary): string => {
  const standardLines = STANDARD_METRICS.filter(({ key }) => summary[key] !== undefined).map(
    ({ key, label, suffix }) => `- ${label}: ${summary[key]}${suffix ?? ""}`
  );

  const customLines = Object.entries(summary)
    .filter(([key]) => !STANDARD_METRIC_KEYS.has(key))
    .map(([key, value]) => `- ${key}: ${value}`);

  return [...standardLines, ...customLines].join("\n");
};

/**
 * Formats git commit history.
 */
export const formatGitHistory = (commits: GitCommit[]): string => {
  return commits
    .map((commit) => {
      const lines = [
        `- Commit: ${commit.sha}`,
        `  Author: ${commit.author}`,
        `  Date: ${commit.timestamp}`,
        `  Message: ${commit.message}`,
      ];

      if (commit.filesChanged && commit.filesChanged.length > 0) {
        lines.push(`  Files Changed: ${commit.filesChanged.join(", ")}`);
      }

      if (commit.additions !== undefined && commit.deletions !== undefined) {
        lines.push(`  +${commit.additions} -${commit.deletions}`);
      }

      if (commit.url) {
        lines.push(`  URL: ${commit.url}`);
      }

      return lines.join("\n");
    })
    .join("\n\n");
};

/**
 * Deployment status field configuration.
 */
const DEPLOYMENT_FIELDS: readonly {
  key: keyof NonNullable<SystemState["deploymentStatus"]>;
  label: string;
}[] = [
  { key: "currentVersion", label: "Current Version" },
  { key: "previousVersion", label: "Previous Version" },
  { key: "deployedAt", label: "Deployed At" },
  { key: "deployedBy", label: "Deployed By" },
];

/**
 * Formats system state information using data-driven approach with functional patterns.
 */
const formatSystemState = (systemState: SystemState): string => {
  const sections: string[] = [];

  if (systemState.deploymentStatus) {
    const ds = systemState.deploymentStatus;
    const deploymentLines = DEPLOYMENT_FIELDS.filter(({ key }) => ds[key]).map(
      ({ key, label }) => `- ${label}: ${ds[key]}`
    );
    sections.push("**Deployment**:", ...deploymentLines);
  }

  if (systemState.serviceHealth) {
    const healthLines = Object.entries(systemState.serviceHealth).map(
      ([service, status]) => `- ${service}: ${status}`
    );
    sections.push("\n**Service Health**:", ...healthLines);
  }

  if (systemState.dependencies?.length) {
    const depLines = systemState.dependencies.map((dep) => {
      const responseTime = dep.responseTime ? ` (${dep.responseTime}ms)` : "";
      return `- ${dep.name}: ${dep.status}${responseTime}`;
    });
    sections.push("\n**Dependencies**:", ...depLines);
  }

  return sections.join("\n");
};

/**
 * Formats knowledge base documents using functional array composition.
 */
export const formatKnowledgeDocs = (docs: KnowledgeDocument[]): string => {
  return docs
    .map((doc) => {
      const similarity = (doc.similarity * UI_CONSTANTS.PERCENTAGE_MULTIPLIER).toFixed(0);
      const lines = [
        `**[${doc.type}] ${doc.title}** (Similarity: ${similarity}%)`,
        doc.excerpt,
        doc.url && `Full document: ${doc.url}`,
        doc.metadata?.tags?.length && `Tags: ${doc.metadata.tags.join(", ")}`,
        "---",
      ].filter(Boolean);
      return lines.join("\n");
    })
    .join("\n");
};

/**
 * Estimates token count for text (rough approximation).
 */
export const estimateTokens = (text: string): number => {
  return Math.ceil(text.length / OPENAI_CONSTANTS.CHARS_PER_TOKEN_ESTIMATE);
};

/**
 * Takes items from array while they fit within token budget.
 */
const takeWhileTokenBudget = <T>(
  items: readonly T[],
  tokenBudget: number,
  getTokens: (item: T) => number
): { items: T[]; remainingBudget: number } => {
  return items.reduce<{ items: T[]; remainingBudget: number }>(
    (acc, item) => {
      const tokens = getTokens(item);
      if (acc.remainingBudget >= tokens) {
        return {
          items: [...acc.items, item],
          remainingBudget: acc.remainingBudget - tokens,
        };
      }
      return acc;
    },
    { items: [], remainingBudget: tokenBudget }
  );
};

/**
 * Truncates evidence to fit within token budget while prioritizing important information.
 */
export const truncateEvidence = (evidence: Evidence, maxTokens: number): Evidence => {
  const truncated: Evidence = {
    ...evidence,
    logs: undefined,
    gitHistory: undefined,
    relatedDocs: undefined,
  };

  let remainingTokens = maxTokens;

  if (evidence.logs) {
    const errorLogs = evidence.logs
      .filter((log) => log.level === "ERROR")
      .slice(0, EVIDENCE_TRUNCATION.MAX_ERROR_LOGS);
    const logSection = formatLogs(errorLogs);
    const logTokens = estimateTokens(logSection);

    if (logTokens <= remainingTokens) {
      truncated.logs = errorLogs;
      remainingTokens -= logTokens;
    } else {
      const result = takeWhileTokenBudget(errorLogs, remainingTokens, (log) =>
        estimateTokens(formatLogs([log]))
      );
      truncated.logs = result.items;
      remainingTokens = result.remainingBudget;
    }
  }

  if (evidence.gitHistory && remainingTokens > EVIDENCE_TRUNCATION.MIN_TOKENS_FOR_COMMITS) {
    const recentCommits = evidence.gitHistory.slice(0, EVIDENCE_TRUNCATION.MAX_RECENT_COMMITS);
    const commitSection = formatGitHistory(recentCommits);
    const commitTokens = estimateTokens(commitSection);

    if (commitTokens <= remainingTokens) {
      truncated.gitHistory = recentCommits;
      remainingTokens -= commitTokens;
    }
  }

  if (evidence.relatedDocs && remainingTokens > EVIDENCE_TRUNCATION.MIN_TOKENS_FOR_DOCS) {
    const topDocs = evidence.relatedDocs
      .filter((doc) => doc.similarity > SIMILARITY_THRESHOLDS.MINIMUM_FOR_FILTERING)
      .slice(0, EVIDENCE_TRUNCATION.MAX_HIGH_SIMILARITY_DOCS);
    const docSection = formatKnowledgeDocs(topDocs);
    const docTokens = estimateTokens(docSection);

    if (docTokens <= remainingTokens) {
      truncated.relatedDocs = topDocs;
      remainingTokens -= docTokens;
    }
  }

  truncated.metrics = evidence.metrics;

  if (evidence.logs && remainingTokens > EVIDENCE_TRUNCATION.MIN_TOKENS_FOR_COMMITS) {
    const additionalLogs = evidence.logs
      .filter((log) => log.level !== "ERROR")
      .slice(0, EVIDENCE_TRUNCATION.MAX_ADDITIONAL_LOGS);

    const currentLogs = truncated.logs || [];
    const result = takeWhileTokenBudget(additionalLogs, remainingTokens, (log) =>
      estimateTokens(formatLogs([log]))
    );
    truncated.logs = [...currentLogs, ...result.items];
  }

  truncated.systemState = evidence.systemState;
  truncated.relatedEvents = evidence.relatedEvents;

  return truncated;
};

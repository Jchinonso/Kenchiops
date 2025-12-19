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
} from "./types.js";
import { SIMILARITY_THRESHOLDS, EVIDENCE_TRUNCATION, UI_CONSTANTS } from "./constants.js";

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
  ]
}
\`\`\``;
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
 * Formats all evidence sections for inclusion in the prompt.
 */
export const formatEvidence = (evidence: Evidence): string => {
  const sections: string[] = ["## COLLECTED EVIDENCE"];

  // 1. Logs
  if (evidence.logs && evidence.logs.length > 0) {
    sections.push("### Error Logs");
    sections.push(formatLogs(evidence.logs));
  } else {
    sections.push("### Error Logs\nNo error logs available.");
  }

  // 2. Metrics
  if (evidence.metrics?.summary) {
    sections.push("### System Metrics (at time of event)");
    sections.push(formatMetrics(evidence.metrics.summary));
  } else {
    sections.push("### System Metrics (at time of event)\nNo metrics available.");
  }

  // 3. Git History
  if (evidence.gitHistory && evidence.gitHistory.length > 0) {
    sections.push("### Recent Git History");
    sections.push(formatGitHistory(evidence.gitHistory));
  } else {
    sections.push("### Recent Git History\nNo recent commits available.");
  }

  // 4. System State
  if (evidence.systemState) {
    sections.push("### System State");
    sections.push(formatSystemState(evidence.systemState));
  }

  // 5. Related Knowledge Base Documents
  if (evidence.relatedDocs && evidence.relatedDocs.length > 0) {
    sections.push("### Related Knowledge Base Documents");
    sections.push(formatKnowledgeDocs(evidence.relatedDocs));
  } else {
    sections.push(
      "### Related Knowledge Base Documents\nNo related documents found in knowledge base."
    );
  }

  return sections.join("\n\n");
};

/**
 * Formats log entries for inclusion in LLM prompts.
 * Each log is formatted with timestamp, level, source, message, and optional stack trace.
 *
 * @param logs - Array of log entries to format
 * @returns Formatted string with logs separated by horizontal rules
 *
 * @example
 * ```typescript
 * const logs = [
 *   {
 *     timestamp: '2024-01-15T10:30:45Z',
 *     level: 'ERROR',
 *     source: 'api-server',
 *     message: 'Database connection failed',
 *     stackTrace: 'Error: Connection timeout\n  at connect (db.ts:45)'
 *   }
 * ];
 *
 * const formatted = formatLogs(logs);
 * // Returns:
 * // [2024-01-15T10:30:45Z] [ERROR] api-server
 * // Database connection failed
 * // Error: Connection timeout
 * //   at connect (db.ts:45)
 * // ---
 * ```
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
 * Formats metrics summary.
 */
export const formatMetrics = (summary: MetricsSummary): string => {
  const lines: string[] = [];

  if (summary.errorRate !== undefined) {
    lines.push(`- Error Rate: ${summary.errorRate}`);
  }
  if (summary.requestRate !== undefined) {
    lines.push(`- Request Rate: ${summary.requestRate} req/s`);
  }
  if (summary.cpuUsage !== undefined) {
    lines.push(`- CPU Usage: ${summary.cpuUsage}%`);
  }
  if (summary.memoryUsage !== undefined) {
    lines.push(`- Memory Usage: ${summary.memoryUsage}%`);
  }
  if (summary.latencyP50 !== undefined) {
    lines.push(`- Latency P50: ${summary.latencyP50}ms`);
  }
  if (summary.latencyP95 !== undefined) {
    lines.push(`- Latency P95: ${summary.latencyP95}ms`);
  }
  if (summary.latencyP99 !== undefined) {
    lines.push(`- Latency P99: ${summary.latencyP99}ms`);
  }

  // Include any custom metrics
  const standardMetrics = [
    "errorRate",
    "requestRate",
    "cpuUsage",
    "memoryUsage",
    "latencyP50",
    "latencyP95",
    "latencyP99",
  ];
  for (const [key, value] of Object.entries(summary)) {
    if (!standardMetrics.includes(key)) {
      lines.push(`- ${key}: ${value}`);
    }
  }

  return lines.join("\n");
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
 * Formats system state information.
 */
const formatSystemState = (systemState: SystemState): string => {
  const sections: string[] = [];

  if (systemState.deploymentStatus) {
    const ds = systemState.deploymentStatus;
    sections.push("**Deployment**:");
    if (ds.currentVersion) sections.push(`- Current Version: ${ds.currentVersion}`);
    if (ds.previousVersion) sections.push(`- Previous Version: ${ds.previousVersion}`);
    if (ds.deployedAt) sections.push(`- Deployed At: ${ds.deployedAt}`);
    if (ds.deployedBy) sections.push(`- Deployed By: ${ds.deployedBy}`);
  }

  if (systemState.serviceHealth) {
    sections.push("\n**Service Health**:");
    for (const [service, status] of Object.entries(systemState.serviceHealth)) {
      sections.push(`- ${service}: ${status}`);
    }
  }

  if (systemState.dependencies && systemState.dependencies.length > 0) {
    sections.push("\n**Dependencies**:");
    for (const dep of systemState.dependencies) {
      sections.push(
        `- ${dep.name}: ${dep.status}${dep.responseTime ? ` (${dep.responseTime}ms)` : ""}`
      );
    }
  }

  return sections.join("\n");
};

/**
 * Formats knowledge base documents.
 */
export const formatKnowledgeDocs = (docs: KnowledgeDocument[]): string => {
  return docs
    .map((doc) => {
      const similarity = (doc.similarity * UI_CONSTANTS.PERCENTAGE_MULTIPLIER).toFixed(0);
      let formatted = `**[${doc.type}] ${doc.title}** (Similarity: ${similarity}%)\n`;

      if (doc.excerpt) {
        formatted += `${doc.excerpt}\n`;
      }

      if (doc.url) {
        formatted += `Full document: ${doc.url}\n`;
      }

      if (doc.metadata?.tags && doc.metadata.tags.length > 0) {
        formatted += `Tags: ${doc.metadata.tags.join(", ")}\n`;
      }

      return formatted + "---";
    })
    .join("\n");
};

/**
 * Estimates token count for text (rough approximation).
 * 1 token ≈ 4 characters for English text.
 */
export const estimateTokens = (text: string): number => {
  return Math.ceil(text.length / 4);
};

/**
 * Truncates evidence to fit within token budget while prioritizing important information.
 */
export const truncateEvidence = (evidence: Evidence, maxTokens: number): Evidence => {
  // Priority order:
  // 1. Critical error logs (ERROR level) - top 10
  // 2. Recent commits - last 5
  // 3. High-similarity knowledge docs - top 3 with similarity > threshold
  // 4. Metrics summary
  // 5. Additional logs (INFO/WARN) - as many as budget allows

  const truncated: Evidence = {
    ...evidence,
    logs: undefined,
    gitHistory: undefined,
    relatedDocs: undefined,
  };

  let remainingTokens = maxTokens;

  // 1. Critical error logs
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
      // Take as many as fit
      const fitLogs: LogEntry[] = [];
      for (const log of errorLogs) {
        const logTokens = estimateTokens(formatLogs([log]));
        if (remainingTokens >= logTokens) {
          fitLogs.push(log);
          remainingTokens -= logTokens;
        } else {
          break;
        }
      }
      truncated.logs = fitLogs;
    }
  }

  // 2. Recent commits
  if (evidence.gitHistory && remainingTokens > EVIDENCE_TRUNCATION.MIN_TOKENS_FOR_COMMITS) {
    const recentCommits = evidence.gitHistory.slice(0, EVIDENCE_TRUNCATION.MAX_RECENT_COMMITS);
    const commitSection = formatGitHistory(recentCommits);
    const commitTokens = estimateTokens(commitSection);

    if (commitTokens <= remainingTokens) {
      truncated.gitHistory = recentCommits;
      remainingTokens -= commitTokens;
    }
  }

  // 3. High-similarity knowledge docs
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

  // 4. Metrics remain as-is (small)
  truncated.metrics = evidence.metrics;

  // 5. Additional logs if budget allows
  if (evidence.logs && remainingTokens > EVIDENCE_TRUNCATION.MIN_TOKENS_FOR_COMMITS) {
    const additionalLogs = evidence.logs.filter((log) => log.level !== "ERROR").slice(0, 20);

    const currentLogs = truncated.logs || [];
    for (const log of additionalLogs) {
      const logTokens = estimateTokens(formatLogs([log]));
      if (remainingTokens >= logTokens) {
        currentLogs.push(log);
        remainingTokens -= logTokens;
      } else {
        break;
      }
    }
    truncated.logs = currentLogs;
  }

  // Keep system state and related events as-is (typically small)
  truncated.systemState = evidence.systemState;
  truncated.relatedEvents = evidence.relatedEvents;

  return truncated;
};

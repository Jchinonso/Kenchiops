# Data Models & JSON Schemas

## Table of Contents
1. [Overview](#overview)
2. [Event Schema](#event-schema)
3. [Evidence Schema](#evidence-schema)
4. [LLMAnalysisResult Schema](#llmanalysisresult-schema)
5. [ActionProposal Schema](#actionproposal-schema)
6. [Supporting Types](#supporting-types)
7. [Validation Rules](#validation-rules)
8. [Examples](#examples)

---

## Overview

This document defines the core data structures used throughout the AI-Driven DevOps Incident Assistant. Each data type is specified with:
- **JSON Schema**: Formal schema definition for validation
- **TypeScript Interface**: Type-safe interface for implementation
- **Field Descriptions**: Detailed explanation of each field
- **Validation Rules**: Constraints and business rules
- **Examples**: Real-world usage examples

### Data Flow
```
Event → Evidence → LLMAnalysisResult → ActionProposal(s) → Execution Results
```

---

## Event Schema

### Description
Represents an incoming event from any source (CI/CD failure, monitoring alert, manual trigger). This is the entry point for all incident analysis.

### JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "title": "Event",
  "description": "Represents an incoming event that triggers incident analysis",
  "required": ["id", "type", "source", "timestamp", "payload"],
  "properties": {
    "id": {
      "type": "string",
      "description": "Unique identifier for the event (e.g., evt_abc123)",
      "pattern": "^evt_[a-zA-Z0-9]+$"
    },
    "type": {
      "type": "string",
      "description": "Category of the event",
      "enum": [
        "CICD_FAILURE",
        "DEPLOYMENT_FAILURE",
        "MONITORING_ALERT",
        "PERFORMANCE_DEGRADATION",
        "ERROR_SPIKE",
        "SECURITY_ALERT",
        "MANUAL_TRIGGER",
        "SERVICE_DOWN",
        "TEST_FAILURE"
      ]
    },
    "source": {
      "type": "string",
      "description": "Origin system that generated the event",
      "examples": ["GitHubActions", "GitLabCI", "Datadog", "Prometheus", "Slack", "Jenkins"]
    },
    "timestamp": {
      "type": "string",
      "format": "date-time",
      "description": "ISO 8601 timestamp when the event occurred"
    },
    "severity": {
      "type": "string",
      "description": "Severity level of the event",
      "enum": ["critical", "high", "medium", "low", "info"],
      "default": "medium"
    },
    "title": {
      "type": "string",
      "description": "Human-readable title/summary of the event",
      "maxLength": 200
    },
    "payload": {
      "type": "object",
      "description": "Event-specific data (structure varies by source and type)",
      "properties": {
        "repository": {
          "type": "string",
          "description": "Repository identifier (e.g., owner/repo)"
        },
        "workflow": {
          "type": "string",
          "description": "Workflow or pipeline name"
        },
        "runId": {
          "type": "string",
          "description": "Unique run/build identifier"
        },
        "branch": {
          "type": "string",
          "description": "Git branch"
        },
        "commit": {
          "type": "string",
          "description": "Git commit SHA"
        },
        "errorMessage": {
          "type": "string",
          "description": "Primary error message or alert description"
        },
        "errorLog": {
          "type": "string",
          "description": "Full error log or stack trace"
        },
        "alertId": {
          "type": "string",
          "description": "Monitoring alert identifier"
        },
        "metricName": {
          "type": "string",
          "description": "Name of the metric that triggered alert"
        },
        "metricValue": {
          "type": "number",
          "description": "Value of the metric at alert time"
        },
        "threshold": {
          "type": "number",
          "description": "Threshold that was exceeded"
        },
        "url": {
          "type": "string",
          "format": "uri",
          "description": "Link to event details (workflow run, alert page, etc.)"
        }
      },
      "additionalProperties": true
    },
    "metadata": {
      "type": "object",
      "description": "Additional metadata about the event",
      "properties": {
        "environment": {
          "type": "string",
          "description": "Environment where event occurred",
          "enum": ["production", "staging", "development", "test"]
        },
        "service": {
          "type": "string",
          "description": "Service or component affected"
        },
        "team": {
          "type": "string",
          "description": "Team responsible for this service"
        },
        "tags": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Tags for categorization and filtering"
        }
      },
      "additionalProperties": true
    },
    "createdAt": {
      "type": "string",
      "format": "date-time",
      "description": "When this Event object was created in our system"
    },
    "updatedAt": {
      "type": "string",
      "format": "date-time",
      "description": "When this Event was last updated"
    }
  }
}
```

### TypeScript Interface

```typescript
interface Event {
  // Core identification
  id: string; // Format: evt_<alphanumeric>
  type: EventType;
  source: string;
  timestamp: string; // ISO 8601
  severity?: EventSeverity;
  title?: string;

  // Event-specific data
  payload: EventPayload;

  // Additional context
  metadata?: EventMetadata;

  // Audit timestamps
  createdAt?: string;
  updatedAt?: string;
}

type EventType =
  | 'CICD_FAILURE'
  | 'DEPLOYMENT_FAILURE'
  | 'MONITORING_ALERT'
  | 'PERFORMANCE_DEGRADATION'
  | 'ERROR_SPIKE'
  | 'SECURITY_ALERT'
  | 'MANUAL_TRIGGER'
  | 'SERVICE_DOWN'
  | 'TEST_FAILURE';

type EventSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

interface EventPayload {
  // CI/CD fields
  repository?: string;
  workflow?: string;
  runId?: string;
  branch?: string;
  commit?: string;

  // Error fields
  errorMessage?: string;
  errorLog?: string;

  // Monitoring fields
  alertId?: string;
  metricName?: string;
  metricValue?: number;
  threshold?: number;

  // Common fields
  url?: string;

  // Allow additional fields
  [key: string]: any;
}

interface EventMetadata {
  environment?: 'production' | 'staging' | 'development' | 'test';
  service?: string;
  team?: string;
  tags?: string[];
  [key: string]: any;
}
```

### Example

```json
{
  "id": "evt_a7b3f2e1",
  "type": "CICD_FAILURE",
  "source": "GitHubActions",
  "timestamp": "2025-12-17T10:30:45Z",
  "severity": "high",
  "title": "main-build pipeline failed on main branch",
  "payload": {
    "repository": "company/backend-api",
    "workflow": "main-build",
    "runId": "8734562",
    "branch": "main",
    "commit": "abc123def456",
    "errorMessage": "Test suite failed: 1 test failed, 24 passed",
    "errorLog": "ERROR: AUTH_SECRET is not defined\n  at auth.test.ts:45:12\n  at TestRunner.run",
    "url": "https://github.com/company/backend-api/actions/runs/8734562"
  },
  "metadata": {
    "environment": "production",
    "service": "backend-api",
    "team": "platform",
    "tags": ["ci", "tests", "authentication"]
  },
  "createdAt": "2025-12-17T10:31:00Z"
}
```

---

## Evidence Schema

### Description
Represents all contextual information collected about an Event. This includes logs, metrics, git history, related incidents, and retrieved documentation. This is the comprehensive data package that gets sent to the LLM for analysis.

### JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "title": "Evidence",
  "description": "Collected contextual information related to an Event",
  "required": ["eventId", "collectedAt"],
  "properties": {
    "eventId": {
      "type": "string",
      "description": "References the Event this evidence belongs to",
      "pattern": "^evt_[a-zA-Z0-9]+$"
    },
    "logs": {
      "type": "array",
      "description": "Relevant log entries from various sources",
      "items": {
        "type": "object",
        "properties": {
          "source": {
            "type": "string",
            "description": "Source of the log (e.g., application, system, database)"
          },
          "timestamp": {
            "type": "string",
            "format": "date-time"
          },
          "level": {
            "type": "string",
            "enum": ["DEBUG", "INFO", "WARN", "ERROR", "FATAL"]
          },
          "message": {
            "type": "string",
            "description": "Log message content"
          },
          "stackTrace": {
            "type": "string",
            "description": "Stack trace if available"
          },
          "metadata": {
            "type": "object",
            "additionalProperties": true
          }
        },
        "required": ["message"]
      }
    },
    "metrics": {
      "type": "object",
      "description": "Relevant metrics around the time of the event",
      "properties": {
        "timeRange": {
          "type": "object",
          "properties": {
            "start": {
              "type": "string",
              "format": "date-time"
            },
            "end": {
              "type": "string",
              "format": "date-time"
            }
          }
        },
        "timeSeries": {
          "type": "array",
          "description": "Time-series data points",
          "items": {
            "type": "object",
            "properties": {
              "metricName": {
                "type": "string"
              },
              "values": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "timestamp": {
                      "type": "string",
                      "format": "date-time"
                    },
                    "value": {
                      "type": "number"
                    }
                  }
                }
              },
              "unit": {
                "type": "string"
              }
            }
          }
        },
        "summary": {
          "type": "object",
          "description": "Summary statistics at event time",
          "properties": {
            "errorRate": {
              "type": "number",
              "description": "Error rate (0.0 to 1.0)"
            },
            "requestRate": {
              "type": "number",
              "description": "Requests per second"
            },
            "cpuUsage": {
              "type": "number",
              "description": "CPU usage percentage"
            },
            "memoryUsage": {
              "type": "number",
              "description": "Memory usage percentage"
            },
            "latencyP50": {
              "type": "number",
              "description": "50th percentile latency (ms)"
            },
            "latencyP95": {
              "type": "number",
              "description": "95th percentile latency (ms)"
            },
            "latencyP99": {
              "type": "number",
              "description": "99th percentile latency (ms)"
            }
          },
          "additionalProperties": true
        }
      }
    },
    "gitHistory": {
      "type": "array",
      "description": "Recent commits and changes",
      "items": {
        "type": "object",
        "properties": {
          "sha": {
            "type": "string",
            "description": "Commit SHA"
          },
          "message": {
            "type": "string",
            "description": "Commit message"
          },
          "author": {
            "type": "string",
            "description": "Author email or username"
          },
          "timestamp": {
            "type": "string",
            "format": "date-time"
          },
          "filesChanged": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "description": "List of file paths modified"
          },
          "additions": {
            "type": "integer",
            "description": "Lines added"
          },
          "deletions": {
            "type": "integer",
            "description": "Lines deleted"
          },
          "url": {
            "type": "string",
            "format": "uri"
          }
        },
        "required": ["sha", "message", "timestamp"]
      }
    },
    "systemState": {
      "type": "object",
      "description": "Current state of the system",
      "properties": {
        "deploymentStatus": {
          "type": "object",
          "properties": {
            "currentVersion": {
              "type": "string"
            },
            "previousVersion": {
              "type": "string"
            },
            "deployedAt": {
              "type": "string",
              "format": "date-time"
            },
            "deployedBy": {
              "type": "string"
            }
          }
        },
        "serviceHealth": {
          "type": "object",
          "additionalProperties": {
            "type": "string",
            "enum": ["healthy", "degraded", "down", "unknown"]
          }
        },
        "dependencies": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "name": {
                "type": "string"
              },
              "status": {
                "type": "string",
                "enum": ["up", "down", "degraded"]
              },
              "responseTime": {
                "type": "number"
              }
            }
          }
        }
      }
    },
    "relatedDocs": {
      "type": "array",
      "description": "Documents retrieved from knowledge base (RAG)",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "description": "Document identifier in knowledge base"
          },
          "type": {
            "type": "string",
            "enum": ["runbook", "past_incident", "documentation", "best_practice", "playbook"],
            "description": "Type of document"
          },
          "title": {
            "type": "string",
            "description": "Document title"
          },
          "excerpt": {
            "type": "string",
            "description": "Relevant excerpt or summary",
            "maxLength": 1000
          },
          "similarity": {
            "type": "number",
            "minimum": 0,
            "maximum": 1,
            "description": "Similarity score from vector search"
          },
          "url": {
            "type": "string",
            "format": "uri",
            "description": "Link to full document"
          },
          "metadata": {
            "type": "object",
            "properties": {
              "createdAt": {
                "type": "string",
                "format": "date-time"
              },
              "updatedAt": {
                "type": "string",
                "format": "date-time"
              },
              "tags": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              }
            }
          }
        },
        "required": ["id", "type", "title", "similarity"]
      }
    },
    "relatedEvents": {
      "type": "array",
      "description": "Correlated events in the same time window",
      "items": {
        "type": "object",
        "properties": {
          "eventId": {
            "type": "string"
          },
          "type": {
            "type": "string"
          },
          "timestamp": {
            "type": "string",
            "format": "date-time"
          },
          "correlation": {
            "type": "string",
            "enum": ["before", "after", "concurrent"],
            "description": "Temporal relationship to main event"
          }
        }
      }
    },
    "collectedAt": {
      "type": "string",
      "format": "date-time",
      "description": "When this evidence was collected"
    },
    "collectionDuration": {
      "type": "number",
      "description": "Time taken to collect evidence (seconds)"
    }
  }
}
```

### TypeScript Interface

```typescript
interface Evidence {
  eventId: string;
  logs?: LogEntry[];
  metrics?: Metrics;
  gitHistory?: GitCommit[];
  systemState?: SystemState;
  relatedDocs?: KnowledgeDocument[];
  relatedEvents?: RelatedEvent[];
  collectedAt: string;
  collectionDuration?: number;
}

interface LogEntry {
  source?: string;
  timestamp?: string;
  level?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
  message: string;
  stackTrace?: string;
  metadata?: Record<string, any>;
}

interface Metrics {
  timeRange?: {
    start: string;
    end: string;
  };
  timeSeries?: TimeSeriesMetric[];
  summary?: MetricsSummary;
}

interface TimeSeriesMetric {
  metricName: string;
  values: Array<{
    timestamp: string;
    value: number;
  }>;
  unit?: string;
}

interface MetricsSummary {
  errorRate?: number;
  requestRate?: number;
  cpuUsage?: number;
  memoryUsage?: number;
  latencyP50?: number;
  latencyP95?: number;
  latencyP99?: number;
  [key: string]: any;
}

interface GitCommit {
  sha: string;
  message: string;
  author: string;
  timestamp: string;
  filesChanged?: string[];
  additions?: number;
  deletions?: number;
  url?: string;
}

interface SystemState {
  deploymentStatus?: {
    currentVersion?: string;
    previousVersion?: string;
    deployedAt?: string;
    deployedBy?: string;
  };
  serviceHealth?: Record<string, 'healthy' | 'degraded' | 'down' | 'unknown'>;
  dependencies?: Array<{
    name: string;
    status: 'up' | 'down' | 'degraded';
    responseTime?: number;
  }>;
}

interface KnowledgeDocument {
  id: string;
  type: 'runbook' | 'past_incident' | 'documentation' | 'best_practice' | 'playbook';
  title: string;
  excerpt?: string;
  similarity: number;
  url?: string;
  metadata?: {
    createdAt?: string;
    updatedAt?: string;
    tags?: string[];
  };
}

interface RelatedEvent {
  eventId: string;
  type: string;
  timestamp: string;
  correlation: 'before' | 'after' | 'concurrent';
}
```

### Example

```json
{
  "eventId": "evt_a7b3f2e1",
  "logs": [
    {
      "source": "application",
      "timestamp": "2025-12-17T10:30:44Z",
      "level": "ERROR",
      "message": "AUTH_SECRET is not defined",
      "stackTrace": "  at Object.<anonymous> (auth.test.ts:45:12)\n  at TestRunner.run (node_modules/jest/runtime.js:123:8)"
    },
    {
      "source": "application",
      "timestamp": "2025-12-17T10:30:45Z",
      "level": "ERROR",
      "message": "Test suite failed: auth.test.ts"
    }
  ],
  "metrics": {
    "timeRange": {
      "start": "2025-12-17T10:25:00Z",
      "end": "2025-12-17T10:35:00Z"
    },
    "summary": {
      "errorRate": 0.02,
      "cpuUsage": 45,
      "memoryUsage": 60,
      "latencyP95": 250
    }
  },
  "gitHistory": [
    {
      "sha": "abc123def456",
      "message": "Add new authentication flow with JWT",
      "author": "dev@company.com",
      "timestamp": "2025-12-17T09:00:00Z",
      "filesChanged": ["src/auth/jwt.ts", "src/auth/middleware.ts", "tests/auth.test.ts"],
      "additions": 120,
      "deletions": 15,
      "url": "https://github.com/company/backend-api/commit/abc123def456"
    }
  ],
  "systemState": {
    "deploymentStatus": {
      "currentVersion": "v2.3.1",
      "previousVersion": "v2.3.0",
      "deployedAt": "2025-12-17T08:00:00Z",
      "deployedBy": "ci-bot"
    },
    "serviceHealth": {
      "api": "healthy",
      "database": "healthy",
      "cache": "healthy"
    }
  },
  "relatedDocs": [
    {
      "id": "incident_456",
      "type": "past_incident",
      "title": "CI failure due to missing environment variable",
      "excerpt": "Build failed with 'SECRET_KEY is not defined'. Resolution: Added SECRET_KEY to GitHub Actions secrets.",
      "similarity": 0.89,
      "url": "https://company.atlassian.net/browse/INC-456",
      "metadata": {
        "createdAt": "2025-11-20T14:30:00Z",
        "tags": ["ci", "environment-variables"]
      }
    },
    {
      "id": "runbook_cicd",
      "type": "runbook",
      "title": "Debugging CI/CD Failures",
      "excerpt": "Common causes: 1) Missing env vars, 2) Dependency conflicts, 3) Test flakiness. Check GitHub Actions secrets first.",
      "similarity": 0.82,
      "url": "https://docs.company.com/runbooks/cicd-failures"
    }
  ],
  "collectedAt": "2025-12-17T10:31:15Z",
  "collectionDuration": 8.3
}
```

---

## LLMAnalysisResult Schema

### Description
Represents the output from the LLM's analysis of an Event and its Evidence. This is the AI's interpretation, including root cause identification, impact assessment, and recommended actions.

### JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "title": "LLMAnalysisResult",
  "description": "Result of LLM analysis of an event and evidence",
  "required": ["eventId", "summary", "analyzedAt"],
  "properties": {
    "eventId": {
      "type": "string",
      "description": "References the Event that was analyzed",
      "pattern": "^evt_[a-zA-Z0-9]+$"
    },
    "summary": {
      "type": "string",
      "description": "Concise summary of what happened (1-3 sentences)",
      "minLength": 10,
      "maxLength": 500
    },
    "identifiedCause": {
      "type": "string",
      "description": "Root cause as determined by the LLM (null if uncertain)",
      "maxLength": 1000
    },
    "impactAssessment": {
      "type": "object",
      "description": "Analysis of the incident's impact",
      "properties": {
        "scope": {
          "type": "string",
          "enum": ["isolated", "service", "system", "organization"],
          "description": "Scope of impact"
        },
        "affectedUsers": {
          "type": "string",
          "enum": ["none", "few", "some", "many", "all"],
          "description": "User impact level"
        },
        "businessImpact": {
          "type": "string",
          "enum": ["none", "low", "medium", "high", "critical"],
          "description": "Business impact level"
        },
        "description": {
          "type": "string",
          "description": "Detailed impact description"
        }
      }
    },
    "confidence": {
      "type": "string",
      "enum": ["very_low", "low", "medium", "high", "very_high"],
      "description": "LLM's stated confidence in the analysis"
    },
    "confidenceScore": {
      "type": "number",
      "minimum": 0,
      "maximum": 1,
      "description": "Numeric confidence score (computed by system, not LLM)"
    },
    "reasoning": {
      "type": "string",
      "description": "Explanation of how the LLM arrived at its conclusion",
      "maxLength": 2000
    },
    "recommendedActions": {
      "type": "array",
      "description": "Actions suggested by the LLM",
      "items": {
        "type": "object",
        "properties": {
          "actionType": {
            "type": "string",
            "description": "Type of action (will be refined into ActionProposal)"
          },
          "description": {
            "type": "string",
            "description": "What to do"
          },
          "reasoning": {
            "type": "string",
            "description": "Why this action is recommended"
          },
          "priority": {
            "type": "string",
            "enum": ["immediate", "high", "medium", "low"],
            "description": "Urgency of the action"
          }
        },
        "required": ["actionType", "description"]
      }
    },
    "uncertainties": {
      "type": "array",
      "description": "Areas where the LLM is uncertain or lacks information",
      "items": {
        "type": "string"
      }
    },
    "evidenceUsed": {
      "type": "array",
      "description": "References to evidence that informed the analysis",
      "items": {
        "type": "object",
        "properties": {
          "type": {
            "type": "string",
            "enum": ["log", "metric", "commit", "document", "related_incident"]
          },
          "reference": {
            "type": "string",
            "description": "Identifier or excerpt"
          },
          "relevance": {
            "type": "string",
            "description": "Why this evidence was important"
          }
        }
      }
    },
    "relatedIncidents": {
      "type": "array",
      "description": "Past incidents identified as similar",
      "items": {
        "type": "string",
        "description": "Incident ID or reference"
      }
    },
    "nextSteps": {
      "type": "array",
      "description": "Suggested next steps for investigation or resolution",
      "items": {
        "type": "string"
      }
    },
    "analyzedAt": {
      "type": "string",
      "format": "date-time",
      "description": "When the analysis was performed"
    },
    "llmModel": {
      "type": "string",
      "description": "LLM model used (e.g., gpt-4, claude-3-opus)",
      "examples": ["gpt-4-turbo", "claude-3-opus-20240229"]
    },
    "processingTime": {
      "type": "number",
      "description": "Time taken for LLM analysis (seconds)"
    }
  }
}
```

### TypeScript Interface

```typescript
interface LLMAnalysisResult {
  eventId: string;
  summary: string;
  identifiedCause?: string;
  impactAssessment?: ImpactAssessment;
  confidence?: 'very_low' | 'low' | 'medium' | 'high' | 'very_high';
  confidenceScore?: number;
  reasoning?: string;
  recommendedActions?: LLMRecommendedAction[];
  uncertainties?: string[];
  evidenceUsed?: EvidenceReference[];
  relatedIncidents?: string[];
  nextSteps?: string[];
  analyzedAt: string;
  llmModel?: string;
  processingTime?: number;
}

interface ImpactAssessment {
  scope?: 'isolated' | 'service' | 'system' | 'organization';
  affectedUsers?: 'none' | 'few' | 'some' | 'many' | 'all';
  businessImpact?: 'none' | 'low' | 'medium' | 'high' | 'critical';
  description?: string;
}

interface LLMRecommendedAction {
  actionType: string;
  description: string;
  reasoning?: string;
  priority?: 'immediate' | 'high' | 'medium' | 'low';
}

interface EvidenceReference {
  type: 'log' | 'metric' | 'commit' | 'document' | 'related_incident';
  reference: string;
  relevance?: string;
}
```

### Example

```json
{
  "eventId": "evt_a7b3f2e1",
  "summary": "CI pipeline failed due to missing AUTH_SECRET environment variable in test environment, introduced by recent authentication refactor.",
  "identifiedCause": "Recent commit abc123def456 added new JWT authentication flow that requires AUTH_SECRET environment variable, but this variable was not added to GitHub Actions secrets configuration.",
  "impactAssessment": {
    "scope": "isolated",
    "affectedUsers": "none",
    "businessImpact": "low",
    "description": "Impact limited to CI pipeline. No production systems or users affected. Blocks merging of new code until resolved."
  },
  "confidence": "high",
  "confidenceScore": 0.95,
  "reasoning": "The error message explicitly states 'AUTH_SECRET is not defined', which directly correlates with the new authentication code added in the most recent commit. Similar past incident (INC-456) had identical symptoms and resolution. The cause is clear and the fix is straightforward.",
  "recommendedActions": [
    {
      "actionType": "add_environment_variable",
      "description": "Add AUTH_SECRET to GitHub Actions repository secrets",
      "reasoning": "This will provide the missing environment variable to the CI environment, resolving the immediate failure",
      "priority": "immediate"
    },
    {
      "actionType": "rerun_pipeline",
      "description": "Re-run the failed CI pipeline after adding the secret",
      "reasoning": "Verify that the fix resolves the issue",
      "priority": "immediate"
    },
    {
      "actionType": "update_documentation",
      "description": "Document the AUTH_SECRET requirement in setup guide",
      "reasoning": "Prevent similar issues in the future for new contributors or environments",
      "priority": "medium"
    }
  ],
  "uncertainties": [],
  "evidenceUsed": [
    {
      "type": "log",
      "reference": "AUTH_SECRET is not defined at auth.test.ts:45",
      "relevance": "Direct error message identifying missing variable"
    },
    {
      "type": "commit",
      "reference": "abc123def456: Add new authentication flow with JWT",
      "relevance": "Introduced code that requires AUTH_SECRET"
    },
    {
      "type": "related_incident",
      "reference": "INC-456: CI failure due to missing environment variable",
      "relevance": "Nearly identical past incident with proven resolution"
    }
  ],
  "relatedIncidents": ["incident_456"],
  "nextSteps": [
    "Add AUTH_SECRET to GitHub Actions secrets",
    "Re-run pipeline to verify fix",
    "Consider adding environment variable validation to CI startup"
  ],
  "analyzedAt": "2025-12-17T10:31:45Z",
  "llmModel": "gpt-4-turbo-2024-04-09",
  "processingTime": 3.2
}
```

---

## ActionProposal Schema

### Description
Represents a single actionable recommendation that has been validated and prepared for execution. Derived from LLMAnalysisResult, but structured for deterministic processing and approval workflows.

### JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "title": "ActionProposal",
  "description": "A validated, actionable recommendation ready for execution",
  "required": ["id", "eventId", "actionType", "description", "confidence", "requiresApproval", "safetyLevel"],
  "properties": {
    "id": {
      "type": "string",
      "description": "Unique identifier for this action proposal",
      "pattern": "^act_[a-zA-Z0-9]+$"
    },
    "eventId": {
      "type": "string",
      "description": "References the Event this action addresses",
      "pattern": "^evt_[a-zA-Z0-9]+$"
    },
    "actionType": {
      "type": "string",
      "description": "Standardized action type",
      "enum": [
        "rollback_deployment",
        "restart_service",
        "scale_service",
        "add_environment_variable",
        "update_configuration",
        "rerun_pipeline",
        "notify_team",
        "run_diagnostic",
        "update_documentation",
        "create_ticket",
        "post_comment",
        "execute_runbook",
        "manual_investigation"
      ]
    },
    "description": {
      "type": "string",
      "description": "Human-readable description of what this action will do",
      "minLength": 10,
      "maxLength": 500
    },
    "reasoning": {
      "type": "string",
      "description": "Why this action is being recommended",
      "maxLength": 1000
    },
    "confidence": {
      "type": "number",
      "minimum": 0,
      "maximum": 1,
      "description": "Confidence score for this specific action (from confidence scoring system)"
    },
    "priority": {
      "type": "string",
      "enum": ["immediate", "high", "medium", "low"],
      "description": "Urgency of this action",
      "default": "medium"
    },
    "safetyLevel": {
      "type": "string",
      "enum": ["safe", "low_risk", "medium_risk", "high_risk", "dangerous"],
      "description": "Safety classification of this action"
    },
    "requiresApproval": {
      "type": "boolean",
      "description": "Whether human approval is required before execution"
    },
    "autoExecutable": {
      "type": "boolean",
      "description": "Whether this action can be auto-executed if approved",
      "default": false
    },
    "executionDetails": {
      "type": "object",
      "description": "Technical details for executing this action",
      "properties": {
        "api": {
          "type": "string",
          "description": "API or service to call"
        },
        "endpoint": {
          "type": "string",
          "description": "Endpoint path"
        },
        "method": {
          "type": "string",
          "enum": ["GET", "POST", "PUT", "PATCH", "DELETE"]
        },
        "parameters": {
          "type": "object",
          "description": "Parameters for the API call or script",
          "additionalProperties": true
        },
        "command": {
          "type": "string",
          "description": "Shell command to execute (if applicable)"
        },
        "script": {
          "type": "string",
          "description": "Script path or name to run"
        }
      }
    },
    "expectedOutcome": {
      "type": "string",
      "description": "What should happen if this action succeeds"
    },
    "rollbackPlan": {
      "type": "string",
      "description": "How to undo this action if needed"
    },
    "estimatedDuration": {
      "type": "number",
      "description": "Estimated time to complete (seconds)"
    },
    "dependencies": {
      "type": "array",
      "description": "Action IDs that must complete before this one",
      "items": {
        "type": "string"
      }
    },
    "status": {
      "type": "string",
      "enum": ["proposed", "approved", "rejected", "executing", "completed", "failed", "rolled_back"],
      "description": "Current status of this action",
      "default": "proposed"
    },
    "approvedBy": {
      "type": "string",
      "description": "User who approved this action"
    },
    "approvedAt": {
      "type": "string",
      "format": "date-time",
      "description": "When approval was given"
    },
    "executedAt": {
      "type": "string",
      "format": "date-time",
      "description": "When execution started"
    },
    "completedAt": {
      "type": "string",
      "format": "date-time",
      "description": "When execution completed"
    },
    "executionResult": {
      "type": "object",
      "description": "Result of execution",
      "properties": {
        "success": {
          "type": "boolean"
        },
        "message": {
          "type": "string"
        },
        "output": {
          "type": "string"
        },
        "error": {
          "type": "string"
        }
      }
    },
    "createdAt": {
      "type": "string",
      "format": "date-time",
      "description": "When this proposal was created"
    }
  }
}
```

### TypeScript Interface

```typescript
interface ActionProposal {
  // Identification
  id: string; // Format: act_<alphanumeric>
  eventId: string;

  // Action specification
  actionType: ActionType;
  description: string;
  reasoning?: string;

  // Confidence & safety
  confidence: number; // 0.0 to 1.0
  priority?: ActionPriority;
  safetyLevel: SafetyLevel;
  requiresApproval: boolean;
  autoExecutable?: boolean;

  // Execution details
  executionDetails?: ExecutionDetails;
  expectedOutcome?: string;
  rollbackPlan?: string;
  estimatedDuration?: number;
  dependencies?: string[];

  // Lifecycle tracking
  status?: ActionStatus;
  approvedBy?: string;
  approvedAt?: string;
  executedAt?: string;
  completedAt?: string;
  executionResult?: ExecutionResult;
  createdAt?: string;
}

type ActionType =
  | 'rollback_deployment'
  | 'restart_service'
  | 'scale_service'
  | 'add_environment_variable'
  | 'update_configuration'
  | 'rerun_pipeline'
  | 'notify_team'
  | 'run_diagnostic'
  | 'update_documentation'
  | 'create_ticket'
  | 'post_comment'
  | 'execute_runbook'
  | 'manual_investigation';

type ActionPriority = 'immediate' | 'high' | 'medium' | 'low';

type SafetyLevel = 'safe' | 'low_risk' | 'medium_risk' | 'high_risk' | 'dangerous';

type ActionStatus =
  | 'proposed'
  | 'approved'
  | 'rejected'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'rolled_back';

interface ExecutionDetails {
  api?: string;
  endpoint?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  parameters?: Record<string, any>;
  command?: string;
  script?: string;
}

interface ExecutionResult {
  success: boolean;
  message?: string;
  output?: string;
  error?: string;
}
```

### Example

```json
{
  "id": "act_x9y2z1",
  "eventId": "evt_a7b3f2e1",
  "actionType": "add_environment_variable",
  "description": "Add AUTH_SECRET to GitHub Actions repository secrets",
  "reasoning": "Recent commit introduced JWT authentication that requires AUTH_SECRET environment variable. Similar past incident (INC-456) resolved by adding missing secret. Error logs confirm variable is missing.",
  "confidence": 0.95,
  "priority": "immediate",
  "safetyLevel": "medium_risk",
  "requiresApproval": true,
  "autoExecutable": true,
  "executionDetails": {
    "api": "github",
    "endpoint": "/repos/company/backend-api/actions/secrets/AUTH_SECRET",
    "method": "PUT",
    "parameters": {
      "encrypted_value": "<encrypted>",
      "key_id": "012345678"
    }
  },
  "expectedOutcome": "AUTH_SECRET will be available in GitHub Actions environment, allowing authentication tests to pass",
  "rollbackPlan": "Delete the secret via GitHub API or UI if it causes issues",
  "estimatedDuration": 5,
  "dependencies": [],
  "status": "proposed",
  "createdAt": "2025-12-17T10:31:50Z"
}
```

---

## Supporting Types

### EventType Enum
```typescript
enum EventType {
  CICD_FAILURE = 'CICD_FAILURE',
  DEPLOYMENT_FAILURE = 'DEPLOYMENT_FAILURE',
  MONITORING_ALERT = 'MONITORING_ALERT',
  PERFORMANCE_DEGRADATION = 'PERFORMANCE_DEGRADATION',
  ERROR_SPIKE = 'ERROR_SPIKE',
  SECURITY_ALERT = 'SECURITY_ALERT',
  MANUAL_TRIGGER = 'MANUAL_TRIGGER',
  SERVICE_DOWN = 'SERVICE_DOWN',
  TEST_FAILURE = 'TEST_FAILURE'
}
```

### EventSeverity Enum
```typescript
enum EventSeverity {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
  INFO = 'info'
}
```

### ConfidenceLevel Enum
```typescript
enum ConfidenceLevel {
  VERY_LOW = 'very_low',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  VERY_HIGH = 'very_high'
}
```

---

## Validation Rules

### Event Validation
- `id` must match pattern `evt_[a-zA-Z0-9]+`
- `timestamp` must be valid ISO 8601 format
- `type` must be one of the defined EventType values
- `severity` defaults to 'medium' if not provided
- `title` max length: 200 characters
- `payload.url` must be valid URI if present

### Evidence Validation
- `eventId` must reference an existing Event
- `logs[].timestamp` must be valid ISO 8601
- `metrics.summary` numeric fields must be >= 0
- `relatedDocs[].similarity` must be between 0 and 1
- `collectionDuration` must be positive number

### LLMAnalysisResult Validation
- `summary` length: 10-500 characters
- `identifiedCause` max length: 1000 characters
- `confidenceScore` must be between 0 and 1
- `reasoning` max length: 2000 characters
- `analyzedAt` must be valid ISO 8601

### ActionProposal Validation
- `id` must match pattern `act_[a-zA-Z0-9]+`
- `confidence` must be between 0 and 1
- `requiresApproval` must be true for safetyLevel 'high_risk' or 'dangerous'
- `autoExecutable` must be false for safetyLevel 'dangerous'
- `executedAt` must be after `approvedAt` if both present
- `completedAt` must be after `executedAt` if both present

---

## Examples

See individual schema sections above for detailed examples of each data type.

### Complete Flow Example

```json
// 1. Event received
{
  "id": "evt_a7b3f2e1",
  "type": "CICD_FAILURE",
  "source": "GitHubActions",
  "timestamp": "2025-12-17T10:30:45Z",
  "payload": { /* ... */ }
}

// 2. Evidence collected
{
  "eventId": "evt_a7b3f2e1",
  "logs": [ /* ... */ ],
  "metrics": { /* ... */ },
  "gitHistory": [ /* ... */ ],
  "relatedDocs": [ /* ... */ ]
}

// 3. LLM analysis performed
{
  "eventId": "evt_a7b3f2e1",
  "summary": "CI pipeline failed due to missing AUTH_SECRET",
  "identifiedCause": "Recent commit requires AUTH_SECRET env var",
  "confidence": "high",
  "recommendedActions": [ /* ... */ ]
}

// 4. Actions proposed
[
  {
    "id": "act_x9y2z1",
    "eventId": "evt_a7b3f2e1",
    "actionType": "add_environment_variable",
    "description": "Add AUTH_SECRET to GitHub Actions secrets",
    "confidence": 0.95,
    "requiresApproval": true,
    "status": "proposed"
  }
]

// 5. Action approved and executed
{
  "id": "act_x9y2z1",
  /* ... */
  "status": "completed",
  "approvedBy": "user@company.com",
  "approvedAt": "2025-12-17T10:35:00Z",
  "executedAt": "2025-12-17T10:35:05Z",
  "completedAt": "2025-12-17T10:35:10Z",
  "executionResult": {
    "success": true,
    "message": "Secret added successfully"
  }
}
```

---

**Document Version**: 1.0
**Last Updated**: 2025-12-17
**Related Documents**:
- [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) - System architecture overview
- [CONFIDENCE_SCORING.md](./CONFIDENCE_SCORING.md) - Confidence scoring details
- [PROMPT_TEMPLATES.md](./PROMPT_TEMPLATES.md) - LLM prompt templates

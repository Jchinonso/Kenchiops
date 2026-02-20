/**
 * OpenAPI Schema Components
 *
 * Reusable schemas, security schemes, parameters, and helpers
 * for the Kenchi API OpenAPI specification.
 *
 * @module swagger/components
 */

// ==================== Helpers ====================

export const successEnvelope = (dataSchema: object): object => ({
  type: "object",
  properties: {
    data: dataSchema,
  },
});

export const paginationParams: readonly object[] = [
  {
    name: "limit",
    in: "query",
    schema: { type: "integer", default: 20 },
    description: "Maximum items to return",
  },
  {
    name: "offset",
    in: "query",
    schema: { type: "integer", default: 0 },
    description: "Number of items to skip",
  },
];

export const tenantQueryParam = {
  name: "tenantId",
  in: "query",
  schema: { type: "string" },
  description: "Tenant ID for scoping",
} as const;

export const bearerAuth = [{ BearerAuth: [] }];

// ==================== Components ====================

export const components = {
  securitySchemes: {
    BearerAuth: {
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
      description: "JWT access token (also sent as httpOnly cookie)",
    },
    CookieAuth: {
      type: "apiKey",
      in: "cookie",
      name: "kenchi_access",
      description: "httpOnly cookie set after OAuth callback",
    },
  },
  schemas: {
    Error: {
      type: "object",
      properties: {
        error: {
          type: "object",
          properties: {
            code: { type: "string" },
            message: { type: "string" },
            requestId: { type: "string" },
          },
        },
      },
    },
    HealthResponse: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["healthy", "degraded", "unhealthy"] },
        service: { type: "string" },
        version: { type: "string" },
        uptime: { type: "number" },
        timestamp: { type: "string", format: "date-time" },
        components: { type: "object", additionalProperties: true },
      },
    },
    UserProfile: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        email: { type: "string", format: "email" },
        displayName: { type: "string" },
        avatarUrl: { type: "string", format: "uri" },
        tenantId: { type: "string" },
        role: { type: "string", enum: ["owner", "admin", "member"] },
        providers: {
          type: "array",
          items: {
            type: "object",
            properties: {
              provider: { type: "string" },
              username: { type: "string" },
            },
          },
        },
        createdAt: { type: "string", format: "date-time" },
      },
    },
    AnalyzeRequest: {
      type: "object",
      required: ["failure_log", "repository"],
      properties: {
        failure_log: { type: "string", description: "CI failure log content" },
        repository: { type: "string", description: "Repository full name (owner/repo)" },
        commit: { type: "string", description: "Commit SHA" },
        tenant_id: { type: "string" },
        workflow_id: { type: "string" },
        test_framework: { type: "string" },
        pr_number: { type: "integer" },
        pr_diff: { type: "string" },
        pr_changed_files: { type: "array", items: { type: "string" } },
        pr_title: { type: "string" },
      },
    },
    JobStatus: {
      type: "object",
      properties: {
        job_id: { type: "string", format: "uuid" },
        status: { type: "string", enum: ["pending", "processing", "completed", "failed"] },
        result: { type: "object", additionalProperties: true },
        error: { type: "string" },
      },
    },
    IngestRequest: {
      type: "object",
      required: ["docType", "title", "content"],
      properties: {
        docType: {
          type: "string",
          enum: ["runbook", "postmortem", "architecture", "adr", "faq", "sop", "glossary"],
        },
        title: { type: "string" },
        content: { type: "string" },
        tenantId: { type: "string" },
        repository: { type: "string" },
        sourceUrl: { type: "string", format: "uri" },
        filePath: { type: "string" },
        metadata: { type: "object", additionalProperties: true },
      },
    },
    SearchRequest: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string" },
        tenantId: { type: "string" },
        repository: { type: "string" },
        topK: { type: "integer", default: 10 },
        minSimilarity: { type: "number", default: 0.7 },
      },
    },
    RiskRule: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        tenantId: { type: "string" },
        name: { type: "string" },
        description: { type: "string" },
        actionTypes: { type: "array", items: { type: "string" } },
        environment: { type: "string", enum: ["production", "staging", "development"] },
        enabled: { type: "boolean" },
        priority: { type: "integer" },
        createdAt: { type: "string", format: "date-time" },
      },
    },
    CreateRiskRuleRequest: {
      type: "object",
      required: ["tenantId", "name", "actionTypes"],
      properties: {
        tenantId: { type: "string" },
        name: { type: "string" },
        description: { type: "string" },
        actionTypes: { type: "array", items: { type: "string" } },
        environment: { type: "string", enum: ["production", "staging", "development"] },
        blastRadius: { type: "string" },
        reversibility: { type: "string" },
        dataImpact: { type: "string" },
        scoreModifier: { type: "number" },
        productionMultiplier: { type: "number" },
        incidentModeMultiplier: { type: "number" },
        offHoursMultiplier: { type: "number" },
        requireApprovalThreshold: { type: "number" },
        blockThreshold: { type: "number" },
        enabled: { type: "boolean", default: true },
        priority: { type: "integer" },
        createdBy: { type: "string" },
      },
    },
  },
} as const;

// ==================== Tags ====================

export const tags = [
  { name: "Health", description: "Health checks and liveness probes" },
  { name: "Auth", description: "OAuth authentication, token management, and user profile" },
  { name: "Analysis", description: "CI failure analysis jobs (async)" },
  { name: "Dashboard", description: "CI/CD dashboard data endpoints (requires tenant)" },
  { name: "SSE", description: "Server-Sent Events for real-time dashboard updates" },
  { name: "Webhooks", description: "Generic webhook ingestion" },
  { name: "Events", description: "Event ingestion and processing" },
  { name: "RAG - Core", description: "RAG document ingestion, search, and statistics" },
  { name: "RAG - Purge", description: "RAG data deletion (admin/owner only)" },
  { name: "RAG - Health", description: "RAG system health, metrics, and cleanup" },
  { name: "RAG - Cost", description: "Embedding tier configuration and cost estimation" },
  { name: "RAG - Drift", description: "Drift detection, staleness monitoring, and re-embedding" },
  { name: "Fine-Tuning - Dataset", description: "Training dataset extraction and statistics" },
  { name: "Fine-Tuning - Jobs", description: "Fine-tuning job management and scheduler" },
  { name: "Fine-Tuning - Models", description: "Model versions, evaluation, and A/B testing" },
  { name: "Integrations", description: "CI provider OAuth connections (Vercel, Netlify)" },
  { name: "Risk Rules", description: "Custom risk rule management and assessment audit trail" },
] as const;

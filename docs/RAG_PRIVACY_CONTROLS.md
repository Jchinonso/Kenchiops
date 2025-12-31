# RAG Privacy Controls

This document describes the privacy controls, data protection mechanisms, and purge capabilities implemented in Kenchi's RAG (Retrieval-Augmented Generation) system.

## Overview

Kenchi's RAG system handles sensitive data from CI/CD pipelines, Slack conversations, and PR discussions. Privacy controls are built into every layer of the system to ensure data protection and regulatory compliance.

## Secret and PII Redaction

### Automatic Redaction Pipeline

All content is redacted before embedding and storage. The redaction pipeline runs in `packages/shared/src/rag/secretRedaction.ts`.

**Redacted Content Types:**

| Type            | Pattern Examples                    | Replacement                 |
| --------------- | ----------------------------------- | --------------------------- |
| API Keys        | `sk-...`, `AKIA...`, `ghp_...`      | `[REDACTED_API_KEY]`        |
| Passwords       | `password=...`, credentials in URLs | `[REDACTED_PASSWORD]`       |
| Tokens          | Bearer tokens, JWT, OAuth tokens    | `[REDACTED_TOKEN]`          |
| Private Keys    | `-----BEGIN PRIVATE KEY-----`       | `[REDACTED_PRIVATE_KEY]`    |
| Email Addresses | `user@domain.com`                   | `[REDACTED_EMAIL]`          |
| IP Addresses    | `192.168.1.1`, IPv6 addresses       | `[REDACTED_IP]`             |
| AWS Credentials | Access keys, secret keys            | `[REDACTED_AWS_CREDENTIAL]` |
| Database URLs   | Connection strings with passwords   | `[REDACTED_DATABASE_URL]`   |

### When Redaction Occurs

1. **Before Embedding**: All text is redacted before generating embeddings
2. **Before Storage**: Content stored in `diff_chunks` and `knowledge_documents` is redacted
3. **Log Sanitization**: CI logs are sanitized before analysis

### Verification

```typescript
import { redactSecrets, containsSensitiveData } from "@kenchi/shared";

// Check if content contains sensitive data
const hasSensitive = containsSensitiveData(content);

// Redact before processing
const safeContent = redactSecrets(content);
```

## Tenant Isolation

### Multi-Tenant Data Separation

All RAG data is scoped by `tenant_id`. Queries are always filtered by tenant.

**Enforced At:**

- Database queries (WHERE tenant_id = ...)
- Vector search (filter by tenant_id)
- API endpoints (tenant extracted from authentication)

### Tenant-Scoped Tables

| Table                 | Tenant Column | Isolation Level |
| --------------------- | ------------- | --------------- |
| `diff_chunks`         | `tenant_id`   | Per-tenant      |
| `knowledge_documents` | `tenant_id`   | Per-tenant      |
| `analysis_feedback`   | `tenant_id`   | Per-tenant      |
| `rag_feedback`        | `tenant_id`   | Per-tenant      |

## Purge APIs

### Available Purge Endpoints

All purge operations are available via the API service.

#### 1. Purge Tenant Data

Removes all RAG data for a specific tenant. Used for GDPR compliance and tenant offboarding.

```bash
DELETE /api/rag/tenant/:tenantId
```

**Response:**

```json
{
  "success": true,
  "data": {
    "tenantId": "tenant-123",
    "deletedCount": 1542,
    "errors": []
  }
}
```

#### 2. Purge PR Diff Chunks

Removes diff chunks for a specific PR. Used when a PR is closed or merged.

```bash
DELETE /api/rag/pr/:repository/:prNumber
```

**Response:**

```json
{
  "success": true,
  "data": {
    "repository": "owner/repo",
    "prNumber": 123,
    "deletedCount": 45,
    "errors": []
  }
}
```

#### 3. Purge Knowledge Document

Removes a specific knowledge document and all its chunks.

```bash
DELETE /api/rag/doc/:parentId
```

**Response:**

```json
{
  "success": true,
  "data": {
    "parentId": "doc-uuid-123",
    "deletedCount": 12,
    "errors": []
  }
}
```

### Programmatic Purge

```typescript
import { purgeTenantRAGData, purgePRDiffChunks, purgeKnowledgeDocChunks } from "@kenchi/shared";

// Purge all tenant data
await purgeTenantRAGData("tenant-123");

// Purge PR diff chunks
await purgePRDiffChunks("owner/repo", 123);

// Purge specific document
await purgeKnowledgeDocChunks("doc-uuid-123");
```

## Data Retention

### TTL Policies

Documents have time-to-live (TTL) policies that automatically expire old data.

| Document Type    | Default TTL | Configurable |
| ---------------- | ----------- | ------------ |
| Diff Chunks      | 30 days     | Yes          |
| Knowledge Docs   | 90 days     | Yes          |
| Postmortems      | 365 days    | Yes          |
| External Sources | 7 days      | Yes          |

### Staleness Management

Documents approaching expiry are marked as stale before deletion.

```typescript
import { checkStaleness, cleanupExpired } from "@kenchi/shared";

// Check current staleness status
const status = await checkStaleness();
// { staleDiffChunks: 12, staleKnowledgeDocs: 5, ... }

// Clean up expired documents
const result = await cleanupExpired();
// { diffChunksDeleted: 8, knowledgeDocsDeleted: 3, ... }
```

### Lifecycle States

| State   | Description        | Searchable         |
| ------- | ------------------ | ------------------ |
| Active  | Normal document    | Yes                |
| Stale   | Approaching expiry | Yes (reduced rank) |
| Expired | Past TTL           | No (auto-deleted)  |

## Slack Data Privacy

### Thread Capture Controls

- Only threads on Kenchi notifications are captured
- User can opt-out specific threads
- Channel permissions are respected

### Resolution Detection Privacy

- Only capture resolution message, not entire thread
- Exclude messages from opt-out users
- Redact @mentions and user IDs

## Audit Logging

All privacy-related operations are logged:

```
[INFO] Purging tenant RAG data { tenantId: "...", requestedBy: "..." }
[INFO] Tenant RAG data purged { tenantId: "...", deletedCount: ... }
[INFO] Secret redaction applied { originalLength: ..., redactedPatterns: [...] }
```

## Compliance Considerations

### GDPR Support

- Right to erasure: Use tenant purge API
- Data portability: Export via stats API
- Data minimization: TTL policies

### SOC 2 Controls

- Tenant isolation verified at query time
- Secret redaction logged and auditable
- Purge operations logged with requestor

## Configuration

### Environment Variables

```bash
# Enable strict secret redaction (default: true)
RAG_STRICT_REDACTION=true

# TTL override (days)
RAG_DIFF_CHUNK_TTL_DAYS=30
RAG_KNOWLEDGE_DOC_TTL_DAYS=90

# Enable audit logging
RAG_AUDIT_LOGGING=true
```

### Runtime Configuration

```typescript
import { TTL_POLICIES } from "@kenchi/shared";

// Default policies
TTL_POLICIES.DIFF_CHUNKS_DEFAULT_DAYS; // 30
TTL_POLICIES.KNOWLEDGE_DOCS_DEFAULT_DAYS; // 90
TTL_POLICIES.INCIDENT_DOCS_DAYS; // 365
```

## Best Practices

1. **Always verify tenant context** before RAG operations
2. **Use purge APIs** instead of direct database deletes
3. **Monitor redaction logs** for missed patterns
4. **Set appropriate TTLs** based on data sensitivity
5. **Regular staleness cleanup** via scheduled jobs

# RAG Admin Guide

This guide covers administration tasks for Kenchi's RAG (Retrieval-Augmented Generation) system, including document ingestion, monitoring, and maintenance.

## Document Ingestion

### Automatic Ingestion (Zero-Config)

Most knowledge is captured automatically without admin intervention:

| Source            | Trigger                       | Configuration |
| ----------------- | ----------------------------- | ------------- |
| Analysis Lessons  | User clicks "Helpful"         | None required |
| PR Fix Comments   | Check succeeds after failure  | None required |
| Slack Resolutions | Resolution detected in thread | None required |
| Diff Chunks       | PR merged                     | None required |

### Manual Document Ingestion

For team documentation that should be added to the knowledge base.

#### API Endpoint

```bash
POST /api/rag/ingest
Content-Type: application/json

{
  "docType": "runbook",
  "title": "Database Migration Runbook",
  "content": "## Steps\n1. Backup database...",
  "repository": "owner/repo",
  "tenantId": "tenant-123",
  "sourceUrl": "https://github.com/owner/repo/docs/runbook.md",
  "metadata": {
    "author": "admin@company.com",
    "tags": ["database", "migration"]
  }
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "documentId": "doc-uuid-123",
    "chunksCreated": 5,
    "chunksEmbedded": 5
  }
}
```

#### CLI Tool

```bash
# Single document
npx tsx scripts/ingest-documents.ts \
  --file docs/runbook.md \
  --type runbook \
  --repo owner/repo

# Batch import
npx tsx scripts/batch-import-docs.ts \
  --directory knowledge/ \
  --type documentation
```

### Document Types

| Type               | Use Case                        | Reliability Score |
| ------------------ | ------------------------------- | ----------------- |
| `runbook`          | Step-by-step operational guides | 1.0               |
| `sop`              | Standard operating procedures   | 1.0               |
| `troubleshooting`  | Problem-solution guides         | 1.0               |
| `postmortem`       | Incident reports                | 1.0               |
| `documentation`    | General technical docs          | 1.0               |
| `architecture`     | System design docs              | 1.0               |
| `pr_fix_comment`   | Auto-captured from PRs          | 0.85              |
| `slack_resolution` | Auto-captured from Slack        | 0.75              |
| `analysis_lesson`  | Auto-captured from feedback     | 0.70              |
| `external`         | External sources                | 0.60              |

## Monitoring

### RAG Statistics

```bash
GET /api/rag/stats?tenantId=tenant-123
```

**Response:**

```json
{
  "success": true,
  "data": {
    "totalDocuments": 1542,
    "documentsByType": {
      "runbook": 45,
      "analysis_lesson": 890,
      "pr_fix_comment": 234,
      "slack_resolution": 123
    },
    "tenantStats": {
      "tenantId": "tenant-123",
      "diffChunkCount": 2340,
      "knowledgeDocCounts": {...},
      "pendingEmbeddings": 0,
      "outdatedEmbeddings": 12
    }
  }
}
```

### Health Check

```typescript
import { checkRAGHealth } from "@kenchi/shared";

const health = await checkRAGHealth();
// {
//   status: 'healthy',
//   embedding: { pendingCount: 0, errorRate: 0 },
//   storage: { diffChunks: 5234, knowledgeDocs: 1542 },
//   staleness: { staleCount: 12, expiringCount: 5 }
// }
```

### Metrics to Monitor

| Metric                | Description                | Alert Threshold |
| --------------------- | -------------------------- | --------------- |
| `pendingEmbeddings`   | Docs waiting for embedding | > 100           |
| `embeddingErrorRate`  | Failed embedding rate      | > 5%            |
| `staleDocumentCount`  | Docs marked stale          | > 50            |
| `averageQueryLatency` | Search response time       | > 500ms         |

## External Source Sync

### GitHub Issues Connector

Syncs GitHub Issues with workaround/solution content.

```typescript
import { syncExternalSource, syncDueSources } from "@kenchi/shared";

// Sync specific source
await syncExternalSource("github-issues", {
  tenantId: "tenant-123",
  repository: "owner/repo",
});

// Sync all due sources
const result = await syncDueSources({
  maxDocsPerSource: 100,
  minCredibility: 0.6,
});
```

### Sync API

```bash
POST /api/rag/sync
Content-Type: application/json

{
  "maxDocsPerSource": 100,
  "minCredibility": 0.6,
  "limit": 10
}
```

## Maintenance Tasks

### Staleness Cleanup

Remove expired documents and mark stale ones.

```typescript
import { cleanupExpired, getStaleDocuments } from "@kenchi/shared";

// View stale documents
const stale = await getStaleDocuments(100);

// Run cleanup
const result = await cleanupExpired();
// { diffChunksDeleted: 45, knowledgeDocsDeleted: 12, ... }
```

### Re-embedding

Trigger re-embedding when the embedding model is updated.

```typescript
import { triggerReembedding } from "@kenchi/shared";

const result = await triggerReembedding({
  tenantId: "tenant-123",
  docTypes: ["runbook", "troubleshooting"],
  batchSize: 100,
});
```

### Purge Operations

See [RAG_PRIVACY_CONTROLS.md](./RAG_PRIVACY_CONTROLS.md) for purge APIs.

## Knowledge Quality

### Quality Scoring

Documents are ranked by quality score during retrieval:

```
finalScore = (vectorSimilarity * 0.55) +
             (sourceReliability * 0.20) +
             (recencyBoost * 0.15) +
             (feedbackSignal * 0.10) +
             metadataBoost
```

### Improving Quality

1. **Encourage feedback** - Users clicking "Helpful" improves ranking
2. **Use specific doc types** - Higher reliability scores for team docs
3. **Keep docs updated** - Newer docs get recency boost
4. **Add metadata** - Repository, workflow, error signatures improve matching

### Hit Count Tracking

Popular documents (frequently retrieved) get higher rankings over time.

```typescript
// View document stats
const stats = await getKnowledgeDocCountsByType();
// { runbook: 45, analysis_lesson: 890, ... }
```

## Troubleshooting

### Common Issues

#### Documents Not Being Retrieved

1. Check embedding status: Look for `pendingEmbeddings > 0`
2. Verify tenant isolation: Ensure tenant_id matches
3. Check similarity thresholds: Default is 0.70 for diff, 0.78 for knowledge

#### High Latency

1. Check pending embedding queue
2. Verify database indexes on `embedding` columns
3. Consider reducing `topK` in queries

#### Stale Data

1. Run `cleanupExpired()` to remove old data
2. Check TTL policies for document types
3. Verify sync jobs are running

### Debug Logging

Enable debug logging for RAG operations:

```bash
LOG_LEVEL=debug npm run start:api
```

Look for logs with these prefixes:

- `rag-ingestion`
- `rag-search`
- `rag-reranker`
- `rag-streaming-updates`

## Bootstrap Templates

Pre-built templates are available in `knowledge/` folder:

- `runbook-template.md` - Standard runbook structure
- `troubleshooting-template.md` - Problem-solution format
- `postmortem-template.md` - Incident report format

To import templates:

```bash
npx tsx scripts/batch-import-docs.ts \
  --directory knowledge/ \
  --type documentation \
  --tenant tenant-123
```

## API Reference

| Endpoint                 | Method | Description            |
| ------------------------ | ------ | ---------------------- |
| `/api/rag/ingest`        | POST   | Ingest single document |
| `/api/rag/search`        | POST   | Semantic search        |
| `/api/rag/stats`         | GET    | System statistics      |
| `/api/rag/sync`          | POST   | Trigger external sync  |
| `/api/rag/tenant/:id`    | DELETE | Purge tenant data      |
| `/api/rag/pr/:repo/:num` | DELETE | Purge PR data          |
| `/api/rag/doc/:id`       | DELETE | Purge document         |

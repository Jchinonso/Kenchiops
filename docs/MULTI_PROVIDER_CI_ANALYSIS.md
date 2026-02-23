# Multi-Provider CI/CD Log Analysis v1

## Executive Summary

This document specifies the extension of Kenchi's CI/CD log analysis pipeline to support multiple CI/CD providers beyond GitHub Actions. The core analysis pipeline (chunk → extract → aggregate → LLM analysis) is already provider-agnostic. This spec defines the **provider abstraction layer**, **webhook ingestion adapters**, **log fetching adapters**, and **output routing** needed to analyze build failures from Vercel, Netlify, AWS CodeBuild, GitLab CI, CircleCI, Bitbucket Pipelines, and custom sources.

**Design Principles:**

1. The analysis pipeline (`services/api`) remains untouched — providers are an ingestion concern
2. Each provider is a pair of adapters behind a shared port interface
3. Webhook signature validation is mandatory for every provider (CLAUDE.md rule #12)
4. Provider-specific code is isolated in adapters — services never know the source
5. The normalized event model maps all providers to a common shape before entering the pipeline

**What Changes vs What Stays:**

| Component                                         | Changes? | Description                                            |
| ------------------------------------------------- | -------- | ------------------------------------------------------ |
| Analysis pipeline (`analysisService.ts`)          | No       | Chunk → extract → aggregate → LLM stays identical      |
| Chunking pipeline (`analysisChunkingPipeline.ts`) | No       | Log processing is text-based, provider-agnostic        |
| LLM extraction (`llmExtraction.ts`)               | No       | Works on raw log text                                  |
| Final analysis (`LLMClient.analyzeIncident`)      | No       | Works on structured evidence                           |
| Redis aggregation layer                           | Minor    | Aggregation key format extended for non-GitHub sources |
| Webhook ingestion                                 | New      | Provider-specific webhook handlers                     |
| Log fetching                                      | New      | Provider-specific API adapters                         |
| Output routing                                    | New      | Provider-specific result posting                       |
| Provider registry                                 | New      | Tenant-level provider configuration                    |

---

## Architecture Overview

```
                    ┌──────────────────────────────────────────────────────┐
                    │                CI/CD Providers                       │
                    │  GitHub Actions │ Vercel │ Netlify │ AWS CodeBuild  │
                    │  GitLab CI │ CircleCI │ Bitbucket │ Custom          │
                    └──────────────────────┬──────────────────────────────┘
                                           │ webhooks (provider-specific)
                                           ▼
                    ┌──────────────────────────────────────────────────────┐
                    │              Webhook Router                          │
                    │  • Route by URL path: /webhooks/{provider}          │
                    │  • Provider-specific signature validation            │
                    │  • Provider-specific event filtering                 │
                    └──────────────────────┬──────────────────────────────┘
                                           │
                    ┌──────────────────────▼──────────────────────────────┐
                    │              Alert Normalizer                        │
                    │  • Provider payload → NormalizedBuildEvent           │
                    │  • Extract: repo, commit, branch, status, metadata  │
                    │  • Idempotency key computation                       │
                    └──────────────────────┬──────────────────────────────┘
                                           │
                    ┌──────────────────────▼──────────────────────────────┐
                    │              Idempotency Check                       │
                    │  • Prevent duplicate processing                      │
                    │  • Key: sha256(provider + buildId + tenantId)        │
                    │  • TTL: 24 hours                                     │
                    └──────────────────────┬──────────────────────────────┘
                                           │
                    ┌──────────────────────▼──────────────────────────────┐
                    │              Log Fetcher                             │
                    │  • Provider-specific API calls                       │
                    │  • Fetch build/deployment logs                       │
                    │  • Returns raw text logs                             │
                    └──────────────────────┬──────────────────────────────┘
                                           │
                    ┌──────────────────────▼──────────────────────────────┐
                    │              Redis Aggregation                       │
                    │  • Debounce multiple failures per commit             │
                    │  • Group by (provider, repo, commitSha)              │
                    │  • Same aggregator worker as today                   │
                    └──────────────────────┬──────────────────────────────┘
                                           │
                    ┌──────────────────────▼──────────────────────────────┐
                    │         Existing Analysis Pipeline (UNCHANGED)       │
                    │  • sanitizeForChunkingWithMapping()                  │
                    │  • POST /api/analyze → analysisWorker                │
                    │  • chunkLog → extractFromAllChunks → aggregate       │
                    │  • LLMClient.analyzeIncident()                       │
                    │  • createAnalysis() → persist to DB                  │
                    └──────────────────────┬──────────────────────────────┘
                                           │
                    ┌──────────────────────▼──────────────────────────────┐
                    │              Output Router                           │
                    │  • Route results based on provider + config          │
                    │  • Provider-specific result formatting               │
                    └──────────────────────┬──────────────────────────────┘
                                           │
              ┌────────────────────────────┼────────────────────────────┐
              │                            │                            │
              ▼                            ▼                            ▼
    ┌─────────────────┐        ┌─────────────────┐        ┌─────────────────┐
    │  GitHub PR      │        │  Slack Channel   │        │  Dashboard      │
    │  Comment +      │        │  Notification    │        │  (all providers)│
    │  Check Run      │        │                  │        │                 │
    └─────────────────┘        └─────────────────┘        └─────────────────┘
```

---

## Provider Abstraction Layer

### Port Interfaces

Two port interfaces define the contract every provider must implement.

**CIWebhookPort — Webhook Processing**

| Method              | Input                                                              | Output                 | Description                          |
| ------------------- | ------------------------------------------------------------------ | ---------------------- | ------------------------------------ |
| `validateSignature` | `rawBody: Buffer, headers: Record<string, string>, secret: string` | `boolean`              | Verify webhook authenticity          |
| `shouldProcess`     | `headers: Record<string, string>, body: unknown`                   | `boolean`              | Filter to failure events only        |
| `normalize`         | `body: unknown, headers: Record<string, string>`                   | `NormalizedBuildEvent` | Map provider payload to common shape |

**CILogFetcherPort — Log Retrieval**

| Method           | Input                                                                                                   | Output        | Description                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------- |
| `fetchBuildLogs` | `event: NormalizedBuildEvent, credentials: ProviderCredentials, context: RequestContext`                | `FetchedLogs` | Retrieve build/deployment logs                 |
| `fetchJobLogs`   | `event: NormalizedBuildEvent, jobId: string, credentials: ProviderCredentials, context: RequestContext` | `string`      | Retrieve logs for a single job/step (optional) |

**CIOutputPort — Result Posting (Optional per provider)**

| Method              | Input                                                                                                               | Output          | Description                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------- | --------------------------------------- |
| `postComment`       | `event: NormalizedBuildEvent, analysis: AnalysisResult, credentials: ProviderCredentials, context: RequestContext`  | `PostedComment` | Post analysis as comment (if supported) |
| `updateBuildStatus` | `event: NormalizedBuildEvent, status: BuildStatusUpdate, credentials: ProviderCredentials, context: RequestContext` | `void`          | Update build status (if supported)      |

### Port Interface Rules

1. Port interfaces use **Kenchi-defined types only** — no vendor SDK types cross the boundary
2. Adapters translate Kenchi types ↔ vendor types internally
3. Credentials are opaque to the port — each adapter knows its own credential shape
4. All methods accept `RequestContext` for logging and tracing
5. All outbound calls must include timeout, structured logging, and error classification

---

## Normalized Build Event

All providers map to this common shape before entering the pipeline.

### Schema Definition

| Field           | Type                    | Required | Description                                                                                                      |
| --------------- | ----------------------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| id              | string                  | Yes      | UUID v4, generated by Kenchi                                                                                     |
| provider        | enum                    | Yes      | `github_actions`, `vercel`, `netlify`, `aws_codebuild`, `gitlab_ci`, `circleci`, `bitbucket_pipelines`, `custom` |
| providerBuildId | string                  | Yes      | Provider's native build/deployment ID                                                                            |
| providerJobIds  | string[]                | No       | Individual job/step IDs (if provider supports multi-job builds)                                                  |
| tenantId        | string                  | Yes      | Tenant identifier                                                                                                |
| repository      | RepositoryInfo          | Yes      | Repository details                                                                                               |
| commitSha       | string                  | Yes      | Git commit SHA that triggered the build                                                                          |
| branch          | string                  | No       | Branch name                                                                                                      |
| prNumber        | number                  | No       | Pull request number (if build is PR-triggered)                                                                   |
| prUrl           | string                  | No       | Pull request URL                                                                                                 |
| buildUrl        | string                  | No       | Link to build in provider's UI                                                                                   |
| buildName       | string                  | Yes      | Build/workflow/deployment name                                                                                   |
| status          | enum                    | Yes      | `failed`, `timed_out`, `cancelled`, `errored`                                                                    |
| triggeredBy     | string                  | No       | User or event that triggered the build                                                                           |
| triggeredAt     | datetime                | Yes      | When the build started                                                                                           |
| failedAt        | datetime                | Yes      | When the failure occurred                                                                                        |
| environment     | string                  | No       | `production`, `preview`, `staging`, `development`                                                                |
| metadata        | Record<string, unknown> | No       | Provider-specific metadata (framework, runtime, etc.)                                                            |
| rawPayload      | unknown                 | Yes      | Original webhook payload (for debugging)                                                                         |

### RepositoryInfo

| Field         | Type   | Required | Description         |
| ------------- | ------ | -------- | ------------------- |
| fullName      | string | Yes      | `owner/repo` format |
| owner         | string | Yes      | Repository owner    |
| name          | string | Yes      | Repository name     |
| url           | string | No       | Repository URL      |
| defaultBranch | string | No       | Default branch name |

### FetchedLogs

| Field        | Type      | Required | Description                                |
| ------------ | --------- | -------- | ------------------------------------------ |
| combinedLogs | string    | Yes      | All logs concatenated                      |
| jobs         | JobLogs[] | No       | Per-job log breakdown (if multi-job build) |
| buildName    | string    | Yes      | Build/workflow name                        |
| totalBytes   | number    | Yes      | Total log size                             |
| truncated    | boolean   | Yes      | Whether logs were truncated due to size    |

### JobLogs

| Field      | Type   | Required | Description               |
| ---------- | ------ | -------- | ------------------------- |
| jobId      | string | Yes      | Job/step identifier       |
| jobName    | string | Yes      | Job/step name             |
| logs       | string | Yes      | Raw log text for this job |
| status     | string | Yes      | Job status                |
| durationMs | number | No       | Job duration              |

---

## Provider Specifications

### GitHub Actions (Existing — Reference Implementation)

| Attribute     | Value                                                                   |
| ------------- | ----------------------------------------------------------------------- |
| Webhook Event | `check_run` (action: `completed`, conclusion: `failure` or `timed_out`) |
| Signature     | `x-hub-signature-256` (HMAC-SHA256)                                     |
| Log API       | `GET /repos/{owner}/{repo}/actions/jobs/{job_id}/logs` via Octokit      |
| Output        | PR comment + check run annotations + Slack                              |
| Multi-job     | Yes — fetches all failed jobs in a workflow run                         |
| PR Linking    | Native — webhook payload includes PR references                         |

**Current Implementation Files:**

| Component       | File                                                                 |
| --------------- | -------------------------------------------------------------------- |
| Webhook handler | `services/github-app/src/handlers/checkRunHandler.ts`                |
| Log fetcher     | `services/github-app/src/services/context/workflowFetcher.ts`        |
| Result poster   | `services/github-app/src/services/aggregation/consolidatedPoster.ts` |
| Comment builder | `services/github-app/src/services/githubComments.ts`                 |

**Migration note:** The existing GitHub implementation will be refactored to implement the port interfaces, but behavior remains identical. This is a structural change, not a functional one.

---

### Vercel

| Attribute      | Value                                                                          |
| -------------- | ------------------------------------------------------------------------------ |
| Webhook Events | `deployment.error`, `deployment.failed`, `deployment.canceled`                 |
| Signature      | HMAC-SHA1 via webhook secret (header: `x-vercel-signature`)                    |
| Log API        | `GET /v6/deployments/{id}/events` (Vercel REST API)                            |
| Auth           | Bearer token (Vercel API token per team)                                       |
| Output         | Slack + Dashboard (no native PR comment — Vercel deployments may not have PRs) |
| Multi-job      | No — single deployment log                                                     |
| PR Linking     | Via `meta.gitCommitSha` → search GitHub for PR containing that SHA             |
| Environment    | `production`, `preview` (from `target` field)                                  |

**Webhook Payload Key Fields:**

| Field                                              | Maps To                                   |
| -------------------------------------------------- | ----------------------------------------- |
| `payload.deployment.id`                            | `providerBuildId`                         |
| `payload.deployment.meta.githubCommitSha`          | `commitSha`                               |
| `payload.deployment.meta.githubCommitRef`          | `branch`                                  |
| `payload.deployment.meta.githubOrg` + `githubRepo` | `repository.fullName`                     |
| `payload.deployment.url`                           | `buildUrl`                                |
| `payload.deployment.name`                          | `buildName`                               |
| `payload.deployment.target`                        | `environment` (`production` or `preview`) |
| `payload.deployment.creator.email`                 | `triggeredBy`                             |
| `payload.deployment.meta.framework`                | `metadata.framework`                      |

**Signature Validation:**

```
HMAC-SHA1(rawBody, webhookSecret)
Compare against x-vercel-signature header
```

**Log Fetching:**

1. `GET https://api.vercel.com/v6/deployments/{deploymentId}/events`
2. Response is newline-delimited JSON (NDJSON) — each line is `{ type, created, payload }`
3. Filter to `type: "stdout"` and `type: "stderr"` events
4. Concatenate `payload.text` fields chronologically
5. Prefix each line with timestamp for log structure

**Log Format Notes:**

- Vercel build logs include framework-specific output (Next.js build errors, TypeScript errors, ESLint output)
- Runtime logs (serverless function crashes) are separate from build logs
- Build logs are available immediately after failure; runtime logs may need CloudWatch/Vercel Log Drain integration

**Rate Limits:**

| Endpoint        | Limit                             |
| --------------- | --------------------------------- |
| Deployments API | 100 requests/minute per team      |
| Events API      | 20 requests/minute per deployment |

---

### Netlify

| Attribute      | Value                                                                          |
| -------------- | ------------------------------------------------------------------------------ |
| Webhook Events | Deploy notification (outgoing webhook on deploy failure)                       |
| Signature      | Webhook signing secret via `x-webhook-signature` (HMAC-SHA256) with JWS format |
| Log API        | `GET /api/v1/deploys/{deploy_id}/log` (Netlify API)                            |
| Auth           | Bearer token (Netlify personal access token)                                   |
| Output         | Slack + Dashboard                                                              |
| Multi-job      | No — single deploy log                                                         |
| PR Linking     | Via `commit_ref` → search for PR                                               |
| Environment    | `production` (production branch), `deploy-preview` (PR), `branch-deploy`       |

**Webhook Payload Key Fields:**

| Field            | Maps To                    |
| ---------------- | -------------------------- |
| `id`             | `providerBuildId`          |
| `commit_ref`     | `commitSha`                |
| `branch`         | `branch`                   |
| `title`          | `buildName` (deploy title) |
| `deploy_ssl_url` | `buildUrl`                 |
| `context`        | `environment`              |
| `committer`      | `triggeredBy`              |
| `error_message`  | `metadata.errorMessage`    |
| `framework`      | `metadata.framework`       |

**Signature Validation:**

Netlify uses JWS (JSON Web Signature) format:

1. Extract `x-webhook-signature` header
2. Decode JWS using webhook signing secret
3. Verify `iss` claim matches `netlify`
4. Verify `sha256` claim matches SHA-256 of raw body

**Log Fetching:**

1. `GET https://api.netlify.com/api/v1/deploys/{deploy_id}/log`
2. Response is JSON array of log entry objects: `[{ id, ts, msg, section }]`
3. Concatenate `msg` fields, preserving section boundaries
4. Sections include: `initializing`, `building`, `deploying`, `cleanup`

**Rate Limits:**

| Endpoint | Limit                         |
| -------- | ----------------------------- |
| API      | 500 requests/minute per token |

---

### AWS CodeBuild

| Attribute    | Value                                                                             |
| ------------ | --------------------------------------------------------------------------------- |
| Event Source | EventBridge rule → SNS → HTTPS webhook, or CloudWatch Events                      |
| Signature    | AWS SNS signature validation (X509 certificate verification)                      |
| Log API      | CloudWatch Logs: `GetLogEvents` API                                               |
| Auth         | AWS IAM credentials (access key + secret, or assumed role)                        |
| Output       | Slack + Dashboard + optional GitHub PR comment (if CodeBuild triggered by GitHub) |
| Multi-job    | Yes — CodeBuild batch builds have multiple build IDs                              |
| PR Linking   | Via source version (commit SHA) if source is GitHub/CodeCommit                    |
| Environment  | From CodeBuild environment variables or tags                                      |

**SNS Notification Key Fields:**

The SNS message wraps a CodeBuild state change event:

| Field                                                             | Maps To                                                                             |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `detail.build-id`                                                 | `providerBuildId` (ARN format: `arn:aws:codebuild:region:account:build/project:id`) |
| `detail.additional-information.source-version`                    | `commitSha`                                                                         |
| `detail.project-name`                                             | `buildName`                                                                         |
| `detail.build-status`                                             | `status` (`FAILED`, `TIMED_OUT`, `STOPPED`)                                         |
| `detail.additional-information.source.location`                   | `repository.url`                                                                    |
| `detail.additional-information.logs.group-name`                   | CloudWatch log group                                                                |
| `detail.additional-information.logs.stream-name`                  | CloudWatch log stream                                                               |
| `detail.additional-information.environment.environment-variables` | `metadata`                                                                          |
| `detail.additional-information.initiator`                         | `triggeredBy`                                                                       |

**Signature Validation:**

AWS SNS message signing (see Appendix A):

1. Verify `SignatureVersion` is `"1"`
2. Validate `SigningCertURL` is from `sns.{region}.amazonaws.com`
3. Fetch signing certificate (cache with TTL)
4. Build canonical string per AWS spec
5. Verify RSA-SHA1 signature against certificate public key

**Log Fetching:**

1. Extract `log-group` and `log-stream` from build event
2. `CloudWatchLogs.GetLogEvents({ logGroupName, logStreamName, startFromHead: true })`
3. Paginate using `nextForwardToken` until no more events
4. Concatenate `message` fields from all log events
5. Each event has `timestamp` and `message`

**Rate Limits:**

| Endpoint          | Limit                                             |
| ----------------- | ------------------------------------------------- |
| GetLogEvents      | 10 requests/second per log group                  |
| Throttle behavior | Returns `ThrottlingException`, retry with backoff |

**Special Considerations:**

- CodeBuild logs can be very large (multi-GB for long builds) — enforce max log size limit
- Log group/stream names are in the build event — no discovery needed
- If build uses S3 for logs instead of CloudWatch, fetch from S3 instead
- Cross-account access requires IAM role assumption

---

### GitLab CI

| Attribute      | Value                                                             |
| -------------- | ----------------------------------------------------------------- |
| Webhook Events | Pipeline Hook (`pipeline` event, status: `failed`)                |
| Signature      | `X-Gitlab-Token` header (shared secret, constant-time comparison) |
| Log API        | `GET /api/v4/projects/{id}/jobs/{job_id}/trace`                   |
| Auth           | Personal/project access token with `read_api` scope               |
| Output         | MR (Merge Request) comment + Slack + Dashboard                    |
| Multi-job      | Yes — pipeline contains multiple jobs, each with own logs         |
| PR Linking     | `merge_request` object in webhook payload                         |
| Environment    | From pipeline variables or job environment                        |

**Webhook Payload Key Fields:**

| Field                         | Maps To                                                           |
| ----------------------------- | ----------------------------------------------------------------- |
| `object_attributes.id`        | `providerBuildId` (pipeline ID)                                   |
| `object_attributes.sha`       | `commitSha`                                                       |
| `object_attributes.ref`       | `branch`                                                          |
| `object_attributes.status`    | `status`                                                          |
| `project.path_with_namespace` | `repository.fullName`                                             |
| `project.web_url`             | `repository.url`                                                  |
| `merge_request.iid`           | `prNumber` (MR number)                                            |
| `merge_request.url`           | `prUrl`                                                           |
| `builds[]`                    | Array of jobs — filter to `status: "failed"` for `providerJobIds` |
| `user.username`               | `triggeredBy`                                                     |

**Signature Validation:**

```
Constant-time compare: headers["x-gitlab-token"] === webhookSecret
```

Note: GitLab's signature is a simple shared secret, not HMAC. Less secure than HMAC but it's GitLab's design.

**Log Fetching:**

1. From webhook, extract failed job IDs: `builds.filter(b => b.status === "failed").map(b => b.id)`
2. For each job: `GET https://gitlab.com/api/v4/projects/{projectId}/jobs/{jobId}/trace`
3. Response is plain text (raw job log)
4. Fetch in parallel with concurrency limit (5)
5. Large logs return partial content with `Range` header support

**Log Format Notes:**

- GitLab job logs include ANSI escape codes for color — strip before analysis
- Section markers: `section_start:timestamp:section_name` / `section_end:timestamp:section_name`
- Collapsible sections may hide relevant error context — expand all

**Rate Limits:**

| Endpoint  | Limit                               |
| --------- | ----------------------------------- |
| API       | 300 requests/minute (authenticated) |
| Job trace | Same rate limit pool                |

**Output — MR Comments:**

GitLab supports Merge Request notes (comments):

- `POST /api/v4/projects/{id}/merge_requests/{mr_iid}/notes`
- Markdown format, similar to GitHub PR comments
- Can also create MR discussions for threaded comments

---

### CircleCI

| Attribute      | Value                                                                   |
| -------------- | ----------------------------------------------------------------------- |
| Webhook Events | `workflow-completed` (outcome: `failed`)                                |
| Signature      | `circleci-signature` header (HMAC-SHA256, v1 format)                    |
| Log API        | `GET /api/v2/project/{slug}/job/{job_number}` + step action output URLs |
| Auth           | API token (project or personal)                                         |
| Output         | Slack + Dashboard + GitHub PR comment (if GitHub-hosted repo)           |
| Multi-job      | Yes — workflow contains multiple jobs                                   |
| PR Linking     | Via `pipeline.vcs.revision` → search for PR                             |
| Environment    | From pipeline parameters or context                                     |

**Webhook Payload Key Fields:**

| Field                          | Maps To                                         |
| ------------------------------ | ----------------------------------------------- |
| `workflow.id`                  | `providerBuildId`                               |
| `pipeline.vcs.revision`        | `commitSha`                                     |
| `pipeline.vcs.branch`          | `branch`                                        |
| `workflow.name`                | `buildName`                                     |
| `workflow.url`                 | `buildUrl`                                      |
| `project.slug`                 | `repository.fullName` (format: `gh/owner/repo`) |
| `pipeline.trigger.actor.login` | `triggeredBy`                                   |

**Signature Validation:**

```
Extract circleci-signature header (format: "v1=<hex-digest>")
Compute HMAC-SHA256 of raw body with webhook secret
Constant-time compare computed digest against v1 value
```

**Log Fetching:**

CircleCI logs require multi-step fetching:

1. `GET /api/v2/workflow/{workflowId}/job` → list jobs in workflow
2. Filter to failed jobs
3. For each job: `GET /api/v2/project/{slug}/{jobNumber}` → get job details with `steps[]`
4. Each step has `actions[]`, each action has `output_url`
5. Fetch each `output_url` → returns `[{ type, time, message }]`
6. Concatenate messages per job

**Rate Limits:**

| Endpoint | Limit                         |
| -------- | ----------------------------- |
| API v2   | 300 requests/minute per token |

---

### Bitbucket Pipelines

| Attribute      | Value                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------- |
| Webhook Events | `repo:commit_status_updated` or Pipeline webhook                                                |
| Signature      | Bitbucket does not sign webhooks — use IP allowlisting + webhook UUID                           |
| Log API        | `GET /2.0/repositories/{workspace}/{repo_slug}/pipelines/{pipeline_uuid}/steps/{step_uuid}/log` |
| Auth           | App password or OAuth consumer with `pipeline:read` scope                                       |
| Output         | PR comment + Slack + Dashboard                                                                  |
| Multi-job      | Yes — pipeline has steps                                                                        |
| PR Linking     | `pullrequest` target in pipeline                                                                |
| Environment    | From deployment environment in pipeline config                                                  |

**Webhook Payload Key Fields:**

| Field                              | Maps To               |
| ---------------------------------- | --------------------- |
| `data.pipeline.uuid`               | `providerBuildId`     |
| `data.pipeline.target.commit.hash` | `commitSha`           |
| `data.pipeline.target.ref_name`    | `branch`              |
| `data.repository.full_name`        | `repository.fullName` |
| `data.pipeline.state.result.name`  | `status`              |

**Signature Validation:**

Bitbucket webhooks lack cryptographic signatures. Mitigation:

1. Verify request originates from Bitbucket IP ranges (published at `https://ip-ranges.atlassian.com/`)
2. Use unique webhook URL with embedded secret token: `/webhooks/bitbucket?token={secret}`
3. Validate webhook UUID matches registered webhook
4. Enforce HTTPS only

**Log Fetching:**

1. `GET /2.0/repositories/{workspace}/{repo}/pipelines/{uuid}/steps/` → list steps
2. Filter to failed steps
3. For each step: `GET /2.0/repositories/{workspace}/{repo}/pipelines/{uuid}/steps/{step_uuid}/log`
4. Response is plain text (raw step log, may include ANSI codes)

**Rate Limits:**

| Endpoint | Limit                           |
| -------- | ------------------------------- |
| API      | 1000 requests/hour per consumer |

---

### Custom Provider (Generic Webhook)

For CI systems not explicitly supported, tenants can configure a custom webhook endpoint.

| Attribute      | Value                                                                    |
| -------------- | ------------------------------------------------------------------------ |
| Webhook Events | Configurable — tenant defines which events to process                    |
| Signature      | HMAC-SHA256 with tenant-configured secret (header: `x-kenchi-signature`) |
| Log Source     | Logs included in webhook payload OR fetched from URL provided in payload |
| Auth           | N/A (logs in payload) or configurable auth for log URL                   |
| Output         | Slack + Dashboard                                                        |

**Custom Webhook Schema:**

Tenants send a standardized payload:

| Field      | Type   | Required    | Description                            |
| ---------- | ------ | ----------- | -------------------------------------- |
| buildId    | string | Yes         | Unique build identifier                |
| repository | string | Yes         | `owner/repo` format                    |
| commitSha  | string | Yes         | Git commit SHA                         |
| branch     | string | No          | Branch name                            |
| prNumber   | number | No          | PR number                              |
| buildName  | string | Yes         | Build/pipeline name                    |
| status     | string | Yes         | `failed`, `timed_out`, `errored`       |
| buildUrl   | string | No          | Link to build UI                       |
| logs       | string | Conditional | Raw log text (if not using logUrl)     |
| logUrl     | string | Conditional | URL to fetch logs from (if not inline) |
| logHeaders | object | No          | Auth headers for logUrl fetch          |

This allows any CI system (Jenkins, Drone, Woodpecker, Buildkite, etc.) to integrate with Kenchi.

---

## Webhook Routing

### URL Structure

Each provider has a dedicated webhook endpoint:

| Provider            | Webhook URL                        |
| ------------------- | ---------------------------------- |
| GitHub Actions      | `POST /webhooks/github` (existing) |
| Vercel              | `POST /webhooks/vercel`            |
| Netlify             | `POST /webhooks/netlify`           |
| AWS CodeBuild       | `POST /webhooks/aws-codebuild`     |
| GitLab CI           | `POST /webhooks/gitlab`            |
| CircleCI            | `POST /webhooks/circleci`          |
| Bitbucket Pipelines | `POST /webhooks/bitbucket`         |
| Custom              | `POST /webhooks/custom`            |

### Routing Logic

Each webhook route follows the same pattern:

1. **Validate signature** (provider-specific middleware)
2. **Check if provider is enabled** for the tenant
3. **Filter to failure events** (provider-specific `shouldProcess`)
4. **Normalize** to `NormalizedBuildEvent`
5. **Check idempotency** (prevent duplicate processing)
6. **Fetch logs** (provider-specific adapter)
7. **Enqueue for analysis** (shared pipeline from here)

```
POST /webhooks/{provider}
  │
  ├─ validateSignature()     ← provider-specific
  ├─ identifyTenant()        ← from webhook config or payload
  ├─ shouldProcess()         ← provider-specific event filter
  ├─ normalize()             ← provider-specific → NormalizedBuildEvent
  ├─ idempotencyCheck()      ← shared
  ├─ fetchBuildLogs()        ← provider-specific
  ├─ addToAggregation()      ← shared (Redis debounce)
  └─ return 200              ← acknowledge webhook immediately
```

### Tenant Identification

Different providers identify tenants differently:

| Provider      | Tenant Identification Method                             |
| ------------- | -------------------------------------------------------- |
| GitHub        | Installation ID → tenant lookup                          |
| Vercel        | Team ID in payload or webhook URL token                  |
| Netlify       | Site ID → tenant lookup                                  |
| AWS CodeBuild | Account ID in ARN → tenant lookup                        |
| GitLab        | Project ID → tenant lookup                               |
| CircleCI      | Project slug → tenant lookup                             |
| Bitbucket     | Workspace UUID → tenant lookup                           |
| Custom        | Tenant ID in webhook URL: `/webhooks/custom?tenant={id}` |

---

## Aggregation Key Extension

The existing aggregation key format is `{repositoryFullName}:{commitSha}`. For multi-provider support, extend to include provider:

**Current:** `kenchi:agg:{repo}:{sha}:failures`

**New:** `kenchi:agg:{provider}:{repo}:{sha}:failures`

This prevents cross-provider aggregation (a Vercel deployment failure shouldn't merge with a GitHub Actions failure for the same commit, since they represent different pipelines).

### Aggregation Metadata Extension

Add provider-specific fields to `AggregationMetadata`:

| Field           | Type   | Description                            |
| --------------- | ------ | -------------------------------------- |
| provider        | string | CI provider name                       |
| buildUrl        | string | Link to build in provider UI           |
| environment     | string | Deployment environment (if applicable) |
| providerBuildId | string | Provider's native build ID             |

---

## Output Routing

### Per-Provider Output Capabilities

| Provider            | PR/MR Comment             | Build Status/Check | Slack | Dashboard |
| ------------------- | ------------------------- | ------------------ | ----- | --------- |
| GitHub Actions      | Yes (existing)            | Yes (check run)    | Yes   | Yes       |
| Vercel              | Via GitHub (if connected) | No                 | Yes   | Yes       |
| Netlify             | Via GitHub (if connected) | No                 | Yes   | Yes       |
| AWS CodeBuild       | Via GitHub (if connected) | No                 | Yes   | Yes       |
| GitLab CI           | Yes (MR note)             | No                 | Yes   | Yes       |
| CircleCI            | Via GitHub (if connected) | No                 | Yes   | Yes       |
| Bitbucket Pipelines | Yes (PR comment)          | No                 | Yes   | Yes       |
| Custom              | No                        | No                 | Yes   | Yes       |

### Output Routing Decision

```
For each completed analysis:
  1. Always: Post to Dashboard SSE (existing)
  2. Always: Post to Slack (if configured)
  3. If provider === github: Post PR comment + check run (existing)
  4. If provider === gitlab: Post MR note (new adapter)
  5. If provider === bitbucket: Post PR comment (new adapter)
  6. If provider has GitHub repo linked: Post GitHub PR comment (cross-provider)
```

### Cross-Provider PR Comments

Many providers (Vercel, Netlify, CircleCI, AWS CodeBuild) deploy code from GitHub repositories. When a non-GitHub CI failure is linked to a GitHub commit:

1. Look up the commit SHA in GitHub
2. Find any open PR containing that commit
3. Post the analysis as a GitHub PR comment

This requires the tenant to have both the CI provider AND GitHub connected. The GitHub connection provides the Octokit instance for posting comments.

---

## Provider Registration & Configuration

### Tenant Provider Settings

Stored in the database per tenant.

| Field         | Type     | Description                                         |
| ------------- | -------- | --------------------------------------------------- |
| id            | string   | UUID                                                |
| tenantId      | string   | Tenant reference                                    |
| provider      | enum     | Provider name                                       |
| enabled       | boolean  | Whether provider is active                          |
| webhookSecret | string   | Secret for signature validation (encrypted at rest) |
| credentials   | object   | Provider-specific API credentials (encrypted)       |
| config        | object   | Provider-specific settings                          |
| createdAt     | datetime | When registered                                     |
| updatedAt     | datetime | Last update                                         |

### Provider Credentials (per provider)

| Provider      | Credential Fields                                                          |
| ------------- | -------------------------------------------------------------------------- |
| GitHub        | `installationId` (existing GitHub App flow)                                |
| Vercel        | `apiToken`, `teamId`                                                       |
| Netlify       | `accessToken`, `siteId`                                                    |
| AWS CodeBuild | `accessKeyId`, `secretAccessKey`, `region` (or `roleArn` for assumed role) |
| GitLab        | `accessToken`, `projectId`, `instanceUrl` (for self-hosted)                |
| CircleCI      | `apiToken`, `projectSlug`                                                  |
| Bitbucket     | `appPassword`, `workspace` (or OAuth consumer credentials)                 |
| Custom        | `logFetchHeaders` (optional auth for log URL)                              |

### Provider Config Options

| Field                    | Type     | Default                                | Description                               |
| ------------------------ | -------- | -------------------------------------- | ----------------------------------------- |
| enableSlackNotifications | boolean  | true                                   | Post to Slack on failure                  |
| enablePRComments         | boolean  | true                                   | Post PR/MR comments (if supported)        |
| slackChannelOverride     | string   | null                                   | Override default Slack channel            |
| environmentFilter        | string[] | `["production", "preview", "staging"]` | Which environments to analyze             |
| branchFilter             | string[] | `["*"]`                                | Which branches to analyze (glob patterns) |
| ignoreBuildNames         | string[] | `[]`                                   | Build names to skip (glob patterns)       |
| maxLogSizeBytes          | number   | 10485760 (10MB)                        | Maximum log size to process               |

---

## Idempotency

### Key Computation

| Component       | Source                                |
| --------------- | ------------------------------------- |
| provider        | Provider name                         |
| providerBuildId | Provider's native build/deployment ID |
| tenantId        | Tenant identifier                     |

**Formula:** `sha256(provider + "|" + providerBuildId + "|" + tenantId)`

### Flow

1. Compute idempotency key from normalized event
2. Check idempotency store: `idempotencyStore.exists(key)`
3. If exists: return `200 { status: "duplicate" }` — no processing
4. If not exists: `idempotencyStore.set(key, { status: "processing" }, ttlDays: 7)`
5. Continue to log fetching and analysis
6. On completion: update key with analysis ID

This reuses the existing `@kenchi/shared` idempotency store.

---

## Error Handling

### Provider-Specific Error Scenarios

| Scenario                           | Behavior                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------- |
| Signature validation fails         | Return 401, log with provider/operation, do not process                   |
| Provider API rate limited          | Retry with backoff (use shared `withRetry`), respect `Retry-After` header |
| Provider API timeout               | Log timeout, retry once, fail with `ExternalServiceError(provider, ...)`  |
| Log fetch returns empty            | Skip analysis, post "No logs available" notification                      |
| Log fetch returns partial          | Analyze partial logs, note limitation in analysis                         |
| Logs exceed size limit             | Truncate to `maxLogSizeBytes`, note truncation in analysis                |
| Provider API auth failure          | Log as `auth_config` error, notify tenant, skip analysis                  |
| Provider not enabled for tenant    | Return 200 (acknowledge webhook), do not process                          |
| Unknown provider event type        | Return 200 (acknowledge), log as info, do not process                     |
| Provider webhook payload malformed | Return 400, log with provider/operation                                   |

### Error Classification by Provider

All providers use the shared `classifyHttpError()` for API call failures:

| Status  | Category      | Action                                         |
| ------- | ------------- | ---------------------------------------------- |
| 429     | retryable     | Retry with backoff, respect `Retry-After`      |
| 500-504 | retryable     | Retry with exponential backoff (max 3 retries) |
| 401/403 | auth_config   | Alert tenant, skip processing                  |
| 404     | non_retryable | Log not found (build may have been deleted)    |
| 400/422 | non_retryable | Log, skip processing                           |

---

## Log Processing Considerations

### ANSI Escape Code Stripping

Several providers include ANSI escape codes in logs (GitLab, CircleCI, Bitbucket). These must be stripped before analysis:

```
Strip pattern: /\x1b\[[0-9;]*[a-zA-Z]/g
```

Apply in the normalizer before logs enter the analysis pipeline.

### Log Size Limits

| Tier          | Max Log Size | Behavior                                                      |
| ------------- | ------------ | ------------------------------------------------------------- |
| Default       | 10 MB        | Truncate from head, keep tail (errors are usually at the end) |
| Large builds  | 50 MB        | Same truncation, log warning                                  |
| Exceeds limit | > 50 MB      | Skip analysis, post "Log too large" notification              |

### Provider-Specific Log Formats

| Provider       | Format                                          | Processing Notes                           |
| -------------- | ----------------------------------------------- | ------------------------------------------ |
| GitHub Actions | Plain text, `##[group]`/`##[endgroup]` sections | Well-structured, existing handling         |
| Vercel         | NDJSON events                                   | Parse JSON, extract `text` fields          |
| Netlify        | JSON array of `{ msg, section }`                | Extract `msg`, preserve section boundaries |
| AWS CodeBuild  | CloudWatch log events with timestamps           | Concatenate messages, preserve timestamps  |
| GitLab CI      | Plain text with ANSI codes and section markers  | Strip ANSI, expand collapsed sections      |
| CircleCI       | JSON array of `{ message, time }` per action    | Parse JSON, concatenate messages           |
| Bitbucket      | Plain text with ANSI codes                      | Strip ANSI                                 |
| Custom         | Plain text (or provider-defined)                | Minimal processing                         |

---

## Database Schema Changes

### New Table: `provider_connections`

```sql
CREATE TABLE provider_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  provider VARCHAR(50) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  webhook_secret TEXT NOT NULL,
  credentials_encrypted TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, provider)
);

CREATE INDEX idx_provider_connections_tenant ON provider_connections(tenant_id);
CREATE INDEX idx_provider_connections_provider ON provider_connections(provider);
```

### Extended `analysis_jobs` Table

Add `provider` column:

```sql
ALTER TABLE analysis_jobs ADD COLUMN provider VARCHAR(50) NOT NULL DEFAULT 'github_actions';
ALTER TABLE analysis_jobs ADD COLUMN provider_build_id VARCHAR(255);
ALTER TABLE analysis_jobs ADD COLUMN build_url TEXT;
ALTER TABLE analysis_jobs ADD COLUMN environment VARCHAR(50);
```

### Extended `analyses` Table

Add provider metadata:

```sql
ALTER TABLE analyses ADD COLUMN provider VARCHAR(50) NOT NULL DEFAULT 'github_actions';
ALTER TABLE analyses ADD COLUMN provider_build_id VARCHAR(255);
ALTER TABLE analyses ADD COLUMN build_url TEXT;
ALTER TABLE analyses ADD COLUMN environment VARCHAR(50);
```

---

## Dashboard Integration

### Multi-Provider Dashboard Views

The frontend Dashboard must display failures from all providers:

| View            | Change                                             |
| --------------- | -------------------------------------------------- |
| Failures list   | Add provider icon/badge to each failure row        |
| Analysis detail | Show provider name, build URL link, environment    |
| Pipelines page  | Group by provider, show provider connection status |
| Settings page   | Provider connection management UI                  |

### Provider Icons & Branding

Each provider has a recognizable icon in the dashboard:

| Provider       | Icon            | Color     |
| -------------- | --------------- | --------- |
| GitHub Actions | GitHub mark     | `#24292f` |
| Vercel         | Vercel triangle | `#000000` |
| Netlify        | Netlify logo    | `#00c7b7` |
| AWS CodeBuild  | AWS icon        | `#ff9900` |
| GitLab CI      | GitLab fox      | `#fc6d26` |
| CircleCI       | CircleCI mark   | `#343434` |
| Bitbucket      | Bitbucket icon  | `#0052cc` |
| Custom         | Gear icon       | `#6b7280` |

---

## Implementation Phases

### Phase 1: Provider Abstraction (Foundation)

**Goal:** Refactor existing GitHub implementation behind port interfaces without changing behavior.

| Task                          | Description                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| Define port interfaces        | `CIWebhookPort`, `CILogFetcherPort`, `CIOutputPort` in `packages/shared`             |
| Define `NormalizedBuildEvent` | Shared type in `packages/shared`                                                     |
| Create GitHub webhook adapter | Extract existing code into `GitHubWebhookAdapter` implementing `CIWebhookPort`       |
| Create GitHub log adapter     | Extract existing code into `GitHubLogFetcherAdapter` implementing `CILogFetcherPort` |
| Create GitHub output adapter  | Extract existing code into `GitHubOutputAdapter` implementing `CIOutputPort`         |
| Provider registry             | Factory function that resolves provider name → adapter instances                     |
| Database migration            | `provider_connections` table + `provider` column on existing tables                  |
| Extend aggregation key        | Include provider in Redis key format                                                 |

**Verification:** All existing GitHub Actions functionality works identically after refactor.

### Phase 2: Vercel + Netlify (Deploy Platforms)

**Goal:** Support the two most common frontend deployment platforms.

| Task                       | Description                                              |
| -------------------------- | -------------------------------------------------------- |
| Vercel webhook adapter     | Signature validation, event filtering, normalization     |
| Vercel log fetcher         | NDJSON parsing, timestamp preservation                   |
| Netlify webhook adapter    | JWS signature validation, event filtering, normalization |
| Netlify log fetcher        | JSON array parsing, section preservation                 |
| ANSI stripping utility     | Shared utility for log cleanup                           |
| Cross-provider PR comments | Post GitHub PR comments for Vercel/Netlify failures      |
| Settings UI                | Provider connection management in frontend Settings page |

**Verification:** Deploy a Next.js app to Vercel, trigger a build failure, verify Kenchi analyzes and posts results.

### Phase 3: GitLab CI + CircleCI (CI Platforms)

**Goal:** Support the two largest non-GitHub CI platforms.

| Task                      | Description                                      |
| ------------------------- | ------------------------------------------------ |
| GitLab webhook adapter    | Token validation, pipeline event filtering       |
| GitLab log fetcher        | Multi-job log fetching, ANSI stripping           |
| GitLab output adapter     | MR note posting                                  |
| CircleCI webhook adapter  | HMAC-SHA256 validation, workflow event filtering |
| CircleCI log fetcher      | Multi-step log assembly                          |
| Dashboard provider badges | Show provider icon on failures/analyses          |

### Phase 4: AWS CodeBuild + Bitbucket (Enterprise)

**Goal:** Support enterprise CI platforms.

| Task                          | Description                                           |
| ----------------------------- | ----------------------------------------------------- |
| AWS CodeBuild adapter         | SNS signature validation, CloudWatch Logs integration |
| AWS IAM credential management | Secure storage, role assumption support               |
| Bitbucket adapter             | IP allowlisting, pipeline step log fetching           |
| Bitbucket output adapter      | PR comment posting                                    |

### Phase 5: Custom Provider + Polish

**Goal:** Open platform to any CI system.

| Task                       | Description                                  |
| -------------------------- | -------------------------------------------- |
| Custom webhook handler     | Standardized payload schema, HMAC validation |
| Log URL fetching           | Secure fetching from tenant-provided URLs    |
| Documentation              | API docs for custom webhook integration      |
| Provider health monitoring | Connection status, failure rate tracking     |

---

## Success Metrics

| Metric                             | Target        | Measurement                                    |
| ---------------------------------- | ------------- | ---------------------------------------------- |
| Provider adapter test coverage     | > 90%         | Unit tests per adapter                         |
| Webhook processing p95 latency     | < 200ms       | Webhook receive → acknowledgment               |
| Log fetch p95 latency              | < 10s         | Depends on provider API speed                  |
| End-to-end analysis latency        | < 3min        | Webhook → result posted                        |
| Cross-provider PR comment accuracy | > 95%         | Correct PR identified for non-GitHub providers |
| Provider connection success rate   | > 99%         | Webhook validation + log fetch success         |
| Analysis quality parity            | ±5% of GitHub | Same confidence scores across providers        |
| Zero false duplicates              | 0%            | Idempotency prevents duplicate analyses        |

---

## Appendix A: Signature Validation Reference

### HMAC-SHA256 (Vercel, CircleCI, Custom)

```
1. Extract signature from provider-specific header
2. Compute HMAC-SHA256 of raw body using webhook secret
3. Constant-time compare (crypto.timingSafeEqual)
4. Reject with 401 if mismatch
```

### HMAC-SHA1 (Vercel alternative)

```
1. Extract x-vercel-signature header
2. Compute HMAC-SHA1 of raw body using webhook secret
3. Hex-encode computed digest
4. Constant-time compare
5. Reject with 401 if mismatch
```

### AWS SNS (CodeBuild)

```
1. Parse SNS message JSON
2. Verify SignatureVersion is "1"
3. Validate SigningCertURL domain (sns.{region}.amazonaws.com)
4. Fetch X509 certificate from SigningCertURL (cache with TTL)
5. Build string-to-sign per AWS spec (ordered fields)
6. Verify RSA-SHA1 signature using certificate public key
7. For SubscriptionConfirmation: auto-confirm by fetching SubscribeURL
8. Reject with 401 if any step fails
```

### JWS (Netlify)

```
1. Extract x-webhook-signature header (JWS compact serialization)
2. Decode JWS header and payload
3. Verify signature using webhook signing secret
4. Validate claims: iss === "netlify", sha256 === SHA256(rawBody)
5. Reject with 401 if verification fails
```

### Shared Secret (GitLab)

```
1. Extract X-Gitlab-Token header
2. Constant-time compare against configured webhook secret
3. Reject with 401 if mismatch
```

Note: This is the weakest validation method. Consider additionally validating source IP if GitLab instance IP ranges are known.

---

## Appendix B: Provider Event Filtering

### Events to Process (per provider)

| Provider       | Process                                                         | Skip                                                             |
| -------------- | --------------------------------------------------------------- | ---------------------------------------------------------------- |
| GitHub Actions | `check_run.completed` where conclusion is `failure`/`timed_out` | `success`, `neutral`, `skipped`, `cancelled`                     |
| Vercel         | `deployment.error`, `deployment.failed`                         | `deployment.created`, `deployment.succeeded`, `deployment.ready` |
| Netlify        | Deploy notification where `state === "error"`                   | `state === "ready"`, `state === "building"`                      |
| AWS CodeBuild  | `build-status: FAILED, TIMED_OUT, STOPPED`                      | `SUCCEEDED`, `IN_PROGRESS`                                       |
| GitLab CI      | Pipeline event where `status === "failed"`                      | `success`, `running`, `pending`, `canceled`                      |
| CircleCI       | `workflow-completed` where `outcome === "failed"`               | `success`, `canceled`                                            |
| Bitbucket      | Pipeline result `FAILED`, `ERROR`                               | `SUCCESSFUL`, `STOPPED`                                          |
| Custom         | `status` in `["failed", "timed_out", "errored"]`                | Everything else                                                  |

---

## Appendix C: Glossary

| Term                      | Definition                                              |
| ------------------------- | ------------------------------------------------------- |
| Provider                  | A CI/CD platform that executes builds/deployments       |
| Normalized Build Event    | Common data shape all providers map to before analysis  |
| Provider Connection       | Tenant's registered connection to a CI provider         |
| Webhook Secret            | Shared secret for webhook signature validation          |
| Cross-Provider PR Comment | Posting GitHub PR comment for a non-GitHub CI failure   |
| Log Fetcher               | Adapter that retrieves build logs from a provider's API |
| Aggregation Key           | Redis key grouping failures by provider + repo + commit |
| ANSI Stripping            | Removing terminal color codes from logs before analysis |
| NDJSON                    | Newline-Delimited JSON (Vercel's log format)            |
| JWS                       | JSON Web Signature (Netlify's webhook signing format)   |

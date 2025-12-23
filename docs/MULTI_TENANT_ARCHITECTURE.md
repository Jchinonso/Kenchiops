# Kenchi Multi-Tenant Architecture

## Overview

Kenchi uses a **shared control plane with multi-tenant services** architecture. This means:

- **One deployment** serves all customers (tenants)
- **Each request carries tenant context** (installation_id, workspace_id)
- **Services look up the right credentials** per tenant
- **Data is logically segregated** in a shared database

This is how most marketplace apps work (Slack apps, Datadog GitHub integration, Linear, etc.).

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                         KENCHI MULTI-TENANT ARCHITECTURE                             │
└─────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   ACME Corp     │     │    BigCo Inc    │     │   StartupXYZ    │
│  (Tenant A)     │     │   (Tenant B)    │     │   (Tenant C)    │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │ Install GitHub App    │ Install GitHub App    │ Install GitHub App
         │ Install Slack App     │ Install Slack App     │ Install Slack App
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              KENCHI CONTROL PLANE                                    │
│                                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                           TENANT DATABASE                                    │   │
│  │  ┌─────────────────────────────────────────────────────────────────────┐   │   │
│  │  │ id │ github_org │ install_id │ slack_workspace │ slack_token │ ... │   │   │
│  │  ├─────────────────────────────────────────────────────────────────────┤   │   │
│  │  │ 1  │ acme-corp  │ 12345      │ T0ACME123       │ xoxb-acme.. │     │   │   │
│  │  │ 2  │ bigco-inc  │ 67890      │ T0BIGCO456      │ xoxb-bigco. │     │   │   │
│  │  │ 3  │ startupxyz │ 11111      │ T0START789      │ xoxb-start. │     │   │   │
│  │  └─────────────────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │
│  │  GitHub App  │  │  Slack Bot   │  │     API      │  │     GitHub App      │            │
│  │  (shared)    │  │  (shared)    │  │  (shared)    │  │  (shared)    │            │
│  │              │  │              │  │              │  │              │            │
│  │ • Receives   │  │ • OAuth flow │  │ • AI analysis│  │ • Orchestrate│            │
│  │   webhooks   │  │ • Dynamic    │  │ • Stateless  │  │ • Stateless  │            │
│  │ • Has install│  │   client per │  │              │  │ • Pass tenant│            │
│  │   _id context│  │   tenant     │  │              │  │   context    │            │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘            │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Tenant Lifecycle

### 1. Tenant Onboarding

When a new company wants to use Kenchi:

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              TENANT ONBOARDING FLOW                                  │
└─────────────────────────────────────────────────────────────────────────────────────┘

Step 1: GitHub App Installation
─────────────────────────────────
Company visits: github.com/apps/kenchi-devops → "Install"
                         │
                         ▼
              ┌─────────────────────┐
              │ GitHub sends webhook │
              │ installation.created │
              │ {                    │
              │   installation: {    │
              │     id: 12345,       │
              │     account: {       │
              │       login: "acme"  │
              │     }                │
              │   }                  │
              │ }                    │
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │ GitHub App Handler   │
              │ Creates tenant row:  │
              │ {                    │
              │   github_org: "acme",│
              │   install_id: 12345, │
              │   status: "pending"  │
              │ }                    │
              └─────────────────────┘

Step 2: Slack App Installation
──────────────────────────────
Company visits: kenchi.app/slack/install → Redirects to Slack OAuth
                         │
                         ▼
              ┌─────────────────────┐
              │ Slack OAuth Screen   │
              │ "Kenchi wants to     │
              │  access your         │
              │  workspace"          │
              │                      │
              │ [Allow]  [Deny]      │
              └──────────┬──────────┘
                         │ User clicks Allow
                         ▼
              ┌─────────────────────┐
              │ Slack redirects to   │
              │ /slack/oauth/callback│
              │ ?code=xxx&state=yyy  │
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │ Slack Bot exchanges  │
              │ code for tokens:     │
              │ {                    │
              │   access_token,      │
              │   team: {            │
              │     id: "T0ACME123", │
              │     name: "ACME"     │
              │   }                  │
              │ }                    │
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │ Update tenant row:   │
              │ {                    │
              │   slack_workspace_id,│
              │   slack_bot_token,   │
              │   slack_team_name,   │
              │   status: "active"   │
              │ }                    │
              └─────────────────────┘
```

### 2. Linking GitHub Org to Slack Workspace

The tenant table links GitHub organizations to Slack workspaces:

```
┌────────────────────────────────────────────────────────────────────────────┐
│                              TENANT TABLE                                   │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  github_org ←──────────────────────→ slack_workspace_id                     │
│      │                                      │                                │
│      │ "acme-corp"                          │ "T0ACME123"                   │
│      │                                      │                                │
│      ▼                                      ▼                                │
│  ┌─────────────┐                    ┌─────────────────┐                     │
│  │ GitHub      │                    │ Slack Workspace │                     │
│  │ Organization│                    │ ACME Corp       │                     │
│  │             │                    │ #devops-alerts  │                     │
│  └─────────────┘                    └─────────────────┘                     │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

Linking Options:

Option A: Same company name (automatic)
─────────────────────────────────────────
If github_org matches slack_team_name (fuzzy match), auto-link.

Option B: OAuth state parameter (recommended)
─────────────────────────────────────────
1. GitHub install happens first → tenant created with github_org
2. We show user: "Now connect your Slack workspace"
3. Slack OAuth URL includes state=tenant_id
4. Callback links the Slack workspace to existing tenant

Option C: Manual linking (admin UI)
─────────────────────────────────────────
Admin dashboard lets users link their GitHub org to Slack workspace.
```

---

## Request Flow (Runtime)

### CI Failure → Slack Notification

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              CI FAILURE FLOW (RUNTIME)                               │
└─────────────────────────────────────────────────────────────────────────────────────┘

1. CI Fails on ACME's repo
───────────────────────────
GitHub Actions fails on acme-corp/my-app
         │
         ▼
2. GitHub sends check_run webhook
─────────────────────────────────
POST /github/webhook
{
  "action": "completed",
  "check_run": {
    "conclusion": "failure",
    "name": "Build & Test"
  },
  "repository": {
    "full_name": "acme-corp/my-app",
    "owner": { "login": "acme-corp" }
  },
  "installation": {
    "id": 12345  ◄─── TENANT CONTEXT
  }
}
         │
         ▼
3. GitHub App Handler
─────────────────────
• Extracts installation_id: 12345
• Gathers enriched context (logs, diff, annotations)
• Forwards to GitHub App with tenant context:

POST http://GitHub App:5678/webhook/ci-failure
{
  "log": "...",
  "repository": "acme-corp/my-app",
  "installation_id": 12345,  ◄─── PASSED THROUGH
  "checkName": "Build & Test",
  ...
}
         │
         ▼
4. GitHub App Workflow (Stateless)
───────────────────────────
• Receives payload with installation_id
• Calls API for AI analysis (passes context through)
• Calls Slack Bot with tenant context:

POST http://slack-bot:3001/slack/message
{
  "installation_id": 12345,  ◄─── TENANT CONTEXT
  "repository": "acme-corp/my-app",
  "analysis": { ... }
}
         │
         ▼
5. Slack Bot (Multi-Tenant)
───────────────────────────
• Receives request with installation_id
• Looks up tenant in database:

  SELECT slack_bot_token, slack_workspace_id
  FROM tenants
  WHERE github_installation_id = 12345

  → Returns: { token: "xoxb-acme...", workspace: "T0ACME123" }

• Creates Slack client with ACME's token
• Gets bot's channel in ACME's workspace
• Posts message to ACME's Slack

         │
         ▼
6. ACME's Slack Channel
───────────────────────
#devops-alerts receives the CI failure notification
```

---

## Database Schema

### Tenants Table

```sql
CREATE TABLE tenants (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- GitHub App integration
    github_org VARCHAR(255) NOT NULL UNIQUE,
    github_installation_id INTEGER UNIQUE,
    github_app_installed_at TIMESTAMP WITH TIME ZONE,

    -- Slack App integration
    slack_workspace_id VARCHAR(255) UNIQUE,
    slack_team_name VARCHAR(255),
    slack_bot_token TEXT,  -- Encrypted at rest
    slack_app_installed_at TIMESTAMP WITH TIME ZONE,

    -- Tenant status
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    -- 'pending' = GitHub installed, awaiting Slack
    -- 'active' = Both installed, ready to use
    -- 'suspended' = Temporarily disabled
    -- 'deleted' = Soft deleted

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT valid_status CHECK (status IN ('pending', 'active', 'suspended', 'deleted'))
);

-- Indexes for fast lookups
CREATE INDEX idx_tenants_github_installation ON tenants(github_installation_id);
CREATE INDEX idx_tenants_slack_workspace ON tenants(slack_workspace_id);
CREATE INDEX idx_tenants_status ON tenants(status);
```

### Audit Log Table (Optional but Recommended)

```sql
CREATE TABLE tenant_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    action VARCHAR(100) NOT NULL,
    -- 'github_installed', 'slack_installed', 'ci_failure_processed', etc.
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_tenant ON tenant_audit_log(tenant_id);
CREATE INDEX idx_audit_created ON tenant_audit_log(created_at);
```

---

## Service Changes Required

### 1. Shared: Tenant Service

New file: `packages/shared/src/tenantService.ts`

```typescript
interface Tenant {
  id: string;
  githubOrg: string;
  githubInstallationId: number | null;
  slackWorkspaceId: string | null;
  slackBotToken: string | null;
  slackTeamName: string | null;
  status: 'pending' | 'active' | 'suspended' | 'deleted';
  createdAt: Date;
  updatedAt: Date;
}

interface TenantService {
  // Lookup methods
  findByGitHubInstallation(installationId: number): Promise<Tenant | null>;
  findByGitHubOrg(org: string): Promise<Tenant | null>;
  findBySlackWorkspace(workspaceId: string): Promise<Tenant | null>;

  // Creation/Update methods
  createFromGitHubInstall(org: string, installationId: number): Promise<Tenant>;
  linkSlackWorkspace(tenantId: string, workspaceId: string, token: string, teamName: string): Promise<Tenant>;

  // Status management
  activate(tenantId: string): Promise<Tenant>;
  suspend(tenantId: string): Promise<Tenant>;
  delete(tenantId: string): Promise<void>;
}
```

### 2. GitHub App Changes

**New: Installation Webhook Handler**

```typescript
// Handle GitHub App installation
app.webhooks.on('installation.created', async ({ payload }) => {
  const { installation, repositories } = payload;

  await tenantService.createFromGitHubInstall(
    installation.account.login,  // github_org
    installation.id              // installation_id
  );

  logger.info('New tenant created from GitHub installation', {
    org: installation.account.login,
    installationId: installation.id,
  });
});

// Handle uninstallation
app.webhooks.on('installation.deleted', async ({ payload }) => {
  const tenant = await tenantService.findByGitHubInstallation(payload.installation.id);
  if (tenant) {
    await tenantService.delete(tenant.id);
  }
});
```

**Updated: Check Run Handler**

```typescript
// Pass installation_id through to GitHub App
const payload = {
  log: enrichedLog,
  repository: repository.full_name,
  installation_id: webhook.installation.id,  // ◄─── ADD THIS
  checkName: check_run.name,
  // ... rest of payload
};
```

### 3. Slack Bot Changes

**New: OAuth Installation Flow**

```typescript
// GET /slack/install - Start OAuth flow
router.get('/slack/install', (req, res) => {
  const state = generateState(); // Could include tenant_id if known
  const scopes = ['chat:write', 'channels:read', 'groups:read'];

  const url = `https://slack.com/oauth/v2/authorize?` +
    `client_id=${config.SLACK_CLIENT_ID}&` +
    `scope=${scopes.join(',')}&` +
    `state=${state}&` +
    `redirect_uri=${config.SLACK_REDIRECT_URI}`;

  res.redirect(url);
});

// GET /slack/oauth/callback - Handle OAuth callback
router.get('/slack/oauth/callback', async (req, res) => {
  const { code, state } = req.query;

  // Exchange code for token
  const result = await slack.oauth.v2.access({
    client_id: config.SLACK_CLIENT_ID,
    client_secret: config.SLACK_CLIENT_SECRET,
    code,
    redirect_uri: config.SLACK_REDIRECT_URI,
  });

  // Link to tenant (by matching team name to github org, or via state)
  const tenant = await tenantService.findByGitHubOrg(result.team.name);
  if (tenant) {
    await tenantService.linkSlackWorkspace(
      tenant.id,
      result.team.id,
      result.access_token,
      result.team.name
    );
  }

  res.send('Slack connected successfully!');
});
```

**Updated: Message Service (Dynamic Client)**

```typescript
// Create Slack client dynamically per tenant
const getSlackClientForTenant = async (installationId: number): Promise<WebClient> => {
  const tenant = await tenantService.findByGitHubInstallation(installationId);

  if (!tenant || !tenant.slackBotToken) {
    throw new Error(`No Slack token found for installation ${installationId}`);
  }

  return new WebClient(tenant.slackBotToken);
};

// Updated postMessage
export const postMessage = async (
  installationId: number,
  request: SlackMessageRequest
): Promise<SlackMessagePostResponse> => {
  // Get tenant-specific Slack client
  const client = await getSlackClientForTenant(installationId);

  // Rest of the logic remains the same...
};
```

### 4. GitHub App Workflow Changes

Update workflow to pass `installation_id` through:

```json
{
  "name": "HTTP Request - Post to Slack",
  "parameters": {
    "jsonBody": "={{ JSON.stringify({ installation_id: $json.webhookData.installation_id, analysis: $json.analysis, repository: $json.analysis.repository }) }}"
  }
}
```

---

## Security Considerations

### 1. Token Storage

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              TOKEN SECURITY                                          │
└─────────────────────────────────────────────────────────────────────────────────────┘

Slack Bot Tokens:
─────────────────
• Stored encrypted at rest (AES-256)
• Never logged (redacted in logs)
• Rotated on re-installation
• Scoped to minimum required permissions

GitHub Installation Tokens:
───────────────────────────
• Generated on-demand via GitHub App private key
• Short-lived (1 hour expiry)
• Cached with TTL
• Never stored in database (only installation_id)

Encryption at Rest:
───────────────────
DATABASE_ENCRYPTION_KEY environment variable
Used to encrypt/decrypt slack_bot_token column
```

### 2. Tenant Isolation

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              TENANT ISOLATION                                        │
└─────────────────────────────────────────────────────────────────────────────────────┘

Every Request Must:
───────────────────
1. Carry tenant context (installation_id or workspace_id)
2. Validate tenant exists and is active
3. Use only that tenant's credentials
4. Tag logs with tenant_id

Isolation Checks:
─────────────────
• GitHub webhooks: Verify installation_id matches signature
• Slack requests: Verify workspace_id matches token
• Database queries: Always filter by tenant_id
• Logs: Include tenant_id in all log entries

What Could Go Wrong (and mitigations):
──────────────────────────────────────
❌ Bug posts to wrong Slack workspace
   ✅ Mitigation: Token lookup is per-request, not cached globally

❌ Tenant A sees Tenant B's logs
   ✅ Mitigation: Logs tagged with tenant_id, filtered in log viewer

❌ Tenant A's webhook triggers action in Tenant B
   ✅ Mitigation: installation_id verified on every webhook
```

### 3. Rate Limiting (Per Tenant)

```typescript
// Rate limit per tenant, not globally
const rateLimiter = rateLimit({
  keyGenerator: (req) => {
    // Use tenant's installation_id as rate limit key
    return req.body.installation_id || req.ip;
  },
  windowMs: 60 * 1000,  // 1 minute
  max: 100,             // 100 requests per minute per tenant
});
```

---

## Environment Variables

### New Variables Required

```bash
# Database (PostgreSQL)
DATABASE_URL=postgresql://user:pass@localhost:5432/kenchi

# Slack OAuth (for multi-tenant)
SLACK_CLIENT_ID=your-slack-client-id
SLACK_CLIENT_SECRET=your-slack-client-secret
SLACK_REDIRECT_URI=https://kenchi.app/slack/oauth/callback

# Encryption
DATABASE_ENCRYPTION_KEY=32-byte-encryption-key-here

# Existing (still needed)
GITHUB_APP_ID=...
GITHUB_APP_PRIVATE_KEY=...
GITHUB_WEBHOOK_SECRET=...
```

### Variables No Longer Needed (Per-Tenant)

```bash
# These move to database, not env vars:
# SLACK_BOT_TOKEN ← Now per-tenant in database
# SLACK_SIGNING_SECRET ← Now per-tenant in database
# GITHUB_INSTALLATION_ID ← Now per-tenant in database
```

---

## Migration Path

### Phase 1: Database Setup
1. Set up PostgreSQL database
2. Create tenants table
3. Implement TenantService

### Phase 2: GitHub App Multi-Tenant
1. Add installation.created webhook handler
2. Store installation_id in tenants table
3. Pass installation_id through to GitHub App

### Phase 3: Slack Bot Multi-Tenant
1. Add OAuth installation flow
2. Store tokens in tenants table
3. Create dynamic Slack client per tenant

### Phase 4: Cutover
1. Migrate existing single-tenant config to first tenant row
2. Test with existing installation
3. Enable new installations

---

## Testing Multi-Tenancy

### Test Cases

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              MULTI-TENANT TEST CASES                                 │
└─────────────────────────────────────────────────────────────────────────────────────┘

1. Installation Tests
─────────────────────
✓ GitHub App install creates tenant with status='pending'
✓ Slack OAuth completes and links to existing tenant
✓ Tenant status becomes 'active' after both installed
✓ GitHub uninstall marks tenant as 'deleted'

2. Isolation Tests
──────────────────
✓ Tenant A's CI failure only goes to Tenant A's Slack
✓ Tenant B's CI failure only goes to Tenant B's Slack
✓ Invalid installation_id returns error (not wrong tenant)
✓ Logs show correct tenant_id for each request

3. Edge Cases
─────────────
✓ CI failure for org with no Slack connected → graceful error
✓ Slack token expired → refresh or notify admin
✓ GitHub App suspended → don't process webhooks
✓ Concurrent requests for same tenant → no race conditions
```

---

## Monitoring & Observability

### Metrics to Track

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              MULTI-TENANT METRICS                                    │
└─────────────────────────────────────────────────────────────────────────────────────┘

Per-Tenant Metrics:
───────────────────
• ci_failures_processed{tenant_id}
• slack_messages_sent{tenant_id}
• github_comments_posted{tenant_id}
• api_requests{tenant_id}
• errors{tenant_id, error_type}

Global Metrics:
───────────────
• active_tenants_count
• pending_tenants_count
• total_ci_failures_processed
• total_slack_messages_sent

Alerts:
───────
• Tenant Slack token expired (needs re-auth)
• Tenant hitting rate limits
• Tenant with high error rate
• New tenant onboarding stuck (installed GitHub but not Slack)
```

---

## Summary

| Aspect | Implementation |
|--------|----------------|
| **Tenant Identity** | `installation_id` from GitHub webhook |
| **Token Storage** | PostgreSQL `tenants` table, encrypted |
| **Slack Client** | Created per-request with tenant's token |
| **GitHub Client** | Uses installation_id to generate tokens |
| **Isolation** | Every request validated against tenant context |
| **Onboarding** | GitHub install → Slack OAuth → Active |

This architecture allows Kenchi to:
- Serve unlimited tenants from a single deployment
- Maintain complete data isolation between tenants
- Scale horizontally (add more service instances)
- Onboard new customers via marketplace installs

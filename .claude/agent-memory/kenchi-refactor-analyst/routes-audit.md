# API Routes Audit Detail (2026-02-22)

## Files Reviewed (22 total)

### Top-level routes/

- authRoutes.ts -- GOOD (minor: long callback handler, CLIENT_ID_MAP dup)
- integrationRoutes.ts -- GOOD (minor: CLIENT_ID_MAP dup, possible dup error logging)
- healthRoutes.ts -- CLEAN
- webhookRoutes.ts -- CRITICAL (no sig verification, no replay protection, stub)
- eventRoutes.ts -- MEDIUM (stub, no context in logs, validateRequiredString dup)
- analysisRoutes.ts -- CRITICAL (raw SQL in route, no context, no repository)
- dashboardRoutes.ts -- MEDIUM (inline error JSON, no container.ts, delegates well)
- sseRoutes.ts -- GOOD (let justified, security proper, inline DashboardEventPayload type)
- subscriptionRoutes.ts -- GOOD (DTO mappers return Record<string,unknown>)
- fineTuningRoutes.ts -- CLEAN (barrel only)
- fineTuningDatasetRoutes.ts -- MEDIUM (no context, validateOptionalString dup)
- fineTuningModelRoutes.ts -- MEDIUM (inline error JSON, no context, validator dups)
- fineTuningJobRoutes.ts -- MEDIUM (inline error JSON, no context, validator dups)
- riskRulesRoutes.ts -- HIGH (tenantId from body not auth, no context, validator dups)
- index.ts -- CLEAN (barrel only)

### rag/ subdirectory

- index.ts -- CLEAN (barrel only)
- types.ts -- CLEAN (proper module organization)
- coreRoutes.ts -- MEDIUM (no context, validateRequiredString dup)
- costRoutes.ts -- MEDIUM (let without justification, inline error JSON, no context)
- driftRoutes.ts -- MEDIUM (no context, validateRequiredString/Number dups)
- healthRoutes.ts -- MEDIUM (no context)
- purgeRoutes.ts -- MEDIUM (global isNaN, inline error JSON, no context)

## Duplication Counts

| Helper                  | Count | Files                                                                                                |
| ----------------------- | ----- | ---------------------------------------------------------------------------------------------------- |
| validateRequiredString  | 6     | analysisRoutes, eventRoutes, fineTuningModelRoutes, riskRulesRoutes, rag/coreRoutes, rag/driftRoutes |
| validateOptionalString  | 3     | fineTuningDatasetRoutes, fineTuningJobRoutes, fineTuningModelRoutes                                  |
| validateOptionalNumber  | 2     | fineTuningDatasetRoutes, fineTuningJobRoutes                                                         |
| validateOptionalBoolean | 2     | fineTuningJobRoutes, rag/costRoutes                                                                  |
| requireTenantId         | 3     | dashboardRoutes, subscriptionRoutes, sseRoutes                                                       |
| CLIENT_ID_MAP           | 3     | authRoutes, integrationRoutes, integrationService                                                    |

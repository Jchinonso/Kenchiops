-- Migration: Expand Knowledge Document Types
-- This migration updates the doc_type CHECK constraint to support all 18 document types
-- defined in packages/shared/src/constants/openai.ts

-- ==================== Drop Existing Constraint ====================

-- Drop the existing CHECK constraint on doc_type
ALTER TABLE knowledge_documents DROP CONSTRAINT IF EXISTS knowledge_documents_doc_type_check;

-- ==================== Add New Constraint ====================

-- Add new CHECK constraint with all 18 document types organized by category:
-- - Operational: runbook, sop, troubleshooting
-- - Incident Analysis: postmortem, known_issues
-- - CI/CD & DevOps: ci_cd, deployment, testing, infrastructure
-- - Technical Reference: documentation, api_docs, architecture, config_guide, database
-- - Project Files: readme, changelog
-- - Other: onboarding, external

ALTER TABLE knowledge_documents ADD CONSTRAINT knowledge_documents_doc_type_check
CHECK (doc_type IN (
  -- Operational
  'runbook',
  'sop',
  'troubleshooting',
  -- Incident Analysis
  'postmortem',
  'known_issues',
  -- CI/CD & DevOps
  'ci_cd',
  'deployment',
  'testing',
  'infrastructure',
  -- Technical Reference
  'documentation',
  'api_docs',
  'architecture',
  'config_guide',
  'database',
  -- Project Files
  'readme',
  'changelog',
  -- Other
  'onboarding',
  'external'
));

-- ==================== Comments ====================

COMMENT ON COLUMN knowledge_documents.doc_type IS 'Document type categorizing the knowledge document. Valid types: runbook, sop, troubleshooting, postmortem, known_issues, ci_cd, deployment, testing, infrastructure, documentation, api_docs, architecture, config_guide, database, readme, changelog, onboarding, external';

-- Migration 041: Add passive learning doc types to knowledge_documents constraint
--
-- The check constraint only allowed manually-created doc types. Add the
-- passive learning types so auto-ingested lessons can be stored:
--   analysis_lesson  — from resolved CI failures
--   pr_fix_comment   — from PR comments explaining fixes
--   slack_resolution — from Slack thread resolution signals
--   linked_fix       — from PR merge with cached failure context

ALTER TABLE knowledge_documents
  DROP CONSTRAINT IF EXISTS knowledge_documents_doc_type_check;

ALTER TABLE knowledge_documents
  ADD CONSTRAINT knowledge_documents_doc_type_check
  CHECK (doc_type IN (
    'runbook', 'sop', 'troubleshooting', 'postmortem', 'known_issues',
    'ci_cd', 'deployment', 'testing', 'infrastructure', 'documentation',
    'api_docs', 'architecture', 'config_guide', 'database', 'readme',
    'changelog', 'onboarding', 'external',
    'analysis_lesson', 'pr_fix_comment', 'slack_resolution', 'linked_fix'
  ));

-- Migration 040: Widen analysis_feedback.analysis_id column
--
-- The feedback URL uses the aggregation key (e.g. "owner/repo:commitSha")
-- as the analysisId, which can exceed 50 characters. Widen to 255 to
-- accommodate all aggregation key formats.

ALTER TABLE analysis_feedback
  ALTER COLUMN analysis_id TYPE varchar(255);

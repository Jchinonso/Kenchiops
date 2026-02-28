-- Migration 037: Fix Free Plan Team Member Limit
--
-- WHY: The free plan has max_team_members = 1, which means a solo user
-- already fills the quota. No team can form on the free plan.
-- Updating to 5 allows small teams to try the product while maintaining
-- a meaningful upgrade path (Pro = 10, Team = 50, Enterprise = unlimited).
--
-- ROLLBACK:
--   UPDATE plans SET max_team_members = 1 WHERE id = 'free';

UPDATE plans SET max_team_members = 5, updated_at = NOW() WHERE id = 'free';

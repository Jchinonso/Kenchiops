-- Migration: Rename github_org column to org_name
-- Phase 1 of provider-neutral tenant refactor
--
-- PostgreSQL automatically updates indexes, constraints, and views
-- that reference the renamed column.

ALTER TABLE tenants RENAME COLUMN github_org TO org_name;

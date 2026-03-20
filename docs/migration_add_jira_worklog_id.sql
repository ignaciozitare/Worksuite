-- Ejecutar en Supabase → SQL Editor
ALTER TABLE worklogs ADD COLUMN IF NOT EXISTS jira_worklog_id text;
CREATE INDEX IF NOT EXISTS idx_worklogs_jira_id ON worklogs (jira_worklog_id) WHERE jira_worklog_id IS NOT NULL;

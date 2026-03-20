-- Ejecutar en Supabase → SQL Editor

CREATE TABLE IF NOT EXISTS jira_connections (
  user_id      uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  base_url     text        NOT NULL,
  email        text        NOT NULL,
  api_token    text        NOT NULL,
  projects     text[]      NOT NULL DEFAULT '{}',
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS jira_connections_updated_at ON jira_connections;
CREATE TRIGGER jira_connections_updated_at
  BEFORE UPDATE ON jira_connections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE jira_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_select" ON jira_connections FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "owner_insert" ON jira_connections FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner_update" ON jira_connections FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "owner_delete" ON jira_connections FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "service_role_all" ON jira_connections FOR ALL USING (auth.role() = 'service_role');

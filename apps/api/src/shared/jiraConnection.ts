import type { SupabaseClient } from '@supabase/supabase-js';
import { JiraClient, type JiraClientConfig } from '@worksuite/jira-client';

interface UserRow {
  jira_api_token: string | null;
  email:          string;
}

interface ConnectionRow {
  base_url:  string;
  email:     string;
  api_token: string;
  user_id:   string;
}

/**
 * resolveJiraClient — shared across jira-tracker AND deploy-planner.
 *
 * Priority:
 * 1. User has a personal jira_api_token → use it with admin base_url
 * 2. User has their own jira_connection row → use it
 * 3. Fallback to admin connection with prefix comment
 */
export async function resolveJiraClient(
  userId: string,
  supabase: SupabaseClient,
): Promise<{ client: JiraClient; commentPrefix: string }> {
  const { data: userRow } = await supabase
    .from('users')
    .select('jira_api_token, email')
    .eq('id', userId)
    .single<UserRow>();

  if (userRow?.jira_api_token) {
    // Option A: personal token — get base_url from admin connection
    const { data: adminConn } = await supabase
      .from('jira_connections')
      .select('base_url, email')
      .limit(1)
      .single<ConnectionRow>();

    if (!adminConn) throw Object.assign(
      new Error('Jira not configured — admin must set up a connection in Settings'),
      { statusCode: 404 },
    );

    const config: JiraClientConfig = {
      baseUrl:  adminConn.base_url,
      email:    userRow.email,
      apiToken: userRow.jira_api_token,
    };
    return { client: new JiraClient(config), commentPrefix: '' };
  }

  // Option B / C: use user's own connection or admin connection
  const { data: conn, error } = await supabase
    .from('jira_connections')
    .select('base_url, email, api_token, user_id')
    .eq('user_id', userId)
    .maybeSingle<ConnectionRow>();

  if (!error && conn) {
    const config: JiraClientConfig = {
      baseUrl:  conn.base_url,
      email:    conn.email,
      apiToken: conn.api_token,
    };
    return { client: new JiraClient(config), commentPrefix: '' };
  }

  // Fallback: admin connection with prefix
  const { data: adminConn } = await supabase
    .from('jira_connections')
    .select('base_url, email, api_token')
    .limit(1)
    .single<ConnectionRow>();

  if (!adminConn) throw Object.assign(
    new Error('Jira not configured'),
    { statusCode: 404 },
  );

  const { data: emailRow } = await supabase
    .from('users')
    .select('email')
    .eq('id', userId)
    .single<{ email: string }>();

  const config: JiraClientConfig = {
    baseUrl:  adminConn.base_url,
    email:    adminConn.email,
    apiToken: adminConn.api_token,
  };

  return {
    client:        new JiraClient(config),
    commentPrefix: `[Logged by: ${emailRow?.email ?? userId}] `,
  };
}

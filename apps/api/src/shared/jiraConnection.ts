import { JiraClient, type JiraClientConfig } from '@worksuite/jira-client';
import type { IJiraConnectionRepository } from '../domain/jira/IJiraConnectionRepository.js';
import type { IUserRepository } from '../domain/user/IUserRepository.js';

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
  jiraConnectionRepo: IJiraConnectionRepository,
  userRepo: IUserRepository,
): Promise<{ client: JiraClient; commentPrefix: string }> {
  const userProfile = await userRepo.findById(userId);

  if (userProfile?.jira_api_token) {
    // Option A: personal token — get base_url from admin connection
    const adminConn = await jiraConnectionRepo.findAny();

    if (!adminConn) throw Object.assign(
      new Error('Jira not configured — admin must set up a connection in Settings'),
      { statusCode: 404 },
    );

    const config: JiraClientConfig = {
      baseUrl:  adminConn.base_url,
      email:    userProfile.email,
      apiToken: userProfile.jira_api_token,
    };
    return { client: new JiraClient(config), commentPrefix: '' };
  }

  // Option B: use user's own connection
  const conn = await jiraConnectionRepo.findByUserId(userId);

  if (conn) {
    const config: JiraClientConfig = {
      baseUrl:  conn.base_url,
      email:    conn.email,
      apiToken: conn.api_token,
    };
    return { client: new JiraClient(config), commentPrefix: '' };
  }

  // Option C: fallback to admin connection with prefix
  const adminConn = await jiraConnectionRepo.findAny();

  if (!adminConn) throw Object.assign(
    new Error('Jira not configured'),
    { statusCode: 404 },
  );

  const config: JiraClientConfig = {
    baseUrl:  adminConn.base_url,
    email:    adminConn.email,
    apiToken: adminConn.api_token,
  };

  return {
    client:        new JiraClient(config),
    commentPrefix: `[Logged by: ${userProfile?.email ?? userId}] `,
  };
}

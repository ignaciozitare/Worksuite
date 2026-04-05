import type { JiraIssueRaw } from '../domain/JiraSearchPort';

/**
 * Extract the list of repository names from a set of Jira tickets.
 *
 * The "repo field" in Jira can be configured per workspace (Admin → Deploy
 * Config → `repo_jira_field`). It may be:
 *   - a custom field id (e.g. "customfield_10146")
 *   - the native "components" field
 *
 * The value of that field, in turn, may come as:
 *   - an array of strings
 *   - an array of objects with `.name` or `.value`
 *   - a single string (comma-separated)
 *   - a single object with `.name` / `.value`
 *
 * This util normalizes all of those into a de-duplicated list of names.
 */
export function extractReposFromTickets(
  tickets: JiraIssueRaw[],
  repoField: string,
): string[] {
  const repos = new Set<string>();

  for (const ticket of tickets) {
    // The field may live either on `ticket.fields[repoField]` (raw Jira shape)
    // or flattened at `ticket[repoField]` (api projection).
    const value =
      ticket?.fields?.[repoField] ??
      (ticket as Record<string, any>)?.[repoField] ??
      null;
    if (value == null) continue;

    const addOne = (v: unknown) => {
      if (v == null) return;
      if (typeof v === 'string') {
        // string can be comma-separated ("repo-a, repo-b") or a single name
        v.split(',').map(s => s.trim()).filter(Boolean).forEach(n => repos.add(n));
        return;
      }
      if (typeof v === 'object') {
        const o = v as Record<string, any>;
        const name = o.name ?? o.value;
        if (typeof name === 'string' && name.trim()) repos.add(name.trim());
      }
    };

    if (Array.isArray(value)) value.forEach(addOne);
    else addOne(value);
  }

  return [...repos];
}

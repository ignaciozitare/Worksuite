import type { IJiraApi, JiraProject, JiraIssue, JiraWorklogResult } from '../../domain/worklog/IJiraApi.js';

// ── Tipos internos de la respuesta Jira ───────────────────────────────────────
interface JiraProjectRaw {
  key:  string;
  name: string;
  id:   string;
}

interface JiraIssueRaw {
  key:    string;
  fields: {
    summary:    string;
    issuetype:  { name: string };
    status:     { name: string };
    priority:   { name: string } | null;
    project:    { key: string };
    assignee:   { displayName: string } | null;
    labels:     string[];
    // epics en Jira Cloud v3: parent o customfield_10014
    parent?:    { key: string; fields?: { summary?: string; issuetype?: { name: string } } };
    customfield_10014?: string | null;   // epic link (legacy)
    customfield_10008?: { key: string; fields?: { summary?: string } } | null; // epic name (legacy)
  };
}

// ── Adapter ───────────────────────────────────────────────────────────────────
export class JiraCloudAdapter implements IJiraApi {
  private readonly authHeader: string;
  private readonly base: string;

  constructor(baseUrl: string, email: string, apiToken: string) {
    this.base = baseUrl.replace(/\/$/, ''); // sin trailing slash
    this.authHeader = 'Basic ' + Buffer.from(`${email}:${apiToken}`).toString('base64');
  }

  // ── helpers ─────────────────────────────────────────────────────────────────
  private async fetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
    const url = `${this.base}/rest/api/3${path}`;
    const res = await fetch(url, {
      ...opts,
      headers: {
        'Authorization': this.authHeader,
        'Accept':        'application/json',
        'Content-Type':  'application/json',
        ...(opts.headers ?? {}),
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Jira ${res.status} ${res.statusText} — ${path}\n${body}`);
    }

    return res.json() as Promise<T>;
  }

  // ── IJiraApi ─────────────────────────────────────────────────────────────────
  async getProjects(): Promise<JiraProject[]> {
    const data = await this.fetch<{ values: JiraProjectRaw[] }>(
      '/project/search?maxResults=50&orderBy=name&typeKey=software',
    );
    return data.values.map(p => ({ key: p.key, name: p.name, id: p.id }));
  }

 async getIssues(projectKey: string, extraFields?: string[]): Promise<JiraIssue[]> {
  const baseFields = ['summary', 'issuetype', 'status', 'priority', 'project',
             'assignee', 'labels', 'parent', 'customfield_10014', 'customfield_10008'];
  const fields = extraFields?.length ? [...new Set([...baseFields, ...extraFields])] : baseFields;
  const body = {
    jql: `project = "${projectKey}" ORDER BY updated DESC`,
    maxResults: 100,
    fields,
  };

  const data = await this.fetch<{ issues: JiraIssueRaw[] }>(
    '/search/jql',
    { method: 'POST', body: JSON.stringify(body) },
  );

  return data.issues.map(i => {
    const f = i.fields;
    let epicKey  = '—';
    let epicName = '—';
    if (f.parent && f.parent.fields?.issuetype?.name === 'Epic') {
      epicKey  = f.parent.key;
      epicName = f.parent.fields.summary ?? f.parent.key;
    } else if (f.customfield_10014) {
      epicKey  = f.customfield_10014;
      epicName = (f.customfield_10008 as any)?.fields?.summary ?? epicKey;
    }
    return {
      key:      i.key,
      summary:  f.summary,
      type:     f.issuetype.name,
      status:   f.status.name,
      priority: f.priority?.name ?? 'Medium',
      project:  f.project.key,
      epic:     epicKey,
      epicName,
      assignee: f.assignee?.displayName ?? '',
      labels:   f.labels ?? [],
      components: (f.components ?? []).map((c: any) => typeof c === 'string' ? c : c.name).filter(Boolean),
      fields:   f,
    };
  });
}

  async addWorklog(
    issueKey:  string,
    seconds:   number,
    startedAt: string,
    comment?:  string,
  ): Promise<JiraWorklogResult> {
    // Jira requiere el campo "started" en formato: 2025-03-19T09:00:00.000+0000
    const started = startedAt.includes('T')
      ? startedAt
      : `${startedAt}T09:00:00.000+0000`;

    const body: Record<string, unknown> = { timeSpentSeconds: seconds, started };

    if (comment) {
      // Jira Cloud v3 usa Atlassian Document Format para el comentario
      body['comment'] = {
        type:    'doc',
        version: 1,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: comment }] }],
      };
    }

    const data = await this.fetch<{ id: string; timeSpent: string }>(
      `/issue/${issueKey}/worklog`,
      { method: 'POST', body: JSON.stringify(body) },
    );

    return { id: data.id, issueKey, timeSpent: data.timeSpent };
  }

  async getIssueTypes(): Promise<{ id: string; name: string; subtask: boolean }[]> {
    const data = await this.fetch<Array<{ id: string; name: string; subtask: boolean }>>('/issuetype');
    return data.map(it => ({ id: it.id, name: it.name, subtask: it.subtask }));
  }

  async getFields(): Promise<{ id: string; name: string; custom: boolean; type: string }[]> {
    const data = await this.fetch<Array<{ id: string; name: string; custom: boolean; schema?: { type: string } }>>('/field');
    return data.map(f => ({ id: f.id, name: f.name, custom: f.custom, type: f.schema?.type || 'unknown' }));
  }

  async searchIssues(jql: string, maxResults = 50, fields?: string): Promise<any> {
    const fieldList = (fields || 'summary,assignee,priority,issuetype,status,components').split(',');
    const data = await this.fetch<any>('/search', {
      method: 'POST',
      body: JSON.stringify({ jql, maxResults, fields: fieldList }),
    });
    return data;
  }

  async getSubtasks(parentKeys: string[]): Promise<any[]> {
    if (!parentKeys.length) return [];
    // Batch: get subtasks + linked issues for all parent keys via JQL
    const keysStr = parentKeys.join(',');
    const jql = `parent in (${keysStr}) OR issuekey in linkedIssuesOf(${keysStr})`;
    const data = await this.fetch<{ issues: any[] }>('/search', {
      method: 'POST',
      body: JSON.stringify({
        jql,
        maxResults: 500,
        fields: ['summary', 'issuetype', 'status', 'priority', 'assignee', 'parent', 'issuelinks'],
      }),
    });

    return (data.issues || []).map(i => {
      const f = i.fields;
      const parentKey = f.parent?.key || null;
      // If no parent, check issuelinks for linked parent
      let relation: 'subtask' | 'linked' = parentKey ? 'subtask' : 'linked';
      let resolvedParent = parentKey;
      if (!resolvedParent && f.issuelinks) {
        for (const link of f.issuelinks) {
          const inward = link.inwardIssue?.key;
          const outward = link.outwardIssue?.key;
          if (inward && parentKeys.includes(inward)) { resolvedParent = inward; break; }
          if (outward && parentKeys.includes(outward)) { resolvedParent = outward; break; }
        }
      }

      return {
        key: i.key,
        summary: f.summary,
        type: f.issuetype?.name || 'Task',
        status: f.status?.name || '',
        statusCategory: f.status?.statusCategory?.name || '',
        priority: f.priority?.name || 'Medium',
        assignee: f.assignee?.displayName || '',
        parentKey: resolvedParent || parentKeys[0],
        relation,
      };
    });
  }
}

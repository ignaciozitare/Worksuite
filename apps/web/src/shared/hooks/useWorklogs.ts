import { useCallback, useRef, useEffect } from 'react';
import { worklogRepo, jiraSync } from './useWorkSuiteData';

interface UseWorklogsParams {
  worklogs: Record<string, any[]>;
  setWorklogs: (fn: (p: any) => any) => void;
  activeDay: string;
  currentUser: { id: string; name: string };
  notify: (msg: string) => void;
}

export function useWorklogs({ worklogs, setWorklogs, activeDay, currentUser, notify }: UseWorklogsParams) {
  const activeDayRef = useRef(activeDay);
  useEffect(() => { activeDayRef.current = activeDay; }, [activeDay]);

  const openLogModal = useCallback(({ date, issueKey }: { date?: string; issueKey?: string } = {}) => {
    return { date: date || activeDayRef.current, issueKey: issueKey || '' };
  }, []);

  const handleSaveWorklog = useCallback(async (date: string, wl: any) => {
    setWorklogs(p => ({ ...p, [date]: [...(p[date] || []), wl] }));
    try {
      await worklogRepo.insert({
        id: wl.id, issue_key: wl.issue, issue_summary: wl.summary,
        issue_type: wl.type, epic_key: wl.epic, epic_name: wl.epicName,
        project_key: wl.project, author_id: currentUser.id, author_name: currentUser.name,
        date, started_at: wl.started, seconds: wl.seconds, description: wl.description || '',
      });

      // Auto-sync to Jira
      try {
        const startedAt = `${date}T${wl.started}:00.000+0000`;
        const syncResult = await jiraSync.syncWorklog(wl.issue, {
          worklogId: wl.id, seconds: wl.seconds, startedAt, description: wl.description || '',
        });
        if (syncResult.ok) {
          setWorklogs(p => ({
            ...p,
            [date]: (p[date] || []).map((w: any) => w.id === wl.id ? { ...w, syncedToJira: true } : w),
          }));
          notify('✓ Worklog guardado y sincronizado con Jira');
        } else {
          notify('Worklog guardado (sync Jira: ' + (syncResult.error?.message || 'error') + ')');
        }
      } catch (syncErr) {
        console.error('Jira sync failed:', syncErr);
        notify('Worklog guardado (Jira no disponible)');
      }
    } catch (err) { console.error('Save worklog failed:', err); }
  }, [currentUser.id, currentUser.name, setWorklogs, notify]);

  const handleDeleteWorklog = useCallback(async (date: string, id: string) => {
    setWorklogs(p => {
      const u = (p[date] || []).filter((w: any) => w.id !== id);
      if (!u.length) { const { [date]: _, ...r } = p; return r; }
      return { ...p, [date]: u };
    });
    try {
      await worklogRepo.remove(id);
    } catch (err) { console.error('Delete worklog failed:', err); }
  }, [setWorklogs]);

  const loadJiraIssues = useCallback(async (projectKey: string, setJiraIssues: (issues: any[]) => void) => {
    try {
      const issues = await jiraSync.loadIssues(projectKey);
      if (issues.length) {
        setJiraIssues(issues.map((i, idx) => ({
          id: idx + 1, key: i.key, summary: i.summary, type: i.type,
          status: i.status, priority: i.priority ?? 'Medium', project: i.project,
          assignee: i.assignee ?? '', epic: i.epic ?? '—', epicName: i.epicName ?? '—',
          hours: 0, labels: i.labels ?? [],
        })));
      }
    } catch (e) { console.error('loadJiraIssues failed:', e); }
  }, []);

  return { openLogModal, handleSaveWorklog, handleDeleteWorklog, loadJiraIssues };
}

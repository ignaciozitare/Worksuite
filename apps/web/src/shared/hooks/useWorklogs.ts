// @ts-nocheck
import { useCallback, useRef, useEffect } from 'react';
import { supabase } from '../lib/api';
import { getAuthHeader, API_BASE } from './useWorkSuiteData';

export function useWorklogs({ worklogs, setWorklogs, activeDay, currentUser, notify }) {
  const activeDayRef = useRef(activeDay);
  useEffect(() => { activeDayRef.current = activeDay; }, [activeDay]);

  const openLogModal = useCallback(({ date, issueKey } = {}) => {
    return { date: date || activeDayRef.current, issueKey: issueKey || '' };
  }, []);

  const handleSaveWorklog = useCallback(async (date, wl) => {
    setWorklogs(p => ({ ...p, [date]: [...(p[date] || []), wl] }));
    try {
      const { error } = await supabase.from('worklogs').insert({
        id: wl.id, issue_key: wl.issue, issue_summary: wl.summary,
        issue_type: wl.type, epic_key: wl.epic, epic_name: wl.epicName,
        project_key: wl.project, author_id: currentUser.id, author_name: currentUser.name,
        date, started_at: wl.started, seconds: wl.seconds, description: wl.description || '',
      });
      if (error) { console.error('Save worklog error:', error.message); return; }

      try {
        const startedAt = `${date}T${wl.started}:00.000+0000`;
        const headers = { ...await getAuthHeader(), 'Content-Type': 'application/json' };
        const syncRes = await fetch(`${API_BASE}/jira/worklogs/${wl.issue}/sync`, {
          method: 'POST', headers,
          body: JSON.stringify({ worklogId: wl.id, seconds: wl.seconds, startedAt, description: wl.description || '' }),
        });
        const syncJson = await syncRes.json();
        if (syncJson.ok) {
          setWorklogs(p => ({
            ...p,
            [date]: (p[date] || []).map(w => w.id === wl.id ? { ...w, syncedToJira: true } : w),
          }));
          notify('✓ Worklog guardado y sincronizado con Jira');
        } else {
          notify('Worklog guardado (sync Jira: ' + (syncJson.error?.message || 'error') + ')');
        }
      } catch (syncErr) {
        console.error('Jira sync failed:', syncErr);
        notify('Worklog guardado (Jira no disponible)');
      }
    } catch (err) { console.error('Save worklog failed:', err); }
  }, [currentUser.id, currentUser.name, setWorklogs, notify]);

  const handleDeleteWorklog = useCallback(async (date, id) => {
    setWorklogs(p => {
      const u = (p[date] || []).filter(w => w.id !== id);
      if (!u.length) { const { [date]: _, ...r } = p; return r; }
      return { ...p, [date]: u };
    });
    try {
      const { error } = await supabase.from('worklogs').delete().eq('id', id);
      if (error) console.error('Delete worklog error:', error.message);
    } catch (err) { console.error('Delete worklog failed:', err); }
  }, [setWorklogs]);

  const loadJiraIssues = useCallback(async (projectKey, setJiraIssues) => {
    try {
      const headers = { ...await getAuthHeader(), 'Content-Type': 'application/json' };
      const res = await fetch(`${API_BASE}/jira/issues?project=${projectKey}`, { headers });
      const json = await res.json();
      if (json.ok && json.data?.length) {
        setJiraIssues(json.data.map((i, idx) => ({
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

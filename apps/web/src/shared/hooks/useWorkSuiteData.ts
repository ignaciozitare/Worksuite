// @ts-nocheck
import { useState, useEffect } from 'react';
import { supabase } from '../lib/api';
import { TODAY } from '../lib/constants';
import { SEATS } from '../../modules/hotdesk/domain/entities/seats';
import { MOCK_ISSUES_FALLBACK, MOCK_PROJECTS_FALLBACK } from '../lib/fallbackData';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '');

async function getAuthHeader() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

function dbWorklogToUI(row) {
  const seconds = row.seconds ?? 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const time = h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
  return {
    id: row.id, issue: row.issue_key, summary: row.issue_summary ?? row.issue_key,
    type: row.issue_type ?? 'Task', epic: row.epic_key ?? '—', epicName: row.epic_name ?? '—',
    project: row.project_key ?? '—', author: row.author_name, authorId: row.author_id,
    time, seconds, started: (row.started_at ?? '09:00').slice(0, 5),
    description: row.description ?? '', syncedToJira: row.synced_to_jira ?? false,
  };
}

function worklogsArrayToMap(rows) {
  const map = {};
  for (const row of rows) {
    const date = typeof row.date === 'string' ? row.date.slice(0, 10) : row.date;
    if (!map[date]) map[date] = [];
    map[date].push(dbWorklogToUI(row));
  }
  return map;
}

export function useWorkSuiteData(authUser) {
  const [loadingData,  setLoadingData]  = useState(true);
  const [worklogs,     setWorklogs]     = useState({});
  const [users,        setUsers]        = useState([]);
  const [hd,           setHd]           = useState({ fixed: {}, reservations: [] });
  const [jiraIssues,   setJiraIssues]   = useState(MOCK_ISSUES_FALLBACK);
  const [jiraProjects, setJiraProjects] = useState(MOCK_PROJECTS_FALLBACK);

  useEffect(() => {
    if (!authUser) { setLoadingData(false); return; }
    let cancelled = false;

    async function loadAll() {
      setLoadingData(true);
      try {
        const [wlRes, usersRes, seatsRes, resRes, fixedRes] = await Promise.all([
          supabase.from('worklogs').select('*').order('date', { ascending: false }),
          supabase.from('users').select('*').order('name'),
          supabase.from('seats').select('*').order('id'),
          supabase.from('seat_reservations').select('*'),
          supabase.from('fixed_assignments').select('*'),
        ]);

        if (cancelled) return;

        if (wlRes.data) setWorklogs(worklogsArrayToMap(wlRes.data));
        if (usersRes.data) setUsers(usersRes.data.map(u => ({
          id: u.id, name: u.name, email: u.email,
          avatar: u.avatar || u.name.slice(0, 2).toUpperCase(),
          role: u.role, deskType: u.desk_type, active: u.active,
          modules: u.modules || ["jt", "hd", "retro", "deploy"],
        })));

        const fixed = {};
        (fixedRes.data ?? []).forEach(fa => {
          const source = fa.user_name || fa.user_id || "";
          const resolved = usersRes.data?.find(u => u.id === source)?.name || source;
          fixed[fa.seat_id] = resolved;
        });
        const reservations = (resRes.data ?? []).map(r => ({
          seatId: r.seat_id, date: r.date.slice(0, 10),
          userId: r.user_id, userName: r.user_name,
        }));
        setHd({ fixed, reservations });

        if (seatsRes.data?.length) {
          seatsRes.data.forEach(s => {
            const seat = SEATS.find(ss => ss.id === s.id);
            if (seat) { seat.x = s.x; seat.y = s.y; }
          });
        }

        // Load Jira projects + issues
        try {
          const authHeaders = await getAuthHeader();
          const headers = { ...authHeaders, 'Content-Type': 'application/json' };

          const projRes = await fetch(`${API_BASE}/jira/projects`, { headers });
          const projJson = await projRes.json();

          if (projJson.ok && projJson.data?.length) {
            if (cancelled) return;
            setJiraProjects(projJson.data.map(p => ({ key: p.key, name: p.name })));

            const preferred = projJson.data.find(p => p.key === 'ANDURIL') ?? projJson.data[0];
            const issRes = await fetch(`${API_BASE}/jira/issues?project=${preferred.key}`, { headers });
            const issJson = await issRes.json();

            if (issJson.ok && issJson.data?.length && !cancelled) {
              setJiraIssues(issJson.data.map((i, idx) => ({
                id: idx + 1, key: i.key, summary: i.summary, type: i.type,
                status: i.status, priority: i.priority ?? 'Medium', project: i.project,
                assignee: i.assignee ?? '', epic: i.epic ?? '—', epicName: i.epicName ?? '—',
                hours: 0, labels: i.labels ?? [],
              })));
            }
          }
        } catch (jiraErr) {
          console.info('Jira not configured or unreachable:', jiraErr);
        }
      } catch (err) {
        console.error('Failed to load data:', err);
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    }

    void loadAll();
    return () => { cancelled = true; };
  }, [authUser?.id]);

  return {
    loadingData,
    worklogs, setWorklogs,
    users, setUsers,
    hd, setHd,
    jiraIssues, setJiraIssues,
    jiraProjects, setJiraProjects,
  };
}

export { getAuthHeader, API_BASE };

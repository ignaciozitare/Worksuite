import { useState, useEffect } from 'react';
import type { WorklogRow } from '../../modules/jira-tracker/domain/ports/WorklogPort';
import { supabase } from '../lib/api';
import { SEATS } from '../../modules/hotdesk/domain/entities/seats';
import { MOCK_ISSUES_FALLBACK, MOCK_PROJECTS_FALLBACK } from '../lib/fallbackData';

// Infra — singletons
import { SupabaseWorklogRepo } from '../../modules/jira-tracker/infra/SupabaseWorklogRepo';
import { JiraSyncAdapter } from '../../modules/jira-tracker/infra/JiraSyncAdapter';
import { SupabaseSeatReservationRepo } from '../../modules/hotdesk/infra/SupabaseSeatReservationRepo';
import { SupabaseUserRepo } from '../infra/SupabaseUserRepo';

const API_BASE = ((import.meta as any).env?.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '');
async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

const worklogRepo = new SupabaseWorklogRepo(supabase);
const jiraSync    = new JiraSyncAdapter(API_BASE, getAuthHeaders);
const seatRepo    = new SupabaseSeatReservationRepo(supabase);
const userRepo    = new SupabaseUserRepo(supabase);

function dbWorklogToUI(row: WorklogRow) {
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

function worklogsArrayToMap(rows: WorklogRow[]) {
  const map: Record<string, any[]> = {};
  for (const row of rows) {
    const date = typeof row.date === 'string' ? row.date.slice(0, 10) : row.date;
    if (!map[date]) map[date] = [];
    map[date].push(dbWorklogToUI(row));
  }
  return map;
}

export function useWorkSuiteData(authUser: any) {
  const [loadingData,  setLoadingData]  = useState(true);
  const [worklogs,     setWorklogs]     = useState<Record<string, any[]>>({});
  const [users,        setUsers]        = useState<any[]>([]);
  const [hd,           setHd]           = useState<{ fixed: Record<string, string>; reservations: any[] }>({ fixed: {}, reservations: [] });
  const [jiraIssues,   setJiraIssues]   = useState(MOCK_ISSUES_FALLBACK);
  const [jiraProjects, setJiraProjects] = useState(MOCK_PROJECTS_FALLBACK);

  useEffect(() => {
    if (!authUser) { setLoadingData(false); return; }
    let cancelled = false;

    async function loadAll() {
      setLoadingData(true);
      try {
        const [wlRows, usersRows, seatsRows, resRows, fixedRows] = await Promise.all([
          worklogRepo.findAll(),
          userRepo.findAll(),
          seatRepo.findAllSeats(),
          seatRepo.findAllReservations(),
          seatRepo.findAllFixed(),
        ]);

        if (cancelled) return;

        setWorklogs(worklogsArrayToMap(wlRows));
        setUsers(usersRows.map(u => ({
          id: u.id, name: u.name, email: u.email,
          avatar: u.avatar || u.name.slice(0, 2).toUpperCase(),
          role: u.role, deskType: u.desk_type, active: u.active,
          modules: (u as any).modules || ["jt", "hd", "retro", "deploy"],
        })));

        const fixed: Record<string, string> = {};
        fixedRows.forEach(fa => {
          const resolved = usersRows.find(u => u.id === (fa.user_name || fa.user_id))?.name || fa.user_name || fa.user_id || "";
          fixed[fa.seat_id] = resolved;
        });
        const reservations = resRows.map(r => ({
          seatId: r.seat_id, date: r.date,
          userId: r.user_id, userName: r.user_name,
        }));
        setHd({ fixed, reservations });

        if (seatsRows.length) {
          seatsRows.forEach(s => {
            const seat = SEATS.find(ss => ss.id === s.id);
            if (seat) { seat.x = s.x; seat.y = s.y; }
          });
        }

        // Load Jira projects + issues
        try {
          const projects = await jiraSync.loadProjects();
          if (projects.length && !cancelled) {
            setJiraProjects(projects);
            const preferred = projects.find(p => p.key === 'ANDURIL') ?? projects[0]!;
            const issues = await jiraSync.loadIssues(preferred.key);
            if (issues.length && !cancelled) {
              setJiraIssues(issues.map((i, idx) => ({
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

export { worklogRepo, jiraSync, seatRepo, getAuthHeaders, API_BASE };

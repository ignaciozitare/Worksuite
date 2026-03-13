# Spec — Jira Tracker

**Status:** Draft v1  
**Last updated:** 2026-03-11  
**Owner:** WorkSuite team

---

## 1. Domain Overview

The Jira Tracker module allows users to log, view, and manage work hours against Jira issues. It acts as a local ledger of time entries that can optionally be synced to Jira Cloud.

**Bounded context:** `JiraTracker`  
**Key concepts:** Worklog, Issue, TimeSpent, DateRange

---

## 2. Entities & Value Objects

### Worklog (Aggregate Root)
| Field | Type | Rules |
|---|---|---|
| id | string | Generated, `wl-{timestamp}-{random}` |
| issueKey | string | Required, non-empty |
| date | string | YYYY-MM-DD format |
| timeSpent | TimeSpent VO | See below |
| authorId | string | References User |
| syncedToJira | boolean | false by default |
| jiraWorklogId | string? | Set after Jira sync |

### TimeSpent (Value Object)
- Immutable, always positive
- Max 86400 seconds (24h) per entry
- Accepted input formats: `2h`, `1h 30m`, `45m`, `1.5` (decimal hours)
- Throws on invalid or out-of-range input

---

## 3. Use Cases

### UC-JT-01: Log Worklog
**Actor:** Authenticated user  
**Pre-conditions:** User is logged in, issue key exists  
**Flow:**
1. User selects an issue (via combobox search)
2. User enters date, start time, time spent, optional description
3. System validates input
4. System creates Worklog entity
5. If `syncToJira=true`: calls IJiraApi.logWork(), stores jiraWorklogId
6. System persists to Supabase
7. Returns formatted time and worklog ID

**Acceptance tests:**
- ✅ Valid input creates worklog and returns `formattedTime`
- ✅ `syncToJira=false` → no Jira API call
- ✅ `syncToJira=true` → Jira called, `jiraWorklogId` returned
- ✅ Invalid time format → throws, nothing saved
- ✅ Empty issue key → throws, nothing saved

### UC-JT-02: Delete Worklog
**Actor:** Authenticated user (own worklogs) or Admin  
**Flow:**
1. User clicks delete on a worklog entry
2. If `syncedToJira=true`: calls IJiraApi.deleteWorklog()
3. System removes from Supabase

**Acceptance tests:**
- ✅ Owner can delete their worklog
- ✅ Non-owner (non-admin) gets 403
- ✅ If jira-synced, Jira delete is called first

### UC-JT-03: Get Calendar
**Actor:** Authenticated user  
**Input:** DateRange, optional authorId filter  
**Output:** Map of date → worklogs[]

### UC-JT-04: Export CSV
**Actor:** Authenticated user  
**Input:** DateRange, optional filters  
**Output:** CSV file download

---

## 4. Business Rules

- **BR-JT-01:** Time entries cannot exceed 24h per single worklog
- **BR-JT-02:** Users can only delete their own worklogs unless they are admin
- **BR-JT-03:** If Jira sync fails, the worklog is still saved locally with `syncedToJira=false`
- **BR-JT-04:** Date range filter is inclusive on both ends

---

## 5. Ports (Interfaces)

### IWorklogRepository
- `save(worklog)` — upsert
- `delete(id, authorId)` — fails if not owner
- `findByFilters(filters)` — main query
- `findById(id)`

### IJiraApi
- `getIssue(key)` — for validation and metadata
- `searchIssues(jql)` — for issue combobox
- `logWork(payload)` — sync on save
- `deleteWorklog(issueKey, jiraWorklogId)` — sync on delete

**Adapters available:**
- `MockJiraAdapter` — dev/test, returns mock data
- `JiraCloudAdapter` — production, requires `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`

---

## 6. Supabase Schema

```sql
create table worklogs (
  id            text primary key,
  issue_key     text not null,
  issue_summary text not null,
  issue_type    text not null,
  epic_key      text not null default '—',
  epic_name     text not null default '—',
  project_key   text not null,
  author_id     uuid not null references auth.users(id),
  author_name   text not null,
  date          date not null,
  started_at    time not null,
  seconds       integer not null check (seconds > 0 and seconds <= 86400),
  description   text not null default '',
  synced_to_jira boolean not null default false,
  jira_worklog_id text,
  created_at    timestamptz not null default now()
);

-- RLS: users see only their own, admins see all
alter table worklogs enable row level security;

create policy "users_own_worklogs" on worklogs
  for all using (author_id = auth.uid());

create policy "admins_all_worklogs" on worklogs
  for all using (
    exists (select 1 from users where id = auth.uid() and role = 'admin')
  );
```

---

## 7. Open Questions

- [ ] Should we support bulk Jira sync (re-sync multiple local worklogs)?
- [ ] Do we need a conflict resolution strategy when Jira has a newer version of the worklog?
- [ ] Pagination on calendar endpoint or always load full month?

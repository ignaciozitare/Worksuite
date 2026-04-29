# Jira Tracker — SPEC

_Last updated: 2026-04-22_

---

## Overview

Jira Tracker is the worklog management module of WorkSuite. It allows users to log time against Jira issues, visualize logged hours across calendar/day/task views, filter by date range/user/project, and export data to CSV.

## Architecture

```
jira-tracker/
├── domain/
│   ├── entities/Worklog.ts          # Worklog domain entity
│   ├── ports/
│   │   ├── WorklogPort.ts           # Simple CRUD port (raw rows)
│   │   ├── WorklogRepository.ts     # Rich typed port (domain entities)
│   │   └── JiraSyncPort.ts          # Jira integration port
│   ├── services/
│   │   ├── TimeParser.ts            # Parse/format time strings
│   │   ├── WorklogService.ts        # Filter by range, group by epic
│   │   └── CsvService.ts            # CSV export logic
│   └── useCases/
│       ├── LogTime.ts               # Create worklog use case
│       └── SyncToJira.ts            # Sync worklog to Jira use case
├── infra/
│   ├── SupabaseWorklogRepo.ts       # WorklogPort adapter (Supabase)
│   ├── SupabaseWorklogRepository.ts # WorklogRepository adapter (Supabase)
│   └── JiraSyncAdapter.ts           # Jira sync via backend API routes
└── ui/
    ├── JiraTrackerPage.tsx           # Main layout (3-panel)
    ├── CalendarView.tsx              # Month/week calendar
    ├── DayView.tsx                   # Single day detail
    ├── TasksView.tsx                 # Issue table with hours
    ├── LogWorklogModal.tsx           # Create/edit worklog modal
    ├── ExportConfigModal.tsx         # CSV export configuration
    ├── JTFilterSidebar.tsx           # Legacy sidebar (replaced by JiraTrackerPage)
    └── RecentTasksSidebar.tsx        # Legacy right sidebar (replaced by JiraTrackerPage)
```

## Domain Entity

### Worklog
| Field | Type | Description |
|---|---|---|
| id | string | Unique ID (`wl-{timestamp}`) |
| issueKey | string | Jira issue key (e.g. `AND-10`) |
| issueSummary | string | Issue title |
| project | string | Project key |
| seconds | number | Time logged in seconds |
| startedAt | string | ISO date (YYYY-MM-DD) |
| description | string | Optional description |
| syncedToJira | boolean | Whether synced to Jira |
| authorId | string | User ID |
| authorName | string | User display name |

## Views

### JiraTrackerPage (Layout)
Three-panel layout:
- **Left Sidebar** (240px, glassmorphic): brand, navigation (Calendar/Day/Tasks), DateRangePicker (`@worksuite/ui`), user filter, project chips, gradient action buttons (Apply Filters, Export CSV)
- **Main Content** (flex:1): renders active view
- **Right Sidebar** (260px open / 40px collapsed): recent tasks from worklogs, full Jira issue search, draggable ticket cards with green filete + radial glow

### CalendarView
- **Month view**: 7-column grid (Mon-Sun), day cells show hours + issue keys
- **Week view**: 7-column expanded with full issue cards per day
- **Bento stats**: Total Hours, Active Days, Avg/Day, Unique Tasks
- **Drag-and-drop**: accept issues from right sidebar → open LogWorklogModal
- **Navigation**: prev/next, today, month/week toggle

### DayView
- Full date header with stats (hours, worklogs count, tasks count)
- Worklogs grouped by Epic with total hours per epic
- Each worklog card: issue key, summary, time, start, author, type
- **Edit** (✎) and **Delete** (×) actions per worklog
- Summary table by task at bottom
- Monthly stats chips

### TasksView
- Only shows issues with logged hours in filtered date range
- **Bento stats**: Total Hours, Active Tasks, Top Project
- **Filter pills**: by issue type (All, Bug, Story, Task, etc.)
- **Search**: by key, summary, assignee
- **Sortable table**: Key, Summary, Type, Status, Priority, Project, Epic, Hours, Actions
- **Semantic chips**: status (green=done, blue=progress, amber=todo), priority (red=critical, amber=high, blue=medium)
- Per-row: Log Hours button + Edit (✎) button

### LogWorklogModal
- **Create mode**: empty form, issue autocomplete
- **Edit mode**: pre-filled with existing worklog data
- Fields: Issue (searchable combobox), Date, Start Time, Time Logged (free-form: `2h`, `1h 30m`, `45m`, `1.5`), Description (optional)
- Validation: issue required, date required, time > 0, max 160h
- Warning confirmation for logs > 16h
- Auto-sync to Jira on save

### ExportConfigModal
- 16 available export fields
- Dual-panel column configurator (available ↔ selected)
- Preset system (save/load/update/delete named presets)
- Custom filename, live preview table
- Default columns: date, issue, summary, type, project, author, started, time, hours, description

## Integrations

### Jira (via backend)
All Jira calls go through `apps/api` backend routes — never direct from frontend:
- `POST /jira/worklogs/{issueKey}/sync` — sync worklog
- `GET /jira/projects` — list projects
- `GET /jira/issues?project={key}` — list issues
- `GET /jira/search?jql=...` — search issues

### Supabase
- Table: `worklogs` — stores all worklog records
- CRUD via `SupabaseWorklogRepo` adapter

## Design System

- **Glassmorphic sidebar**: `rgba(14,14,14,.6)` + `backdrop-filter: blur(20px)`, solid `var(--sf)` in light mode
- **Ticket cards**: green left border (`var(--green-strong)`), radial glow
- **Gradient buttons**: primary (blue), export (green), with glow shadows
- **Bento stat cards**: 4 semantic colors (blue/green/amber/purple)
- **Semantic chips**: status and priority with DS color tokens
- All colors via CSS variables — dark/light mode supported
- Uses `@worksuite/ui` components: `DateRangePicker`, `Modal`, `Btn`
- Icons: Material Symbols Outlined

## Rules & Limits
- Maximum worklog: 160 hours (576,000 seconds)
- Warning threshold: >16 hours requires confirmation
- Time parser accepts: `2h`, `1h 30m`, `45m`, `1.5` (decimal hours)
- Minimum worklog: 60 seconds (enforced in LogTime use case)
- Recent tasks sidebar: max 20 unique issues
- Jira search in sidebar: max 30 results
- **Jira sync fallback:** si la sync a Jira falla, el worklog se persiste localmente con `syncedToJira=false` (LogTime use case crea siempre la row, la sync es best-effort).

## Out of Scope
- DayView v2 redesign (user confirmed to keep original)
- ExportConfigModal internal redesign (exterior only)
- Login screen redesign (pending Pencil reference)

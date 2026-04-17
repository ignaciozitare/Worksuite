# Deploy Planner — SPEC

## Feature: Right Sidebar — Jira Task Search + Ordered Task List

### Context

The Planning and Timeline views currently show releases with their assigned tickets, but there's no way to browse/search all Jira tickets from a sidebar. Users have to go to Jira externally to find tickets. The admin also can't configure which task types and statuses appear in the deploy planner.

### Requirements

#### 1. Right Sidebar (Planning & Timeline views)

**Goal:** A collapsible right panel with two sections — search and ordered task list.

| Component | Detail |
|-----------|--------|
| **Position** | Right side of Planning and Timeline views, 300px wide, collapsible. |
| **Toggle** | Chevron button to collapse/expand. State persisted in localStorage. |
| **Section 1: Search** | Input field that searches Jira tickets by key or summary (debounced 300ms). Uses existing `HttpJiraSearchAdapter`. Results show as compact cards (key, summary, type icon, status badge). |
| **Section 2: Task List** | All tickets from configured Jira projects, ordered newest first (by creation date). User can drag to reorder manually. Reorder persisted per-session or in DB if needed. |
| **Drag to Release** | User can drag a ticket from the sidebar into a release card in the main area (existing DnD flow). |
| **Filtering** | Filter by task type and status using the admin-configured values (see below). |

#### 2. Admin Configuration — Task Types & Statuses

**Goal:** Admin defines which Jira issue types and statuses are visible in the deploy planner sidebar.

| Config | Detail |
|--------|--------|
| **Task Types** | Admin selects which Jira issue types appear in the sidebar (e.g., Story, Bug, Task). Stored in `dp_release_config.issue_types[]`. Already exists — reuse. |
| **Statuses** | Admin selects which Jira statuses are included (e.g., "In Development", "Ready for QA"). Stored in `dp_release_config.jira_status_filter`. Already exists — reuse. |
| **UI Location** | Admin panel → Deploy Planner → Jira tab (existing). Add a section for "Sidebar Filters" if needed, or reuse current config. |

#### 3. Task List Behavior

| Rule | Detail |
|------|--------|
| **Default order** | Newest first (by Jira `created` field). |
| **Manual reorder** | Drag handle on each item. New order stored in component state (session-only). |
| **Already assigned** | Tickets already in a release show a subtle "assigned" badge and are de-emphasized. |
| **Click action** | Click opens Jira ticket in new tab (using `jiraBaseUrl + /browse/ + key`). |
| **Refresh** | "Refresh" button at top to re-fetch from Jira. |

### UI Design (Carbon Logic)

- Background: `var(--sf)` with `border-left: 1px solid var(--bd)`
- Header: Section label in uppercase 9px bold, search input below
- Cards: `var(--sf2)` background, 8px radius, ghost border, hover glow
- Type icons: Jira type icon or Material Symbol fallback
- Status badges: Semantic chips (green/blue/amber per category)
- Collapse animation: 300ms ease, chevron rotates

### Data Flow

1. On mount, sidebar calls existing `fetchJiraTickets()` from DeployPlanner state
2. Search triggers `jiraSearchAdapter.search(query)` with debounce
3. Sidebar reads `releaseStatuses` and `issueTypes` from config (already loaded)
4. Drag-drop uses same `onTicketDrop(ticketKey, releaseId)` as existing Planning DnD

### Files to Create
- `apps/web/src/modules/deploy-planner/ui/internal/TaskSidebar.tsx`

### Files to Modify
- `apps/web/src/modules/deploy-planner/ui/DeployPlanner.tsx` — layout + sidebar state
- `apps/web/src/modules/deploy-planner/ui/internal/Planning.tsx` — accept drops from sidebar
- `apps/web/src/modules/deploy-planner/ui/internal/Timeline.tsx` — same sidebar integration

### Out of Scope (v1)
- Persisting manual reorder to DB (session-only for now)
- Inline ticket editing from sidebar
- Bulk assign multiple tickets to a release

---

## Status: DRAFT — awaiting user confirmation

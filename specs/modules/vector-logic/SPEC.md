# Vector Logic — Module Spec

## Overview

Vector Logic is a full task orchestration platform inside WorkSuite. It allows users to define custom workflows (state machines), build dynamic task schemas, manage tasks on a Kanban board, and automate task creation from emails via an AI-powered rule engine.

## Phases

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | Workflow Engine (states, transitions, canvas, assignment) | Shipped |
| 2 | Task Type Schema Builder (dynamic fields, form constructor) | Shipped |
| 3 | Smart Kanban (task CRUD, board view, task movement) | Shipped |
| 4 | Email Intelligence (Gmail OAuth, rule engine, AI extraction, review inbox) | Spec confirmed — ready for DBA |

---

## Phase 1: Workflow Engine

### What it does

Lets admins create reusable workflow state machines with visual transitions. Each workflow defines the lifecycle of a task type (e.g., Bug → Triage → In Progress → QA → Done).

### Sub-views

1. **State Manager** — CRUD for states with categories. Kanban-style columns grouped by category.
2. **Canvas Designer** — Visual drag-and-drop editor using React Flow. States as nodes, transitions as edges. Sidebar with reusable state library.
3. **Assignment Manager** — Table mapping task types to workflows. Bulk assign via checkboxes.

### Data Model

#### `vl_workflows`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, default gen_random_uuid() |
| name | text | NOT NULL |
| description | text | nullable |
| is_published | boolean | default false |
| created_by | uuid | FK → users.id |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

#### `vl_states`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| name | text | NOT NULL |
| category | text | CHECK: 'OPEN', 'BACKLOG', 'IN_PROGRESS', 'DONE' |
| color | text | hex color for UI |
| is_global | boolean | default false — reusable across workflows |
| created_at | timestamptz | default now() |

#### `vl_workflow_states`
Join table — which states belong to which workflow, with canvas position.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| workflow_id | uuid | FK → vl_workflows.id, ON DELETE CASCADE |
| state_id | uuid | FK → vl_states.id |
| position_x | real | React Flow node X |
| position_y | real | React Flow node Y |
| is_initial | boolean | default false — entry point |

**Business rule**: only ONE state with category='OPEN' per workflow. Enforced in domain logic + DB constraint.

#### `vl_transitions`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| workflow_id | uuid | FK → vl_workflows.id, ON DELETE CASCADE |
| from_state_id | uuid | FK → vl_states.id |
| to_state_id | uuid | FK → vl_states.id |
| is_global | boolean | if true, accessible from any state |
| label | text | nullable, transition name |

#### `vl_task_types`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| name | text | NOT NULL (e.g., "Bug", "Feature Request") |
| icon | text | nullable, Material Symbol name |
| workflow_id | uuid | FK → vl_workflows.id, nullable |
| schema | jsonb | default '[]' — field definitions (Phase 2) |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

### Business Rules

1. **One OPEN per workflow**: when adding a state with category='OPEN' to a workflow, check that no other state in that workflow has category='OPEN'. If violated, reject with error.
2. **Global transitions**: if `is_global` is true on a transition, it means every state in that workflow can transition to the target state (no need for explicit from edges).
3. **Publish guard**: a workflow can only be published if it has at least one OPEN state and one DONE state.

### Module Structure

```
apps/web/src/modules/vector-logic/
├── container.ts              # infra wiring
├── domain/
│   ├── entities/
│   │   ├── Workflow.ts
│   │   ├── State.ts
│   │   ├── Transition.ts
│   │   └── TaskType.ts
│   ├── ports/
│   │   ├── IWorkflowRepo.ts
│   │   ├── IStateRepo.ts
│   │   ├── ITransitionRepo.ts
│   │   └── ITaskTypeRepo.ts
│   └── useCases/
│       ├── CreateWorkflow.ts
│       ├── AddStateToWorkflow.ts
│       └── AssignWorkflowToTaskType.ts
├── infra/
│   └── supabase/
│       ├── SupabaseWorkflowRepo.ts
│       ├── SupabaseStateRepo.ts
│       ├── SupabaseTransitionRepo.ts
│       └── SupabaseTaskTypeRepo.ts
└── ui/
    ├── VectorLogicPage.tsx    # main shell with sidebar nav
    ├── views/
    │   ├── StateManagerView.tsx
    │   ├── CanvasDesignerView.tsx
    │   └── AssignmentManagerView.tsx
    └── components/
        ├── StateCard.tsx
        ├── StateNode.tsx       # React Flow custom node
        └── TransitionEdge.tsx  # React Flow custom edge
```

### UI Reference (from mockups)

- **State Manager**: 4-column layout (BACKLOG, OPEN, IN_PROGRESS, DONE). States as cards within columns. "Architect New State" form at bottom with name + category + validation conflict warning.
- **Canvas Designer**: Full-screen canvas. Left sidebar with sections (Nodes, Triggers, Variables, Logs, Deploy). States as dark cards with category badge, "CONFIGURE" button, auto-transition toggle. Right sidebar "State Library" with search + draggable existing states.
- **Assignment Manager**: Data table with Task Type Name, Current Workflow, Last Modified, Status columns. Bulk "ASSIGN WORKFLOW" button. Filter by status.

### Navigation

Vector Logic gets its own sidebar (same Stitch glass pattern as chrono/environments):
- **Task Entities** (Phase 2+)
- **Workflow Engine** (Phase 1) — active
- **AI Rules** (Phase 4)
- **Settings** (Phase 4)

---

## Phase 4: Email Intelligence

### What it does

An AI layer inside Vector Logic that reads a user's Gmail inbox, detects which incoming emails are actionable, and automatically creates tasks in their workspace with title, description, task type, priority, and due date deduced from the email content.

It acts as a **triage copilot**: instead of reading every email and creating tasks manually, the AI does it. Users control the behavior through filter rules and a confidence threshold — from fully automatic (0% threshold) to a hybrid review-queue model (default 85%).

### Who uses it

Any Vector Logic user with a Gmail account. Each user connects their own Gmail via OAuth 2.0 — there is no shared team inbox in v1. Emails processed and tasks created are scoped to that user's workspace.

### Main flow (end-to-end)

1. **Connect Gmail** — In Settings, "Connect Gmail" button opens Google's OAuth consent. The backend stores the refresh token encrypted.
2. **Define filter rules** — The user creates at least one active rule. Each rule has one or more filter criteria (label, Gmail category/tray, specific sender, domain, or "all"). If no rule is active, no email gets processed — the system never processes by default.
3. **Polling** — The backend polls the user's inbox on an interval (default 5 min, configurable). Only emails received **after** the OAuth connection are considered — no historical reprocessing in v1.
4. **Matching** — Each new email is tested against active rules. If nothing matches, it's ignored silently.
5. **AI extraction** — For matched emails, the LLM extracts: title (a short summary, not necessarily the subject), description (summary + original body), task type, priority, due date (only if explicit in the email).
6. **Rule overrides** — If the matched rule has optional **actions** (e.g., "force task type = Bug, priority = High, assign to Nacho"), those override the AI's extraction on those specific fields. AI extraction still runs for the non-overridden fields.
7. **Confidence gate**:
   - If overall confidence ≥ user's threshold → task is **auto-created** in the OPEN state of the task type's workflow.
   - If confidence < threshold → the detection goes to the **review inbox**.
8. **Review inbox** — A dedicated view "AI Detections" lists pending detections with proposed fields and a preview of the email. User can:
   - **Approve** → task is created as-is.
   - **Edit** → user adjusts fields, then creates.
   - **Reject** → detection is discarded (does not re-appear for the same email).
9. **Task ↔ Email link** — Every task created (auto or via approval) stores the Gmail `message_id` and `thread_id`. The task detail view shows a clickable link that opens the original email in Gmail in a new tab. A visual `AI` badge distinguishes AI-created tasks from manual ones in the Kanban.

### Actions the user can take

- Connect / disconnect Gmail (user can disconnect at any time — polling stops, existing tasks are preserved).
- CRUD on filter rules: create, edit, activate/deactivate (without deleting), delete.
- Configure defaults in Settings: default priority, default task type, confidence threshold (0–100% slider), polling interval.
- Review AI Detections inbox: Approve / Edit / Reject.
- See AI-created tasks on the Kanban with an `AI` badge.
- Click the email link on a task to open the original thread in Gmail.

### Business rules and limits

- **One Gmail account per user** in v1 (not multiple inboxes per user).
- **Only post-connection emails** — no historical reprocessing.
- **No rule = nothing processed.** The system does not process "by default" when the inbox is connected but no rule is active. This is intentional: opt-in, not opt-out.
- **Confidence fallback**: fields the AI cannot confidently deduce → fall back to user-configured Settings defaults (if any), otherwise left empty.
- **Assignee default**: always the user who connected the inbox. The AI does not try to guess assignees in v1.
- **Initial state**: always the OPEN state of the task type's workflow. If the task type has no workflow or no OPEN state → detection goes to the review inbox regardless of confidence.
- **Rejected detections** do not re-appear for the same `gmail_message_id`.
- **Security**: all Gmail API calls and LLM calls run in `apps/api` (Fastify). The browser never sees OAuth tokens or LLM API keys. Refresh tokens are stored encrypted at rest.

### Connections

- **Gmail API** (OAuth 2.0 + REST) — read messages, labels, threads. Scope: `https://www.googleapis.com/auth/gmail.readonly`.
- **LLM** — reuses the existing `apps/api/infrastructure/llm/` proxy (the same layer the chat uses). Email extraction runs as a structured-output prompt with confidence scoring.
- **Vector Logic internal** — creates `Task` via the existing `taskRepo`; references `TaskType`, `Priority`, `Workflow` of the user.

### Sub-views

1. **Settings → Email Intelligence panel** — OAuth connect button, connection status, polling interval slider, confidence threshold slider, default priority, default task type.
2. **Email Rules view** (new, alongside Workflow Engine / Schema Builder / Kanban in the Vector Logic sidebar) — list of rules with activate toggles, create/edit form with filters and optional actions.
3. **AI Detections view** (new) — inbox-style list of pending detections, each expandable to preview the email and the proposed task. Approve / Edit / Reject buttons.
4. **Kanban TaskCard** — small `AI` badge + email link icon for AI-created tasks.

### In v1 (IN)

- Gmail OAuth per-user with encrypted refresh token storage.
- Filter rules with composable criteria: label, Gmail category/tray, specific sender, domain, "all".
- Rules with optional action overrides (task type, priority, assignee).
- AI extraction of: title, description, task type, priority, due date.
- User-configurable confidence threshold (default 85%, slider 0–100%).
- User-configurable defaults: priority, task type, polling interval.
- Review Inbox view with Approve / Edit / Reject.
- `AI` badge on AI-created tasks in Kanban.
- Clickable email-thread link on each task back to Gmail.
- Polling-based ingestion (not push).

### Planned future iterations (OUT of v1 — explicit backlog)

These were discussed and deliberately deferred. Keep them visible for future planning:

1. **Push real-time ingestion** via Gmail Pub/Sub (replace or complement polling).
2. **Sandbox / testing tool** — paste a sample email, preview what the AI would extract and which rule would match, without creating a task.
3. **Visual node-based rule editor** — drag-drop graph of Email Received → Filter → Extract → Create Task (mockup reference: `visual_ai_rule_editor`).
4. **Reply to the original email** from the task detail view (compose + send via Gmail API).
5. **Attach email attachments** to the created task (download from Gmail, store in Supabase Storage, link in task `data`).
6. **Multi-provider support** — Outlook / Microsoft Graph and generic IMAP. Abstract the email provider behind a domain port `IEmailProvider` so this is additive, not invasive.
7. **Reprocess historical emails** — user picks a date range and the AI retroactively processes past emails.
8. **Learning / feedback loop** — the AI improves its confidence scoring based on the user's Approve/Edit/Reject history (e.g., per-sender reliability).
9. **Shared team inbox** — one Gmail connected by an admin, detections fan out to the team's workspace with optional per-sender routing to specific users.
10. **Multiple Gmail accounts per user** (e.g., personal + work, each with separate rule sets).

### Module extension

```
apps/web/src/modules/vector-logic/
├── domain/
│   ├── entities/
│   │   ├── EmailRule.ts                   # new
│   │   ├── EmailDetection.ts              # new
│   │   └── GmailConnection.ts             # new
│   ├── ports/
│   │   ├── IEmailRuleRepo.ts              # new
│   │   ├── IEmailDetectionRepo.ts         # new
│   │   └── IGmailConnectionRepo.ts        # new
│   └── useCases/
│       ├── ApproveDetection.ts            # new
│       ├── RejectDetection.ts             # new
│       └── EditAndApproveDetection.ts     # new
├── infra/
│   └── api/
│       ├── GmailApiAdapter.ts             # new — HTTP client to our backend routes
│       └── EmailRuleApiAdapter.ts         # new — HTTP client to our backend routes
└── ui/views/
    ├── EmailRulesView.tsx                 # new
    └── AIDetectionsView.tsx               # new

apps/api/src/
├── domain/
│   ├── entities/ (mirror of frontend entities)
│   └── ports/
│       └── IEmailProvider.ts              # new — abstracts Gmail/Outlook/IMAP
├── application/
│   ├── PollInboxForUser.ts                # new — orchestrator
│   ├── MatchEmailAgainstRules.ts          # new
│   ├── ExtractTaskFromEmail.ts            # new — LLM call with structured output
│   └── ProcessInboundEmail.ts             # new — glues match → extract → auto-create or queue
└── infrastructure/
    ├── http/
    │   ├── gmailOAuthRoutes.ts            # new — /auth/gmail/start, /auth/gmail/callback
    │   ├── emailRulesRoutes.ts            # new — CRUD for rules
    │   ├── emailDetectionsRoutes.ts       # new — list, approve, reject, edit
    │   └── emailIngestionRoutes.ts        # new — trigger poll (cron or manual)
    ├── gmail/
    │   └── GmailProvider.ts               # new — implements IEmailProvider
    ├── supabase/
    │   ├── SupabaseEmailRuleRepo.ts       # new
    │   ├── SupabaseEmailDetectionRepo.ts  # new
    │   └── SupabaseGmailConnectionRepo.ts # new
    └── scheduler/
        └── pollInboxesCron.ts             # new — scheduled job per connected user
```

### Data Model

Three new tables, plus a small extension to the existing `vl_tasks` table so any task knows whether it came from an email.

**1. Gmail connection (`vl_gmail_connections`).** One row per user. Stores the Gmail address the user connected, the OAuth tokens needed to keep reading their inbox (tokens are encrypted by `apps/api` before being written, and the browser never sees them), and the per-user settings that shape the AI behavior: polling interval, confidence threshold, default priority, and default task type to fall back on when the AI can't deduce one. Also tracks `last_polled_at` and `last_message_timestamp` so each poll only looks at new emails since the previous run.

**2. Email rules (`vl_email_rules`).** One row per rule the user defines. Each rule has a name, an active flag, and a list of filter criteria (stored as a JSON array of `{type, value}` entries — type is one of `label`, `category`, `sender`, `domain`, or `all`). If **any** filter in a rule matches an email, the rule matches. Each rule can optionally specify override actions: force a specific task type, force a priority by name, or force an assignee. If multiple rules match the same email, the rule with the lowest `sort_order` wins.

**3. Email detections (`vl_email_detections`).** One row per email that the system processed. Holds the Gmail identifiers (`gmail_message_id`, `gmail_thread_id`, `gmail_received_at`), the sender, the subject and body preview, which rule matched, the AI's confidence score, and the proposed task fields (title, description, task type, priority, due date). The `status` column tracks the lifecycle: `pending_review` (waiting in the review inbox), `approved` (user confirmed), `rejected` (user discarded), `auto_created` (confidence beat the threshold, task created without review), or `failed` (something went wrong during processing — `error_message` explains). Once a task is actually created, `task_id` points back to it. A unique constraint on `(user_id, gmail_message_id)` ensures the same email is never processed twice.

**4. Extension to `vl_tasks`.** Three new columns: `gmail_message_id` and `gmail_thread_id` (so the Kanban card can link back to the original thread in Gmail), and `created_by_ai` (a boolean so the UI can show the `AI` badge without joining against `vl_email_detections`).

**Relationships in plain language.**
A user has at most one Gmail connection. That user can have many email rules and many detections. Each detection was (optionally) matched by one rule, and (optionally) resulted in one task. A rule can be referenced by many detections. A task can be referenced by at most one detection.

**Security.**
Every new table has Row Level Security enabled with policies scoped by `auth.uid() = user_id` — a user can only see and modify their own connection, rules, and detections. OAuth tokens are stored as `text` but encrypted by the backend before insert; the decryption key lives only in `apps/api` environment variables.

**Indexes.**
Fast lookups for: the user's Gmail connection, the user's active rules in priority order, the user's pending detections in recent-first order, and the reverse lookup from a `gmail_message_id` back to a task.

Migration file: `supabase/migrations/20260416_vl_email_intelligence_initial.sql` (applied to prod).

---

## Phase 5: Smart Kanban v2

### What it does

13 enhancements to the Smart Kanban that add search, typed task IDs, alarms with browser notifications, world clock, task hierarchies (up to 5 levels), Backlog/History views, and auto-archiving of completed tasks.

### Status: Spec confirmed — ready for DBA

### Feature 1 — Search bar

- Search input in the Kanban header.
- Searches by task title or ID (e.g., "BUG-0012") in real time.
- Filters visible cards across all columns. Empty columns show "No results" message.

### Feature 2 — Task IDs per Task Type

- Each Task Type has a **configurable prefix** set in Admin (e.g., "BUG", "FEAT", "OPS").
- IDs are auto-incremental per type: BUG-0001, BUG-0002, FEAT-0001...
- The ID is visible on the card and in the detail modal.
- The prefix is configured when creating/editing a Task Type in Admin.

### Feature 3 — Task type filter as dropdown

- Replaces the current tab pills with a **dropdown/select**.
- First option: "All Types" (shows all tasks).
- Then each Task Type individually.

### Feature 4 — Column task counter

- Each column shows the count of visible tasks (respecting active filters).
- Already partially exists — confirmed behavior: counter reflects filtered results.

### Feature 5 — Days in column

- Each task card shows a badge with how many days the task has been in its current column.
- Calculated from the timestamp when the task entered that column.
- Updates daily.

### Feature 6 — Due date with color alerts

- Due date is displayed on the card.
- **Normal**: neutral color (text-dim).
- **Today**: **yellow** (warning).
- **Overdue**: **red** (danger).

### Feature 7 — Fully editable detail modal

- The task detail modal allows editing **all** fields: title, description, priority, state, assignee, due date, dynamic schema fields.
- All previously read-only fields become editable.

### Feature 8 — Task alarms with browser notifications

- Each task can have one or more alarms.
- When creating an alarm the user selects:
  - **Date and time** — using the Jira Tracker datepicker + time picker.
  - **Advance notice**: how early to notify (15 min, 30 min, 1h, 2h, 1 day, custom).
  - **Repetitions**: how many times the notification repeats.
- Notification is shown as a **native browser notification** (Web Notifications API) styled like a post-it with the task title and pending action.
- Browser notification permission is requested on first use.

### Feature 9 — World clock

- The Kanban header shows the **current time + city name** of the user (geolocation or manual config).
- A button opens a **popover** where:
  - Other cities' times are displayed.
  - Cities can be **added/removed** quickly from the same popover.
- User's cities are stored in per-user preferences.
- Module-level configuration lives in Settings.

### Feature 10 — Double-width detail modal

- Task detail modal opens at **double the current width** (~560px → ~1120px).
- Internal layout reorganized into 2 columns: main info + sidebar with metadata.

### Feature 11 — Backlog / History view

- A **single view** accessible from the sidebar with a **toggle** to switch between:
  - **Backlog**: tasks created but not yet assigned to any workflow column. List view.
  - **History**: archived/closed tasks. List view with close date, who closed it.
- From History: **reopen** a task and send it back to the board (OPEN state).
- From Backlog: **move** a task to the board (assign to OPEN state).

### Feature 12 — Done column limits

- Configurable from module Settings:
  - **Max time** in Done (e.g., 7 days) — after which the task is auto-archived to History.
  - **Max count** of tasks in Done (e.g., 20) — when exceeded, oldest tasks are auto-archived.
- Auto-archiving executes when the board loads.

### Feature 13 — Task hierarchies

- Parent-child relationships between Task Types are configured from Admin (e.g., "Epic" can contain "Story", "Story" can contain "Bug").
- **Up to 5 levels** of depth.
- On a parent task's card: a **subtask counter** (e.g., "3/5 done").
- In the detail modal: a **list of child tasks** with their state (like Jira).
- Subtasks can be created directly from the parent's modal.
- Subtasks have their own ID with their Task Type's prefix.

### Feature 14 — Backlog redesign + state semantics

- The Backlog view has the same visual DNA as the Kanban (cards, glassmorphism, stat cards).
- Stat cards (bento): Waiting count, Oldest age, High priority count, Added this week.
- Backlog toggle counters show quantity on each side (Backlog / History).
- Search bar inside the Backlog view.
- Backlog membership is **state-based**: a task whose `state.category = 'BACKLOG'` stays in the Backlog view. If moved to any other category (OPEN/IN_PROGRESS/DONE), it moves to the Kanban board.

### Feature 15 — Drag-over column glow

- When dragging a task in the Kanban, the target column shows a **drag-over visual state**: dashed blue border, gradient tint background, outer glow shadow, slight scale-up.
- Matches the standard drag highlight pattern used across WorkSuite (blue tint, dashed border, scale 1.015).

### Feature 16 — Task type icon on cards

- Each task card shows its Task Type icon next to the ID.
- Icon comes from the `vl_task_types.icon` column (Material Symbol name).
- Uses the semantic color associated with the type (bug=red, feature=amber, ops=green, epic=purple).

### Feature 17 — Task type switcher from modal

- Clicking the task type icon/chip inside the modal opens a dropdown listing all available Task Types.
- If the user picks a **different type** whose schema differs from the current one, a **field mapping dialog** appears:
  - Lists every field from the current schema that does not exist in the new schema.
  - For each orphaned field the user can either: map it to a field in the new schema, or delete the value.
  - Only after the user confirms the mapping does the type change.
- If the schemas are identical (or a superset), the switch happens immediately.

### Feature 18 — Auto-save on modal blur/close

- Every editable field in the modal auto-saves on change (debounced).
- On modal close or focus loss without an explicit save, pending changes are persisted automatically.
- A small **"Auto-saved"** indicator in the modal header confirms state (with a `cloud_done` icon).
- No "Save" button — the UX trusts auto-save.

### Out of scope (v2)

- Automation: "when all subtasks are DONE, move parent to DONE".
- Filter by hierarchy level (show only epics, only stories).
- Export Backlog/History to CSV.
- Push notifications (browser notifications only in this version).

### Connections

- **Jira Tracker**: reuses the datepicker component (with time picker added).
- **TimeClock**: visual pattern for world clock (no shared code, pattern only).
- **Admin Panel**: configuration of prefixes, Task Type hierarchies, Done column limits.
- **Browser Notifications API**: for task alarms.

### UI Reference

- Pencil designs: `pencil-new.pen` frames `VectorLogic/Kanban`, `VectorLogic/Chat`, `VectorLogic/AI Detections`.

## Modelo de datos (Phase 5)

Four new tables plus extensions to `vl_tasks` and `vl_task_types`. All new tables have Row Level Security enabled.

### Extensions to `vl_task_types`
Two new columns:
- `prefix` (text) — the short code used to build typed task IDs (e.g. "BUG", "FEAT"). Configured from Admin when creating/editing a Task Type.
- `next_number` (integer, default 1) — the next sequence number to assign. Incremented atomically when a task is created.

Existing rows are backfilled with a default prefix derived from the type name (first 4 uppercase letters).

### Extensions to `vl_tasks`
Five new columns:
- `code` (text, unique when set) — the human-readable ID (e.g. "BUG-0012"). Backfilled for legacy tasks as they are read/edited.
- `due_date` (date) — first-class due date, replacing the dynamic-schema representation. Drives the color-coded due-date badge.
- `state_entered_at` (timestamptz) — automatically updated by a trigger whenever `state_id` changes. Powers the "days in column" counter on cards.
- `archived_at` / `archived_by` — a task is considered archived (and appears in History) when `archived_at IS NOT NULL`. `archived_by` records who archived it.
- `parent_task_id` (uuid, self-FK, nullable) — the direct parent for hierarchical tasks. The application layer enforces the 5-level maximum depth.

A BEFORE-UPDATE trigger resets `state_entered_at` to `now()` whenever the row's `state_id` changes, so the days-in-column counter is always accurate.

### `vl_task_alarms`
One row per alarm. A task can have many alarms. Stores `trigger_at` (the target time), `advance_minutes` (how early to notify before the target), `repetitions` (how many times the notification fires), and `fired_count` (how many times it has already fired). Scoped to the user so each person's alarms are private.

### `vl_user_world_cities`
One row per city the user has added to the quick-access world clock popover. Stores `city_name`, IANA `timezone`, and `sort_order`. Managed inline from the Kanban header popover.

### `vl_user_settings`
One row per user. Holds general Vector Logic preferences that are not specific to email: `done_max_days` (Done-column age limit for auto-archive), `done_max_count` (Done-column size limit), and the user's `home_timezone` / `home_city` for the header clock.

### `vl_task_type_hierarchy`
Admin-configured parent-child whitelist between Task Types. Stores `(parent_type_id, child_type_id)` pairs with a uniqueness constraint and a self-reference guard. Determines which Task Types a given type can contain as subtasks.

### Relationships in plain language
A task type has many tasks. A task has many alarms (per-user), optionally has a parent task (also a task), and records who archived it (a user). A user has many cities, one settings row, and many alarms. The task-type hierarchy is a many-to-many relationship between task types.

Migration file: `supabase/migrations/20260423_vl_smart_kanban_v2.sql` (NOT yet applied to prod — DBA Agent has written it pending review).

---

## Phase 5 — Schema Builder · Card Layout selector (revisión 2026-04-25)

### What it does
The Schema Builder lets admins pick which fields appear on a Kanban card for a given Task Type. Originally implemented as a horizontal "Card Layout band" of toggleable chips, it overflowed on 13" laptops and pushed the field canvas down. This revision replaces it with a compact dropdown multiselect placed in the schema header, next to **Save schema**.

### Behaviour

**Trigger button (in schema header):**
- Label: `Card Layout`, icon `view_agenda`, counter `N/4` (selected fields).
- Same visual treatment as the other header buttons (radius 8px, no hard border, hover glow).
- Position in the header action row: `[Card Layout ▾ N/4] [🗑] [Save schema]`.

**Dropdown panel (on click):**
- Glassmorphic surface with backdrop blur, anchored under the trigger.
- Search input at the top, placeholder `Search field…` (i18n key).
- Scrollable list of all fields of the current Task Type **except Title** (Title is always shown on the card and is not optional).
- Each row: checkbox + field-type icon + field label. Clicking the row toggles `showOnCard`.
- The search filters by `field.label`, case-insensitive, partial match.
- Empty states:
  - No matches → `No fields match`.
  - Task Type has no fields yet → `No fields yet`.
- Click outside or `Esc` closes the panel; selection is preserved.

### Rules (unchanged from previous implementation)
- Maximum **4 card fields**. When the limit is reached, unselected items render disabled with tooltip `Max 4 fields reached`.
- Title is always implicitly included on the card and never appears in the list.
- Selection persists in `field.showOnCard` and is committed only when **Save schema** is pressed (no auto-save).

### Responsive
With the band gone, the header collapses cleanly on 1280px+ widths. Roughly 50px of vertical canvas is recovered on small laptops.

### Out of scope
- Reordering card fields (still controlled by Main/Sidebar columns).
- Choosing fields for views other than the Kanban card.

### Data model
No schema changes. The `field.showOnCard` boolean already exists on each entry of the Task Type's field array, persisted as part of the JSONB `schema` column on the `vl_task_types` row (see `SupabaseTaskTypeRepo`). The dropdown writes through the same `updateField → saveSchema` path the chip band uses today, so no migration, port, or adapter changes are required.

**DBA verdict (2026-04-25):** no migration created — confirmed pass-through.

---

## Phase 5 — Two follow-up fixes (revisión 2026-04-25 · bundled with Card Layout selector branch)

### Fix #1 — FieldCard label wrapping in SchemaBuilderView

**Problem.** In the Schema Builder field list — especially in the narrow Sidebar column (~180px) — the field name is truncated with ellipsis because it shares a single row with the *Required* badge and the *CREATE / DETAIL / CARD* toggle pills. Users see `St...`, `Us...`, `D...` instead of the full field name.

**Behaviour.**
- **First row** (full width): drag handle + field-type icon + full field label + delete (×) button.
- **Second row** (below the label, indented to the label level): *Required* badge if applicable + active *Create / Detail / Card* pills.
- If the second row would be empty (field is not required and has no active toggle pill), it is not rendered.
- Behaviour is otherwise unchanged: clicking the card selects the field, dragging reorders, × deletes.

### Fix #2 — Clickable subtasks in TaskDetailModal

**Problem.** Subtasks listed in the task detail modal can be created and read, but cannot be opened — the row is a static `<div>`.

**Behaviour.**
- Each subtask row is interactive: hover highlight, `cursor: pointer`.
- Clicking a subtask row opens **that subtask** inside the same `TaskDetailModal`, replacing the current task in view.
- The checkbox on the left still toggles DONE/not-DONE without opening the modal (event propagation stopped).
- When the task currently open has `parent_task_id`, the modal shows a **breadcrumb** above the title with the full ancestor chain (e.g. `↑ EPIC-1 / STORY-2`). Each ancestor in the breadcrumb is clickable and opens that ancestor in the modal. The Phase 5 hierarchy cap of 5 levels keeps the chain bounded.
- When the task in view changes, all dependent state (subtasks list, alarms list, auto-save indicator) is reloaded for the new task.

**Drag-and-drop reorder of subtasks.**
- Subtasks can be reordered by dragging within the subtasks list. The order persists on the parent task and is visible to other users.
- Implementation note for DBA: requires a `sort_order` (or equivalent) on subtasks scoped to their parent, if not already present.

### Out of scope
*(none — items previously listed here have been moved into scope.)*

### Data model
- No schema changes. `parent_task_id` already exists for the breadcrumb / subtask navigation.
- For the drag-and-drop reorder, the application layer reuses the existing `vl_tasks.sort_order` column (integer, NOT NULL, default 0), scoped by `parent_task_id`. When listing children of a parent task, the repo orders by `sort_order ASC, created_at ASC`. Reordering issues an UPDATE on the affected rows' `sort_order`.

**DBA verdict (2026-04-25):** no migration created — `parent_task_id` and `sort_order` are both pre-existing on `vl_tasks` (verified against prod schema).

---

## Phase 5 — Bug fix: User Picker rendering on Kanban cards (2026-04-25)

### Problem
When a `user_picker` field is marked **Show on card** on the Task Type schema, the Kanban renders it as a chip showing the truncated user UUID (e.g. `00000005-0000-0000-000`). The default `formatCardValue` falls through to `String(v).slice(0, 24)` because the chip filter only excludes `'assignee'` and `'title'`, not `'user_picker'`.

### Behaviour
- Any `user_picker` field with `showOnCard=true` is excluded from the chip rail (same treatment as `assignee` and `title`).
- Each `user_picker` value is rendered in the card footer as a **small avatar chip (initials)** alongside the native assignee, matching the existing assignee visual (22px circle, gradient fill, monospaced initials). Full name and email surface via the hover tooltip — keeping the footer compact on narrow cards. The user_picker avatars use a purple→accent gradient to differentiate from the native assignee's accent gradient.
- If the `user_picker` value equals the native `assigneeId`, the second chip is suppressed (avoid duplicates — the assignee chip already covers it).
- When multiple `user_picker` fields are marked `showOnCard`, all distinct user chips are rendered. Visible cap of 3; any extras collapse into a `+N` indicator.
- Each chip exposes a tooltip on hover showing `Name — email` (uses the native HTML `title` attribute; no extra UI components).
- If the saved user ID does not resolve to any entry in `wsUsers`, the chip is silently skipped (no broken UI, no UUID leak).
- If the value is null/empty, nothing is rendered.

### Out of scope
*(none — items previously listed have been moved into scope.)*

### Data model
No changes. The `user_picker` field already persists the user ID in `task.data[fieldId]`. The `WSUser[]` list is already passed to the `TaskCard` component for the assignee avatar; the same list resolves user_picker IDs.

**DBA verdict (2026-04-25):** no migration created — pure presentation fix.

---

## Phase 5 — Two bug fixes (revisión 2026-04-25 #3)

### Fix #1 — Avatar tooltip is delayed (~500ms)

**Problem.** The user_picker (and assignee) avatars in the TaskCard footer rely on the native HTML `title` attribute, which takes 500–1000ms to appear. Users perceive this as broken.

**Behaviour.**
- Tooltip appears **instantly** on hover (≤100ms perceived).
- Content: `Name — email` (or just email if no name).
- Visual: small chip with `var(--sf3)` background and `var(--bd)` border, positioned above the avatar with an arrow pointing down at it.
- Implementation: CSS-driven via a pseudo-element on a `data-tooltip` attribute. No external library, no React state per avatar.
- Same treatment applied to the native assignee avatar for consistency.

### Fix #2 — Destination column does not highlight when dragging a task

**Problem.** When dragging a task between columns in the KanbanView, the destination column does not light up. The existing `isDropTarget` glow only triggers for column-to-column reorder because `onDragOverCol` (the task-drag handler) never sets `dropColumnId`.

**Behaviour.**
- Dragging a task over a column other than its source highlights that column with the existing `isDropTarget` styling (gradient `var(--ac-dim)`, dashed accent border, `scale(1.015)`, glow shadow).
- Drag-leaving the column or dropping clears the highlight.
- The source column does not highlight while dragging within itself (avoids visual noise).
- Behaviour is identical in single-type and aggregate kanban modes.

### Out of scope
- Drop animation (only the during-drag glow).
- Multi-line tooltip with avatar + extra metadata (just name — email).

### Data model
No changes. Both fixes are pure UI.

**DBA verdict (2026-04-25):** no migration — both are pure presentation tweaks.

---

## Phase 5 — Bundle of fixes (revisión 2026-04-25 #4)

### Fix #1 — Tooltip clipped by column overflow
**Problem.** The CSS `::after` tooltip is contained inside the column's `overflow-y: auto`, so it gets clipped when the card sits near the column edge.
**Behaviour.** Replace the CSS tooltip with a React portal rendered into `document.body` and positioned with `position: fixed` from the avatar's `getBoundingClientRect()`. Hover shows it, mouse-leave hides it. No clipping anywhere.

### Fix #2 — Show parent task in TaskDetailModal even without breadcrumb
**Problem.** When a task with `parent_task_id` is opened directly (not via breadcrumb), the parent is hidden.
**Behaviour.** When the open task has a parent, the modal renders a clickable line above the title: `↑ EPIC-12 — Migración Auth` (icon + parent code + parent title). Click opens the parent in the same modal via the existing `onOpenTask` callback. No parent → not rendered.

### Fix #3 — Main column grows to match sidebar height
**Problem.** The Rich Text + main fields block has natural height; the sidebar (state, priority, dates, alarms, etc.) is taller. Visual mismatch.
**Behaviour.** The Rich Text container gets `flex: 1` to fill the available vertical space. The grid uses `align-items: stretch` so both columns end at the same minimum height.

### Fix #4 — Tooltip name only
**Problem.** Tooltip currently shows `Name — email`, redundant.
**Behaviour.** Tooltip shows only the user's name; falls back to the email if the user has no name.

### Data model
No changes for fixes #1–#4. All UI.

---

## Multi-type Kanban drag (revisión 2026-04-26)

### Problem
When the Kanban is in aggregate mode (more than one task type selected, or "All"), columns are 4 synthetic universal categories (`OPEN`, `IN_PROGRESS`, `BLOCKED`, `DONE`) instead of states of a specific workflow. Drag-and-drop is currently disabled in this mode (`onDragEnd={isAggregate ? undefined : onTaskDragEnd}` in `KanbanView.tsx`), so users cannot move tasks between columns.

### Behaviour
Drag is enabled in aggregate mode. When a task is dropped on column `__cat_X` (X ∈ OPEN / IN_PROGRESS / BLOCKED / DONE):

1. Resolve the dragged task's `taskTypeId` → its `workflowId`.
2. Look up the workflow's states (`vl_workflow_states`) and find the one whose `state.category === X`.
3. If exactly one match → call `moveTask(taskId, matchedStateId)`.
4. If multiple matches in the same workflow → pick the one with the lowest `sortOrder`.
5. If no state of category X exists in that workflow → no-op + toast `"This task type has no {category} state"`.
6. If the task's current state already has category X → no-op (no visual change, no API call).

### Visuals
- The destination-column glow (already present in single-type) fires in aggregate mode too while a task is dragged over a column the task can move to.
- If the task cannot be moved (rule 5), no glow.

### Out of scope
- No modal/selector for picking a specific state — fully automatic mapping.
- No reordering inside aggregate columns (synthetic, not real workflow states).
- No changes to the 4 universal categories.

### Data model
No changes — purely UI logic that derives `toStateId` from `category` + the task's own workflow before calling the existing `moveTask` use case.

---

## Multi-Board Kanban + Priority visuals (revisión 2026-04-26)

### 1. Propósito
Permitir que el usuario cree, configure y comparta tableros Kanban con columnas explícitas, filtros, WIP limits y permisos por usuario. Reemplaza el uso del Smart Kanban genérico cuando equipos quieren vistas dedicadas. El Smart Kanban actual queda intacto como "board implícito" (Smart Kanban Auto).

### 2. Conceptos

**Board.** Tiene nombre, icono opcional (default según category de columnas), descripción opcional. Pertenece a un owner (el usuario que lo creó). Visibilidad: `personal` (sólo el owner lo ve) o `shared` (visible a todos los miembros del workspace, sujeto a permisos).

**Columnas del board.** Cada columna tiene un nombre elegido por el usuario (ej. "To Do", "Code Review") y mapea **N estados** de la librería `vl_states` (modelo Jira-style). Tiene orden manual (drag-reorder en el modal de config). Tiene WIP limit opcional (entero ≥ 1, o vacío = sin límite). Un mismo `state` no puede estar mapeado a dos columnas en el mismo board (la modal lo bloquea). Si una columna queda sin estados mapeados, no recibe drops y no muestra tareas — pero queda configurable.

**Filtros del board.** Configurables, todos opcionales y combinables con AND:
- Task types (multi-select).
- Assignees (multi o "Anyone").
- Priorities (multi).
- Labels / Tags (multi — placeholder hasta que la entidad exista).
- Created by (multi).
- Due date range (from / to / vacío).

Una tarea aparece en el board si su `stateId` matchea una columna configurada Y pasa todos los filtros activos.

**Permisos sobre boards compartidos.** El owner asigna por usuario:
- `use` (default al compartir): puede ver el board, mover tareas dentro de él, crear tareas. NO puede modificar columnas, filtros, WIP, ni permisos.
- `edit`: todo lo de `use` + modificar config del board (columnas, filtros, WIP). NO puede borrar el board ni cambiar el owner.

Sólo el owner puede eliminar el board, transferir ownership, o cambiar la visibilidad personal↔shared. El owner puede revocar permisos en cualquier momento. Cambiar visibilidad de `shared` → `personal` automáticamente borra todos los permisos otorgados.

### 3. UX

**Sidebar.** "Smart Kanban" es un grupo expandible. Hijos: el board **default** del usuario (auto-creado en su primera visita, llamado "Smart Kanban", siempre primero, editable pero no eliminable), seguido de cada board accesible (propios + compartidos donde tengo permisos), terminado por `+ Add board`. Boards personales muestran badge `PERSONAL` violeta. Boards compartidos sin badge. Cada board tiene icono `edit` en hover (visible si tengo permiso `edit` o soy owner; oculto si sólo tengo `use`).

**Modal "Edit board".** Campos según diseño Pencil (`pencil-new.pen` mocks dark + light):
- Nombre.
- Visibilidad: toggle `Personal` / `Shared`.
- Cuando `Shared` → bloque adicional `Permissions` con lista de usuarios + dropdown `Use` / `Edit` por cada uno + botón "Add user".
- Columnas: lista drag-reorder; cada item con dot color (state.color), nombre del state, categoría, WIP limit editable, botón remove. Botón "+ Add column" (selector de state).
- Filtros: una fila por dimensión.
- Footer: `Delete board` (rojo, sólo owner) · Cancel · Save changes.

**Board view.** Header con nombre + badge `SHARED`/`PERSONAL` + meta (count types y tareas) + Edit board (sólo si tengo permiso) + New task. Columnas según config, con barra superior de color del state, dot + nombre + chip `actual / limit`. WIP limit alcanzado: borde de la columna ámbar, chip ámbar con icono warning, banner inferior `"WIP limit reached — drop blocked"`. Drop bloqueado en esa columna hasta que el conteo baje.

**"Add board".** Abre el mismo modal con valores por defecto: nombre vacío, visibilidad `Personal`, columnas iniciales = 4 categorías (BACKLOG/OPEN/IN_PROGRESS/DONE) usando los primeros estados disponibles, sin filtros, sin WIP.

### 4. Reglas
- WIP limit aplica al count actual de tareas en esa columna (sólo cuenta las que pasan los filtros del board).
- Drop a columna con WIP limit alcanzado se rechaza con toast `"WIP limit reached"`.
- Eliminar un state usado en columnas de boards: el state queda referenciado, las columnas que lo usen se marcan como inválidas (rojo) en el modal hasta que el owner las arregle. No bloqueamos la eliminación pero alertamos.
- El **default board** ("Smart Kanban") se auto-crea con 4 columnas (Backlog / To Do / In Progress / Done) cada una mapeada a todos los estados de la categoría correspondiente. Es editable como cualquier otro board, pero **no se puede eliminar** (UI oculta el botón Delete cuando `is_default = true`). Constraint a nivel DB: como mucho 1 default por usuario (`vl_kanban_boards_one_default_per_owner` partial unique index).

### 5. Priority visuals (mejora paralela)
Acompaña esta feature porque los boards muestran prioridad como chip y el visual hacía falta desde antes.
- `vl_priorities` ya tiene `color` (hex). Si está vacío, default por nombre (Critical=red, High=amber, Medium=primary, Low=tx3).
- Agregar columna `icon` (text nullable) con nombre de Material Symbols (ej: `priority_high`, `keyboard_arrow_up`, `remove`, `keyboard_arrow_down`).
- Cualquier UI que renderiza el chip de prioridad: pinta background con el color (10% opacity) + texto color sólido + icono si está seteado. Aplica retroactivamente a TaskCard del Smart Kanban actual y al board view nuevo.

### 6. Fuera de alcance
- Vistas no-Kanban (lista, gantt, calendar).
- Plantillas de boards.
- Bulk move / multi-select de tareas.
- Notificaciones cuando alguien mueve tarea en board compartido.
- Compartir boards con usuarios externos al workspace.
- Auto-archive específico por board (sigue siendo global per-user en User Settings).

### 7. Modelo de datos

Confirmado por DBA Agent (2026-04-26) + restructurado en Fase H (2026-04-26).
Migraciones: `supabase/migrations/20260426_vl_kanban_boards.sql` y `_v2.sql`.

**`vl_kanban_boards`** — un row por tablero que crea un usuario. Guarda quién es el dueño (`owner_id`), el nombre, una descripción opcional, un icono opcional (Material Symbols), la visibilidad (`personal` o `shared`), y un flag `is_default` que marca el board auto-creado "Smart Kanban" (uno por usuario, partial unique index `vl_kanban_boards_one_default_per_owner`). Cuando se borra un usuario, sus boards se borran en cascada. Lleva `created_at` y `updated_at` (este último actualizado por trigger).

**`vl_board_columns`** — un row por columna dentro de cada board. Guarda el `name` elegido por el usuario, el orden manual (`sort_order`) y un WIP limit opcional (entero ≥ 1, o vacío). El mapeo a estados vive en una tabla aparte (`vl_board_column_states`) — modelo Jira-style. Si se borra el board se borran sus columnas en cascada.

**`vl_board_column_states`** — junction column ↔ state (muchos-a-muchos). Cada row mapea una columna a un estado de la librería. Constraint UNIQUE`(column_id, state_id)`. La aplicación garantiza que un estado no aparezca en dos columnas del mismo board (la modal deshabilita los estados ya usados). Si se borra una columna, sus mapeos se borran en cascada; si se borra un estado en uso, la operación se rechaza.

**`vl_board_filters`** — un row por filtro activo en cada board. Cada fila tiene una `dimension` (uno de `task_type`, `assignee`, `priority`, `label`, `created_by`, `due_from`, `due_to`) y un `value` JSONB que contiene el valor o lista de valores aplicables. Una tarea aparece en el board sólo si pasa todos los filtros (AND).

**`vl_board_members`** — un row por usuario al que el owner le otorgó acceso a un board compartido. Guarda el `permission` que tiene (`use` para leer/mover tareas, `edit` para modificar config). Constraint UNIQUE`(board_id, user_id)` impide duplicados. Cuando un board pasa de `shared` a `personal`, esta tabla se vacía para ese board (manejado en código de aplicación).

**`vl_priorities`** — se agrega columna `icon` (text, nullable). Permite que cada prioridad lleve un icono Material Symbols. Los chips de prioridad en TaskCards y board view pintan background con `color` al 10% + texto color sólido + icono si está seteado.

**Row Level Security.**
- 3 helper functions con `SECURITY DEFINER` que rompen recursión circular:
  `vl_can_view_board`, `vl_can_edit_board`, `vl_is_board_owner`.
- `vl_kanban_boards`: SELECT si owner OR `visibility = 'shared'` OR member del board. INSERT requiere `owner_id = auth.uid()`. UPDATE/DELETE sólo owner.
- `vl_board_columns`, `vl_board_filters`: SELECT a quien tenga acceso al board. CRUD a owner OR member con `permission = 'edit'`.
- `vl_board_column_states`: SELECT/CRUD se delegan a las policies del column padre.
- `vl_board_members`: SELECT al owner y al propio user. INSERT/UPDATE/DELETE sólo el owner del board.
- Todas las tablas tienen RLS habilitado.

---

## Canvas Designer — duplicate transitions fix (revisión 2026-04-27)

### Problema reportado
El usuario configura transiciones entre estados en el Canvas Designer del Workflow Engine, sale de la página y vuelve, y el grafo aparece con muchas más transiciones de las que dibujó — efecto "todo conectado con todo".

### Investigación
Snapshot de prod (2026-04-27) confirmó **transiciones duplicadas en `vl_transitions`**:
- Workflow "Accionable": 6 pares duplicados (e.g. `In progress → Review` x2, `Review → Close` x3, `Open → ToDo` x2, `ToDo → In progress` x2, `caca → todo` x2, `todo → caca` x2).
- Workflow "solucion": `Close → Close` self-loop persistido x2 (a pesar de que `onConnect` rechaza self-loops vía `if (connection.source === connection.target) return`).

### Causa raíz
1. **No hay UNIQUE constraint** en `vl_transitions(workflow_id, from_state_id, to_state_id)`. El frontend depende de un check sobre el estado local de React (`transitions.some(t => ...)`); si el estado está stale (entre re-renders, race conditions, o después de un load), inserts duplicados pasan.
2. **No hay CHECK constraint** que prohíba self-loops. La guarda de frontend puede ser bypaseada (e.g., insertar directo por SQL, o un edge case de React Flow).
3. **Estados con nombres duplicados** en `vl_states` ("Review" tiene 2 ids distintos). Si ambos terminan en el mismo workflow, se ven como nodos duplicados — esto NO es bug del Canvas pero contribuye a la confusión visual.

### Fix
1. **Migración DB** (`20260427_vl_transitions_dedupe.sql`):
   - Dedupe existente: por cada `(workflow_id, from_state_id, to_state_id)` con copies > 1, conservar el id mínimo, borrar los demás.
   - `ALTER TABLE vl_transitions ADD CONSTRAINT vl_transitions_unique_pair UNIQUE (workflow_id, from_state_id, to_state_id)`.
   - `ALTER TABLE vl_transitions ADD CONSTRAINT vl_transitions_no_self_loop CHECK (from_state_id <> to_state_id)`.
2. **Frontend defensa**:
   - En `onConnect`, atrapar errores de la inserción (incluyendo violación de unique constraint) y silenciar el caso "ya existe" — re-fetchear transitions y rebuilder el grafo para resincronizar.
   - En `loadWorkflow`, deduplicar in-memory antes de buildear el grafo (defensa contra cualquier dato sucio que aún quede).

### Fuera de alcance (followups)
- Los `position_y` negativos de algunos workflow_states (estados arrastrados off-canvas). React Flow `fitView` ya re-encuadra al cargar; no se persiste corrección.

### Cleanup adicional aplicado el mismo día — dedupe de `vl_states`
Migración `20260427_vl_states_dedupe_unique_name.sql` (separada del fix de transitions):

- Había dos rows en `vl_states` con name="Review", category=IN_PROGRESS, color=#dff43e — orphan id `9fc5851c…` y canonical `78614163…`.
- Mergeo: las referencias del orphan en `vl_workflow_states`, `vl_transitions`, `vl_tasks` y `vl_board_column_states` se repuntaron a la canonical. Donde los UNIQUE constraints habrían bloqueado el UPDATE (porque ambas ids ya coexistían en el mismo workflow / column), se borró la fila orphan en lugar de updatear.
- DELETE del row orphan en `vl_states`.
- ADD CONSTRAINT `vl_states_name_unique UNIQUE (name)` — la librería de estados es global (sin scoping por user/workflow), así que dos estados con el mismo nombre siempre fue un error de UX.

### Modelo de datos
Sin tablas nuevas. Sólo dos constraints añadidos a `vl_transitions`:
- `UNIQUE (workflow_id, from_state_id, to_state_id)` — previene duplicados.
- `CHECK (from_state_id <> to_state_id)` — previene self-loops.

---

## Phase 5 — TaskCard ToDo + Card Menu (revisión 2026-04-27)

### Propósito
Enriquecer la TaskCard del Kanban / BoardView con visibilidad de progreso (ToDo + subtareas) y un menú de acciones rápidas, sin agregar fricción visual ni romper la fila de meta-chips existente.

### Cambios

**1. Campo nuevo "ToDo".**
Nuevo `fieldType: 'todo'` en el Schema Builder. Estructura idéntica a `checklist`: array de items `{text, checked}` editable desde TaskDetailModal. Convive con `checklist` legacy en el mismo task type. Cero cambios de base de datos — es un valor nuevo aceptado por el JSONB `schema` de `vl_task_types` y por `task.data[fieldId]`.

**2. Barras de progreso apiladas en el borde inferior de la card.**
Pegadas al borde inferior, ~3px de alto, full width. Stack ordenado de arriba a abajo (gap 1px entre barras):
- **Una barra por cada campo ToDo** del task type que tenga al menos 1 item. N segmentos = N items. Verde (`var(--green)`) para `checked`, gris (`var(--sf2)`) para pendiente.
- **Una barra de subtareas** si la task tiene subtareas (otras `vl_tasks` con `parent_task_id = esta`). N segmentos = N subtareas. Verde si la subtarea está en un estado de `category=DONE`, gris si no.
- Total de barras visibles: 0 (sin ToDos ni subtasks) hasta N+1. Si no hay nada, la card no muestra barra al pie.
- Animación: 150ms de transición de color cuando un segmento cambia.

**3. Mini-barra de progreso dentro del chip `done/total`.**
El chip que `formatCardValue` renderiza para `checklist` (y para `todo`) sigue mostrando `4/4`. Al lado del texto se agrega una mini-barra segmentada (~3px alto, ~5px por segmento). Mismos colores que la barra del borde inferior. **El texto numérico no se quita.**

**4. Restaurar chip "días en columna".**
El badge `Nd` vuelve a renderizarse **siempre** en la fila de meta-chips de la card, no solo cuando el task type carece de campos `showOnCard`. Hoy queda oculto en `KanbanView.tsx:1098` cuando hay chips configurados — fue una regresión al introducir `cardFields`. Posición: a continuación de los chips configurados.

**5. Menú kebab `⋮` en la card y en el modal de detalle.**
Esquina superior derecha de la card. Botón ghost con backdrop blur, ícono Material Symbols `more_vert`. Click abre un dropdown glass + blur sobre `surface-container-high`, con tres items:

- **Clonar** (todos los usuarios). Abre modal "Clonar tarea".
- **Borrar** (todos los usuarios). Modal de confirmación estándar. Si la task tiene subtareas, el modal lo aclara — el borrado es en cascada.
- **Configurar** (solo si rol admin). Navega a Settings → SchemaBuilderView con el task type del card pre-seleccionado.

El menú se cierra con click fuera, `Esc`, o al elegir un item. Click en el kebab no propaga al click handler de la card.

**Visibilidad del kebab en card:** en desktop solo aparece en hover; en touch siempre visible con baja opacidad cuando no hay hover/touch.

**Misma kebab dentro del TaskDetailModal** (revisión post-merge 2026-04-27): el componente `CardMenu` también se renderiza en `mode="inline"` dentro del header del modal de detalle, junto al indicador "Auto-saved". Mismos tres items con la misma lógica. El botón "Delete" rojo del footer del modal queda eliminado — el kebab pasa a ser la fuente única de las acciones destructivas / de configuración. La opción Borrar dentro del modal usa el confirm con conteo de subtareas (`subtasks.length` ya cargado por el modal).

**6. Modal "Clonar tarea".**
Se abre desde el item Clonar del menú. Layout:
- **Título** (input): default `"clon - {título original}"`. Editable.
- **Qué copiar** (checkboxes; ver defaults):
  - `[ ]` Subtareas (recursivo)
  - `[x]` Datos de los campos del schema (incluye ToDos y checklists)
  - `[x]` Prioridad
  - `[x]` Asignado
  - `[ ]` Alarmas
  - `[ ]` Comentarios / actividad
- **Estado inicial:** la copia arranca siempre en el estado OPEN del workflow (no se copia el estado actual del original — evitamos confusión de dos tasks en IN_PROGRESS sin haber arrancado).
- Footer: `Cancelar` · `Clonar` (gradient).
- Al confirmar: se genera un `code` nuevo, la task se inserta en OPEN, modal se cierra, toast `"Tarea clonada"` con link a la nueva.

### Reglas
- En boards compartidos con permission `use`, el item Borrar se muestra deshabilitado con tooltip. **NO implementado en v1** — actualmente Borrar está habilitado para todos los miembros del board. RLS de `vl_tasks` es la red de seguridad real. Follow-up pendiente.
- Si el rol no es admin, el item Configurar no se renderiza (no visible).
- La barra inferior no se renderiza si la card no tiene ningún ToDo con items ni subtareas.
- El chip de días-en-columna sigue requiriendo `daysInColumn > 0` (no muestra `0d`).
- Subtareas de un task type filtrado fuera del Kanban no aparecen en la barra de progreso (la card solo cuenta los hijos cargados en `tasks`). Para ver progreso completo en hierarchies cross-type, switchear a "All types".

### Out of scope
- Edición inline del ToDo desde la card (solo desde TaskDetailModal).
- Right-click → menú contextual del browser.
- Bulk select para clonar/borrar varias tasks.
- Templates de clonado guardados.

### Modelo de datos
**Sin cambios.** `fieldType: 'todo'` se persiste en el JSONB `schema` de `vl_task_types` (extensible). Items del ToDo en `task.data[fieldId]` como array `[{text, checked}]`, idéntico al checklist actual. Subtareas ya existen via `vl_tasks.parent_task_id`. El rol admin se lee del estado de auth global.

**Cascade de borrado.** El FK self-referencial `vl_tasks_parent_task_id_fkey` está hoy como `ON DELETE SET NULL` (verificado en prod 2026-04-27, definido en `supabase/migrations/20260423_vl_smart_kanban_v2.sql:32`). Lo mantenemos así — preserva subtareas si un padre se borra por una vía no controlada. El borrado en cascada que pide la UX (modal "tiene N subtareas, también se borrarán") se implementa en el use case `DeleteTask`: BFS por `parent_task_id` (cap natural a 5 niveles por la regla de Phase 5) y borrado de hojas-a-raíz dentro de la misma transacción.

**DBA verdict (2026-04-27):** no migration — pass-through verificado.

### Files afectados (preview)
- `apps/web/src/modules/vector-logic/ui/views/KanbanView.tsx` — TaskCard: kebab, barras inferiores, mini-bar en chip, restaurar chip días.
- `apps/web/src/modules/vector-logic/ui/views/BoardView.tsx` — mismo TaskCard, simétrico.
- `apps/web/src/modules/vector-logic/ui/components/CloneTaskModal.tsx` — nuevo.
- `apps/web/src/modules/vector-logic/ui/components/CardMenu.tsx` — nuevo, dropdown kebab reutilizable.
- `apps/web/src/modules/vector-logic/ui/components/CardProgressBars.tsx` — nuevo, barras apiladas.
- `apps/web/src/modules/vector-logic/application/CloneTask.ts` — nuevo use case.
- `apps/web/src/modules/vector-logic/container.ts` — wire de nuevos use cases.
- `apps/web/src/modules/vector-logic/ui/views/SchemaBuilderView.tsx` — agregar `todo` al picker de field types.
- `packages/i18n/locales/es.json` + `en.json` — claves `vectorLogic.card.clone/delete/configure`, `vectorLogic.cloneModal.*`.

### UI Reference
Pencil — frame `VectorLogic/Kanban` actualizado con: card con kebab visible, menú abierto, barras de progreso al pie (ToDo + subtasks), mini-bar dentro del chip `4/4`, modal Clonar.

---

## Phase 5 — Subtask row fixes en TaskDetailModal (revisión 2026-04-28)

### Propósito
Dos arreglos pequeños sobre la lista de subtareas dentro del TaskDetailModal:
- **Bug:** las subtareas no se abren al hacerles click cuando el modal está abierto desde un BoardView.
- **Feature:** mostrar metadata de cada subtarea (estado, prioridad, asignado, due date) inline en su fila, sin tener que abrirla.

### Cambios

**1. Bug fix — subtask click roto desde BoardView.**
`BoardView.tsx` invocaba `onOpenTask={(t) => openTaskDetail(t)}`. La firma del prop recibe un `taskId: string`, no un `Task`. La función `openTaskDetail(task: Task)` recibía entonces un string como si fuera objeto y `task.taskTypeId` quedaba `undefined`, abortando el flujo en silencio. KanbanView ya hacía el lookup correcto (`taskRepo.findById(id)`). Se iguala BoardView al mismo patrón.

**2. Meta inline en cada fila de subtarea.**
A la derecha del título de la subtarea, en una línea compacta justificada al final, render condicional de:
- **Estado** — chip con dot del color del state + nombre. `--fs-2xs`, fondo `--sf3`. Si la subtarea no tiene `stateId`, no se renderiza.
- **Prioridad** — chip con icono opcional + nombre, fondo color al 10%, texto color sólido. Mismo patrón visual que los priority chips de la TaskCard.
- **Asignado** — `UserAvatar` 22px. Resuelve `wsUsers.find(u => u.id === s.assigneeId)`.
- **Due date** — chip `M/D`, rojo si vencido / ámbar si hoy / gris si futuro (mismo cálculo que `dueLabel` en la TaskCard).

Si la subtarea no tiene un dato (sin asignar, sin priority, sin due), su chip no se renderiza y la fila queda más limpia. La fila sigue siendo arrastrable/clickeable; los nuevos chips no tienen handlers propios — todo el row invoca `onOpenTask`.

### Reglas
- El checkbox de "marcar done" sigue con `e.stopPropagation()` para no propagar al row.
- Drag-reorder no se ve afectado.
- En light/dark se mantienen los mismos `var()` — sin hardcodes.

### Out of scope
- Edición inline de los chips (click sobre el state chip para cambiarlo, etc.).
- Quick-actions sobre la subtarea (priority/assignee picker desde la lista).

### Modelo de datos
**Sin cambios.** Todo se resuelve en frontend a partir de `Task` + `State` + `Priority` + `WSUser` ya cargados.

**DBA verdict (2026-04-28):** no migration — pure UI fix.

### Files afectados
- `apps/web/src/modules/vector-logic/ui/views/BoardView.tsx` — 1 línea (handler `onOpenTask`).
- `apps/web/src/modules/vector-logic/ui/views/KanbanView.tsx` — TaskDetailModal subtask row: agrega `priorityByName` useMemo + chips inline.
- (Sin keys i18n nuevas — todas existen.)

---

## Phase 5 — Gantt view por board (revisión 2026-04-28)

### Propósito
Cada board del Vector Logic tiene una vista alternativa Gantt accesible desde el mismo sidebar. La vista muestra cada tarea como una row con su barra de fechas y permite expandir subtareas inline. La barra del Gantt incluye fills internos de progreso reusando los colores del card (ToDo verde + subtareas morado).

### Cambios

**1. Routing y sidebar.**
- Nueva tab `'gantt'` y URL `/vector-logic/board/:boardId/gantt`. `parseRoute` detecta este sufijo.
- En el sidebar, cada `vl-board-item` muestra ahora dos action icons (al lado de la badge `PERSONAL` cuando aplica): `view_timeline` (Gantt) + `edit` (modal). Click en el ícono de Gantt navega a la URL nueva. Click en el cuerpo del row sigue yendo a Board view.
- Estado activo de la row se enciende cuando `view === 'board'` o `view === 'gantt'` para ese board. El ícono de Gantt se pinta `--ac` cuando esa es la view activa.

**2. Vista Gantt.**
Componente nuevo `GanttView` en `apps/web/src/modules/vector-logic/ui/views/GanttView.tsx`. **Composé el `GanttTimeline` compartido de `@worksuite/ui`** (el que ya usan Deploy Planner y Environments) en lugar de duplicarlo. Para cubrir las necesidades de Vector Logic se agregaron 2 extension points opt-in al shared component, **backward compatible** con los consumidores existentes:
- `renderLabel?: (bar) => ReactNode` — slot para el contenido de la columna izquierda. VL lo usa para chevron de expand/collapse + indent + ícono de task type + code + título.
- `renderBarContent?: (bar, barWidth) => ReactNode` — slot para el contenido DENTRO de la barra (entre los handles de resize). VL lo usa para los dual-fills verde/morado.
- También se sumaron `showHeader` y `showHelpText` para que el consumidor desactive el header/zoom/help built-in cuando ya tiene los suyos.

Ningún cambio en Deploy Planner / Environments — todos los nuevos props default a `true` o `undefined` preservando comportamiento.

**Layout:**
- Header con título del board + zoom selector (`Days | Weeks | Months`) + view-switcher (Board ↔ Gantt).
- Banner ámbar **"⚠ N tareas sin fecha de inicio"** con botón **"Ver / asignar fechas"**. Click → expande la lista debajo del banner con date-pickers inline para cada task. Setear fecha de inicio (y opcionalmente fecha de fin) → la task aparece en el timeline.
- Timeline grid:
  - Columna fija izquierda 280px: chevron expand/collapse + ícono task type + code + title (1 línea ellipsis).
  - Área timeline: header con marcas de día/semana/mes según zoom + línea vertical "today" en ámbar dasheado + barras por row.

**3. Bar render con dual progress fill.**
Cada barra del Gantt es un rectángulo con:
- Posición: `left = (startDate − rangeStart) × dayWidth`, `width = (dueDate − startDate + 1) × dayWidth`.
- Background: `state.color` al ~12% opacity. Border izquierdo `state.color` 100%.
- **Fill interno superior** (verde, `var(--green)`): % `done/total` items de **todos los ToDos** de la task. Crece desde la izquierda. Ocupa la mitad superior si hay subtareas, o la altura completa si no las hay. Si la task no tiene ToDos con items, no se renderiza.
- **Fill interno inferior** (morado, `var(--purple)`): % subtareas DONE / total subtareas. Crece desde la izquierda. Ocupa la mitad inferior si hay ToDos, o la altura completa si no los hay.
- Si la task **no tiene ni ToDos ni subtareas** → barra plana en `state.color` solo (sin fills).
- Click en la barra → abre `TaskDetailModal` (mismo del Kanban / Board).
- Drag de la barra completa → mueve start+due manteniendo duración. Persiste a DB en mouseup.
- Drag handles izq/der → resize start o due.

**4. Subtareas (jerarquía).**
- Cada parent task se renderiza como row. Chevron `▾`/`▸` a la izquierda → expand/collapse.
- Cuando está expandida, las subtareas directas se renderizan debajo, indentadas 20px.
- Subtareas tienen su propia barra con sus propias fechas. Si no tienen fechas, el row aparece pero sin barra y con un botón inline "Set dates".
- El padre **no agrega** rangos de hijos automáticamente — cada row es independiente.
- Cap natural de 5 niveles por la regla Phase 5 hierarchy.

**5. Time scale + zoom.**
- `days`: 32px por día, header día+nombre mes.
- `weeks`: 12px por día, header marca cada lunes.
- `months`: 4px por día, header marca cada primer día de mes.
- Range del eje: `min(all task startDates) − 7 días` hasta `max(all task dueDates) + 14 días`. Default si no hay tasks: hoy −7 a hoy +30.
- Línea "today" siempre visible en ámbar dasheado.
- Weekend shading sutil cuando zoom='days'.

### Reglas
- Si la task tiene **solo due_date** sin start_date → entra al banner "tareas sin fecha de inicio". El usuario tiene que setear start_date para verla en la grilla.
- Si la task no tiene ni start ni due → mismo caso, banner.
- Si tiene start sin due → banner pero el botón inline pregunta por due.
- Drag-resize respeta `start ≤ due` (no permite invertir).
- ToDo fill y subtask fill solo aplican a tasks DENTRO del Gantt — para una subtask sin ToDos/sub-subtasks se renderiza como barra plana.
- Permission `use` en boards compartidos: drag y resize quedan deshabilitados (read-only). Click → modal sigue funcionando.

### Out of scope
- Dependencias entre tareas (líneas conectoras tipo MS Project).
- Constraint solving (auto-shift de hijos cuando cambia el padre).
- Critical path highlight.
- Export a CSV / image.
- Milestones (eventos puntuales sin duración).

### Modelo de datos
**Sin cambios.** `start_date`, `due_date`, `parent_task_id`, `state_id`, `data` (para ToDo items) ya existen en `vl_tasks`.

**DBA verdict (2026-04-28):** no migration — pure UI feature.

### Files afectados
- `packages/ui/src/components/GanttTimeline.tsx` — extension points (`renderLabel`, `renderBarContent`, `showHeader`, `showHelpText`). Backward compatible.
- `apps/web/src/modules/vector-logic/ui/views/GanttView.tsx` — nuevo componente que compone `<GanttTimeline>` con los slots VL-específicos.
- `apps/web/src/modules/vector-logic/ui/VectorLogicPage.tsx` — tab `gantt` + parseRoute + sidebar Gantt icon.
- `packages/i18n/locales/es.json` + `en.json` — keys `vectorLogic.gantt.*`.

### Refactor history
La primera versión de esta entrega creaba un `GanttBar.tsx` propio en VL y reimplementaba el eje temporal en `GanttView.tsx`, duplicando la lógica de `GanttTimeline`. Tras feedback del usuario ("esto crecerá y será inmanejable"), se refactorizó a la composición descrita arriba: el shared component se extiende con slots, VL solo aporta su data + slots. `GanttBar.tsx` fue eliminado. Memoria: `feedback_extend_dont_duplicate.md`.

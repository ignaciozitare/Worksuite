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

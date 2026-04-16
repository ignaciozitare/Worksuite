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

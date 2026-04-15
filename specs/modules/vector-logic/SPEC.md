# Vector Logic — Module Spec

## Overview

Vector Logic is a full task orchestration platform inside WorkSuite. It allows users to define custom workflows (state machines), build dynamic task schemas, manage tasks on a Kanban board, and automate task creation from emails via an AI-powered rule engine.

## Phases

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | Workflow Engine (states, transitions, canvas, assignment) | In progress |
| 2 | Task Type Schema Builder (dynamic fields, form constructor) | Planned |
| 3 | Smart Kanban (task CRUD, board view, task movement) | Planned |
| 4 | Email Intelligence (AI rule engine, email parsing, auto-creation) | Planned |

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

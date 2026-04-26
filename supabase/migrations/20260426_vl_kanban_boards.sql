-- ============================================================================
-- Migration: 20260426_vl_kanban_boards.sql
-- Feature:   Multi-Board Kanban + Priority visuals
-- Spec:      specs/modules/vector-logic/SPEC.md (revisión 2026-04-26)
--
-- Creates the configurable Kanban Board feature for Vector Logic:
--   - vl_kanban_boards   user-created boards (personal or shared)
--   - vl_board_columns   columns of each board referencing existing vl_states
--   - vl_board_filters   per-board filter rules (task type, assignee, etc.)
--   - vl_board_members   per-user permissions on shared boards
--
-- Also adds an `icon` column to vl_priorities so priority chips can show
-- a Material Symbols glyph alongside their color.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. vl_kanban_boards
-- ----------------------------------------------------------------------------
create table if not exists public.vl_kanban_boards (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.users(id) on delete cascade,
  name        text not null,
  description text,
  icon        text,
  visibility  text not null default 'personal'
                check (visibility in ('personal', 'shared')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists vl_kanban_boards_owner_idx
  on public.vl_kanban_boards(owner_id);
create index if not exists vl_kanban_boards_visibility_idx
  on public.vl_kanban_boards(visibility);

-- ----------------------------------------------------------------------------
-- 2. vl_board_columns
-- ----------------------------------------------------------------------------
create table if not exists public.vl_board_columns (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null references public.vl_kanban_boards(id) on delete cascade,
  state_id   uuid not null references public.vl_states(id) on delete restrict,
  sort_order integer not null default 0,
  wip_limit  integer check (wip_limit is null or wip_limit >= 1),
  created_at timestamptz not null default now(),
  unique (board_id, state_id)
);

create index if not exists vl_board_columns_board_idx
  on public.vl_board_columns(board_id);

-- ----------------------------------------------------------------------------
-- 3. vl_board_filters
-- ----------------------------------------------------------------------------
create table if not exists public.vl_board_filters (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null references public.vl_kanban_boards(id) on delete cascade,
  dimension  text not null
              check (dimension in (
                'task_type', 'assignee', 'priority',
                'label', 'created_by', 'due_from', 'due_to'
              )),
  value      jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists vl_board_filters_board_idx
  on public.vl_board_filters(board_id);

-- ----------------------------------------------------------------------------
-- 4. vl_board_members
-- ----------------------------------------------------------------------------
create table if not exists public.vl_board_members (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null references public.vl_kanban_boards(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  permission text not null default 'use'
              check (permission in ('use', 'edit')),
  created_at timestamptz not null default now(),
  unique (board_id, user_id)
);

create index if not exists vl_board_members_board_idx
  on public.vl_board_members(board_id);
create index if not exists vl_board_members_user_idx
  on public.vl_board_members(user_id);

-- ----------------------------------------------------------------------------
-- 5. ALTER vl_priorities — add icon column for chip visuals
-- ----------------------------------------------------------------------------
alter table public.vl_priorities
  add column if not exists icon text;

-- ----------------------------------------------------------------------------
-- 6. updated_at triggers
-- ----------------------------------------------------------------------------
create or replace function public.vl_kanban_boards_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists vl_kanban_boards_updated_at on public.vl_kanban_boards;
create trigger vl_kanban_boards_updated_at
  before update on public.vl_kanban_boards
  for each row execute function public.vl_kanban_boards_set_updated_at();

-- ----------------------------------------------------------------------------
-- 7. Row Level Security
-- ----------------------------------------------------------------------------
alter table public.vl_kanban_boards enable row level security;
alter table public.vl_board_columns enable row level security;
alter table public.vl_board_filters enable row level security;
alter table public.vl_board_members enable row level security;

-- Helper: returns true if the current user can read a given board
-- (owner, board is shared, or user is a member). Inlined into policies via
-- direct EXISTS subqueries to avoid an extra function dependency.

-- ── vl_kanban_boards policies ─────────────────────────────────────────────
drop policy if exists vl_kanban_boards_select on public.vl_kanban_boards;
create policy vl_kanban_boards_select on public.vl_kanban_boards
  for select to authenticated
  using (
    owner_id = auth.uid()
    or visibility = 'shared'
    or exists (
      select 1 from public.vl_board_members m
       where m.board_id = vl_kanban_boards.id
         and m.user_id  = auth.uid()
    )
  );

drop policy if exists vl_kanban_boards_insert on public.vl_kanban_boards;
create policy vl_kanban_boards_insert on public.vl_kanban_boards
  for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists vl_kanban_boards_update on public.vl_kanban_boards;
create policy vl_kanban_boards_update on public.vl_kanban_boards
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists vl_kanban_boards_delete on public.vl_kanban_boards;
create policy vl_kanban_boards_delete on public.vl_kanban_boards
  for delete to authenticated
  using (owner_id = auth.uid());

-- ── vl_board_columns policies ────────────────────────────────────────────
-- SELECT: anyone with read access to the parent board.
drop policy if exists vl_board_columns_select on public.vl_board_columns;
create policy vl_board_columns_select on public.vl_board_columns
  for select to authenticated
  using (
    exists (
      select 1 from public.vl_kanban_boards b
       where b.id = vl_board_columns.board_id
         and (
           b.owner_id = auth.uid()
           or b.visibility = 'shared'
           or exists (
             select 1 from public.vl_board_members m
              where m.board_id = b.id
                and m.user_id  = auth.uid()
           )
         )
    )
  );

-- INSERT/UPDATE/DELETE: owner of the board OR member with permission='edit'.
drop policy if exists vl_board_columns_mutate on public.vl_board_columns;
create policy vl_board_columns_mutate on public.vl_board_columns
  for all to authenticated
  using (
    exists (
      select 1 from public.vl_kanban_boards b
       where b.id = vl_board_columns.board_id
         and (
           b.owner_id = auth.uid()
           or exists (
             select 1 from public.vl_board_members m
              where m.board_id = b.id
                and m.user_id  = auth.uid()
                and m.permission = 'edit'
           )
         )
    )
  )
  with check (
    exists (
      select 1 from public.vl_kanban_boards b
       where b.id = vl_board_columns.board_id
         and (
           b.owner_id = auth.uid()
           or exists (
             select 1 from public.vl_board_members m
              where m.board_id = b.id
                and m.user_id  = auth.uid()
                and m.permission = 'edit'
           )
         )
    )
  );

-- ── vl_board_filters policies ────────────────────────────────────────────
drop policy if exists vl_board_filters_select on public.vl_board_filters;
create policy vl_board_filters_select on public.vl_board_filters
  for select to authenticated
  using (
    exists (
      select 1 from public.vl_kanban_boards b
       where b.id = vl_board_filters.board_id
         and (
           b.owner_id = auth.uid()
           or b.visibility = 'shared'
           or exists (
             select 1 from public.vl_board_members m
              where m.board_id = b.id
                and m.user_id  = auth.uid()
           )
         )
    )
  );

drop policy if exists vl_board_filters_mutate on public.vl_board_filters;
create policy vl_board_filters_mutate on public.vl_board_filters
  for all to authenticated
  using (
    exists (
      select 1 from public.vl_kanban_boards b
       where b.id = vl_board_filters.board_id
         and (
           b.owner_id = auth.uid()
           or exists (
             select 1 from public.vl_board_members m
              where m.board_id = b.id
                and m.user_id  = auth.uid()
                and m.permission = 'edit'
           )
         )
    )
  )
  with check (
    exists (
      select 1 from public.vl_kanban_boards b
       where b.id = vl_board_filters.board_id
         and (
           b.owner_id = auth.uid()
           or exists (
             select 1 from public.vl_board_members m
              where m.board_id = b.id
                and m.user_id  = auth.uid()
                and m.permission = 'edit'
           )
         )
    )
  );

-- ── vl_board_members policies ────────────────────────────────────────────
-- SELECT: owner of the board, or the member themselves (so a user can
--         discover what shared boards they belong to).
drop policy if exists vl_board_members_select on public.vl_board_members;
create policy vl_board_members_select on public.vl_board_members
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.vl_kanban_boards b
       where b.id = vl_board_members.board_id
         and b.owner_id = auth.uid()
    )
  );

-- INSERT/UPDATE/DELETE: only the board owner can manage membership.
drop policy if exists vl_board_members_mutate on public.vl_board_members;
create policy vl_board_members_mutate on public.vl_board_members
  for all to authenticated
  using (
    exists (
      select 1 from public.vl_kanban_boards b
       where b.id = vl_board_members.board_id
         and b.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.vl_kanban_boards b
       where b.id = vl_board_members.board_id
         and b.owner_id = auth.uid()
    )
  );

-- ============================================================================
-- 20260426_vl_kanban_boards_v2.sql
-- Fase H · Multi-Board Kanban v2
--   1. Break the RLS recursion on vl_kanban_boards / vl_board_members via
--      SECURITY DEFINER helper functions.
--   2. Restructure board columns: a column has a user-chosen name and maps
--      to N states from the library (many-to-many via vl_board_column_states).
-- ============================================================================

-- ── 1. Helper functions ────────────────────────────────────────────────────
create or replace function public.vl_can_view_board(_board_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.vl_kanban_boards b
     where b.id = _board_id
       and (b.owner_id = auth.uid() or b.visibility = 'shared')
  ) or exists (
    select 1 from public.vl_board_members m
     where m.board_id = _board_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.vl_can_edit_board(_board_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.vl_kanban_boards b
     where b.id = _board_id and b.owner_id = auth.uid()
  ) or exists (
    select 1 from public.vl_board_members m
     where m.board_id = _board_id and m.user_id = auth.uid() and m.permission = 'edit'
  );
$$;

create or replace function public.vl_is_board_owner(_board_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.vl_kanban_boards b
     where b.id = _board_id and b.owner_id = auth.uid()
  );
$$;

revoke all on function public.vl_can_view_board(uuid) from public;
revoke all on function public.vl_can_edit_board(uuid) from public;
revoke all on function public.vl_is_board_owner(uuid) from public;
grant execute on function public.vl_can_view_board(uuid) to authenticated;
grant execute on function public.vl_can_edit_board(uuid) to authenticated;
grant execute on function public.vl_is_board_owner(uuid) to authenticated;

-- ── 2. Restructure vl_board_columns ───────────────────────────────────────
alter table public.vl_board_columns drop constraint if exists vl_board_columns_board_id_state_id_key;
alter table public.vl_board_columns drop column if exists state_id;
alter table public.vl_board_columns add column if not exists name text;
update public.vl_board_columns set name = 'Column' where name is null;
alter table public.vl_board_columns alter column name set not null;

-- Many-to-many junction column ↔ state
create table if not exists public.vl_board_column_states (
  id         uuid primary key default gen_random_uuid(),
  column_id  uuid not null references public.vl_board_columns(id) on delete cascade,
  state_id   uuid not null references public.vl_states(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (column_id, state_id)
);

create index if not exists vl_board_column_states_column_idx
  on public.vl_board_column_states(column_id);
create index if not exists vl_board_column_states_state_idx
  on public.vl_board_column_states(state_id);

alter table public.vl_board_column_states enable row level security;

-- ── 3. Replace policies on existing tables to use the helper functions ────
drop policy if exists vl_kanban_boards_select on public.vl_kanban_boards;
drop policy if exists vl_kanban_boards_insert on public.vl_kanban_boards;
drop policy if exists vl_kanban_boards_update on public.vl_kanban_boards;
drop policy if exists vl_kanban_boards_delete on public.vl_kanban_boards;

create policy vl_kanban_boards_select on public.vl_kanban_boards for select to authenticated
  using (
    owner_id = auth.uid()
    or visibility = 'shared'
    or public.vl_can_view_board(id)
  );
create policy vl_kanban_boards_insert on public.vl_kanban_boards for insert to authenticated
  with check (owner_id = auth.uid());
create policy vl_kanban_boards_update on public.vl_kanban_boards for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy vl_kanban_boards_delete on public.vl_kanban_boards for delete to authenticated
  using (owner_id = auth.uid());

drop policy if exists vl_board_columns_select on public.vl_board_columns;
drop policy if exists vl_board_columns_mutate on public.vl_board_columns;
create policy vl_board_columns_select on public.vl_board_columns for select to authenticated
  using (public.vl_can_view_board(board_id));
create policy vl_board_columns_mutate on public.vl_board_columns for all to authenticated
  using (public.vl_can_edit_board(board_id))
  with check (public.vl_can_edit_board(board_id));

drop policy if exists vl_board_filters_select on public.vl_board_filters;
drop policy if exists vl_board_filters_mutate on public.vl_board_filters;
create policy vl_board_filters_select on public.vl_board_filters for select to authenticated
  using (public.vl_can_view_board(board_id));
create policy vl_board_filters_mutate on public.vl_board_filters for all to authenticated
  using (public.vl_can_edit_board(board_id))
  with check (public.vl_can_edit_board(board_id));

drop policy if exists vl_board_members_select on public.vl_board_members;
drop policy if exists vl_board_members_mutate on public.vl_board_members;
create policy vl_board_members_select on public.vl_board_members for select to authenticated
  using (user_id = auth.uid() or public.vl_is_board_owner(board_id));
create policy vl_board_members_mutate on public.vl_board_members for all to authenticated
  using (public.vl_is_board_owner(board_id))
  with check (public.vl_is_board_owner(board_id));

-- ── 4. RLS on the new junction table ──────────────────────────────────────
drop policy if exists vl_board_column_states_select on public.vl_board_column_states;
create policy vl_board_column_states_select on public.vl_board_column_states for select to authenticated
  using (
    exists (
      select 1 from public.vl_board_columns c
       where c.id = vl_board_column_states.column_id
         and public.vl_can_view_board(c.board_id)
    )
  );

drop policy if exists vl_board_column_states_mutate on public.vl_board_column_states;
create policy vl_board_column_states_mutate on public.vl_board_column_states for all to authenticated
  using (
    exists (
      select 1 from public.vl_board_columns c
       where c.id = vl_board_column_states.column_id
         and public.vl_can_edit_board(c.board_id)
    )
  )
  with check (
    exists (
      select 1 from public.vl_board_columns c
       where c.id = vl_board_column_states.column_id
         and public.vl_can_edit_board(c.board_id)
    )
  );

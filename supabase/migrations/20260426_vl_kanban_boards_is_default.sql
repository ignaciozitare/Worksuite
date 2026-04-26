-- ============================================================================
-- 20260426_vl_kanban_boards_is_default.sql
-- Adds an is_default flag so each user gets one auto-created "Smart Kanban"
-- board that replaces the old non-editable Smart Kanban Auto. The default
-- board is editable like any other but cannot be deleted (UI guards), and
-- the partial unique index enforces at most one default per user.
-- ============================================================================

alter table public.vl_kanban_boards
  add column if not exists is_default boolean not null default false;

create unique index if not exists vl_kanban_boards_one_default_per_owner
  on public.vl_kanban_boards(owner_id) where is_default = true;

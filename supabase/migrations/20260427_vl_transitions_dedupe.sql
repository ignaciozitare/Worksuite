-- ============================================================================
-- 20260427_vl_transitions_dedupe.sql
-- Cleans up duplicate vl_transitions rows accumulated because the table
-- had no UNIQUE constraint on its natural key, then enforces uniqueness
-- and forbids self-loops at the DB level.
--
-- Investigation report: specs/modules/vector-logic/SPEC.md
--   sección "Canvas Designer — duplicate transitions fix (revisión 2026-04-27)"
-- ============================================================================

-- 1. Drop any self-loop rows. The frontend onConnect already rejects these
--    (`if (connection.source === connection.target) return`) but at least
--    one row slipped through and persisted in workflow "solucion".
delete from public.vl_transitions
 where from_state_id = to_state_id;

-- 2. Dedupe by (workflow_id, from_state_id, to_state_id). vl_transitions
--    has no created_at column, so we keep the row with the lowest id.
delete from public.vl_transitions a
 using public.vl_transitions b
 where a.workflow_id   = b.workflow_id
   and a.from_state_id = b.from_state_id
   and a.to_state_id   = b.to_state_id
   and a.id > b.id;

-- 3. Enforce uniqueness on the natural key going forward.
alter table public.vl_transitions
  add constraint vl_transitions_unique_pair
    unique (workflow_id, from_state_id, to_state_id);

-- 4. Defence-in-depth: block self-loops at the DB level. Even if the
--    frontend regresses or another caller bypasses the guard, a self-loop
--    insert will be rejected by Postgres.
alter table public.vl_transitions
  add constraint vl_transitions_no_self_loop
    check (from_state_id <> to_state_id);

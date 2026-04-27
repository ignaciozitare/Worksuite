-- ============================================================================
-- 20260427_vl_states_dedupe_unique_name.sql
-- The vl_states library had two "Review" rows with different ids but the
-- same name + category + color. When both ended up in the same workflow or
-- board column, the user saw nodes/columns that looked like duplicates.
--
-- This migration merges the orphan into the canonical row (the one with
-- more references) and adds a UNIQUE(name) constraint to prevent the issue
-- from coming back.
-- ============================================================================

-- 1. UNIQUE(workflow_id, state_id) and UNIQUE(column_id, state_id) would
--    block a plain UPDATE in places where both ids already coexist. Drop
--    the orphan rows where the canonical already covers them.
delete from public.vl_board_column_states orphan
 using public.vl_board_column_states canonical
 where orphan.state_id    = '9fc5851c-7f2f-49bc-b15d-32130e29d6c8'
   and canonical.state_id = '78614163-702b-4e08-89bb-fb1a90896314'
   and orphan.column_id   = canonical.column_id;

delete from public.vl_workflow_states orphan
 using public.vl_workflow_states canonical
 where orphan.state_id    = '9fc5851c-7f2f-49bc-b15d-32130e29d6c8'
   and canonical.state_id = '78614163-702b-4e08-89bb-fb1a90896314'
   and orphan.workflow_id = canonical.workflow_id;

-- 2. Re-point remaining references onto the canonical id.
update public.vl_workflow_states     set state_id      = '78614163-702b-4e08-89bb-fb1a90896314' where state_id      = '9fc5851c-7f2f-49bc-b15d-32130e29d6c8';
update public.vl_transitions         set from_state_id = '78614163-702b-4e08-89bb-fb1a90896314' where from_state_id = '9fc5851c-7f2f-49bc-b15d-32130e29d6c8';
update public.vl_transitions         set to_state_id   = '78614163-702b-4e08-89bb-fb1a90896314' where to_state_id   = '9fc5851c-7f2f-49bc-b15d-32130e29d6c8';
update public.vl_tasks               set state_id      = '78614163-702b-4e08-89bb-fb1a90896314' where state_id      = '9fc5851c-7f2f-49bc-b15d-32130e29d6c8';
update public.vl_board_column_states set state_id      = '78614163-702b-4e08-89bb-fb1a90896314' where state_id      = '9fc5851c-7f2f-49bc-b15d-32130e29d6c8';

-- 3. Drop the orphan vl_states row.
delete from public.vl_states where id = '9fc5851c-7f2f-49bc-b15d-32130e29d6c8';

-- 4. Enforce uniqueness of state names going forward. Library is global
--    (no per-user / per-workflow scope), so two states with the same name
--    is always a mistake.
alter table public.vl_states
  add constraint vl_states_name_unique unique (name);

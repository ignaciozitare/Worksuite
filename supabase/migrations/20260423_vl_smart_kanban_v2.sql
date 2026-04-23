-- ============================================================================
-- Vector Logic — Phase 5: Smart Kanban v2
-- Extends vl_tasks and vl_task_types, adds vl_task_alarms,
-- vl_user_world_cities, vl_user_settings, vl_task_type_hierarchy.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) vl_task_types — add prefix + counter for typed IDs (BUG-0001, FEAT-0001…)
-- ----------------------------------------------------------------------------
ALTER TABLE public.vl_task_types
  ADD COLUMN IF NOT EXISTS prefix      text,
  ADD COLUMN IF NOT EXISTS next_number integer NOT NULL DEFAULT 1;

-- Keep existing rows valid: backfill a default prefix from the type's name
-- (first 4 uppercase chars) so no NULLs stay in the column before we enforce
-- NOT NULL at the app layer. We intentionally do NOT add a DB-level NOT NULL
-- so that seed/migration scripts can backfill gradually.
UPDATE public.vl_task_types
   SET prefix = UPPER(LEFT(regexp_replace(name, '[^A-Za-z]', '', 'g'), 4))
 WHERE prefix IS NULL;

-- ----------------------------------------------------------------------------
-- 2) vl_tasks — typed code, due_date, state_entered_at, archive fields,
--    parent_task_id (hierarchy self-FK).
-- ----------------------------------------------------------------------------
ALTER TABLE public.vl_tasks
  ADD COLUMN IF NOT EXISTS code             text,
  ADD COLUMN IF NOT EXISTS due_date         date,
  ADD COLUMN IF NOT EXISTS state_entered_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS archived_at      timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parent_task_id   uuid REFERENCES public.vl_tasks(id) ON DELETE SET NULL;

-- Uniqueness on the human-readable code is important because it becomes the
-- primary user-facing identifier (BUG-0012). Nullable for now — backfilled
-- at the application layer as tasks are read/edited, and enforced unique
-- per-type via this index.
CREATE UNIQUE INDEX IF NOT EXISTS vl_tasks_code_unique_idx
  ON public.vl_tasks(code) WHERE code IS NOT NULL;

-- Index to quickly answer "show me a task's children"
CREATE INDEX IF NOT EXISTS vl_tasks_parent_idx
  ON public.vl_tasks(parent_task_id) WHERE parent_task_id IS NOT NULL;

-- Index to efficiently filter archived vs live tasks
CREATE INDEX IF NOT EXISTS vl_tasks_archived_idx
  ON public.vl_tasks(archived_at) WHERE archived_at IS NOT NULL;

-- Trigger: when state_id changes, reset state_entered_at so "days in column"
-- always reflects the current column.
CREATE OR REPLACE FUNCTION public.vl_tasks_reset_state_entered_at()
RETURNS trigger AS $$
BEGIN
  IF NEW.state_id IS DISTINCT FROM OLD.state_id THEN
    NEW.state_entered_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS vl_tasks_state_entered_trg ON public.vl_tasks;
CREATE TRIGGER vl_tasks_state_entered_trg
  BEFORE UPDATE ON public.vl_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.vl_tasks_reset_state_entered_at();

-- ----------------------------------------------------------------------------
-- 3) vl_task_alarms — per-task browser-notification schedule
--    Each row is one alarm. Multiple alarms per task are allowed.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vl_task_alarms (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id          uuid NOT NULL REFERENCES public.vl_tasks(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  trigger_at       timestamptz NOT NULL,
  advance_minutes  integer NOT NULL DEFAULT 0
                    CHECK (advance_minutes >= 0 AND advance_minutes <= 10080), -- up to 1 week
  repetitions      integer NOT NULL DEFAULT 1
                    CHECK (repetitions BETWEEN 1 AND 100),
  fired_count      integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vl_task_alarms_user_trigger_idx
  ON public.vl_task_alarms(user_id, trigger_at);

CREATE INDEX IF NOT EXISTS vl_task_alarms_task_idx
  ON public.vl_task_alarms(task_id);

ALTER TABLE public.vl_task_alarms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own alarms" ON public.vl_task_alarms;
CREATE POLICY "Users read own alarms"
  ON public.vl_task_alarms FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users write own alarms" ON public.vl_task_alarms;
CREATE POLICY "Users write own alarms"
  ON public.vl_task_alarms FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 4) vl_user_world_cities — user's quick-access clock cities
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vl_user_world_cities (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  city_name   text NOT NULL,
  timezone    text NOT NULL,  -- IANA e.g. "America/Argentina/Buenos_Aires"
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vl_user_world_cities_user_idx
  ON public.vl_user_world_cities(user_id, sort_order);

ALTER TABLE public.vl_user_world_cities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own cities" ON public.vl_user_world_cities;
CREATE POLICY "Users read own cities"
  ON public.vl_user_world_cities FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users write own cities" ON public.vl_user_world_cities;
CREATE POLICY "Users write own cities"
  ON public.vl_user_world_cities FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 5) vl_user_settings — per-user Vector Logic preferences
--    Separate from vl_gmail_connections (which is Gmail-specific).
--    Holds board-behavior preferences: Done-column limits, home timezone, etc.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vl_user_settings (
  user_id          uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  done_max_days    integer NOT NULL DEFAULT 7
                    CHECK (done_max_days BETWEEN 0 AND 365),
  done_max_count   integer NOT NULL DEFAULT 20
                    CHECK (done_max_count BETWEEN 0 AND 1000),
  home_timezone    text NOT NULL DEFAULT 'UTC',
  home_city        text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vl_user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own vl settings" ON public.vl_user_settings;
CREATE POLICY "Users read own vl settings"
  ON public.vl_user_settings FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users write own vl settings" ON public.vl_user_settings;
CREATE POLICY "Users write own vl settings"
  ON public.vl_user_settings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 6) vl_task_type_hierarchy — which Task Types can parent which other Types
--    Admin config. App layer enforces the 5-level max depth at create time.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vl_task_type_hierarchy (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_type_id  uuid NOT NULL REFERENCES public.vl_task_types(id) ON DELETE CASCADE,
  child_type_id   uuid NOT NULL REFERENCES public.vl_task_types(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vl_task_type_hierarchy_unique UNIQUE (parent_type_id, child_type_id),
  CONSTRAINT vl_task_type_hierarchy_no_self CHECK (parent_type_id <> child_type_id)
);

CREATE INDEX IF NOT EXISTS vl_task_type_hierarchy_parent_idx
  ON public.vl_task_type_hierarchy(parent_type_id);

CREATE INDEX IF NOT EXISTS vl_task_type_hierarchy_child_idx
  ON public.vl_task_type_hierarchy(child_type_id);

ALTER TABLE public.vl_task_type_hierarchy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read task type hierarchy" ON public.vl_task_type_hierarchy;
CREATE POLICY "Authenticated read task type hierarchy"
  ON public.vl_task_type_hierarchy FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated write task type hierarchy" ON public.vl_task_type_hierarchy;
CREATE POLICY "Authenticated write task type hierarchy"
  ON public.vl_task_type_hierarchy FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

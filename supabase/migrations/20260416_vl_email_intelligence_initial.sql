-- ============================================================================
-- Vector Logic — Phase 4: Email Intelligence
-- Tables: vl_gmail_connections, vl_email_rules, vl_email_detections
-- Extension: vl_tasks gets gmail_message_id / gmail_thread_id / created_by_ai
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) vl_gmail_connections — one Gmail OAuth connection per user
--    Holds the refresh/access tokens (encrypted at the application layer by
--    apps/api before insert) and user-tunable email-intelligence settings.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vl_gmail_connections (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   uuid NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  email                     text NOT NULL,
  refresh_token             text NOT NULL,
  access_token              text,
  token_expires_at          timestamptz,
  is_active                 boolean NOT NULL DEFAULT true,
  polling_interval_minutes  integer NOT NULL DEFAULT 5 CHECK (polling_interval_minutes BETWEEN 1 AND 1440),
  confidence_threshold      numeric(4,3) NOT NULL DEFAULT 0.850 CHECK (confidence_threshold BETWEEN 0 AND 1),
  default_priority_id       uuid REFERENCES public.vl_priorities(id) ON DELETE SET NULL,
  default_task_type_id      uuid REFERENCES public.vl_task_types(id) ON DELETE SET NULL,
  last_polled_at            timestamptz,
  last_message_timestamp    timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vl_gmail_connections_user_idx ON public.vl_gmail_connections(user_id);

ALTER TABLE public.vl_gmail_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own gmail connection" ON public.vl_gmail_connections;
CREATE POLICY "Users read own gmail connection"
  ON public.vl_gmail_connections FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users write own gmail connection" ON public.vl_gmail_connections;
CREATE POLICY "Users write own gmail connection"
  ON public.vl_gmail_connections FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 2) vl_email_rules — composable filter rules with optional action overrides
--    filters is a JSON array. Each entry:
--      { "type": "label"|"category"|"sender"|"domain"|"all", "value": "..." }
--    An email matches the rule if ANY of its filters match (OR semantics
--    within a rule). If multiple rules match an email, the rule with the
--    lowest sort_order wins.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vl_email_rules (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name                   text NOT NULL,
  is_active              boolean NOT NULL DEFAULT true,
  filters                jsonb NOT NULL DEFAULT '[]'::jsonb,
  action_task_type_id    uuid REFERENCES public.vl_task_types(id) ON DELETE SET NULL,
  action_priority_name   text,
  action_assignee_id     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  sort_order             integer NOT NULL DEFAULT 0,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vl_email_rules_user_active_idx
  ON public.vl_email_rules(user_id, is_active, sort_order);

ALTER TABLE public.vl_email_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own email rules" ON public.vl_email_rules;
CREATE POLICY "Users read own email rules"
  ON public.vl_email_rules FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users write own email rules" ON public.vl_email_rules;
CREATE POLICY "Users write own email rules"
  ON public.vl_email_rules FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 3) vl_email_detections — every processed email and its outcome
--    Status lifecycle: pending_review → approved | rejected
--                                    ↘ auto_created (skips review)
--                                    ↘ failed (LLM or task-creation error)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vl_email_detections (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  gmail_message_id        text NOT NULL,
  gmail_thread_id         text NOT NULL,
  gmail_received_at       timestamptz NOT NULL,
  from_email              text NOT NULL,
  from_name               text,
  subject                 text,
  body_snippet            text,
  body_full               text,
  matched_rule_id         uuid REFERENCES public.vl_email_rules(id) ON DELETE SET NULL,
  status                  text NOT NULL CHECK (status IN ('pending_review','approved','rejected','auto_created','failed')),
  confidence              numeric(4,3) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  proposed_title          text,
  proposed_description    text,
  proposed_task_type_id   uuid REFERENCES public.vl_task_types(id) ON DELETE SET NULL,
  proposed_priority       text,
  proposed_due_date       date,
  task_id                 uuid REFERENCES public.vl_tasks(id) ON DELETE SET NULL,
  error_message           text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vl_email_detections_user_msg_unique UNIQUE (user_id, gmail_message_id)
);

CREATE INDEX IF NOT EXISTS vl_email_detections_user_status_idx
  ON public.vl_email_detections(user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS vl_email_detections_task_idx
  ON public.vl_email_detections(task_id) WHERE task_id IS NOT NULL;

ALTER TABLE public.vl_email_detections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own detections" ON public.vl_email_detections;
CREATE POLICY "Users read own detections"
  ON public.vl_email_detections FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users write own detections" ON public.vl_email_detections;
CREATE POLICY "Users write own detections"
  ON public.vl_email_detections FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 4) Extend vl_tasks with Gmail linkage and AI provenance flag
-- ----------------------------------------------------------------------------
ALTER TABLE public.vl_tasks
  ADD COLUMN IF NOT EXISTS gmail_message_id text,
  ADD COLUMN IF NOT EXISTS gmail_thread_id  text,
  ADD COLUMN IF NOT EXISTS created_by_ai    boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS vl_tasks_gmail_message_idx
  ON public.vl_tasks(gmail_message_id) WHERE gmail_message_id IS NOT NULL;

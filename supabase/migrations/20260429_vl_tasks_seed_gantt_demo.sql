-- Demo seeder for the Vector Logic Gantt view.
-- Fills start_date + due_date on every live vl_task using a recursive CTE so
-- subtasks always sit inside their parent's range. Also injects a few ToDo
-- items into Bug-typed tasks so the green progress fill renders.
--
-- Idempotent: re-running rewrites the same deterministic ranges and replaces
-- ToDos only when they are missing.

WITH RECURSIVE
params AS (SELECT DATE '2026-04-15' AS anchor),
sibs AS (
  SELECT
    id,
    parent_task_id,
    ROW_NUMBER() OVER (PARTITION BY parent_task_id ORDER BY sort_order, created_at)::int AS sib_idx,
    COUNT(*) OVER (PARTITION BY parent_task_id)::int AS sib_count
  FROM vl_tasks
  WHERE archived_at IS NULL
),
walk AS (
  -- Roots: stagger starts every 5 days, durations 35-55 days
  SELECT
    s.id,
    s.parent_task_id,
    0 AS depth,
    ((SELECT anchor FROM params) + ((s.sib_idx - 1) * 5))::date AS start_date,
    ((SELECT anchor FROM params) + ((s.sib_idx - 1) * 5 + 35 + ((s.sib_idx % 5) * 5)))::date AS due_date
  FROM sibs s
  WHERE s.parent_task_id IS NULL
  UNION ALL
  -- Children: divide parent range across N siblings, sequential slots
  SELECT
    s.id,
    s.parent_task_id,
    w.depth + 1,
    (w.start_date + GREATEST(((w.due_date - w.start_date) * (s.sib_idx - 1) / s.sib_count), 0))::date AS start_date,
    (w.start_date + GREATEST(((w.due_date - w.start_date) * s.sib_idx / s.sib_count - 1), 1))::date AS due_date
  FROM sibs s
  JOIN walk w ON s.parent_task_id = w.id
)
UPDATE vl_tasks t
SET start_date = w.start_date,
    due_date   = w.due_date,
    updated_at = NOW()
FROM walk w
WHERE t.id = w.id;

-- Inject ToDo items into every Bug-typed task that has the f9wuopam ToDo field
-- but no items yet. Five items with a deterministic checked pattern based on
-- task code so each task shows a different progress fill in the Gantt bar.
UPDATE vl_tasks t
SET data = jsonb_set(
  COALESCE(t.data, '{}'::jsonb),
  '{f9wuopam}',
  jsonb_build_array(
    jsonb_build_object('id', substr(md5(t.id::text || '1'), 1, 8), 'label', 'Reproducir el caso',         'checked', true),
    jsonb_build_object('id', substr(md5(t.id::text || '2'), 1, 8), 'label', 'Identificar la causa raiz', 'checked', true),
    jsonb_build_object('id', substr(md5(t.id::text || '3'), 1, 8), 'label', 'Aplicar el fix',             'checked', (substr(md5(t.id::text), 1, 1) IN ('0','1','2','3','4','5','6','7','8'))),
    jsonb_build_object('id', substr(md5(t.id::text || '4'), 1, 8), 'label', 'Agregar test de regresion',  'checked', (substr(md5(t.id::text), 2, 1) IN ('0','1','2','3','4','5'))),
    jsonb_build_object('id', substr(md5(t.id::text || '5'), 1, 8), 'label', 'Validar en staging',         'checked', false)
  )
),
updated_at = NOW()
WHERE t.task_type_id = '6cae9c95-6d09-4eaa-b3a2-b63aea8cb904' -- Bug
  AND t.archived_at IS NULL
  AND (
    t.data IS NULL
    OR NOT (t.data ? 'f9wuopam')
    OR jsonb_array_length(COALESCE(t.data->'f9wuopam', '[]'::jsonb)) = 0
  );

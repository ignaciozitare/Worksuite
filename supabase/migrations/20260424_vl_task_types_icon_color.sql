-- ============================================================================
-- Vector Logic — add icon_color to vl_task_types
-- Lets the user pick a color for the task type's icon at create/edit time.
-- Nullable so legacy rows keep rendering with the default accent.
-- ============================================================================
ALTER TABLE public.vl_task_types
  ADD COLUMN IF NOT EXISTS icon_color text;

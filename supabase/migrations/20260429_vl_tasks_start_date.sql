-- Add start_date column to vl_tasks so the Gantt view can persist task ranges.
-- Pairs with the existing due_date column.
ALTER TABLE vl_tasks ADD COLUMN IF NOT EXISTS start_date date;
COMMENT ON COLUMN vl_tasks.start_date IS 'Optional start date for Gantt rendering. Pairs with due_date to define a task range.';

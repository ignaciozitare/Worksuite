-- ============================================================================
-- WorkSuite — Chrono Admin RLS policies
-- ============================================================================
-- Grants SELECT (and where appropriate, ALL) to admin users on the Chrono
-- tables that today only allow per-user access. Without this, the Chrono
-- Admin / HR views show no data at all when the admin reads other people's
-- fichajes, vacations, bags and notifications — RLS filters them out before
-- they reach the UI.
--
-- Pattern used by the existing `ch_empleado_config` policies:
--   (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid()
--                              AND users.role = 'admin'))
--
-- Tables touched:
--   - ch_fichajes        (admin sees everyone's clock-ins)
--   - ch_vacaciones      (admin sees pending / approved requests)
--   - ch_saldo_vacaciones (admin sees balances)
--   - ch_bolsa_horas     (admin sees hour-bank adjustments)
--   - ch_incidencias     (admin sees justifications)
--   - ch_notificaciones  (admin sees notifications — useful for audit)
--
-- Idempotent: every CREATE POLICY is wrapped in DROP POLICY IF EXISTS so it
-- can be re-run safely.
-- ============================================================================

BEGIN;

-- ── ch_fichajes ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS ch_fichajes_admin_all ON ch_fichajes;
CREATE POLICY ch_fichajes_admin_all ON ch_fichajes
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'admin'
    )
  );

-- ── ch_vacaciones ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS ch_vacaciones_admin_all ON ch_vacaciones;
CREATE POLICY ch_vacaciones_admin_all ON ch_vacaciones
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'admin'
    )
  );

-- ── ch_saldo_vacaciones ────────────────────────────────────────────────────
ALTER TABLE ch_saldo_vacaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ch_saldo_vacaciones_select_own ON ch_saldo_vacaciones;
CREATE POLICY ch_saldo_vacaciones_select_own ON ch_saldo_vacaciones
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS ch_saldo_vacaciones_admin_all ON ch_saldo_vacaciones;
CREATE POLICY ch_saldo_vacaciones_admin_all ON ch_saldo_vacaciones
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'admin'
    )
  );

-- ── ch_bolsa_horas ─────────────────────────────────────────────────────────
ALTER TABLE ch_bolsa_horas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ch_bolsa_horas_select_own ON ch_bolsa_horas;
CREATE POLICY ch_bolsa_horas_select_own ON ch_bolsa_horas
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS ch_bolsa_horas_admin_all ON ch_bolsa_horas;
CREATE POLICY ch_bolsa_horas_admin_all ON ch_bolsa_horas
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'admin'
    )
  );

-- ── ch_incidencias ─────────────────────────────────────────────────────────
ALTER TABLE ch_incidencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ch_incidencias_select_own ON ch_incidencias;
CREATE POLICY ch_incidencias_select_own ON ch_incidencias
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS ch_incidencias_insert_own ON ch_incidencias;
CREATE POLICY ch_incidencias_insert_own ON ch_incidencias
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS ch_incidencias_admin_all ON ch_incidencias;
CREATE POLICY ch_incidencias_admin_all ON ch_incidencias
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'admin'
    )
  );

-- ── ch_notificaciones ──────────────────────────────────────────────────────
ALTER TABLE ch_notificaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ch_notificaciones_select_own ON ch_notificaciones;
CREATE POLICY ch_notificaciones_select_own ON ch_notificaciones
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS ch_notificaciones_update_own ON ch_notificaciones;
CREATE POLICY ch_notificaciones_update_own ON ch_notificaciones
  FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS ch_notificaciones_admin_all ON ch_notificaciones;
CREATE POLICY ch_notificaciones_admin_all ON ch_notificaciones
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'admin'
    )
  );

COMMIT;

-- ── Sanity check ───────────────────────────────────────────────────────────
-- Run these as the admin user from the web app. All counts should match the
-- row counts reported right after running supabase/seed.sql.
--
-- SELECT count(*) FROM ch_fichajes;
-- SELECT count(*) FROM ch_vacaciones;
-- SELECT count(*) FROM ch_saldo_vacaciones;

-- ============================================================================
-- WorkSuite — Seed data cleanup
-- ============================================================================
-- Reverses everything seed.sql inserted. Wrapped in a single transaction so a
-- half-failed cleanup won't leave orphan rows. Only touches:
--   * Users whose email starts with `seed+` and ends with `@worksuite.test`
--   * Teams whose id starts with `10000000-`
--   * Notifications whose title starts with `[SEED]` (these belong to the
--     real admin user — that's how we inject bell notifs without polluting)
--
-- The real admin user (ignaciozitare@gmail.com) is never deleted, and his
-- non-seed notifications are never touched.
-- ============================================================================

BEGIN;

-- Delete in reverse FK order so referenced rows still exist when we hit them.

-- 1. Notifications (both for seed users AND the [SEED]-prefixed ones on the
--    real admin).
DELETE FROM ch_notificaciones
WHERE user_id IN (
  SELECT id FROM users WHERE email LIKE 'seed+%@worksuite.test'
);
DELETE FROM ch_notificaciones WHERE titulo LIKE '[SEED] %';

-- 2. Incidencias
DELETE FROM ch_incidencias
WHERE user_id IN (
  SELECT id FROM users WHERE email LIKE 'seed+%@worksuite.test'
);

-- 3. Vacaciones + saldos
DELETE FROM ch_vacaciones
WHERE user_id IN (
  SELECT id FROM users WHERE email LIKE 'seed+%@worksuite.test'
);
DELETE FROM ch_saldo_vacaciones
WHERE user_id IN (
  SELECT id FROM users WHERE email LIKE 'seed+%@worksuite.test'
);

-- 4. Bolsa de horas
DELETE FROM ch_bolsa_horas
WHERE user_id IN (
  SELECT id FROM users WHERE email LIKE 'seed+%@worksuite.test'
);

-- 5. Fichajes
DELETE FROM ch_fichajes
WHERE user_id IN (
  SELECT id FROM users WHERE email LIKE 'seed+%@worksuite.test'
);

-- 6. Alarmas (if any were ever added; safe even if empty)
DELETE FROM ch_alarmas
WHERE user_id IN (
  SELECT id FROM users WHERE email LIKE 'seed+%@worksuite.test'
);

-- 7. Team memberships + teams
DELETE FROM ch_equipo_miembros
WHERE equipo_id IN (
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000004'
);
DELETE FROM ch_equipos
WHERE id IN (
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000004'
);

-- 8. Employee configs
DELETE FROM ch_empleado_config
WHERE user_id IN (
  SELECT id FROM users WHERE email LIKE 'seed+%@worksuite.test'
);

-- 9. Finally the users themselves
DELETE FROM users WHERE email LIKE 'seed+%@worksuite.test';

-- 10. Also delete the auth.users rows. public.users has ON DELETE CASCADE
-- from auth.users, so in theory deleting here alone would clean both sides,
-- but we keep step 9 explicit for clarity and to guard against any future
-- removal of the cascade.
DELETE FROM auth.users WHERE email LIKE 'seed+%@worksuite.test';

COMMIT;

-- Sanity check (run manually after):
-- SELECT count(*) FROM users WHERE email LIKE 'seed+%@worksuite.test'; -- 0
-- SELECT id, name, email FROM users WHERE email = 'ignaciozitare@gmail.com'; -- still there

-- ============================================================================
-- WorkSuite — Seed data for Chrono + Chrono Admin (HR)
-- ============================================================================
-- Creates 30 fake users (2 admins + 4 managers + 24 employees spread across
-- 4 teams), with the relational data needed to exercise the Chrono dashboards,
-- the incompletos / aprobaciones / vacaciones views and the notifications
-- bell. All seed rows are tagged via `email LIKE 'seed+%@worksuite.test'`.
--
-- Safety guarantees:
--   * Never touches the real admin user (ignaciozitare@gmail.com / id
--     dff31041-da17-41fc-bf2f-2b95504938d4) except to INSERT a few tagged
--     notifications for him so the bell shows realistic data. Those notifs
--     are titled "[SEED] ..." so the cleanup script can drop them too.
--   * Never touches `ch_ficha_empleado` (encrypted via Edge Function).
--   * Wrapped in a single BEGIN/COMMIT — if anything fails, nothing persists.
--   * Idempotent via ON CONFLICT (id) DO NOTHING for the static rows, and
--     guarded sub-SELECTs for the dynamically generated fichajes.
--
-- Note on auth.users:
--   `public.users.id` has a FK to `auth.users.id ON DELETE CASCADE`, so we
--   must create the auth rows first. Seed accounts have NO password/hash,
--   so they CANNOT log in — which is exactly what we want. Cleanup just
--   deletes the auth.users rows and the public.users rows cascade away.
--
-- To wipe everything clean: run supabase/seed-cleanup.sql.
-- ============================================================================

BEGIN;

-- ── 0. Auth rows (required because public.users.id FK → auth.users.id) ─────
-- Seed accounts only have the bare minimum fields. No password, no identity,
-- no session → they are unable to log in. Their only role is to satisfy the
-- FK so we can insert into `public.users`.
INSERT INTO auth.users (
  id, instance_id, aud, role, email,
  raw_app_meta_data, raw_user_meta_data,
  email_confirmed_at, created_at, updated_at,
  is_sso_user, is_anonymous
) VALUES
  ('00000001-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed+lucia.delgado@worksuite.test',   '{"provider":"seed"}'::jsonb, '{}'::jsonb, now(), now(), now(), false, false),
  ('00000001-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed+elena.fuentes@worksuite.test',   '{"provider":"seed"}'::jsonb, '{}'::jsonb, now(), now(), now(), false, false),
  ('00000002-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed+clara.nogueira@worksuite.test',  '{"provider":"seed"}'::jsonb, '{}'::jsonb, now(), now(), now(), false, false),
  ('00000002-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed+diego.castillo@worksuite.test',  '{"provider":"seed"}'::jsonb, '{}'::jsonb, now(), now(), now(), false, false),
  ('00000002-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed+miguel.ortega@worksuite.test',   '{"provider":"seed"}'::jsonb, '{}'::jsonb, now(), now(), now(), false, false),
  ('00000002-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed+carmen.bravo@worksuite.test',    '{"provider":"seed"}'::jsonb, '{}'::jsonb, now(), now(), now(), false, false),
  ('00000003-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed+alejandra.ruiz@worksuite.test',  '{"provider":"seed"}'::jsonb, '{}'::jsonb, now(), now(), now(), false, false),
  ('00000003-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed+marco.ferrari@worksuite.test',   '{"provider":"seed"}'::jsonb, '{}'::jsonb, now(), now(), now(), false, false),
  ('00000003-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed+sofia.herrero@worksuite.test',   '{"provider":"seed"}'::jsonb, '{}'::jsonb, now(), now(), now(), false, false),
  ('00000003-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed+pablo.iglesias@worksuite.test',  '{"provider":"seed"}'::jsonb, '{}'::jsonb, now(), now(), now(), false, false),
  ('00000003-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed+valeria.campos@worksuite.test',  '{"provider":"seed"}'::jsonb, '{}'::jsonb, now(), now(), now(), false, false),
  ('00000003-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed+ivan.ortiz@worksuite.test',      '{"provider":"seed"}'::jsonb, '{}'::jsonb, now(), now(), now(), false, false),
  ('00000004-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed+nuria.vidal@worksuite.test',     '{"provider":"seed"}'::jsonb, '{}'::jsonb, now(), now(), now(), false, false),
  ('00000004-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed+javier.molina@worksuite.test',   '{"provider":"seed"}'::jsonb, '{}'::jsonb, now(), now(), now(), false, false),
  ('00000004-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed+raul.pereira@worksuite.test',    '{"provider":"seed"}'::jsonb, '{}'::jsonb, now(), now(), now(), false, false),
  ('00000004-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed+ainhoa.solis@worksuite.test',    '{"provider":"seed"}'::jsonb, '{}'::jsonb, now(), now(), now(), false, false),
  ('00000004-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed+tomas.rivera@worksuite.test',    '{"provider":"seed"}'::jsonb, '{}'::jsonb, now(), now(), now(), false, false),
  ('00000004-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed+lola.martin@worksuite.test',     '{"provider":"seed"}'::jsonb, '{}'::jsonb, now(), now(), now(), false, false),
  ('00000005-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed+gabriel.rios@worksuite.test',    '{"provider":"seed"}'::jsonb, '{}'::jsonb, now(), now(), now(), false, false),
  ('00000005-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed+martina.serra@worksuite.test',   '{"provider":"seed"}'::jsonb, '{}'::jsonb, now(), now(), now(), false, false),
  ('00000005-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed+andres.navarro@worksuite.test',  '{"provider":"seed"}'::jsonb, '{}'::jsonb, now(), now(), now(), false, false),
  ('00000005-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed+irene.bustos@worksuite.test',    '{"provider":"seed"}'::jsonb, '{}'::jsonb, now(), now(), now(), false, false),
  ('00000005-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed+enzo.vargas@worksuite.test',     '{"provider":"seed"}'::jsonb, '{}'::jsonb, now(), now(), now(), false, false),
  ('00000005-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed+camila.reyes@worksuite.test',    '{"provider":"seed"}'::jsonb, '{}'::jsonb, now(), now(), now(), false, false),
  ('00000006-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed+hector.salas@worksuite.test',    '{"provider":"seed"}'::jsonb, '{}'::jsonb, now(), now(), now(), false, false),
  ('00000006-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed+paula.domingo@worksuite.test',   '{"provider":"seed"}'::jsonb, '{}'::jsonb, now(), now(), now(), false, false),
  ('00000006-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed+bruno.cabrera@worksuite.test',   '{"provider":"seed"}'::jsonb, '{}'::jsonb, now(), now(), now(), false, false),
  ('00000006-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed+sara.ibanez@worksuite.test',     '{"provider":"seed"}'::jsonb, '{}'::jsonb, now(), now(), now(), false, false),
  ('00000006-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed+oscar.villar@worksuite.test',    '{"provider":"seed"}'::jsonb, '{}'::jsonb, now(), now(), now(), false, false),
  ('00000006-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed+laura.redondo@worksuite.test',   '{"provider":"seed"}'::jsonb, '{}'::jsonb, now(), now(), now(), false, false)
ON CONFLICT (id) DO NOTHING;

-- ── 1. Users (30 seed accounts in public.users) ────────────────────────────
-- IDs are intentionally predictable so the SQL reads cleanly.
-- "Prefix 0000000X" encodes the group:
--   00000001-... → admins (RRHH)
--   00000002-... → managers
--   00000003-... → Backend employees
--   00000004-... → Frontend employees
--   00000005-... → Mobile employees
--   00000006-... → Data employees

INSERT INTO users (id, name, email, role, desk_type, avatar, active, modules) VALUES
  -- Admins (2)
  ('00000001-0000-0000-0000-000000000001', 'Lucía Delgado',   'seed+lucia.delgado@worksuite.test',   'admin', 'fixed',   'LD', true, '["jt","hd","retro","deploy","chrono","chrono-admin"]'::jsonb),
  ('00000001-0000-0000-0000-000000000002', 'Elena Fuentes',   'seed+elena.fuentes@worksuite.test',   'admin', 'fixed',   'EF', true, '["jt","hd","retro","deploy","chrono","chrono-admin"]'::jsonb),

  -- Managers (4, one per team)
  ('00000002-0000-0000-0000-000000000001', 'Clara Nogueira',  'seed+clara.nogueira@worksuite.test',  'admin', 'fixed',   'CN', true, '["jt","hd","retro","deploy","chrono","chrono-admin"]'::jsonb),
  ('00000002-0000-0000-0000-000000000002', 'Diego Castillo',  'seed+diego.castillo@worksuite.test',  'admin', 'fixed',   'DC', true, '["jt","hd","retro","deploy","chrono","chrono-admin"]'::jsonb),
  ('00000002-0000-0000-0000-000000000003', 'Miguel Ortega',   'seed+miguel.ortega@worksuite.test',   'admin', 'fixed',   'MO', true, '["jt","hd","retro","deploy","chrono","chrono-admin"]'::jsonb),
  ('00000002-0000-0000-0000-000000000004', 'Carmen Bravo',    'seed+carmen.bravo@worksuite.test',    'admin', 'fixed',   'CB', true, '["jt","hd","retro","deploy","chrono","chrono-admin"]'::jsonb),

  -- Backend (6)
  ('00000003-0000-0000-0000-000000000001', 'Alejandra Ruiz',  'seed+alejandra.ruiz@worksuite.test',  'user',  'hotdesk', 'AR', true, '["jt","hd","retro","chrono"]'::jsonb),
  ('00000003-0000-0000-0000-000000000002', 'Marco Ferrari',   'seed+marco.ferrari@worksuite.test',   'user',  'hotdesk', 'MF', true, '["jt","hd","retro","chrono"]'::jsonb),
  ('00000003-0000-0000-0000-000000000003', 'Sofía Herrero',   'seed+sofia.herrero@worksuite.test',   'user',  'hotdesk', 'SH', true, '["jt","hd","retro","chrono"]'::jsonb),
  ('00000003-0000-0000-0000-000000000004', 'Pablo Iglesias',  'seed+pablo.iglesias@worksuite.test',  'user',  'hotdesk', 'PI', true, '["jt","hd","retro","chrono"]'::jsonb),
  ('00000003-0000-0000-0000-000000000005', 'Valeria Campos',  'seed+valeria.campos@worksuite.test',  'user',  'hotdesk', 'VC', true, '["jt","hd","retro","chrono"]'::jsonb),
  ('00000003-0000-0000-0000-000000000006', 'Iván Ortiz',      'seed+ivan.ortiz@worksuite.test',      'user',  'hotdesk', 'IO', true, '["jt","hd","retro","chrono"]'::jsonb),

  -- Frontend (6)
  ('00000004-0000-0000-0000-000000000001', 'Núria Vidal',     'seed+nuria.vidal@worksuite.test',     'user',  'hotdesk', 'NV', true, '["jt","hd","retro","chrono"]'::jsonb),
  ('00000004-0000-0000-0000-000000000002', 'Javier Molina',   'seed+javier.molina@worksuite.test',   'user',  'hotdesk', 'JM', true, '["jt","hd","retro","chrono"]'::jsonb),
  ('00000004-0000-0000-0000-000000000003', 'Raúl Pereira',    'seed+raul.pereira@worksuite.test',    'user',  'hotdesk', 'RP', true, '["jt","hd","retro","chrono"]'::jsonb),
  ('00000004-0000-0000-0000-000000000004', 'Ainhoa Solís',    'seed+ainhoa.solis@worksuite.test',    'user',  'hotdesk', 'AS', true, '["jt","hd","retro","chrono"]'::jsonb),
  ('00000004-0000-0000-0000-000000000005', 'Tomás Rivera',    'seed+tomas.rivera@worksuite.test',    'user',  'hotdesk', 'TR', true, '["jt","hd","retro","chrono"]'::jsonb),
  ('00000004-0000-0000-0000-000000000006', 'Lola Martín',     'seed+lola.martin@worksuite.test',     'user',  'hotdesk', 'LM', true, '["jt","hd","retro","chrono"]'::jsonb),

  -- Mobile (6)
  ('00000005-0000-0000-0000-000000000001', 'Gabriel Ríos',    'seed+gabriel.rios@worksuite.test',    'user',  'hotdesk', 'GR', true, '["jt","hd","retro","chrono"]'::jsonb),
  ('00000005-0000-0000-0000-000000000002', 'Martina Serra',   'seed+martina.serra@worksuite.test',   'user',  'hotdesk', 'MS', true, '["jt","hd","retro","chrono"]'::jsonb),
  ('00000005-0000-0000-0000-000000000003', 'Andrés Navarro',  'seed+andres.navarro@worksuite.test',  'user',  'hotdesk', 'AN', true, '["jt","hd","retro","chrono"]'::jsonb),
  ('00000005-0000-0000-0000-000000000004', 'Irene Bustos',    'seed+irene.bustos@worksuite.test',    'user',  'hotdesk', 'IB', true, '["jt","hd","retro","chrono"]'::jsonb),
  ('00000005-0000-0000-0000-000000000005', 'Enzo Vargas',     'seed+enzo.vargas@worksuite.test',     'user',  'hotdesk', 'EV', true, '["jt","hd","retro","chrono"]'::jsonb),
  ('00000005-0000-0000-0000-000000000006', 'Camila Reyes',    'seed+camila.reyes@worksuite.test',    'user',  'hotdesk', 'CR', true, '["jt","hd","retro","chrono"]'::jsonb),

  -- Data (6)
  ('00000006-0000-0000-0000-000000000001', 'Héctor Salas',    'seed+hector.salas@worksuite.test',    'user',  'hotdesk', 'HS', true, '["jt","hd","retro","chrono"]'::jsonb),
  ('00000006-0000-0000-0000-000000000002', 'Paula Domingo',   'seed+paula.domingo@worksuite.test',   'user',  'hotdesk', 'PD', true, '["jt","hd","retro","chrono"]'::jsonb),
  ('00000006-0000-0000-0000-000000000003', 'Bruno Cabrera',   'seed+bruno.cabrera@worksuite.test',   'user',  'hotdesk', 'BC', true, '["jt","hd","retro","chrono"]'::jsonb),
  ('00000006-0000-0000-0000-000000000004', 'Sara Ibáñez',     'seed+sara.ibanez@worksuite.test',     'user',  'hotdesk', 'SI', true, '["jt","hd","retro","chrono"]'::jsonb),
  ('00000006-0000-0000-0000-000000000005', 'Óscar Villar',    'seed+oscar.villar@worksuite.test',    'user',  'hotdesk', 'OV', true, '["jt","hd","retro","chrono"]'::jsonb),
  ('00000006-0000-0000-0000-000000000006', 'Laura Redondo',   'seed+laura.redondo@worksuite.test',   'user',  'hotdesk', 'LR', true, '["jt","hd","retro","chrono"]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ── 2. Employee configs (1 per user, defaults: 480 min, 23 days, L-V) ──────
INSERT INTO ch_empleado_config (user_id, horas_jornada_minutos, dias_vacaciones, jornada_dias)
SELECT id, 480, 23, ARRAY['L','M','X','J','V']
FROM users
WHERE email LIKE 'seed+%@worksuite.test'
ON CONFLICT DO NOTHING;

-- ── 3. Equipos (4 teams, each with their manager) ──────────────────────────
INSERT INTO ch_equipos (id, nombre, descripcion, manager_id) VALUES
  ('10000000-0000-0000-0000-000000000001', 'Backend',  'Servicios, APIs e infraestructura',          '00000002-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002', 'Frontend', 'Interfaces web y experiencia de usuario',    '00000002-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000003', 'Mobile',   'Aplicaciones iOS y Android',                 '00000002-0000-0000-0000-000000000003'),
  ('10000000-0000-0000-0000-000000000004', 'Data',     'Analítica, ML y plataforma de datos',        '00000002-0000-0000-0000-000000000004')
ON CONFLICT (id) DO NOTHING;

-- ── 4. Miembros de equipos (manager + 6 employees per team) ────────────────
INSERT INTO ch_equipo_miembros (equipo_id, user_id) VALUES
  -- Backend
  ('10000000-0000-0000-0000-000000000001', '00000002-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000001', '00000003-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000001', '00000003-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000001', '00000003-0000-0000-0000-000000000003'),
  ('10000000-0000-0000-0000-000000000001', '00000003-0000-0000-0000-000000000004'),
  ('10000000-0000-0000-0000-000000000001', '00000003-0000-0000-0000-000000000005'),
  ('10000000-0000-0000-0000-000000000001', '00000003-0000-0000-0000-000000000006'),
  -- Frontend
  ('10000000-0000-0000-0000-000000000002', '00000002-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000002', '00000004-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002', '00000004-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000002', '00000004-0000-0000-0000-000000000003'),
  ('10000000-0000-0000-0000-000000000002', '00000004-0000-0000-0000-000000000004'),
  ('10000000-0000-0000-0000-000000000002', '00000004-0000-0000-0000-000000000005'),
  ('10000000-0000-0000-0000-000000000002', '00000004-0000-0000-0000-000000000006'),
  -- Mobile
  ('10000000-0000-0000-0000-000000000003', '00000002-0000-0000-0000-000000000003'),
  ('10000000-0000-0000-0000-000000000003', '00000005-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000003', '00000005-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000003', '00000005-0000-0000-0000-000000000003'),
  ('10000000-0000-0000-0000-000000000003', '00000005-0000-0000-0000-000000000004'),
  ('10000000-0000-0000-0000-000000000003', '00000005-0000-0000-0000-000000000005'),
  ('10000000-0000-0000-0000-000000000003', '00000005-0000-0000-0000-000000000006'),
  -- Data
  ('10000000-0000-0000-0000-000000000004', '00000002-0000-0000-0000-000000000004'),
  ('10000000-0000-0000-0000-000000000004', '00000006-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000004', '00000006-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000004', '00000006-0000-0000-0000-000000000003'),
  ('10000000-0000-0000-0000-000000000004', '00000006-0000-0000-0000-000000000004'),
  ('10000000-0000-0000-0000-000000000004', '00000006-0000-0000-0000-000000000005'),
  ('10000000-0000-0000-0000-000000000004', '00000006-0000-0000-0000-000000000006')
ON CONFLICT DO NOTHING;

-- ── 5. Fichajes (last 30 weekdays per employee) ────────────────────────────
-- Uses a generate_series and a deterministic hash per (user, date) so timings
-- vary from row to row but stay stable on re-runs. All generated fichajes
-- start as 'completo'; further UPDATEs below mark some as incomplete or
-- pending approval for UI variety.
INSERT INTO ch_fichajes (
  user_id, fecha, entrada_at, comida_ini_at, comida_fin_at, salida_at,
  minutos_trabajados, tipo, estado
)
SELECT
  u.id                                                          AS user_id,
  d::date                                                       AS fecha,
  (d::date + time '08:30' + ((abs(hashtext(u.id::text || d::text)) % 30) || ' minutes')::interval) AT TIME ZONE 'UTC' AS entrada_at,
  (d::date + time '13:00' + ((abs(hashtext(u.id::text || d::text || 'l')) % 30) || ' minutes')::interval) AT TIME ZONE 'UTC' AS comida_ini_at,
  (d::date + time '14:00' + ((abs(hashtext(u.id::text || d::text || 'l')) % 30) || ' minutes')::interval) AT TIME ZONE 'UTC' AS comida_fin_at,
  (d::date + time '17:30' + ((abs(hashtext(u.id::text || d::text || 's')) % 60) || ' minutes')::interval) AT TIME ZONE 'UTC' AS salida_at,
  -- Realistic worked minutes: ~480 ± some variation, clipped
  GREATEST(420, LEAST(540, 480 + (abs(hashtext(u.id::text || d::text || 'w')) % 60) - 30)) AS minutos_trabajados,
  'normal'                                                      AS tipo,
  'completo'                                                    AS estado
FROM users u
CROSS JOIN generate_series(
  (current_date - interval '30 days')::date,
  (current_date - interval '1 day')::date,
  '1 day'::interval
) AS d
WHERE u.email LIKE 'seed+%@worksuite.test'
  AND u.role = 'user'
  AND extract(dow FROM d) NOT IN (0, 6)  -- exclude Sunday (0) and Saturday (6)
ON CONFLICT DO NOTHING;

-- ── 6. Variations: mark some fichajes as incomplete ────────────────────────
-- Pick 5 random-ish fichajes from the last 3 days and strip their salida_at.
UPDATE ch_fichajes
SET salida_at = NULL,
    minutos_trabajados = NULL,
    estado = 'incompleto'
WHERE id IN (
  SELECT f.id
  FROM ch_fichajes f
  JOIN users u ON u.id = f.user_id
  WHERE u.email LIKE 'seed+%@worksuite.test'
    AND f.fecha >= current_date - interval '3 days'
    AND f.fecha <  current_date
    AND f.estado = 'completo'
  ORDER BY f.id
  LIMIT 5
);

-- ── 7. Variations: mark some fichajes as pending approval ──────────────────
-- Pick another 5 recent fichajes (not the incomplete ones) as pending.
UPDATE ch_fichajes
SET estado = 'pendiente_aprobacion'
WHERE id IN (
  SELECT f.id
  FROM ch_fichajes f
  JOIN users u ON u.id = f.user_id
  WHERE u.email LIKE 'seed+%@worksuite.test'
    AND f.fecha >= current_date - interval '5 days'
    AND f.fecha <  current_date - interval '3 days'
    AND f.estado = 'completo'
  ORDER BY f.id DESC
  LIMIT 5
);

-- ── 8. Bolsa de horas (hour bank) ──────────────────────────────────────────
-- Varied totals so the "Bolsa horas" stat card renders every color branch:
-- big positive, small positive, neutral, small negative, big positive.
INSERT INTO ch_bolsa_horas (user_id, fecha, minutos, concepto, ajuste_rrhh)
VALUES
  -- Big positive (+25h, +18h, +12h)
  ('00000003-0000-0000-0000-000000000003', current_date - 5,  1500, 'Horas extra proyecto A', true),
  ('00000004-0000-0000-0000-000000000001', current_date - 7,  1080, 'Guardia fin de semana', true),
  ('00000005-0000-0000-0000-000000000002', current_date - 10,  720, 'Picos de release', true),
  -- Small positive (+8h, +3h, +2h, +1h)
  ('00000003-0000-0000-0000-000000000001', current_date - 3,   480, 'Ajuste trimestral',    true),
  ('00000003-0000-0000-0000-000000000005', current_date - 8,   180, 'Hora extra puntual',   true),
  ('00000004-0000-0000-0000-000000000005', current_date - 2,   120, 'Ajuste manual',        true),
  ('00000005-0000-0000-0000-000000000001', current_date - 4,    60, 'Hora extra formación', true),
  ('00000006-0000-0000-0000-000000000002', current_date - 6,   300, 'Soporte sprint final', true),
  -- Negative (−1h, −3h, −2h)
  ('00000004-0000-0000-0000-000000000002', current_date - 9,  -180, 'Salida anticipada',    true),
  ('00000005-0000-0000-0000-000000000004', current_date - 11, -120, 'Media jornada médica', true),
  ('00000006-0000-0000-0000-000000000004', current_date - 1,   -60, 'Ajuste por error fichaje', true)
ON CONFLICT DO NOTHING;

-- ── 9. Saldo de vacaciones (per user, current year) ────────────────────────
-- Everyone gets the base 23 days. Some get extra days on top.
INSERT INTO ch_saldo_vacaciones (user_id, anyo, dias_totales, dias_extra)
SELECT id, extract(year FROM current_date)::int, 23, CASE
  WHEN email LIKE 'seed+alejandra%'  THEN 2
  WHEN email LIKE 'seed+sofia%'      THEN 3
  WHEN email LIKE 'seed+nuria%'      THEN 1
  WHEN email LIKE 'seed+martina%'    THEN 4
  WHEN email LIKE 'seed+hector%'     THEN 2
  ELSE 0
END
FROM users
WHERE email LIKE 'seed+%@worksuite.test'
ON CONFLICT DO NOTHING;

-- ── 10. Vacaciones (5 pendientes, 3 aprobadas pasadas, 2 futuras) ──────────
INSERT INTO ch_vacaciones (user_id, tipo, fecha_inicio, fecha_fin, dias_habiles, estado, motivo)
VALUES
  -- Pendientes (4)
  ('00000003-0000-0000-0000-000000000001', 'vacaciones', current_date + 14, current_date + 18, 5, 'pendiente', 'Escapada de primavera'),
  ('00000003-0000-0000-0000-000000000004', 'vacaciones', current_date + 20, current_date + 24, 5, 'pendiente', 'Boda familiar'),
  ('00000004-0000-0000-0000-000000000003', 'vacaciones', current_date + 7,  current_date + 8,  2, 'pendiente', 'Puente'),
  ('00000005-0000-0000-0000-000000000005', 'vacaciones', current_date + 30, current_date + 44, 11, 'pendiente', 'Vacaciones de verano')
ON CONFLICT DO NOTHING;

INSERT INTO ch_vacaciones (user_id, tipo, fecha_inicio, fecha_fin, dias_habiles, estado, motivo, aprobado_por, aprobado_at)
VALUES
  -- Aprobadas pasadas (3)
  ('00000004-0000-0000-0000-000000000002', 'vacaciones', current_date - 60, current_date - 55, 6, 'aprobada', 'Semana Santa', '00000002-0000-0000-0000-000000000002', now() - interval '70 days'),
  ('00000005-0000-0000-0000-000000000001', 'vacaciones', current_date - 45, current_date - 43, 3, 'aprobada', 'Días personales', '00000002-0000-0000-0000-000000000003', now() - interval '55 days'),
  ('00000006-0000-0000-0000-000000000003', 'asunto_propio', current_date - 20, current_date - 20, 1, 'aprobada', 'Gestión personal', '00000002-0000-0000-0000-000000000004', now() - interval '25 days'),
  -- Aprobadas futuras (2)
  ('00000003-0000-0000-0000-000000000005', 'vacaciones', current_date + 50, current_date + 64, 11, 'aprobada', 'Vacaciones verano', '00000002-0000-0000-0000-000000000001', now() - interval '5 days'),
  ('00000006-0000-0000-0000-000000000001', 'vacaciones', current_date + 10, current_date + 14, 5, 'aprobada', 'Viaje familiar', '00000002-0000-0000-0000-000000000004', now() - interval '2 days')
ON CONFLICT DO NOTHING;

-- ── 11. Incidencias (justificaciones históricas para la vista RRHH) ────────
-- Deliberately kept small: just enough to exercise the badges.
INSERT INTO ch_incidencias (user_id, categoria, inicio_at, fin_at, descripcion, estado)
VALUES
  ('00000003-0000-0000-0000-000000000002', 'medico', (current_date - 12) + time '09:00', (current_date - 12) + time '11:30', 'Cita médica programada',     'aprobada'),
  ('00000004-0000-0000-0000-000000000004', 'medico', (current_date - 8)  + time '15:00', (current_date - 8)  + time '17:00', 'Fisioterapia',                'aprobada'),
  ('00000005-0000-0000-0000-000000000003', 'formacion', (current_date - 4) + time '09:00', (current_date - 4) + time '13:00', 'Curso interno de seguridad', 'aprobada'),
  ('00000006-0000-0000-0000-000000000005', 'viaje',  (current_date - 2)  + time '08:00', (current_date - 2)  + time '18:00', 'Desplazamiento a cliente',    'pendiente'),
  ('00000003-0000-0000-0000-000000000006', 'asunto_propio', (current_date - 1) + time '16:00', (current_date - 1) + time '18:00', 'Gestión personal urgente', 'pendiente')
ON CONFLICT DO NOTHING;

-- ── 12. Notificaciones para el usuario real (bell del topbar) ──────────────
-- Títulos prefijados con "[SEED]" para que el cleanup las pueda borrar.
INSERT INTO ch_notificaciones (user_id, tipo, titulo, mensaje, leida, link)
VALUES
  ('dff31041-da17-41fc-bf2f-2b95504938d4', 'warning', '[SEED] Fichajes incompletos',      'Hay 5 fichajes incompletos pendientes de revisión en tu equipo.',         false, '/chrono-admin?view=empleados'),
  ('dff31041-da17-41fc-bf2f-2b95504938d4', 'action',  '[SEED] Aprobaciones pendientes',   '4 solicitudes de vacaciones esperan tu aprobación.',                       false, '/chrono-admin?view=aprobaciones'),
  ('dff31041-da17-41fc-bf2f-2b95504938d4', 'info',    '[SEED] Informe mensual disponible','El informe de horas del mes pasado está listo para descargar.',           true,  '/chrono-admin?view=informes'),
  ('dff31041-da17-41fc-bf2f-2b95504938d4', 'warning', '[SEED] Empleados con déficit',     '3 empleados tienen menos horas fichadas que las esperadas este mes.',      false, '/chrono-admin?view=jira')
ON CONFLICT DO NOTHING;

COMMIT;

-- ── Quick sanity checks (run manually after the COMMIT) ────────────────────
-- SELECT count(*) FROM users               WHERE email LIKE 'seed+%@worksuite.test'; -- 30
-- SELECT count(*) FROM ch_empleado_config  WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'seed+%@worksuite.test'); -- 30
-- SELECT count(*) FROM ch_equipos          WHERE id::text LIKE '10000000-%'; -- 4
-- SELECT count(*) FROM ch_equipo_miembros  WHERE equipo_id::text LIKE '10000000-%'; -- 28
-- SELECT count(*) FROM ch_fichajes         WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'seed+%@worksuite.test'); -- ~480
-- SELECT estado, count(*) FROM ch_fichajes WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'seed+%@worksuite.test') GROUP BY estado;
-- SELECT count(*) FROM ch_vacaciones       WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'seed+%@worksuite.test'); -- 9
-- SELECT count(*) FROM ch_notificaciones   WHERE titulo LIKE '[SEED] %'; -- 4

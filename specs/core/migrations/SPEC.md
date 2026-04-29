# Database Migrations — Core Spec

> **Snapshot spec (2026-04-29).** Documenta el orden cronológico de las migraciones SQL aplicadas a la base de datos de Supabase. Para reconstruir la app desde cero, este es el orden y el propósito de cada una. Los SQL crudos están en `supabase/migrations/`; este SPEC explica el porqué.

## Overview

WorkSuite usa migraciones SQL en `supabase/migrations/` con naming `YYYYMMDD[_NN]_descripcion.sql`. **No hay CI** que las aplique — un operador (humano o agente) las ejecuta a mano contra el proyecto Supabase prod (`enclhswdbwbgxbjykdtj.supabase.co`).

Las migraciones del repo cubren los cambios desde el 2026-04-12 en adelante. **El esquema base anterior** (tablas creadas antes de esa fecha — `users`, `worklogs`, `seats`, `seat_reservations`, `fixed_assignments`, `buildings`, `blueprints`, `dp_releases`, `dp_release_statuses`, `syn_*`, `retro_*`, etc.) se aplicó manualmente al provisionar el proyecto y **no hay un dump SQL de eso en el repo**. Para reconstrucción ver "Esquema base" más abajo.

## Cronología de migraciones (orden de aplicación)

| # | Archivo | Fecha | Para qué |
|---|---|---|---|
| 1 | `20260412_chrono_admin_rls_policies.sql` | 2026-04-12 | Policies RLS para que un user con rol `admin` / RRHH pueda leer fichajes / vacaciones / incidencias de toda la empresa. Usado por módulo `chrono-admin`. |
| 2 | `20260416_vl_email_intelligence_initial.sql` | 2026-04-16 | Crea las 3 tablas de Email Intelligence en Vector Logic: `vl_gmail_connections`, `vl_email_rules`, `vl_email_detections`. Más extensión a `vl_tasks` con `gmail_message_id`, `gmail_thread_id`, `created_by_ai`. |
| 3 | `20260418_hotdesk_booking_confirmation.sql` | 2026-04-18 | Agrega `status`, `confirmed_at`, `delegated_by` a `seat_reservations`. Crea tabla `hotdesk_config` (singleton). Agrega `is_blocked`, `blocked_reason` a `seats`. |
| 4 | `20260419_building_city_and_user_zones.sql` | 2026-04-19 | Suma columna `city` a `buildings` y columna `allowed_booking_zones` (jsonb) a `users`. |
| 5 | `20260419_concurrency_constraints.sql` | 2026-04-19 | Constraints UNIQUE / EXCLUDE en HotDesk, Deploy Planner, Environments para prevenir reservas / asignaciones duplicadas (ver `specs/core/concurrency/SPEC.md`). |
| 6 | `20260420_hotdesk_max_booking_days.sql` | 2026-04-20 | Agrega config de máximo de días futuros para reservar en HotDesk. |
| 7 | `20260423_vl_smart_kanban_v2.sql` | 2026-04-23 | Phase 5 de Vector Logic: tablas `vl_task_alarms`, `vl_user_world_cities`, `vl_user_settings`, `vl_task_type_hierarchy`. Extensiones a `vl_task_types` (`prefix`, `next_number`) y `vl_tasks` (`code`, `due_date`, `state_entered_at` con trigger, `archived_at`/`archived_by`, `parent_task_id` con `ON DELETE SET NULL`). |
| 8 | `20260424_vl_task_types_icon_color.sql` | 2026-04-24 | Agrega columna `icon_color` (text nullable) a `vl_task_types` para que cada tipo tenga color de icono propio. |
| 9 | `20260425_user_avatar_url_and_storage.sql` | 2026-04-25 | Agrega columna `avatar_url` a `users`. Provisiona bucket `user-avatars` con 7 RLS policies (1 public read + 3 owner write/update/delete + 3 admin write/update/delete). |
| 10 | `20260426_vl_kanban_boards.sql` | 2026-04-26 | Multi-Board Kanban inicial: 4 tablas (`vl_kanban_boards`, `vl_board_columns`, `vl_board_filters`, `vl_board_members`) + columna `icon` a `vl_priorities`. |
| 11 | `20260426_vl_kanban_boards_v2.sql` | 2026-04-26 | RLS recursion fix con `SECURITY DEFINER` helpers (`vl_can_view_board`, `vl_can_edit_board`, `vl_is_board_owner`). Restructura: columnas pasan de 1:1 a N:M con states via nueva tabla `vl_board_column_states`. |
| 12 | `20260426_vl_kanban_boards_is_default.sql` | 2026-04-26 | Agrega `is_default` a `vl_kanban_boards` con partial unique index `vl_kanban_boards_one_default_per_owner` (uno default por usuario). |
| 13 | `20260427_vl_states_dedupe_unique_name.sql` | 2026-04-27 | Cleanup: dedupe de `vl_states` con nombre duplicado ("Review" tenía 2 ids). Mergeo de referencias (`vl_workflow_states`, `vl_transitions`, `vl_tasks`, `vl_board_column_states`). DELETE del orphan. ADD CONSTRAINT `vl_states_name_unique UNIQUE (name)`. |
| 14 | `20260427_vl_transitions_dedupe.sql` | 2026-04-27 | Cleanup: dedupe de transitions duplicadas en Vector Logic. Borra rows con `from_state_id = to_state_id`. Conserva mínima id por `(workflow, from, to)`. ADD CONSTRAINT `vl_transitions_unique_pair UNIQUE` y `vl_transitions_no_self_loop CHECK`. |

## Esquema base (pre-2026-04-12)

Las siguientes tablas existen en prod pero **sin migración SQL en el repo**. Fueron creadas vía Supabase Studio o psql directo cuando el proyecto se provisionó. Para reconstruir, usar `pg_dump` del proyecto actual o consultar `information_schema`:

- **Auth/users:** `users`, `roles`, `sso_config`.
- **Jira Tracker:** `worklogs`, `jira_connections`.
- **HotDesk (base):** `seats`, `seat_reservations`, `fixed_assignments`, `buildings`, `blueprints`.
- **Deploy Planner:** `dp_releases`, `dp_release_statuses`, `dp_repo_groups`, `dp_subtask_config`, `dp_version_config`.
- **Environments:** `syn_environments`, `syn_reservations`, `syn_reservation_history`, `syn_reservation_statuses`, `syn_jira_filter_config`, `syn_policy`, `syn_repositories` (legacy).
- **Retro:** `retro_sessions`, `retro_actionables`, `retro_teams`, `retro_team_members`.
- **Chrono base:** `ch_fichajes`, `ch_incidencias`, `ch_vacaciones`, `ch_saldo_vacaciones`, `ch_bolsa_horas`, `ch_alarmas`, `ch_config_empresa`, `ch_equipos`, `ch_equipo_miembros`, `ch_empleado_config`.
- **Vector Logic base:** `vl_workflows`, `vl_states`, `vl_workflow_states`, `vl_transitions`, `vl_task_types`, `vl_tasks`, `vl_priorities`, `vl_ai_settings`.

Cada uno está documentado en su respectivo `specs/modules/<module>/SPEC.md` con columnas, tipos y relaciones. Los specs son la **fuente de verdad para reconstrucción** dado que las migraciones base no existen en repo.

## Cómo aplicar migraciones a un nuevo proyecto

Para reconstruir desde cero:

1. **Crear proyecto Supabase nuevo** (region `eu-west-1` para parity).
2. **Reproducir el esquema base** — opción A: ejecutar SQL derivado de los specs de cada módulo. Opción B (mejor): hacer `pg_dump` del prod actual y aplicar.
3. **Aplicar migraciones del repo en orden** — los 14 archivos arriba listados, en orden cronológico estricto (algunos dependen del estado dejado por anteriores, ej. la #14 dedupe dependía de columnas creadas en #7).
4. **Sembrar datos seed** — algunas tablas necesitan filas iniciales:
   - `dp_release_statuses` con statuses por defecto.
   - `dp_version_config` con id=1 (singleton).
   - `syn_policy` con id=1 (singleton).
   - `syn_jira_filter_config` con id=1 (singleton).
   - `ch_config_empresa` con singleton de empresa.
   - `vl_priorities` con `low / medium / high / urgent` por defecto (la app las crea on-first-use via `priorityRepo.ensureDefaults`).
5. **Configurar RLS** — la mayoría está cubierta por las migraciones; verificar que cada tabla tenga RLS habilitada.
6. **Provisionar bucket** `user-avatars` (la migración 9 lo hace si tu Supabase lo permite vía SQL).

## Cómo agregar una migración nueva

Convención del proyecto:

1. Naming: `supabase/migrations/YYYYMMDD[_NN]_descripcion.sql` (sin tildes, lowercase, snake_case).
2. Una migración = un cambio coherente. No mezclar features distintas.
3. Idempotente cuando sea posible: `IF NOT EXISTS` en `CREATE`, `IF EXISTS` en `DROP`, etc.
4. Si crea una tabla:
   - `CREATE TABLE`.
   - Indexes relevantes.
   - `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.
   - `CREATE POLICY` para SELECT / INSERT / UPDATE / DELETE.
5. Si modifica RLS existente: `DROP POLICY IF EXISTS ... CREATE POLICY ...` (las policies no se updatan, se recrean).
6. Si requiere data backfill: incluirlo en la misma migración o como migración separada `*_backfill.sql` con orden estricto.
7. Si es destructiva (DROP TABLE / COLUMN): incluir comentario explicando el porqué + plan de rollback.

DBA Agent del proyecto (CLAUDE.md) verifica las migraciones nuevas antes de aplicar.

## Aplicar via Claude Code (workflow actual)

```
mcp__claude_ai_Supabase__apply_migration({
  project_id: 'enclhswdbwbgxbjykdtj',
  name: 'descripcion_corta',
  query: '... SQL ...'
})
```

**Memoria importante:** la herramienta `apply_migration` requiere DDL. Para data-only changes usar `execute_sql`. Documentar el archivo SQL en `supabase/migrations/` después de aplicar (no antes — el agente ejecuta primero, commitea después).

## Out of scope (en este snapshot)

- Auto-CI que aplica migraciones del repo a prod.
- Migration framework con `up` / `down` automatizado (Prisma, Knex, sqlx).
- Snapshots de schema versionados (`pg_dump` periódico al repo).
- Diff tool entre repo migrations y estado prod.
- Test environment con migraciones aplicadas para CI.
- Performance regression tests al aplicar migraciones (ej. detectar índices missing).
- Backfill de datos legacy via cron job (hoy todo es manual).

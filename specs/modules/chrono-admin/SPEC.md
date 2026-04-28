# Chrono Admin (RRHH) — Module Spec

> **Snapshot spec (2026-04-28).** Documenta el estado actual del módulo a partir del código en `apps/web/src/modules/chrono-admin/`. Es la cara administrativa del control horario; los empleados usan el módulo `chrono`.

## Overview

Chrono Admin es el panel de RRHH para administrar el control horario de toda la empresa: gestión de empleados, equipos, aprobaciones de fichajes / vacaciones / incidencias, comparativa con Jira, informes y configuración de jornada.

Todo lo que aquí ocurre afecta `ch_*` tablas — las mismas que el empleado lee desde `chrono`. La diferencia es el rol: este módulo solo se renderiza para usuarios con rol `admin` o equivalente RRHH.

### Quién lo usa
Personas con rol RRHH / admin del workspace. Acceden vía `/chrono-admin` (URL dedicada). Cada vista tiene RLS que valida el rol antes de devolver data multi-usuario; los empleados sin permiso no ven nada de otros.

## Sub-views

URL: `/chrono-admin`. La nav lateral expone 7 secciones:

| Tab | Componente | Para qué |
|---|---|---|
| `dashboard` | `DashboardAdminView` | KPIs globales: empleados activos, fichajes abiertos hoy, pendientes de aprobación, vacaciones pendientes, alertas. |
| `empleados` | `EmpleadosView` | Tabla de empleados con resumen (horas mes, saldo bolsa, vacaciones disfrutadas, días pendientes). Click → `FichaEmpleadoDrawer` con datos sensibles encriptados (DNI, IBAN, contrato). |
| `equipos` | `EquiposView` (+ `EquipoHoyView`, `FichajesEquipoView`) | CRUD de equipos, asignación de manager, lista de miembros, vista del día por equipo, vista de fichajes por equipo en rango. |
| `aprobaciones` | `AprobacionesView` (+ `GestionVacacionesView`) | Cola de fichajes/incidencias/vacaciones en `pendiente_aprobacion`. Aprobar / rechazar / pedir info. Marca al aprobador y timestamp. |
| `jira` | `JiraView` | Comparativa horas Jira (worklogs) vs fichajes Chrono por empleado, mes y rango. Detecta deltas para auditoría. |
| `informes` | `InformesEmpresaView` | Informes con CSV export y gráficos: horas por empleado, por equipo, distribución de tipos de fichaje, vacaciones consumidas, etc. |
| `config` | `ConfigEmpresaSection` (en `sections/`) | Edición global de `ch_config_empresa`: jornada, tolerancias, geo whitelist, IPs permitidas, slack webhook, aviso Jira mensual. |

## Actions del usuario (RRHH)

- **Aprobar / rechazar fichajes** que llegaron a `pendiente_aprobacion` por geofence, IP fuera de whitelist, pausa comida fuera de rango, o por configuración global. Aprobación cambia `estado='aprobado'`, registra `aprobado_por` y `aprobado_at`. Rechazo permite añadir `rechazado_razon`.
- **Aprobar / rechazar vacaciones e incidencias** del mismo modo.
- **Crear / editar / archivar equipos.** Cada equipo tiene un manager (referencia a `users.id`) y N miembros (`ch_equipo_miembros`). Opcional: `allowed_booking_zones` (texto plano, lista CSV) que cruza con HotDesk.
- **Asignar miembros a equipos.** N:M via tabla `ch_equipo_miembros`.
- **Configurar empleado individual.** `ch_empleado_config` permite override por user de la jornada estándar (horas distintas, días de jornada distintos al lunes-viernes, días de vacaciones distintos).
- **Edición de saldo de vacaciones.** RRHH puede aumentar `dias_extra` en `ch_saldo_vacaciones` para un user en un año concreto (bonus por antigüedad, etc.).
- **Ajuste manual de bolsa de horas.** Crea row en `ch_bolsa_horas` con `ajuste_rrhh=true` y `ajustado_por=auth.uid()`. Útil para corregir errores históricos.
- **Configuración global de empresa.** Edita el singleton `ch_config_empresa`.
- **Export CSV** de informes para envío externo / contabilidad.

## Reglas y límites

- **Solo rol admin / RRHH.** El frontend valida `currentUser.role`; las RLS en DB son la red de seguridad real (policies separadas para `chrono-admin`, ver `20260412_chrono_admin_rls_policies.sql`).
- **Override por empleado.** Si existe row en `ch_empleado_config` para un user, sus parámetros de jornada / vacaciones overridean los globales de `ch_config_empresa`.
- **Manager de equipo.** No tiene permisos administrativos por sí solo — sigue siendo un empleado normal salvo que también tenga rol admin. La FK `manager_id` es informativa para los reportes.
- **Aprobaciones idempotentes.** Aprobar dos veces no duplica; el frontend deshabilita los botones si `estado != 'pendiente_aprobacion'`.
- **Aviso Jira automático.** Si `aviso_jira_auto=true`, el día `aviso_jira_dia_mes` del mes se dispara un cronjob que avisa por Slack a quienes tengan delta Jira-vs-Chrono > X.

## Conexiones

- **Supabase** — todas las tablas `ch_*` con RLS escrita en `20260412_chrono_admin_rls_policies.sql`. Adicionalmente lee `users` (lista de empleados) y `worklogs` (Jira) para `JiraView`.
- **Jira (vía worklogs en DB)** — `JiraView` no llama directo a Jira; usa la tabla `worklogs` que el módulo `jira-tracker` mantiene actualizada.
- **HotDesk** — `ch_equipos.allowed_booking_zones` se referencia en HotDesk para filtrar en qué zona puede reservar cada equipo.
- **Slack** — `slack_webhook_url` en `ch_config_empresa` se usa para alertas / avisos.

## Modelo de datos

### Comparte con `chrono` (no se redefine acá)
`ch_fichajes`, `ch_incidencias`, `ch_vacaciones`, `ch_saldo_vacaciones`, `ch_bolsa_horas`, `ch_alarmas`, `ch_config_empresa` — definidos en `specs/modules/chrono/SPEC.md`.

### Tablas propias del admin

#### `ch_equipos`
Un row por equipo. Campos: `id` (uuid), `nombre`, `descripcion`, `manager_id` (FK → `users.id`), `allowed_booking_zones` (text, CSV), `created_at`. No tiene `updated_at` — los renombres son raros y no se trackea.

#### `ch_equipo_miembros`
Junction `equipo ↔ user`. Constraint UNIQUE`(equipo_id, user_id)` (en frontend; verificar). Borrar un equipo cascade-borra los miembros.

#### `ch_empleado_config`
Un row por usuario que tenga override personalizado (no todos los users tienen una row). Campos: `user_id`, `horas_jornada_minutos`, `dias_vacaciones`, `jornada_dias` (text[] con días de la semana, ej. `['L','M','X','J','V']`), `created_at`, `updated_at`.

### Relaciones en lenguaje plano
Un equipo tiene un manager (un usuario) y muchos miembros (usuarios). Un usuario puede pertenecer a muchos equipos. Cada usuario tiene cero o una config personalizada en `ch_empleado_config`. La empresa tiene una sola row de config global.

## Estructura del módulo

```
apps/web/src/modules/chrono-admin/
├── container.ts
├── domain/
│   ├── entities/
│   │   ├── ConfigEmpresa.ts
│   │   ├── EmpleadoConfig.ts
│   │   ├── EmpleadoResumen.ts
│   │   ├── Equipo.ts
│   │   ├── FichaEmpleado.ts
│   │   └── JiraResumen.ts
│   └── ports/                # repos por entidad
├── infra/
│   └── supabase/             # adapters
├── shared/
│   └── adminColors.ts        # CHRONO_ADMIN_COLORS tokens
└── ui/
    ├── ChronoAdminPage.tsx   # shell con sidebar 7 tabs
    ├── sections/
    │   └── ChronoConfigSection.tsx   # también renderizado en /admin general
    └── views/
        ├── DashboardAdminView.tsx
        ├── EmpleadosView.tsx
        ├── FichaEmpleadoDrawer.tsx
        ├── EquiposView.tsx
        ├── EquipoHoyView.tsx
        ├── FichajesEquipoView.tsx
        ├── AprobacionesView.tsx
        ├── GestionVacacionesView.tsx
        ├── JiraView.tsx
        └── InformesEmpresaView.tsx
```

## Out of scope (en este snapshot)

- Onboarding / offboarding de empleados (creación de cuenta, desactivación) — se hace desde `/admin` general.
- Importación masiva CSV — no implementado.
- Workflow de bajas médicas con adjuntos validados por médico — la `Incidencia` admite `adjunto_url` pero no hay validación.
- Aprobación condicional / multi-step — actualmente es de un solo paso (RRHH aprueba o rechaza).
- Notificaciones push reales al empleado tras aprobación / rechazo — sólo se setea el estado.

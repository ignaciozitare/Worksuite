# Chrono — Module Spec

> **Snapshot spec (2026-04-28).** Documenta el estado actual del módulo a partir del código en `apps/web/src/modules/chrono/`. No describe nuevas features sino lo que ya existe.

## Overview

Chrono es la herramienta de control horario del usuario (autoservicio). Cada empleado registra entrada / pausa de comida / salida desde un dashboard, consulta sus registros históricos, gestiona sus vacaciones y configura alarmas de fichaje.

La cara administrativa (RRHH: aprobaciones, equipos, informes empresa) vive en un módulo separado: `chrono-admin`.

### Quién lo usa
Cualquier usuario con cuenta WorkSuite. Cada user solo ve y modifica sus propios fichajes / vacaciones / alarmas. La empresa configura globalmente los parámetros de jornada (hora estándar, tolerancias, geo whitelist, etc.) desde `chrono-admin`.

## Sub-views

URL base: `/chrono`. Tab actual sincronizada en query string `?view=` para deep links.

| Tab | Componente | Para qué |
|---|---|---|
| `dashboard` | `DashboardView` | Botones de fichaje (entrada/comida/salida), estado del día actual, resumen del mes en curso, marcador de bolsa de horas, geolocalización. |
| `registros` | `RegistrosView` | Histórico de fichajes con filtro por mes y categoría. |
| `incompletos` | `IncompletosView` | Lista de fichajes con `estado='incompleto'` (faltan timestamps). El user los completa o justifica. |
| `vacaciones` | `VacacionesView` | Solicita vacaciones / asuntos propios / bajas, ve su saldo, ve histórico de solicitudes y estado. |
| `alarmas` | `AlarmasView` | CRUD de alarmas push/email/slack para recordatorios de fichaje. |
| `informes` | placeholder | Vista pendiente — render `<InformesPlaceholder />` por ahora. |

## Actions del usuario

- **Fichar entrada / inicio comida / fin comida / salida.** Cada acción registra un timestamp en el `Fichaje` del día. Si la empresa requiere geo, se lee posición + IP + device en cada fichaje.
- **Cambiar tipo de fichaje** entre `normal | teletrabajo | medico | formacion | viaje | asunto_propio` antes de cerrar el día.
- **Justificar un incompleto.** Adjunta texto / archivo a un fichaje sin timestamps completos.
- **Solicitar vacaciones.** El user pide días de un tipo (`vacaciones | asunto_propio | baja_medica | maternidad | paternidad`) entre dos fechas. Calcula `diasHabiles` automáticamente.
- **CRUD alarmas** con días de la semana, hora, canal (push/email/slack), tipo (entrada/comida/salida/recordatorio).

Acciones de aprobación (rechazar / aprobar fichaje, vacación) **NO** viven en este módulo — están en `chrono-admin`.

## Reglas y límites

- **Saldo vacaciones** = `dias_totales + dias_extra − días disfrutados − días aprobados futuros`. Si saldo < días pedidos, la solicitud se rechaza en frontend antes de enviar.
- **Geofence opcional.** Si `requiere_geo=true` en `ch_config_empresa`, fichaje sin geo se marca `incompleto`.
- **IP whitelist.** Si la empresa setea `ip_whitelist` en config, fichajes desde IPs fuera de la lista se marcan `incompleto` o se rechazan según `requiere_aprobacion_fichaje`.
- **Bolsa de horas** = sumatoria de `minutos` registrados en `ch_bolsa_horas`. Refleja extras o ajustes manuales hechos por RRHH.
- **Pausa comida** debe estar entre `pausa_comida_min_minutos` y `pausa_comida_max_minutos` configurados a nivel empresa. Fuera de ese rango el fichaje queda en `pendiente_aprobacion`.

## Conexiones

- **Supabase** — tablas `ch_*` con RLS por `user_id`. Migración inicial documentada en `supabase/migrations/20260412_chrono_admin_rls_policies.sql` (sólo policies; el DDL fue aplicado a prod previamente, por eso no hay migración propia del esquema en repo).
- **Nominatim** (OpenStreetMap) — `NominatimGeoLocationService` resuelve coordenadas a dirección legible para mostrar en el dashboard.
- **Slack webhook** — opcional, configurable por empresa; las alarmas push pueden enviarse al webhook.
- **chrono-admin** — el spec de ese módulo (separado) describe el flujo de aprobación que afecta `estado` de fichajes / vacaciones / incidencias.

## Modelo de datos

Todas las tablas viven en el schema `public` de Supabase, con RLS habilitada y policies que limitan a `auth.uid() = user_id`.

### `ch_fichajes`
Un row por día por usuario. Guarda los 4 timestamps (entrada, inicio comida, fin comida, salida), `minutos_trabajados` calculado, `tipo`, `estado`, `justificacion`, `geo_entrada`/`geo_salida` (jsonb con lat/lng/ip/device) y trazabilidad de aprobación (`aprobado_por`, `aprobado_at`, `rechazado_razon`).

`estado` ∈ `abierto | completo | incompleto | pendiente_aprobacion | aprobado | rechazado`.
`tipo` ∈ `normal | teletrabajo | medico | formacion | viaje | asunto_propio`.

### `ch_incidencias`
Sub-eventos dentro de un fichaje. Guarda `categoria` (`medico | comida | gestion | formacion | teletrabajo | viaje`), rango horario (`inicio_at`, `fin_at`), descripción y adjunto opcional. RRHH aprueba o rechaza.

### `ch_vacaciones`
Solicitud de vacaciones / asunto propio / bajas. `tipo` ∈ `vacaciones | asunto_propio | baja_medica | maternidad | paternidad`. `estado` ∈ `pendiente | aprobado | rechazado | cancelado`. Tracker de aprobación incluido.

### `ch_saldo_vacaciones`
Una row por usuario por año. `dias_totales` (base de empresa), `dias_extra` (bonus manual de RRHH). El saldo neto se calcula en frontend restando lo aprobado/disfrutado.

### `ch_bolsa_horas`
Movimientos de la bolsa de horas. Cada row tiene `fecha`, `minutos` (positivo o negativo), `concepto`, `fichaje_id` opcional para enlace, `ajuste_rrhh` (true cuando lo introduce RRHH a mano), `ajustado_por`.

### `ch_alarmas`
Alarmas configurables por usuario. `hora` (time), `dias` (array de días de la semana), `tipo` (`entrada | comida_ini | comida_fin | salida | recordatorio`), `canales` (jsonb `{push, email, slack}`), `sonido`, `activa`.

### `ch_config_empresa`
Singleton (una sola fila). Configuración global: `horas_jornada_minutos`, `pausa_comida_min/max_minutos`, `tolerancia_entrada_minutos`, `dias_vacaciones_base`, `requiere_geo`, `geo_whitelist` (jsonb), `ip_whitelist` (text[]), `requiere_aprobacion_fichaje`, `slack_webhook_url`, `aviso_jira_auto`, `aviso_jira_dia_mes`, `updated_at`, `updated_by`.

### Relaciones en lenguaje plano
Un usuario tiene muchos fichajes (uno por día). Un fichaje tiene cero o más incidencias. El usuario tiene una sola fila por año en saldo_vacaciones, y muchas filas en bolsa_horas (cada movimiento). Vacaciones e incidencias siguen un workflow `pendiente → aprobado/rechazado/cancelado` cerrado por RRHH desde `chrono-admin`. La empresa tiene una sola fila de config.

## Estructura del módulo

```
apps/web/src/modules/chrono/
├── container.ts              # wiring de repos + geoService
├── domain/
│   ├── entities/
│   │   ├── Fichaje.ts
│   │   ├── Incidencia.ts
│   │   ├── Vacacion.ts
│   │   ├── BolsaHoras.ts
│   │   └── Alarma.ts
│   └── ports/
│       ├── FichajeRepository.ts
│       ├── IncidenciaRepository.ts
│       ├── VacacionRepository.ts
│       ├── BolsaHorasRepository.ts
│       ├── AlarmaRepository.ts
│       ├── ConfigEmpresaRepository.ts
│       └── GeoLocationService.ts
├── infra/
│   ├── supabase/             # adapters de cada repo
│   └── NominatimGeoLocationService.ts
├── shared/
│   └── theme.ts              # CHRONO_THEME tokens
└── ui/
    ├── ChronoPage.tsx        # shell con sidebar + router por tab
    ├── views/
    │   ├── DashboardView.tsx
    │   ├── RegistrosView.tsx
    │   ├── IncompletosView.tsx
    │   ├── VacacionesView.tsx
    │   └── AlarmasView.tsx
    └── components/
```

## Out of scope (en este snapshot)

- Aprobaciones de fichajes / vacaciones — viven en `chrono-admin`.
- Informes de empresa — placeholder hasta que se diseñe.
- Edición masiva de fichajes — no existe.
- Integración con calendario externo (Google Calendar, Outlook) — no implementada.
- Push notifications a nivel sistema operativo — el campo `canales.push` está pero el envío real no está conectado.

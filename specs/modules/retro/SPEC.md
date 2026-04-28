# Retro (RetroBoard) — Module Spec

> **Snapshot spec (2026-04-28).** Documenta el estado actual del módulo a partir del código en `apps/web/src/modules/retro/`. Componente principal: `RetroBoard.tsx`.

## Overview

RetroBoard es la herramienta de retrospectivas del workspace. Cada sesión de retro pasa por fases temporizadas (creating → grouping → voting → discussion → summary), donde el equipo aporta cards de feedback en categorías predefinidas, las agrupa, las vota, las discute y al final extrae accionables que se trackean en un kanban hasta cerrarse.

### Quién lo usa
Cualquier miembro de un Retro Team. El owner del team ("Mod. Owner") y el "Mod. Temporal" tienen permisos para mover la sesión entre fases y ajustar timers; el resto son participantes que aportan cards y votan.

## Sub-views

URL: `/retro`. Una sola vista (`RetroBoard.tsx`) que cambia su layout según la fase activa de la sesión.

| Fase | Para qué |
|---|---|
| `lobby` | Sala de espera. Configurar nombre de retro, equipo, tiempo por fase, votos por usuario. Ver accionables abiertas de la última retro del equipo. |
| `creating` | Cada participante escribe sus cards privadas en categorías (positivo / negativo / acción / pregunta — definidas en `RC` constant). |
| `grouping` | Las cards se publican y los moderadores las agrupan visualmente arrastrando una sobre otra. |
| `voting` | Cada usuario reparte sus votos (default `votesPerUser` configurable) entre cards / grupos. |
| `discussion` | Los grupos más votados se discuten en orden. |
| `summary` | Resumen final + extracción de accionables al kanban. |

Hay además un kanban persistente de **accionables** post-retro (`KANBAN_COLS` columns: open / in progress / done). Las accionables siguen visibles fuera de cualquier retro activa para tracking continuo.

## Roles

- **Admin** (rol del workspace): control total sobre cualquier retro.
- **Mod. Owner**: dueño del equipo, control sobre las retros del equipo.
- **Mod. Temporal**: moderador asignado para la sesión activa.
- **Member** (participante): aporta cards, vota, no controla fases ni timer.

Colores de rol cableados como string literals en `RetroBoard.tsx:42` (`ROLE_COLORS`) — pendiente migrar a CSS vars.

## Actions del usuario

- **Crear retro.** Setear nombre, elegir team, configurar tiempos por fase y votos por user. Al iniciar, todos los miembros del team reciben acceso.
- **Aportar cards** en `creating` (privadas hasta el cambio de fase).
- **Agrupar cards** drag-and-drop en `grouping` (mod-only o todos según config).
- **Votar** en `voting` — votos con tope `votesPerUser`.
- **Avanzar de fase** (mod-only). Timer corre por fase si la fase está en `TIMED` (creating, grouping, voting, discussion).
- **Crear accionable** desde una card durante summary o discussion.
- **CRUD accionables del kanban** — text, assignee, due_date, priority, status (open / in_progress / done), sort_order.
- **Reabrir** accionables de retros pasadas — vuelven a la columna open.
- **Histórico** de retros del team con sus stats finales.

## Reglas y límites

- **MAX_TITLE** = 50 caracteres en nombre de retro.
- **TIMED phases** corren countdown automático según `phase_times[fase]` (minutos). Pueden ajustarse en lobby.
- **Votos** se limitan al `votesPerUser` global; el frontend impide superarlo.
- **Cards en creating** son privadas hasta que el moderador avanza a grouping.
- **Solo el owner del team** puede borrar el team.
- **Stats** se calculan al cerrar (`closed_at`) y se persisten en `retro_sessions.stats` (jsonb): cards por categoría, votos totales, accionables generadas, etc.

## Conexiones

- **Supabase** — tablas `retro_*` con RLS por team (los miembros ven sus retros).
- **`@worksuite/jira-service`** — opcional, para asociar accionables a tickets Jira.
- **Admin Panel** — `AdminRetroTeamsShell.tsx` en `apps/web/src/shared/admin/` para CRUD de teams + miembros (compartido con la sección de Roles & Perms).

## Modelo de datos

### `retro_sessions`
Una row por retro. Campos: `id` (uuid), `team_id` (FK), `name`, `status` (`active | closed`), `phase` (enum de las 6 fases), `votes_per_user`, `phase_times` (jsonb con tiempos por fase), `created_by`, `created_at`, `closed_at`, `stats` (jsonb con métricas finales).

**Cards** se persisten dentro de `stats.cards_data` cuando la retro se cierra (no hay tabla `retro_cards` separada — diseño intencional, las cards solo importan en agregado al final).

### `retro_actionables`
Una row por accionable extraída de una retro. Campos: `id`, `session_id` (FK), `card_id`, `text`, `assignee` (text — nombre, no FK por ahora), `due_date`, `status` (`open | in_progress | done`), `priority` (text legacy), `sort_order`, `team_id`, `retro_name` (snapshot del nombre de la retro origen), `created_at`. Sin `updated_at` por diseño — los cambios menores (status, drag-reorder) no requieren auditoría.

### `retro_teams`
Equipo de retro. Campos: `id`, `name`, `color`, `owner_id`, `created_at`.

### `retro_team_members`
Miembros del team (N:M users ↔ teams). PK compuesto `(team_id, user_id)` (no tiene `id` propio). Campos: `role` (text — `admin | owner | temporal | member`), `joined_at`.

### Relaciones en lenguaje plano
Un team tiene un owner y muchos miembros. Un team tiene muchas sesiones de retro a lo largo del tiempo. Cada sesión genera N accionables que se referencian a la session_id y al team_id. El `team_id` desnormalizado en accionables permite consultarlas sin pasar por la sesión (útil para el kanban global).

## Estructura del módulo

```
apps/web/src/modules/retro/
├── container.ts
├── domain/
│   ├── entities/
│   │   └── RetroSession.ts
│   └── ports/
├── infra/
│   └── supabase/
└── ui/
    └── RetroBoard.tsx           # componente único, ~2500 líneas
                                 # (refactorizar a sub-componentes por fase
                                 # es follow-up conocido)
```

## Out of scope (en este snapshot)

- Realtime sincronización entre participantes (websockets / Supabase realtime) — actualmente cada participante ve un snapshot al entrar a la fase, refresh manual.
- Plantillas reutilizables de retros (mismo formato Sprint Retro / 4Ls / Mad-Sad-Glad).
- Export a PDF / Markdown del summary.
- Integración con Vector Logic — convertir accionables en tasks del Smart Kanban.
- Anonimización opcional de cards en `creating`.
- Métricas históricas tipo "cuántas accionables del último retro se cerraron" (existe en `retro_sessions.stats` para una sola retro pero no hay vista cruzando varias).
- `RetroBoard.tsx` está como un solo file gigante — splitting por fase es follow-up. La refactorización de fontSize literales a `--fs-*` ya se hizo durante el sweep de typography del 2026-04-27.

# SPEC: Migración de componentes a @worksuite/ui

_Confirmada: 2026-04-21_

## Tipo
Core change — refactor de UI

## Objetivo
Eliminar componentes duplicados en los módulos, reemplazándolos por los compartidos de `@worksuite/ui` (Btn, Badge, Chip, Modal, Avatar, StatBox).

## Orden de migración

| Fase | Módulo | Componentes a reemplazar | Archivos |
|------|--------|--------------------------|----------|
| 1 | retro | RBtn → Btn, RPriBadge/RRoleBadge → Badge | RetroBoard.tsx |
| 2 | deploy-planner | RepoChip → Chip | atoms.tsx |
| 3 | vector-logic | Avatar → Avatar, ConfidenceBadge → Badge | UserPicker.tsx, AIDetectionsView.tsx |
| 4 | chrono-admin | Stat → StatBox | InformesEmpresaView.tsx |
| 5 | chrono | Modal local → Modal | DashboardView.tsx |
| 6 | hotdesk | Modal overlay → Modal wrapper | HDReserveModal.tsx |
| 7 | jira-tracker | Modal patterns inline | ExportConfigModal.tsx, LogWorklogModal.tsx |
| 8 | environments | Modal inline divs | AdminEnvironments.tsx, EnvironmentsView.tsx |

## Fuera de scope
- ChronoStatCard, ReleaseCard, ToolButton, StatusDot, TaskDetailModal
- Módulos auth y profile (mínimos)

## Reglas
- Cada fase se verifica visualmente antes de pasar a la siguiente
- Si un componente compartido necesita un prop extra, se agrega a packages/ui
- No se cambia funcionalidad, solo implementación visual
- Se mantiene el look & feel actual exacto

## Modelo de datos
> No aplica — no hay cambios de base de datos.

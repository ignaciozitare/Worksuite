# SPEC: Migración de componentes a @worksuite/ui

_Confirmada: 2026-04-21_

## Tipo
Core change — refactor de UI

## Fase 1 (completada 2026-04-21)

| Módulo | Componentes migrados | Archivos |
|--------|---------------------|----------|
| retro | RBtn → Btn, RPriBadge/RRoleBadge → Badge | RetroBoard.tsx |
| vector-logic | Avatar local → Avatar | UserPicker.tsx |
| chrono | Modal local → Modal | DashboardView.tsx |
| jira-tracker | Modal inline → Modal | ExportConfigModal.tsx |
| environments | Modal → Modal, ConfirmDialog → ConfirmModal | EnvironmentsView.tsx, AdminEnvironments.tsx |

## Fase 2

### Extensiones a packages/ui

| Componente | Cambio |
|-----------|--------|
| StatBox | Agregar props `style` y `className` |
| Badge | Agregar prop `variant` ('pill' / 'compact') |
| Chip | Agregar prop `style` para overrides |

### Migraciones

| Paso | Módulo | Componente local → compartido | Archivo |
|------|--------|-------------------------------|---------|
| 1 | chrono-admin | Stat → StatBox | InformesEmpresaView.tsx |
| 2 | vector-logic | ConfidenceBadge → Badge compact | AIDetectionsView.tsx |
| 3 | deploy-planner | RepoChip → Chip con style | atoms.tsx |
| 4 | jira-tracker | LogWorklogModal → Modal + Btn | LogWorklogModal.tsx |

## Fuera de scope
- HDReserveModal (hotdesk) — brecha demasiado grande
- ChronoStatCard, ReleaseCard, ToolButton, StatusDot, TaskDetailModal
- Módulos auth y profile

## Reglas
- No se cambia funcionalidad, solo implementación visual
- Se mantiene el look & feel actual exacto
- Se trabaja en rama separada
- Se verifica visualmente antes de mergear

## Modelo de datos
> No aplica — no hay cambios de base de datos.

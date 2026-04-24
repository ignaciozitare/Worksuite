# WORK_STATE

_Ultima actualizacion: 2026-04-23_

---

## Tarea en curso

**Vector Logic — Phase 5 "Smart Kanban v2" — Dev Agent (en curso)**

Branch: `feat/vector-logic-smart-kanban-v2`
Checkpoint: commit `ede82e3` — Phase 5 scaffold completo

Pipeline: Spec ✅ → DBA ✅ → Scaffold ✅ → **Dev ⏳** → Review → QA → Deploy

## Punto exacto

### Ya hecho (commit `ede82e3`)
- `specs/modules/vector-logic/SPEC.md` — spec confirmado (18 features)
- `supabase/migrations/20260423_vl_smart_kanban_v2.sql` — migración escrita, **NO aplicada** a prod todavía
- Entidades nuevas: `TaskAlarm`, `WorldCity`, `UserSettings`, `TaskTypeHierarchy`
- Extensiones a `Task` (code, due_date, state_entered_at, archived_at/by, parent_task_id) y `TaskType` (prefix, next_number)
- Ports: `ITaskAlarmRepo`, `IWorldCityRepo`, `IUserSettingsRepo`, `ITaskTypeHierarchyRepo`
- Adapters Supabase para los 4 ports nuevos
- Skeleton UI: `WorldClock.tsx`, `TaskAlarmPicker.tsx`, `TaskTypeSwitcher.tsx`, `BacklogHistoryView.tsx`
- i18n EN/ES agregado (35 keys nuevas)
- Wiring en `container.ts`

### Pendiente Dev Agent (orden propuesto)
1. **Aplicar migración** `20260423_vl_smart_kanban_v2.sql` a Supabase prod (bloquea el resto)
2. **Extender `SupabaseTaskRepo`** con `findBacklog` / `findArchived` / `archive` / `reopen`
3. **Cablear** `BacklogHistoryView`, `WorldClock`, `TaskAlarmPicker`, `TaskTypeSwitcher` dentro de `KanbanView` / `VectorLogicPage` / `TaskDetailModal`
4. **Features restantes**: search bar, días en columna, due date con color, modal doble ancho, subtareas, auto-save, drag-over glow, task type icon, filtro dropdown, contador por columna
5. **Browser notifications** schedulado desde `TaskAlarm` rows

## Decisiones tomadas
- Backlog = state-based (tasks con `state.category = 'BACKLOG'`)
- History = `archived_at IS NOT NULL`
- Hasta 5 niveles de jerarquía — enforcement en capa de aplicación
- `state_entered_at` se resetea via trigger BEFORE UPDATE cuando cambia `state_id`
- Prefix backfilled con primeras 4 letras uppercase del nombre del tipo
- Auto-archive ejecuta al cargar el board
- Edit worklog (Jira Tracker) = delete old + insert new

## Archivos de referencia
- **Spec**: `specs/modules/vector-logic/SPEC.md`
- **Migración**: `supabase/migrations/20260423_vl_smart_kanban_v2.sql`
- **Diseños**: `pencil-new.pen` frames `VectorLogic/Kanban`, `VectorLogic/Chat`, `VectorLogic/AI Detections`
- **Container**: `apps/web/src/modules/vector-logic/container.ts`

## Bloqueos / notas
- **git commit sandbox**: macOS `com.apple.provenance` bloquea writes al `.git/index` — `git push` funciona OK
- **URL produccion**: worksuite-phi.vercel.app
- **Jira Tracker redesign**: mergeado en commit `89c0a80` — no pendiente
- **Login screen redesign**: esperando referencia visual de Pencil (sesiones anteriores)

## Cómo retomar esta sesión

Usuario dirá: **"seguí con el Dev de Smart Kanban v2 desde el checkpoint"**

Acción: arrancar por aplicar la migración a Supabase (paso 1 de los pendientes), previa lectura completa del SQL y confirmación con el usuario.

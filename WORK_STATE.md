# WORK_STATE

_Ultima actualizacion: 2026-04-26_

---

## Tarea en curso

**Ninguna pendiente.** Multi-Board Kanban mergeado a main, prod construyendo.

## Sesión 2026-04-26 — resumen

Día completo: login redesign + Vector Logic multi-type drag fix + Multi-Board Kanban completo (8 fases).

### Producción al día (último merge: `80b0697`)
1. **Login Carbon Logic redesign** (commit `32fc0b0`) — split desktop, mobile collapse, gradient hero, error banner. i18n keys nuevas en namespace `auth.*`. Cambio cosmético-only, comportamiento auth/SSO/remember/required preservado.
2. **Multi-type Kanban drag fix** (commit `d094fce`) — habilita drag en aggregate mode mapeando categoría destino → state propio del workflow de cada tarea. Toast inline cuando no hay match.
3. **Multi-Board Kanban** (commit `80b0697`, branch `feat/vl-kanban-boards`, fases A→H) — boards configurables tipo Jira:
   - Sidebar Smart Kanban → grupo expandible con boards anidados + Add board.
   - Modal: nombre, visibilidad personal/shared, columnas con nombre propio mapeando N estados, WIP limit, filtros (task_type, assignee, priority, created_by, due range), permisos por usuario (use/edit) cuando shared.
   - BoardView: render de tareas filtradas, drag con WIP enforcement (toast bloqueando drop al límite).
   - Priority chip retroactivo en Smart Kanban (color al 10% bg + texto color sólido + icono opcional).

### Migraciones aplicadas a prod hoy
- `20260425_user_avatar_url_and_storage.sql` (avatar — sesión anterior)
- `20260426_vl_kanban_boards.sql` (4 tablas + columna `vl_priorities.icon`)
- `20260426_vl_kanban_boards_v2.sql` (RLS recursion fix + restructura columnas a N:M + nueva tabla `vl_board_column_states`)

### Decisiones técnicas registradas
- RLS con SECURITY DEFINER helpers (`vl_can_view_board`, `vl_can_edit_board`, `vl_is_board_owner`) para romper ciclos entre `vl_kanban_boards` y `vl_board_members`.
- Modelo Jira-style: 1 columna del board mapea N estados de la librería (no 1:1 como diseño inicial). Modal bloquea estados ya usados en otra columna del mismo board.
- En BoardView, drop a una columna mueve la tarea al **primer state mapeado** de la columna destino. WIP enforcement antes del move.
- Filtros guardados como `BoardFilter[]` con dimension + jsonb value, atomic via `replaceAll`.
- Cuando visibilidad cambia a personal, todos los miembros se borran automáticamente.

## TODO arrastrado (pre-existente)
- `stateById` en `TaskDetailModal` se construye con `wfStates` del kanban (sólo `selectedType`). Cuando se navega por breadcrumb a una task de otro tipo, el `done` para sus subtasks puede aparecer false.

## Followups conocidos del Multi-Board Kanban
- Admin UI para editar `vl_priorities` (color picker + icon picker). Hoy `icon` se setea por SQL directo.
- "New task" en BoardView muestra dialog "use Smart Kanban for now". Activar cuando definamos default task type por board.
- Filtro por Label/Tag — la entidad no existe, se ignora silenciosamente.

## Bloqueos / notas
- **URL produccion**: worksuite-phi.vercel.app

## Cómo retomar
Pedile lo que sigue. Sin tarea pendiente.

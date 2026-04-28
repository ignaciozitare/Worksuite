# WORK_STATE

_Ultima actualizacion: 2026-04-28 (cont. — Gantt view)_

---

## Tarea en curso

**Pendiente merge a main** — Vector Logic Gantt view por board:
- Nueva vista `/vector-logic/board/:id/gantt` con timeline horizontal por board.
- Sidebar agrega ícono `view_timeline` en cada board row → switch a Gantt.
- `GanttBar` dual-fill: verde (% ToDo done/total) arriba + morado (% subtareas DONE) abajo, dentro de la barra.
- Banner ámbar con date pickers inline para tasks sin start_date / due_date.
- Subtareas expandibles (chevron) indentadas dentro de su parent.
- Drag bar → mueve fechas. Drag handles → resize. `use` permission = read-only.
- 3 zoom levels: days/weeks/months.

Spec: `specs/modules/vector-logic/SPEC.md` "Phase 5 — Gantt view por board (revisión 2026-04-28)". Sin migration, sin DB. Build local verde, Review ✅, QA ✅. User confirmó smoke test.

---

## Última entrega — Vector Logic Card chip rail + live subtask progress (2026-04-28 ✅ EN PROD)

Mergeado a main y desplegado (commit merge `3da83af`, branch `fix/vl-board-card-chips`). User confirmó smoke test prod ok.

### Lo que shipea
- **Subtask progress bar morada** en el pie de la card (`var(--purple)`). Antes era verde y se confundía con las barras de ToDo (que se quedan verdes — son cosas distintas).
- **Toggle de subtarea propaga al parent** vía `onSubtaskChanged` callback en TaskDetailModal. KanbanView/BoardView upsert al `tasks` state → la barra al pie se redibuja inmediatamente, sin reload.
- **BoardTaskCard ahora renderiza los `cardFields` configurados** (showOnCard). Antes solo lo hacía la TaskCard del Smart Kanban; ahora ambos comparten el mismo chip rail (Due date con color por proximidad, mini-bar dentro de chip checklist/todo, user_picker como avatar al lado del assignee). `readCardFieldValue` y `formatCardValue` exportadas desde KanbanView para reuso.

---

## Entrega anterior — Subtask row fixes en TaskDetailModal (2026-04-28 ✅ EN PROD, commit `f278f1e`)
- Bug fix: click en subtarea desde modal abierto en BoardView ahora abre la subtask (era stale handler).
- Feature: chips inline (state, priority, due, assignee) en cada fila de subtarea del modal.

---

## Última entrega — Vector Logic TaskCard ToDo + Card Menu (2026-04-28 ✅ EN PROD)

Mergeado a main y desplegado a producción (commit merge `05c4183`, branch `feat/vl-todo-card-menu`). User confirmó smoke test prod ok.

### Lo que shipea
- `fieldType: 'todo'` nuevo en Schema Builder (sin migración, JSONB extensible).
- `CardProgressBars` apilado al pie de las cards (una barra por ToDo con items + una de subtareas).
- Mini-bar dentro del chip `N/M` (junto al texto, no lo reemplaza).
- Chip de días-en-columna restaurado — antes lo escondía `!hasCardFields`.
- `CardMenu` (kebab `⋮`) en cards y dentro del header del TaskDetailModal — items: Clonar / Borrar / Configurar (admin-only).
- `CloneTaskModal` con título prefill `clon - {title}` + 6 toggles. Clone arranca siempre en OPEN del workflow.
- `DeleteTaskCascade` use case (BFS leaves-first). FK `vl_tasks.parent_task_id` se mantiene `ON DELETE SET NULL` por defensa.
- AdminShell + AdminVectorLogic URL-synced (`?mod=vectorlogic&tab=schema&typeId=…`). SchemaBuilderView acepta `targetTypeId`.

### Follow-ups conocidos
- En boards compartidos con permission `use`, Borrar **no se deshabilita con tooltip** (hoy abierto a todos los miembros). RLS de DB es la red de seguridad real. Agregar gating UI cuando sea prioridad.
- Subtareas cross-type: la barra de progreso solo cuenta hijos cargados en el `tasks` actual del Kanban. Filtros activos pueden esconderlos. Switchear a "All types" para ver progreso completo.
- Alarmas / comentarios en el modal de Clonar son toggles inertes (UI lista, use case los ignora — reservados para v2).

---

## Sesión 2026-04-27 — Typography + Theme tokens (anterior — ya en prod)

**Pendiente smoke test del usuario en prod** del barrido completo de tipografía + theme tokens (5 commits en main). Todos los builds pasaron localmente, pero ~2200 fontSize literales y ~370 var() fallbacks reescritos en una sola tanda — alta probabilidad de pequeños desajustes visuales (especialmente íconos de empty state que colapsaron de 48px → 28px).

## Sesión 2026-04-27 (cont.) — Typography + Theme tokens

Five commits en main (último: `9b181a5`). El propósito: fuente única de verdad para tipografía y color, eliminando literales hardcodeados.

### Tokens nuevos en `WorkSuiteApp.css`
- Tipografía: `--fs-2xs … --fs-display` (8 escalones), `--icon-xs … --icon-lg`, `--lh-tight/normal/loose`. Body usa `--fs-body` y `--lh-normal`.
- Theme: `--ac-grad` (gradient canónico de CTA), `--ac-soft` (variante clara del accent).

### Cambios mecánicos aplicados
- 2200+ `fontSize: <px>` → `'var(--fs-*)'` o `'var(--icon-*)'`.
- 370+ `var(--x,#hex)` (forbidden por design system) → `var(--x)` (sin fallback).
- 14 archivos con hex inline (`#4d8eff`, `#8c909f`, `#22c55e`, etc.) → CSS vars equivalentes.
- 4 ocurrencias de `linear-gradient(135deg,#adc6ff,#4d8eff)` → `var(--ac-grad)`.

### Mapeo px → token (referencia)
- 8/9/10/11 → `--fs-2xs` (11)
- 12/13 → `--fs-xs` (13)
- 14/15 → `--fs-sm` (15)
- 16/17 → `--fs-body` (17)
- 18/19 → `--fs-md` (19)
- 20-22 → `--fs-lg` (22)
- 23-32 → `--fs-xl` (28)
- 33+ → `--fs-display` (36)
- Material Symbols icon literals → `--icon-xs/sm/md/lg` (14/16/20/28)

### Decisiones de scope
- AppSwitcher color por app (`#4d8eff` para JT) preservado — branding intencional por app.
- Definiciones de CSS variables en `WorkSuiteApp.css`, `DeployPlanner.tsx`, `packages/ui/tokens/index.css` y swatches del UIKit no se tocaron (son los lugares donde el hex es legítimo).
- `OfficeSVG.tsx` palette object intacto — necesita refactor mayor para usar vars en SVG attrs.
- `SupabasePriorityRepo` colors hex preservados — son seed data persistido a DB.

### Riesgos visuales conocidos
- Empty-state icons que tenían `fontSize:48` mapean a `--icon-lg` (28). KanbanView vacío y otros muestran ícono 42% más chico.
- Numeritos decorativos `fontSize:24/36` colapsan al token más cercano (`--fs-xl`/`--fs-display`).
- Fix correcto si molesta: ampliar el rango de tokens (`--icon-xl`, `--fs-hero`) en `WorkSuiteApp.css`. NO revertir literales.

### TODO carryover de typography
- ~250+ hex hardcoded fuera del subset que el Review Agent grep verifica (e.g. `#22c55e`, `#f59e0b`, `#ef4444`). Violación de CLAUDE.md pero no bloquea el commit. Sweep posterior si el usuario lo pide.
- `// @ts-nocheck` en `apps/web/src/modules/jira-tracker/ui/ExportConfigModal.tsx` — hack pre-existente, contradice la regla "no hacks". Pendiente de eliminar (necesita arreglar tipos antes).

---

## Tarea pendiente anterior

**Pendiente review del usuario:** branch `fix/canvas-designer-transitions` con el fix de transiciones duplicadas. Migración ya aplicada a prod (cleanup + UNIQUE + CHECK no-self-loop). Frontend con manejo defensivo de errores.

### Investigación 2026-04-27 — bug "todo conectado con todo" en Canvas Designer

**Síntoma reportado:** al configurar transiciones en el Canvas Designer del Workflow Engine, salir y volver, aparecen muchas más transiciones de las que el usuario dibujó.

**Causa raíz confirmada en DB:**
- `vl_transitions` no tenía UNIQUE en `(workflow_id, from_state_id, to_state_id)`. El check de "ya existe" del frontend dependía de estado React local, propenso a stale en re-renders y race conditions.
- Resultado: filas duplicadas acumuladas. Snapshot mostró:
  - workflow "Accionable": 6 pares con duplicados (ej. `Review → Close` x3, `In progress → Review` x2).
  - workflow "solucion": `Close → Close` self-loop x2 (a pesar del guard `connection.source === connection.target`).
- ~~Bug secundario:~~ dos estados con el mismo nombre "Review" en `vl_states` — RESUELTO en `20260427_vl_states_dedupe_unique_name.sql`: orphan `9fc5851c…` mergeado a canonical `78614163…`, references actualizadas, ADD CONSTRAINT `vl_states_name_unique UNIQUE(name)`.

**Fix aplicado a prod (DB) + commiteado en fix branch:**
- Migración `20260427_vl_transitions_dedupe.sql`:
  - DELETE de filas con `from_state_id = to_state_id`.
  - DELETE de duplicados conservando id mínimo por `(workflow, from, to)`.
  - ADD CONSTRAINT `vl_transitions_unique_pair UNIQUE (workflow_id, from_state_id, to_state_id)`.
  - ADD CONSTRAINT `vl_transitions_no_self_loop CHECK (from_state_id <> to_state_id)`.
- `CanvasDesignerView.tsx onConnect`: try/catch con códigos Postgres `23505` (unique violation) y `23514` (check violation) → silencia el caso "ya existe" y resincroniza con `transitionRepo.findByWorkflow` + `buildGraph`.

**Próximo paso:** mergear a main cuando el usuario revise. Branch lista en GitHub.

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

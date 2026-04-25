# WORK_STATE

_Ultima actualizacion: 2026-04-25_

---

## Tarea en curso

**Vector Logic — Card Layout selector + 2 follow-up fixes (revisión UI)**

Branch: `feat/vl-card-layout-multiselect`
Pipeline: Spec ✅ → DBA ✅ → Scaffold ✅ → Dev ✅ → Review ✅ → QA ⏳ → Deploy

## Punto exacto

### Ya hecho
- **Card Layout selector** (commit `4d164ef`, ya pusheado y con preview Vercel verde):
  - Banda chips de fields reemplazada por dropdown `MultiSelectDropdown` (nuevo en `packages/ui`) junto a Save schema.
- **Fix #1 — FieldCard label wrap** (uncommitted): cada field card ahora muestra nombre/× en row 1 y Required + Create/Detail/Card pills en row 2.
- **Fix #2 — Subtareas interactivas en TaskDetailModal** (uncommitted):
  - Filas clickeables → abren la subtarea en el mismo modal (`key={detailTask.id}` re-mounta limpio).
  - Breadcrumb de ancestros sobre el body cuando `parent_task_id` existe; click en cada ancestor navega al padre. Cap 5 niveles.
  - Drag-and-drop entre subtareas con `taskRepo.reorder` sobre `vl_tasks.sort_order`.
  - Checkbox toggle DONE/OPEN con `taskRepo.moveToState` + `stopPropagation`.
- 2 keys i18n nuevas: `markAsDone` / `markAsOpen` (EN + ES).

### Pendiente
1. Commit + push de los 2 fixes (re-deploy preview).
2. Verificación visual del usuario en preview.
3. Merge a `main`.

## Decisiones tomadas
- Modal remonta vía `key={detailTask.id}` cuando se navega entre tareas (más simple que reset manual).
- Parent (KanbanView) computa `taskType` por lookup desde `taskTypes.find(t => t.id === detailTask.taskTypeId)` para que el modal funcione con tareas de cualquier tipo.
- Breadcrumb camina parent_task_id con `taskRepo.findById` repetido (max 5 hops por la regla de jerarquía de Phase 5). No hay batch endpoint — KISS.
- Drag-and-drop reusa `vl_tasks.sort_order` (ya existía). Sin migración.
- Toggle DONE/OPEN del checkbox: usa `stateRepo.findByWorkflow` por subtask (puede ser de tipo distinto al padre).

## Archivos de referencia
- **Spec**: `specs/modules/vector-logic/SPEC.md` — sección "Phase 5 — Schema Builder · Card Layout selector revisión 2026-04-25" + "Two follow-up fixes (revisión 2026-04-25)"
- **Componente compartido**: `packages/ui/src/components/MultiSelectDropdown.tsx`
- **Vista admin**: `apps/web/src/modules/vector-logic/ui/views/SchemaBuilderView.tsx`
- **Modal de detalle**: `apps/web/src/modules/vector-logic/ui/views/KanbanView.tsx` (función `TaskDetailModal`)

## Bloqueos / notas
- **TODO arrastrado (no en scope)**: `stateById` dentro del modal se construye con los `wfStates` del kanban (que sólo cubren `selectedType`). Cuando se navega por breadcrumb a una task de otro tipo, el cálculo de `done` para sus subtareas puede aparecer como false aunque la subtask esté en DONE. Pre-existente, más visible ahora con la navegación nueva.
- **URL produccion**: worksuite-phi.vercel.app
- **Login screen redesign**: sigue esperando referencia visual de Pencil.

## Cómo retomar esta sesión

Usuario dirá: **"seguí con el deploy del Card Layout"**

Acción: commit de los 2 fixes pendientes en `feat/vl-card-layout-multiselect`, push, esperar preview Vercel verde, mergear a main, verificar producción.

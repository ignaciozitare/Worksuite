# WORK_STATE

_Ultima actualizacion: 2026-04-25_

---

## Tarea en curso

**Ninguna.** Todos los cambios de hoy están en producción.

## Últimos deploys de hoy (2026-04-25)

1. **Card Layout selector + 2 follow-up fixes** — merge `19fbf11` (fix/vl-card-layout-multiselect):
   - `MultiSelectDropdown` compartido en `packages/ui`.
   - FieldCard label wrap en SchemaBuilderView.
   - Subtareas clickeables con breadcrumb + drag-and-drop.

2. **User Picker UUID fix en Kanban** — merge `e4fb1c9` (fix/vl-user-picker-avatars):
   - User Picker fields con `showOnCard` ya no aparecen como UUID truncado.
   - Se renderizan como avatares chicos en el footer de la card (gradient violeta para diferenciarse del assignee).
   - Dedup contra el assignee, cap 3 visibles + N en overflow, tooltip Name—email.

Ambos en producción en worksuite-phi.vercel.app.

## TODO arrastrado (no en scope, pre-existente)

- `stateById` dentro del `TaskDetailModal` se construye con los `wfStates` del kanban (sólo `selectedType`). Cuando se navega por breadcrumb a una task de otro tipo, el cálculo de `done` para sus subtareas puede aparecer como false aunque la subtask esté en DONE. Se sentía más visible con la navegación nueva — sigue pendiente.

## Bloqueos / notas

- **URL produccion**: worksuite-phi.vercel.app
- **Login screen redesign**: sigue esperando referencia visual de Pencil.

## Cómo retomar

Pedile lo que sigue. No hay tarea pendiente.

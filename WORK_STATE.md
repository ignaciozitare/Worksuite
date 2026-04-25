# WORK_STATE

_Ultima actualizacion: 2026-04-25_

---

## Tarea en curso

**Ninguna.** Todo lo de hoy está en producción.

## Últimos deploys de hoy (2026-04-25)

1. **Card Layout selector + 2 follow-up fixes** — merge `19fbf11`.
2. **User Picker UUID fix** — merge `e4fb1c9`.
3. **Instant tooltip + drag-over column glow** — merge `09831dc`:
   - Tooltip de avatares ahora aparece al instante (CSS pseudo-element vía `data-tooltip`, ~80ms).
   - Arrastrar una task entre columnas resalta la columna destino con el mismo glow que ya tenía el reorder de columnas.

Todos en producción en worksuite-phi.vercel.app.

## TODO arrastrado (no en scope, pre-existente)

- `stateById` en `TaskDetailModal` se construye con `wfStates` del kanban (sólo `selectedType`). Cuando se navega por breadcrumb a una task de otro tipo, el `done` para subtareas puede aparecer false aunque la subtask esté en DONE.

## Bloqueos / notas

- **URL produccion**: worksuite-phi.vercel.app
- **Login screen redesign**: sigue esperando referencia visual de Pencil.

## Cómo retomar

Pedile lo que sigue. No hay tarea pendiente.

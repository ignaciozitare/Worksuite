# WORK_STATE

_Ultima actualizacion: 2026-04-25_

---

## Tarea en curso

**Ninguna.** El último cambio (Card Layout selector + 2 follow-up fixes) está en producción desde hoy.

## Último deploy

- Branch: `feat/vl-card-layout-multiselect`
- Merge commit en main: `19fbf11`
- Deploy ID Vercel: `dpl_ADhWDnfpP2HMJRrxHYY6sXiHffBp`
- Live: worksuite-phi.vercel.app
- Pipeline completa ✅: Spec → DBA → Scaffold → Dev → Review → QA → Deploy.

### Qué incluyó
1. **Card Layout selector** — dropdown multiselect con búsqueda al lado de Save schema. Reemplaza la banda de chips. Nuevo componente compartido `@worksuite/ui/MultiSelectDropdown`.
2. **FieldCard label wrap** — los nombres de campo ya no se truncan en el sidebar; los pills Required/Create/Detail/Card van en una segunda fila.
3. **Subtareas interactivas en TaskDetailModal** — filas clickeables, breadcrumb de ancestros (hasta 5 niveles), drag-and-drop reorder, checkbox toggle DONE/OPEN.

Sin migraciones de DB. 5 keys i18n nuevas (EN + ES).

## TODO arrastrado (no en scope, pre-existente)

- `stateById` dentro del `TaskDetailModal` se construye con los `wfStates` del kanban (sólo `selectedType`). Cuando se navega por breadcrumb a una task de otro tipo, el cálculo de `done` para sus subtareas puede aparecer como false aunque la subtask esté en DONE. Más visible ahora con la navegación nueva. Si lo arreglamos, conviene cargar `wfStates` por task abierta dentro del modal.

## Bloqueos / notas

- **URL produccion**: worksuite-phi.vercel.app
- **Login screen redesign**: sigue esperando referencia visual de Pencil (sesiones anteriores).
- **git commit sandbox**: macOS `com.apple.provenance` ocasionalmente bloquea writes al `.git/index` — `git push` siempre funciona OK.

## Cómo retomar

Pedile lo que sigue. No hay tarea pendiente.

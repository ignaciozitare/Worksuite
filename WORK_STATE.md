# WORK_STATE

_Ultima actualizacion: 2026-04-25_

---

## Tarea en curso

**Vector Logic — Schema Builder · Card Layout selector (revisión UI)**

Branch base: `main` (último commit `1cbba15`)
Pipeline: Spec ✅ → DBA ⏳ → Scaffold → Dev → Review → QA → Deploy

## Punto exacto

### Ya hecho
- Spec confirmada con el usuario y guardada en `specs/modules/vector-logic/SPEC.md` (sección *"Phase 5 — Schema Builder · Card Layout selector (revisión 2026-04-25)"*).
- Índice `specs/SPEC.md` actualizado.
- Confirmado: **no hay cambios de schema**, reusa el flag existente `field.showOnCard`.

### Pendiente
1. **DBA Agent** — confirmar que no hay impacto de datos (debería ser pase rápido).
2. **Scaffold Agent** — decidir si introducir un nuevo componente en `packages/ui` (multiselect dropdown con buscador) o componer inline; revisar si ya existe algo reutilizable.
3. **Dev Agent** — reemplazar la franja de chips en `apps/web/src/modules/vector-logic/ui/views/SchemaBuilderView.tsx:573-634` por el botón-dropdown junto a `Save schema`, con buscador interno.
4. **i18n** — agregar keys: `vectorLogic.cardLayoutSearch`, `vectorLogic.cardLayoutNoMatches`, `vectorLogic.cardLayoutNoFields` (EN/ES).
5. **Review Agent** — gate obligatorio antes de cerrar.

## Decisiones tomadas
- Botón-dropdown con buscador **interno** (no input separado fuera).
- Posición: `[Card Layout ▾ N/4] [🗑] [Save schema]`.
- Reglas existentes intactas: máx 4 campos, Title implícito, persistencia en `showOnCard`, save manual.
- Sin reordenamiento de campos en la card (queda gobernado por columnas Main/Sidebar).

## Archivos de referencia
- **Spec**: `specs/modules/vector-logic/SPEC.md` (sección Card Layout selector revisión 2026-04-25)
- **Componente actual**: `apps/web/src/modules/vector-logic/ui/views/SchemaBuilderView.tsx:573-634`
- **i18n**: `packages/i18n/locales/{en,es}.json`

## Bloqueos / notas
- **git commit sandbox**: macOS `com.apple.provenance` bloquea writes al `.git/index` — `git push` funciona OK.
- **URL produccion**: worksuite-phi.vercel.app.
- **Phase 5 Smart Kanban v2** ya está mergeado en `main` (commits `c5d7c1c` → `1cbba15`). El plan que figuraba como pendiente en este archivo desde 2026-04-23 ya se completó en su totalidad.
- **Login screen redesign**: sigue esperando referencia visual de Pencil (sesiones anteriores).

## Cómo retomar esta sesión

Usuario dirá: **"seguí con el Card Layout selector"**

Acción: pasar al DBA Agent (no debería bloquear), después al Scaffold para decidir reusabilidad del dropdown.

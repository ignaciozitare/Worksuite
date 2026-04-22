# WORK_STATE

_Ultima actualizacion: 2026-04-22_

---

## Tarea en curso

**Rediseño UI del módulo Jira Tracker**

## Punto exacto

### Completado en sesiones anteriores:
1. **UIKit Brandbook** — packages/ui alineado a variables CSS reales, UIKit como brandbook viviente
2. **Migración de componentes Fase 1+2** — 10 componentes migrados a @worksuite/ui (Btn, Badge, Chip, Modal, Avatar, StatBox, ConfirmModal). Badge tiene variant pill/compact, Chip y StatBox tienen style prop
3. **Diseños en Pencil** — 12 screens completos (6 dark + 6 light) para el rediseño de Jira Tracker:
   - Calendar Month v2, Calendar Week v2, DayView v2, TasksView v2, Log Work Modal v2, Export Modal v2
   - Sidebar izquierda glassmorphism con brand, nav, filtros, gradient glow buttons
   - Sidebar derecha con ticket cards (filete verde, glow radial, search, collapse)
   - Bento StatBox headers compactos
   - Status/priority con Chips del design system
4. **Spec confirmada** — `specs/modules/jira-tracker/SPEC.md`
5. **Migración SQL concurrency** — ya aplicada en Supabase (3 migraciones)

### Intento fallido (borrado):
- Rama `feat/jira-tracker-redesign` fue borrada — el approach de wrappear las vistas existentes con CSS classes antiguas dentro del nuevo layout rompió todo. **No se debe repetir este error.**

### Pendiente — próxima sesión:
- **Implementar el rediseño** en rama `feat/jira-tracker-redesign-v2` (ya creada, limpia desde main)
- **Approach correcto**: reescribir el render de cada vista siguiendo los diseños de Pencil pixel a pixel, usando inline styles/CSS nuevo con variables CSS del proyecto. Mantener la lógica (props, state, handlers, domain calls) intacta. NO reutilizar CSS classes antiguas (.cal-h, .sb, .chip, etc.)
- **Orden**: 
  1. JiraTrackerPage.tsx (sidebar izquierda + layout + sidebar derecha)
  2. CalendarView.tsx (month + week con bento stats)
  3. DayView.tsx (bento stats + epic groups mejorados)
  4. TasksView.tsx (bento stats + tabla con Chips DS)
  5. Modales (LogWorklogModal, ExportConfigModal — ya parcialmente migrados)

### Pendiente de sesiones anteriores:
- **Login screen redesign** — esperando referencia visual de Pencil

## Decisiones tomadas
- Sidebar izquierda glassmorphism = patrón compartido con Deploy Planner, HotDesk, Chrono
- Navbar superior eliminada para JT — navegación en sidebar
- Ticket cards con filete verde + glow radial (confirmado por usuario)
- Botones gradient con drop-shadow glow
- StatBox compactos (padding 12, icon 16)
- "TICKETS" renombrado a "TASKS" en sidebar derecha
- DayView original se mantiene sin cambios v2 (confirmado por usuario)
- ExportConfigModal no se toca internamente — solo estética exterior
- El botón "+" en cada celda del calendario se mantiene exactamente como está

## Archivos de referencia
- **Diseños**: `pencil-new.pen` (frames Redesign/JT Calendar v2, Week v2, TasksView v2, etc.)
- **Spec**: `specs/modules/jira-tracker/SPEC.md`
- **Componentes compartidos**: `packages/ui/src/components/` (Atoms.tsx, Btn.tsx, Modal.tsx, Card.tsx)
- **Patrón de referencia**: `apps/web/src/modules/deploy-planner/ui/DeployPlanner.tsx` (CSS inline con variables, sidebar glass, layout flex)

## Bloqueos / notas
- **npm cache corrupto**: dirs owned by root en ~/.npm/_cacache
- **URL produccion**: worksuite-phi.vercel.app
- **NO wrappear vistas existentes** — reescribir el render siguiendo Pencil, no meter componentes viejos dentro de layouts nuevos

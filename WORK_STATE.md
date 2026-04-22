# WORK_STATE

_Ultima actualizacion: 2026-04-22_

---

## Tarea en curso

**Rediseño UI del módulo Jira Tracker**

## Punto exacto

### Completado en sesiones anteriores:
1. **UIKit Brandbook** — packages/ui alineado a variables CSS reales, UIKit como brandbook viviente
2. **Migración de componentes Fase 1+2** — 10 componentes migrados a @worksuite/ui (Btn, Badge, Chip, Modal, Avatar, StatBox, ConfirmModal). Badge tiene variant pill/compact, Chip y StatBox tienen style prop
3. **Diseños en Pencil** — 12 screens completos (6 dark + 6 light) para el rediseño de Jira Tracker
4. **Spec confirmada** — `specs/modules/jira-tracker/SPEC.md`
5. **Migración SQL concurrency** — ya aplicada en Supabase (3 migraciones)

### Completado en esta sesión:
1. **JiraTrackerPage.tsx** — Nuevo layout component con:
   - Sidebar izquierda glassmorphic (240px, blur 20px, brand block, nav integrado, filtros, gradient buttons)
   - Main content area (flex:1) renderizando CalendarView/DayView/TasksView según view
   - Sidebar derecha (260px) con ticket cards: filete verde, glow radial, search, collapse
   - Light/dark theme support completo via CSS variables
2. **WorkSuiteApp.tsx** — Refactored: reemplazados los 3 bloques JT individuales + sidebar por un solo `<JiraTrackerPage>`. Sub-nav eliminada para JT (nav ahora en sidebar)
3. **CalendarView.tsx** — Reescrito completo:
   - Header con nav arrows, view toggle (month/week), today, log hours
   - Bento StatCards: Total Hours, Active Days, Avg/Day, Unique Tasks (4 colores semánticos)
   - Month grid con celdas redondeadas, today highlight, issue pills
   - Week grid con issue cards por día
   - Drag-and-drop preservado
   - Cero CSS classes antiguas (.cal-h, .cgrid, .cc eliminados)
4. **TasksView.tsx** — Reescrito completo:
   - Header con badge count + log hours button
   - Bento StatCards: Total Hours, Active Tasks, Top Project
   - Filter pills con design system (rounded, glow active state)
   - Table con status/priority chips semánticos (rounded pills, color-coded)
   - Sort arrows, search, empty state con Material icon
5. **i18n keys** — Agregadas 7 keys nuevas en EN y ES (totalHours, avgPerDay, uniqueTasks, activeTasks, topProject, searchTickets, all)

### Intento fallido anterior (borrado):
- Rama `feat/jira-tracker-redesign` fue borrada — wrappear vistas existentes rompió todo

### Pendiente — próxima sesión:
- **DayView.tsx** — Mantener sin cambios v2 (confirmado por usuario), pero los CSS classes antiguas que usa (dh, dd, dsub, etc.) siguen en WorkSuiteApp.css así que funciona
- **LogWorklogModal** — Funciona con Modal de @worksuite/ui + CSS classes existentes. Pendiente rediseño visual si se quiere alinear al 100% con Pencil
- **ExportConfigModal** — No se toca internamente (confirmado). Exterior funciona con Modal de @worksuite/ui
- **Testing visual en browser** — Verificar layout completo, light/dark toggle, filtros, drag-drop
- **Login screen redesign** — Esperando referencia visual de Pencil

## Decisiones tomadas
- Sidebar izquierda glassmorphism = patrón compartido con Deploy Planner
- Navbar superior eliminada para JT — navegación en sidebar izquierda
- Ticket cards con filete verde + glow radial (confirmado por usuario)
- Botones gradient con drop-shadow glow (Apply Filters = blue, Export CSV = green)
- StatBox compactos con colores semánticos (blue/green/amber/purple)
- "TICKETS" renombrado a "TASKS" en sidebar derecha (usa t() i18n)
- DayView original se mantiene sin cambios v2 (confirmado por usuario)
- ExportConfigModal no se toca internamente — solo estética exterior
- El botón "+" en cada celda del calendario se mantiene exactamente como está

## Archivos modificados/creados
- `apps/web/src/modules/jira-tracker/ui/JiraTrackerPage.tsx` — **NUEVO** layout component
- `apps/web/src/modules/jira-tracker/ui/CalendarView.tsx` — Reescrito
- `apps/web/src/modules/jira-tracker/ui/TasksView.tsx` — Reescrito
- `apps/web/src/modules/jira-tracker/ui/index.ts` — Agregado export JiraTrackerPage
- `apps/web/src/WorkSuiteApp.tsx` — Refactored JT rendering
- `packages/i18n/locales/en.json` — 7 keys nuevas
- `packages/i18n/locales/es.json` — 7 keys nuevas

## Archivos de referencia
- **Diseños**: `pencil-new.pen` (frames Redesign/JT Calendar v2, Week v2, TasksView v2, etc.)
- **Spec**: `specs/modules/jira-tracker/SPEC.md`
- **Componentes compartidos**: `packages/ui/src/components/` (Atoms.tsx, Btn.tsx, Modal.tsx, Card.tsx)
- **Patrón de referencia**: `apps/web/src/modules/deploy-planner/ui/DeployPlanner.tsx`

## Bloqueos / notas
- **npm cache corrupto**: dirs owned by root en ~/.npm/_cacache
- **URL produccion**: worksuite-phi.vercel.app
- **NO wrappear vistas existentes** — reescribir el render siguiendo Pencil

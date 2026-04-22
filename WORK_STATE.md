# WORK_STATE

_Ultima actualizacion: 2026-04-22_

---

## Tarea en curso

**Rediseño UI del módulo Jira Tracker — COMPLETADO, pendiente merge a main**

## Punto exacto

### Completado en esta sesión:
1. **JiraTrackerPage.tsx** — Layout: sidebar glass izquierda (240px) + main content + sidebar derecha (260px/40px collapsed)
2. **CalendarView.tsx** — Bento stats, celdas rediseñadas con contenido grande, month/week toggle
3. **TasksView.tsx** — Bento stats, filter pills, tabla con columnas auto-width, columna Epic, botón edit ✎
4. **DayView.tsx** — Botón edit ✎ en cada worklog (abre modal en modo edición)
5. **LogWorklogModal.tsx** — Modo edición: pre-carga campos, título dinámico, actualiza en vez de crear
6. **WorkSuiteApp.tsx** — Nuevo topbar (WorkSuite + PREVIEW badge condicional), JiraTrackerPage wrapper
7. **NotificationsBell.tsx** — Emoji 🔔 reemplazado por Material Symbol
8. **useWorklogs.ts** — handleEditWorklog (delete old + insert updated)
9. **DateRangePicker** — Usando componente de @worksuite/ui (no custom)
10. **i18n** — 10+ keys nuevas en EN y ES
11. **WorkSuiteApp.css** — tb-icon-btn para navbar, topbar justify-content

### Pendiente de sesiones anteriores:
- **Login screen redesign** — Esperando referencia visual de Pencil

## Decisiones tomadas
- Sidebar izquierda glassmorphism (patrón Deploy Planner)
- Navbar superior: "WorkSuite" + PREVIEW badge (solo en non-production hostname)
- Ticket cards con filete verde + glow radial
- DayView original se mantiene sin cambios v2
- ExportConfigModal no se toca internamente
- DateRangePicker de @worksuite/ui (no custom)
- Edit worklog = delete old + insert new (no update in place)

## Archivos de referencia
- **Diseños**: `pencil-new.pen`
- **Componentes compartidos**: `packages/ui/src/components/`
- **Patrón de referencia**: `apps/web/src/modules/deploy-planner/ui/DeployPlanner.tsx`

## Bloqueos / notas
- **git commit sandbox**: macOS com.apple.provenance bloquea writes al .git/index — git push funciona OK
- **URL produccion**: worksuite-phi.vercel.app

# WORK_STATE

_Última actualización: 2026-04-12_

---

## 🎯 Tarea en curso

**Rediseño UI de Chrono y Chrono Admin basado en el output de Stitch.**
La rama `ui/stitch-redesign` tiene los tokens y el repintado de colores
hecho, pero falta el **rediseño visual real**: layouts, efectos, depth,
gradientes, bento grid, glass cards, animaciones. Lo que hay hoy es un
cambio de paleta (amber → blue), no el look que Stitch diseñó.

## 📍 Punto exacto

Rama: `ui/stitch-redesign` (HEAD: `90a5ec0`). NO mergeada a main.

**Hecho (tokens y colores)**:
- `CHRONO_THEME` con la paleta completa del Stitch
- Legacy `C` object remapeado a tokens del theme
- Inter como fuente base en ambos módulos
- `.ch-btn-amber` → primary blue con glow
- Botón circular clock-in → primary
- FichaEmpleadoDrawer recoloreado
- Filtros/selects/search bar recoloreados
- Sidebar con fondo surfaceLowest, active con glow blue
- Tabs del admin recoloreados
- Headers de tabla sticky con padding/spacing mejorados
- Scroll en TODAS las tablas (10+ vistas arregladas)
- Timer envuelto en un card con borde

**NO hecho (el rediseño visual real)**:
- Hero timer card como en Stitch (5.5rem font, gradient bg, layout
  centrado con "Active Session Duration" label, "Clock Out" + "Take
  a Break" como botones rectangulares con gradient, indicadores
  "Clocked in at 08:18 AM" + "Last synced 2m ago")
- Bento grid asimétrico (8+4 cols) en vez de 4 cols iguales
- Stat cards con look de Stitch (progress bar verde tipo "On Track",
  mini bar chart semanal tipo sparkline con barras individuales)
- Glass-card effects (backdrop-filter blur)
- Gradientes en botones (from-primary to-primary-container)
- Depth real con shadows multicapa
- Indicadores pulsantes con animación (dot verde animado)
- "Good Morning" greeting con hora + ubicación
- Recent Alerts & Incidents como card con border-left colored

**Seeder** (ya ejecutado en la DB, no en la rama):
- 30 usuarios + 4 equipos + 660 fichajes + vacaciones + bolsa horas
- RLS arreglada (admin-all en 6 tablas)
- Fichajes de hoy para variedad de estados

## ✅ Decisiones tomadas

- No copiar JSX de Stitch directo — preservar handlers/state/props
  del código actual y solo cambiar el shell visual
- Sidebar inventada por Stitch → ignorada, la sidebar de Chrono
  ya existía y se restyled
- "Location London, UK" → ignorada (no existe en el sistema)
- Scope: solo Chrono y Chrono Admin por ahora

## ⏭ Siguiente paso inmediato

Empezar el rediseño visual **real** del Chrono Dashboard, componente
por componente, usando el HTML del Stitch como referencia de look:

1. **Hero timer card** — el cambio más impactante. Tomar el layout
   del HTML de Stitch: fondo con gradient oscuro, timer en 5.5rem
   blanco con tracking tight, label "ACTIVE SESSION DURATION" en
   uppercase primary, botones rectangulares "Clock Out" + "Take a
   Break" con gradient, indicadores "Clocked in at..." con dot
   pulsante verde.
2. **Bento grid** — mover los stat cards a un layout 8+4 con "Hours
   Today" y "This Week" a la derecha en un stack vertical.
3. **Stat cards enriquecidos** — sparkline bars, trend indicators.
4. **Alerts card** — border-left colored con iconos.

Cada paso es un commit separado, build verificado, reversible.

## 🚫 Bloqueos / notas

- tsc baseline: 24 errores pre-existentes.
- npm cache: `--cache /tmp/npm-cache`.
- `ENCRYPTION_KEY`: Supabase Edge Functions secrets.
- Vitest forks pool tiene timeouts intermitentes en esta máquina;
  usar `--pool=threads` como workaround.
- El HTML completo del Stitch está en el historial de la conversación.
  Si se pierde contexto, pedirle al usuario que lo pegue de nuevo.

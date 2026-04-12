# WORK_STATE

Live snapshot — se lee al iniciar cada sesión y se actualiza al cerrar cada
tarea. No es un log histórico. Si está en `git log` o en `ARCHITECTURE.md`,
no va acá.

_Última actualización: 2026-04-12_

---

## 🎯 Tarea en curso

**Pausa.** El rediseño Stitch de Chrono y Chrono Admin está completo en
la rama `ui/stitch-redesign`. Pendiente: merge a `main` una vez que el
usuario valide visualmente en el preview de Vercel.

## 📍 Punto exacto

Rama: `ui/stitch-redesign` (HEAD: `f2b0a70`). No mergear a main sin
confirmación del usuario.

Commits del rediseño Stitch (esta sesión):
- Tokens compartidos (`CHRONO_THEME`)
- `ChronoStatCard` + progressBar/subtext en dashboards de Chrono y Admin
- Sidebar del Chrono restyled (surfaceLowest, primary active glow, Inter)
- Tabs del Chrono Admin restyled (primary vs amber, glow)
- Tablas (headers sticky, hover, padding) en ambos módulos
- Scroll fix en las 10+ tablas sin maxHeight
- Timer card envuelto en bento card
- Botones: `.ch-btn-amber` → primary blue con glow
- Botón circular clock-in: primary en "listo"
- FichaEmpleadoDrawer: avatar, inputs, labels, secciones en tokens
- Filtros de EmpleadosView: selects + search bar
- Remap completo del legacy `C` object a `CHRONO_THEME` tokens

Seeder (DB, no en la rama):
- 30 usuarios seed + 4 equipos + 660 fichajes + vacaciones + bolsa
  horas + notificaciones para el admin real
- RLS arreglada (admin-all en 6 tablas ch_*)
- Bug `dias_disfrutados` arreglado
- Nombres de seed users corregidos (trigger handle_new_user)

## ✅ Decisiones tomadas

- `CHRONO_THEME` vive en `chrono/shared/theme.ts`, compartido por
  chrono-admin vía cross-module import (aceptable por ahora, promover a
  `shared/ui` si un tercer consumidor aparece).
- El objeto `C` legacy ahora es un **thin wrapper** sobre los tokens del
  theme. Se exporta como `CHRONO_COLORS` para compat. Si algún día se
  elimina, hay que actualizar ~30 refs en 10+ archivos.
- Los botones mantienen la clase `ch-btn-amber` pero pintados en primary.
  Renombrar requiere tocar 20+ call sites → deferred.

## ⏭ Siguiente paso inmediato

Cuando el usuario confirme que le gusta el preview: **merge a main**.
Después, las opciones son:
1. Repetir el mismo approach Stitch en otros módulos (RetroBoard,
   DeployPlanner, etc.)
2. Más pulido fino en Chrono/Admin: modo claro, responsive, charts
3. Feature work nuevo

## 🚫 Bloqueos / notas

- `tsc` baseline: 24 errores pre-existentes. Los remaps de `C` no
  introducen nuevos porque los archivos tienen `@ts-nocheck`.
- npm cache global root-owned: usar `--cache /tmp/npm-cache`.
- `ENCRYPTION_KEY` vive en Supabase Edge Functions secrets.
- Vitest tiene un problema intermitente de timeouts en esta sesión;
  el build sigue pasando limpio.

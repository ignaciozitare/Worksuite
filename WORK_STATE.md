# WORK_STATE

_Última actualización: 2026-04-12_

---

## 🎯 Tarea en curso

**Rediseño UI de Chrono y Chrono Admin basado en el output de Stitch.**

## 📍 Punto exacto

Rama: `ui/stitch-redesign` (sin mergear a main).

**Hecho (esta sesión)**:
- Hero timer card rediseñado: timer 5.5rem, botones rectangulares con
  gradiente, bento grid 8+4, status indicators con dot pulsante verde
- Header Stitch: saludo dinámico (Buenos días/tardes/noches + nombre),
  widget hora+fecha+ubicación GPS real (Barcelona, etc.)
- Bento grid asimétrico: hero 8 cols, stat cards (Hours Today + This
  Week) apilados en 4 cols a la derecha
- Bottom row 3+3+6: Hours Bank, Vacaciones, Alertas con border-left
- Botón "Salir a comer" → "Volver de comida" (verde gradiente) al
  estar en lunch. Botón principal se deshabilita durante lunch.
- 8 vistas de Chrono Admin migradas a tokens Stitch (eliminado C
  hardcodeado con #f59e0b, importan de shared/adminColors.ts)
- CSS gradientes en todos los .ch-btn (amber, red, green, ghost con
  glass effect) en ambos módulos
- Keyframes pulse-ring actualizados de amber a primary blue
- Barritas de colores conservadas en stat cards
- Dependencia circular arreglada (adminColors.ts separado)
- Todas las i18n keys añadidas en es.json y en.json

**Hecho (sesiones anteriores)**:
- CHRONO_THEME con paleta completa Stitch
- Legacy C object remapeado a tokens
- Inter como fuente base
- Sidebar, tabs, filtros, search bar restyled
- FichaEmpleadoDrawer restyled
- Scroll en todas las tablas
- Seeder ejecutado en DB (30 usuarios, 660 fichajes)

**NO hecho (pendiente)**:
- Chrono employee views (Registros, Incompletos, Vacaciones, Alarmas):
  ya usan C wrapper que mapea a Stitch, pero no tienen rediseño visual
  tipo Stitch (siguen con layout original)
- Verificar visualmente CADA pestaña del admin en el browser
- Deploy a preview Vercel para validar antes de merge
- Commit de los cambios actuales

## ✅ Decisiones tomadas

- Preservar toda funcionalidad existente, solo cambiar el shell visual
- Botón circular → rectangular con gradiente (diseño Stitch)
- Ubicación por GPS real (navigator.geolocation + Nominatim)
- adminColors.ts separado para evitar dependencia circular
- "Tomar descanso" → "Salir a comer" (más claro semánticamente)

## ⏭ Siguiente paso inmediato

Commitear todo lo hecho, y luego preguntar al usuario si quiere:
1. Desplegar a preview Vercel para validar visualmente
2. Seguir con el rediseño de las vistas internas (Registros, etc.)
3. Mergear a main

## 🚫 Bloqueos / notas

- tsc baseline: 24 errores pre-existentes
- El navegador pide permiso de geolocalización; si el usuario no lo
  da, la ubicación simplemente no se muestra
- No hay módulo RRHH separado, todo es Chrono/Chrono Admin

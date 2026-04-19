# WORK_STATE

_Última actualización: 2026-04-19 (madrugada)_

---

## 🎯 Tarea en curso

**HotDesk UI redesign + features completados. Deploy Planner sidebar hecho. Pendiente QA visual.**

## 📍 Punto exacto

### HotDesk — Redesign completo ✅
- **Sidebar**: Time Clock style con brand, nav (Office Map / Monthly View), Campus Filter, Live Status, CHECK IN, Instant Booking
- **Header**: Solo texto "Real-time desk occupancy..." con ciudad del edificio
- **Floating cards**: Available Desks + Active Booking (glassmorphism) en esquina inferior derecha sobre el mapa
- **Bottom bar**: Leyenda de colores completa + stats + Peak Insight con botón View Trends
- **Trends Modal**: Barras de utilización semanal con color coding + recomendación
- **Quick Reserve**: Funcional — busca primer puesto libre
- **CHECK IN**: Botón verde gradient con pulse en sidebar cuando hay reserva pending
- **Campus Filter card**: Selector de edificio/piso dentro de card con glow
- **Ciudad en building**: Campo `city` agregado a BuildingPort, repo, y admin form
- **Booking confirmation**: Domain + infra + UI completos (pending → confirmed → released)
- **Delegation + Blocked seats**: Implementados en domain/infra/UI

### HR — Zonas permitidas ✅
- Campo `allowedBookingZones` en FichaEmpleado entity
- Sección "Zonas de Reserva Permitidas" en FichaEmpleadoDrawer
- Migración: `allowed_booking_zones jsonb` en tabla users

### Deploy Planner — Task Sidebar ✅
- TaskSidebar.tsx con búsqueda, DnD funcional, filtrado
- Integrado en DeployPlanner.tsx

### Vector Logic — Fixes ✅
- i18n completo, iconos Material Symbols, DnD Schema Builder, tabs ordenados

### Hexagonal — 3 violaciones corregidas ✅
- retro, chrono-admin, vector-logic

## ✅ Decisiones tomadas

- HotDesk UI usa CHRONO_THEME (mismos tokens que Time Clock)
- City: campo en buildings, se muestra como "{City} Hub" en el header
- Zonas permitidas: campo jsonb en users, configurado desde FichaEmpleado en HR
- Quick Reserve: fallback a primer puesto libre en zonas del usuario
- Trends: modal con barras de utilización por día de semana (mock data por ahora)
- Deploy Planner sidebar: DnD desde sidebar a release cards, source '__sidebar__'

## ⏭ Siguiente paso inmediato

1. **QA visual**: Verificar en browser todos los cambios
2. **Trends real data**: Conectar el modal de trends a datos reales de reservas
3. **Quick Reserve con zonas**: Filtrar puestos por allowed_booking_zones del usuario
4. **Admin HotDesk config**: Panel admin para togglear confirmation, exempt roles, manage blocked seats

## 🚫 Bloqueos / notas

- **npm cache corrupto**: Dirs owned by root en ~/.npm/_cacache — impide install global
- **Vercel token**: guardado en memoria del agente para futuros deploys
- **URL producción**: `worksuite-phi.vercel.app` (no worksuite.vercel.app)

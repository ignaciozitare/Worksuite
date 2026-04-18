# WORK_STATE

_Última actualización: 2026-04-18 (madrugada)_

---

## 🎯 Tarea en curso

**3 features nuevas implementadas — pendiente deploy y QA visual.**

## 📍 Punto exacto

### Feature 1: HotDesk Booking Confirmation ✅ CODED
- **Spec**: `specs/modules/hotdesk/SPEC.md`
- **Migration**: `20260418_hotdesk_booking_confirmation.sql` — aplicada en prod
- **Domain**: Entidades (HotDeskConfig, SeatReservation con status), ports (ConfigRepository, confirmReservation, delegateSeat), use cases actualizados
- **Infra**: SupabaseConfigRepository nuevo, adapters actualizados para nuevos campos
- **UI**: Pending pulse animation, blocked X-overlay, delegated violet badge, confirm presence button, delegate modal con user picker
- **Container**: `container.ts` creado con reservationRepo, seatRepo, configRepo

### Feature 2: Deploy Planner Task Sidebar ✅ CODED
- **Spec**: `specs/modules/deploy-planner/SPEC.md`
- **Componente**: `TaskSidebar.tsx` — sidebar colapsable 300px
- **Integración**: DeployPlanner.tsx modificado para layout con sidebar derecha
- **i18n**: 7 keys nuevas en EN/ES

### Feature 3: Auditoría Hexagonal ✅ FIXED
- **retro**: container.ts creado, RetroBoard.tsx limpio
- **chrono-admin**: supabase.auth reemplazado por useAuth hook
- **vector-logic**: getSessionToken() movido a container.ts

### Fixes previos (VL i18n + icons)
- 5 commits: i18n keys, Material Symbols global, Carbon Logic gradients, auto-save DnD, pollNow 400 fix
- **Main**: commit `a5d7c22` (todo pusheado)

## ✅ Decisiones tomadas

- Booking confirmation: status enum `pending|confirmed|released` en seat_reservations
- Auto-release: función PL/pgSQL `hotdesk_auto_release()` — pendiente wiring con cron
- Delegation: campo `delegated_by` en seat_reservations
- Blocked seats: `is_blocked` + `blocked_reason` en seats table
- Config: tabla `hotdesk_config` con defaults sensatos
- Deploy Planner sidebar: UI-only, sin cambios de dominio, reutiliza tickets existentes
- Hexagonal: !important en Material Symbols CSS, container pattern en retro

## ⏭ Siguiente paso inmediato

1. **Deploy**: Vercel debe recoger el push a main (o redeploy manual)
2. **QA visual**: Verificar en browser que:
   - HotDesk: reservas muestran pending con pulse, confirm button funciona, blocked seats con X
   - Deploy Planner: sidebar aparece, search filtra, tickets se listan
   - VL admin: iconos renderizan correctamente, DnD guarda, tabs en orden correcto
3. **Wiring cron**: Conectar `hotdesk_auto_release()` a un cron (pg_cron o Vercel cron)
4. **Admin UI para HotDesk config**: Panel admin para togglear confirmation, exempt roles, manage blocked seats

## 🚫 Bloqueos / notas

- **Vercel Git integration**: Sigue rota — deploy manual necesario
- **npm cache corrupto**: `/Users/ignaciozitare/.npm/_cacache/content-v2/sha512/2b/` owned by root — impide instalar vercel CLI globalmente
- **Cron auto-release**: Función DB lista pero no conectada a un trigger temporal
- **Admin HotDesk config UI**: No construido aún — la config se puede cambiar via Supabase dashboard por ahora

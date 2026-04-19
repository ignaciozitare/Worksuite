# WORK_STATE

_Ultima actualizacion: 2026-04-19_

---

## Tarea completada

**Concurrency Control — race-condition prevention para HotDesk, Deploy Planner y Environments.**

## Punto exacto

### Completado hoy:
1. **Spec** — `specs/core/concurrency/SPEC.md` con estrategia completa para los 3 modulos
2. **Migracion SQL** — `supabase/migrations/20260419_concurrency_constraints.sql`:
   - RPC `reserve_seat()` y `reserve_seats_batch()` para HotDesk (atomic INSERT con manejo de unique_violation)
   - UNIQUE INDEX parcial en `deployments(environment, planned_at)` para Deploy Planner (solo estados activos)
   - Trigger `check_reservation_overlap()` en `syn_reservations` para Environments (detecta solapamientos y lanza 23505)
3. **ConflictError compartido** — `apps/web/src/shared/domain/errors/ConflictError.ts`
4. **HotDesk** — Port + Infra: nuevo metodo `insertReservations()` que usa RPC batch con fallback a INSERT directo. Hook `useHotDesk`: captura ConflictError, muestra toast traducido, rollback optimistic update, re-fetch desde DB
5. **Deploy Planner** — Infra: captura 23505 en `save()` y lanza ConflictError
6. **Environments** — Port + Infra: nuevo metodo `insert()` separado de `upsert()`. Use case `UpsertReservation`: acepta `isNew` flag para usar INSERT en nuevas. View: captura ConflictError con alert + re-fetch
7. **i18n** — Keys nuevas en EN y ES: `hotdesk.seatConflict`, `deployPlanner.deployConflict`, `admin.envReservationConflict`
8. **Documentacion** — ARCHITECTURE.md (seccion Concurrency Control), README.md (parrafo resumen), specs/SPEC.md (indice actualizado con core/concurrency + modulos hotdesk y deploy-planner)

### Pendiente:
- **Aplicar migracion SQL** en Supabase (requiere ejecutar contra la DB real)
- **Login screen redesign** — esperando referencia visual de Pencil del usuario

## Decisiones tomadas
- INSERT en vez de UPSERT para reservas — first-come-first-served obligatorio
- DB constraint como ultima linea de defensa, aplicacion como feedback rapido
- RPC batch para HotDesk (reserva multi-fecha atomica con resultado por fecha)
- Trigger en vez de EXCLUSION constraint para Environments (porque status_id requiere JOIN)
- ConflictError compartido en shared/domain para consistencia cross-modulo

## Proximo paso inmediato
- Ejecutar la migracion `20260419_concurrency_constraints.sql` en Supabase

## Bloqueos / notas
- **npm cache corrupto**: dirs owned by root en ~/.npm/_cacache
- **URL produccion**: worksuite-phi.vercel.app
- **Migracion pendiente**: la migracion SQL debe aplicarse en Supabase antes de que los RPC functions funcionen. Mientras tanto, el fallback a INSERT directo cubre el caso

# WORK_STATE

_Ultima actualizacion: 2026-04-26_

---

## Tarea en curso

**Login screen redesign (Carbon Logic / Pencil)** — pipeline Spec → DBA → Scaffold → Dev → Review → QA en curso.

- Spec: [specs/core/login/SPEC.md](specs/core/login/SPEC.md)
- DBA: N/A (UI-only).
- Cambios: `apps/web/src/modules/auth/LoginPage.tsx` (rewrite cosmético, comportamiento de auth/remember/required preservado), `apps/web/src/WorkSuiteApp.css` (3 vars hero), `packages/i18n/locales/{en,es}.json` (rename `employeeAdmin`→`contactAdmin`, 4 keys nuevas, ES mirrors EN).
- Pendiente: verificación visual light/dark del usuario, merge a main, deploy.

## Sesión 2026-04-26 — resumen

Día completo de mejoras a Vector Logic + nueva feature de avatar en perfil.

### Producción al día (último merge: `ec5f706`)
1. **Avatares end-to-end**: subir foto / elegir preset / iniciales como fallback. Render unificado en navbar, kanban TaskCard, modal de detalle, AdminUsers, listas de retro/environments. Admin override desde AdminUsers. Migración + bucket + RLS aplicados.
2. **Vector Logic modal**: portal tooltip (no se corta en columnas), parent breadcrumb prominente, Rich Text con flex:1, tooltip sólo nombre.
3. **Vector Logic kanban**: column glow al arrastrar tareas, instant tooltip.
4. **Schema Builder admin**: Card Layout multiselect dropdown con buscador, FieldCard labels en segunda línea, subtareas clickeables con drag-reorder + breadcrumb.
5. **Bug fixes**: user_picker UUID leak, dos mapeos de `avatarUrl` (global users hook + CURRENT_USER del navbar).

### Decisiones técnicas registradas
- Folder pattern en Storage: `{user_id}/avatar.{ext}`.
- Cache-buster `?v=timestamp` en URL post-upload.
- Crop client-side con canvas zoom/pan (sin lib).
- Hex hardcodeados en 3 presets (teal/pink/gray) marcados como brand palette intencional.
- Tooltip via React portal con `position: fixed` + `getBoundingClientRect`.

## TODO arrastrado (pre-existente)
- `stateById` en `TaskDetailModal` se construye con `wfStates` del kanban (sólo `selectedType`). Cuando se navega por breadcrumb a una task de otro tipo, el `done` para sus subtasks puede aparecer false.

## Bloqueos / notas
- **URL produccion**: worksuite-phi.vercel.app
- **Login screen redesign**: sigue esperando referencia visual de Pencil.

## Cómo retomar
Pedile lo que sigue. Sin tarea pendiente.

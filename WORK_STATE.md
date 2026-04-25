# WORK_STATE

_Ultima actualizacion: 2026-04-26_

---

## Tarea en curso

**Ninguna.** Todo en producción.

## Último deploy

- Branch: `feat/vl-modal-fixes-and-avatars`
- Merge commit: `4759962`
- Deploy ID Vercel: `dpl_BfxbhHmfxRB7KJNbgQt8YBKLAHFX`
- Live: worksuite-phi.vercel.app
- Pipeline ✅: Spec → DBA → Scaffold → Dev → Review → QA → Deploy

### Qué incluyó (5 ítems bundleados)
1. **Tooltip portal** en TaskCard avatars — escapa el overflow de la columna del kanban (antes se cortaba).
2. **Parent breadcrumb prominente** sobre el título del modal — chip con `Padre: CODE — title`, clickeable, hasta 5 ancestros.
3. **Main column flex:1** en TaskDetailModal — el Rich Text llena el alto del sidebar (220px min-height).
4. **Tooltip sólo nombre** (sin email).
5. **Avatar / foto en perfil** — feature nueva:
   - Migración `20260425_user_avatar_url_and_storage` aplicada a prod (column + bucket + 7 RLS policies).
   - Componente compartido `<UserAvatar/>` en `@worksuite/ui` (initials | preset | foto).
   - Modal `<AvatarPicker/>` con drag-and-drop upload + crop inline (canvas zoom/pan, sin lib) + 8 presets + remove.
   - Bloque clickeable en `/profile` y en `AdminUsers` (admin override).
   - Render unificado en UserMenu, KanbanView TaskCard.
   - 15 keys i18n nuevas (EN/ES) + UIKit demo.

### Decisiones técnicas
- Folder pattern en Storage: `{user_id}/avatar.{ext}` para que las RLS usen `storage.foldername(name)[1]`.
- Cache-buster `?v=timestamp` en URL post-upload para refrescar avatar overwriteado.
- Image transformation via query params (`?width=64&quality=80`), graceful si no hay tier que lo soporte.
- Hex hardcodeados en 3 presets (teal/pink/gray) marcados como brand palette intencional — los otros 5 usan CSS vars.

## TODO arrastrado (pre-existente)
- `stateById` en `TaskDetailModal` se construye con `wfStates` del kanban (sólo `selectedType`). Cuando se navega por breadcrumb a una task de otro tipo, el `done` para sus subtasks puede aparecer false.

## Bloqueos / notas
- **URL produccion**: worksuite-phi.vercel.app
- **Login screen redesign**: sigue esperando referencia visual de Pencil.

## Cómo retomar
Pedile lo que sigue. Sin tarea pendiente.

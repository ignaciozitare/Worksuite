# Profile — Module Spec

> **Snapshot spec (2026-04-29).** Documenta el estado actual del módulo. Las secciones marcadas con fecha son entregas históricas que llegaron a producción.

## Overview

Profile es la página de identidad del usuario actual. Cada empleado ve y edita los datos públicos / personales propios desde `/profile`: nombre, idioma de la app, avatar, token Jira personal opcional, y módulos visibles (jsonb `users.modules`).

### Quién lo usa
Cualquier usuario logueado, **solo sobre su propio perfil**. Para editar otros perfiles se va a Admin → Users.

## Sub-views

URL: `/profile`. Una sola vista, sin tabs.

| Bloque | Componente | Para qué |
|---|---|---|
| Avatar | `AvatarPicker` | Bloque grande arriba con avatar circular. Click abre modal con upload, presets, remove. |
| Identidad | dentro de `ProfilePage` | Display name, email (read-only — viene de auth), idioma preferido (es/en), rol (read-only). |
| Token Jira personal | dentro de `ProfilePage` | Input para guardar el PAT de Jira de cada user. Lo usa Jira Tracker para que los worklogs aparezcan bajo el nombre real del user en Jira. |
| Módulos visibles | dentro de `ProfilePage` | Toggles para mostrar / ocultar módulos en la app switcher. Persiste en `users.modules` (jsonb). |

## Actions del usuario

- **Cambiar nombre** (texto libre, persiste a `users.name`).
- **Cambiar idioma** (es / en) — persiste en localStorage del browser via `@worksuite/i18n` + opcionalmente columna user.
- **Cambiar / subir / quitar avatar** (ver subsección Avatar más abajo).
- **Setear / actualizar token Jira personal** (PAT) — persiste a `users.jira_api_token`. Lectura sólo por el propio user (RLS).
- **Toggle módulos visibles** — persiste a `users.modules` (jsonb default `["jt","hd","retro","deploy"]`).

No hay otras pantallas — el module es deliberadamente fino. Toda la admin de un user (cambiar rol, desactivar, ver datos sensibles) vive en `/admin → Users`.

## Reglas y límites

- Un usuario solo edita su propio perfil. RLS: `auth.uid() = users.id` para UPDATE.
- El email no es editable desde aquí — viene de `auth.users` (Supabase Auth).
- El rol no es editable desde aquí — solo desde Admin.
- Token Jira es opcional. Si no está, los worklogs se sincronizan bajo el user genérico de la integración.

## Conexiones

- **Supabase** — tabla `users` (RLS por user para SELECT/UPDATE de filas propias). Bucket `user-avatars`.
- **`@worksuite/i18n`** — el idioma del user lo controla este provider.
- **`@worksuite/ui`** — `Modal`, `UserAvatar`, `Btn`.
- **Auth** — lee `useAuth()` para conocer el user actual.
- **Admin Panel** — la misma `<AvatarPicker />` se reusa en `AdminUsers` para que el admin pueda cambiar avatar de cualquier user.

## Modelo de datos

### `users` (compartida con Auth, no propia del módulo)
Profile lee/escribe sobre `users`:
- `name` (text), `email` (text — read-only desde aquí), `role` (text — read-only desde aquí), `desk_type` (text), `avatar` (text legacy), `avatar_url` (text — Storage URL o `preset:NAME`), `active` (bool), `jira_api_token` (text), `role_id` (uuid → `roles.id`), `modules` (jsonb default `["jt","hd","retro","deploy"]`), `export_presets` (jsonb), `allowed_booking_zones` (jsonb), `created_at`.

### Storage bucket `user-avatars`
- Path: `{user_id}/avatar.{ext}` (folder-per-user).
- Public read para users autenticados.
- Write/delete restringido a owner o admin (RLS sobre `storage.foldername(name)[1]`).
- Image transformation a request time: `?width=64&quality=80` (chips), `?width=256&quality=85` (profile page).

## Estructura del módulo

```
apps/web/src/modules/profile/
├── container.ts
├── domain/
│   └── ports/                 # UserProfilePort
├── infra/
│   └── supabase/              # SupabaseUserProfileRepo
└── ui/
    ├── ProfilePage.tsx
    └── AvatarPicker.tsx       # modal de avatar (también usada por AdminUsers)
```

---

## Avatar / photo (revisión 2026-04-25)

### What it does
A user can choose how their avatar appears across WorkSuite. Three options:
1. **Upload a photo** (drag-and-drop or click to upload).
2. **Pick a preset avatar** from a small gallery.
3. **Remove the avatar** and fall back to initials (the original behaviour).

The avatar is shown wherever a user's avatar appears in the app: Vector Logic Kanban TaskCard, TaskDetailModal, navbar UserMenu, AdminUsers list, assignee chips, etc.

### Who uses it
Every WorkSuite user can edit their own avatar from the Profile page. **Admins can edit other users' avatars** from the AdminUsers screen (same picker reused).

### Main flow

**Self-edit (Profile page):**
1. User clicks the avatar block at the top of `/profile`.
2. A modal opens with three sections:
   - **Upload**: drag-and-drop area or "Choose file" button. Accepts JPG, PNG, WEBP up to **2MB**.
   - **Crop step (after upload)**: when a file is selected, the modal shows a square crop area with zoom slider (using a small client-side cropper). User confirms and the cropped image is uploaded.
   - **Preset gallery**: 8 preset avatars (gradient circles in: purple, blue, green, amber, red, teal, pink, gray). Clicking one selects it.
   - **Remove**: a button "Use initials" that clears the avatar.
3. While the upload is in progress, a spinner shows over the avatar block.
4. On success, the new avatar persists and refreshes everywhere immediately.

**Admin-edit (AdminUsers):**
1. Admin opens the row for a user.
2. Same picker modal opens, scoped to that user.
3. Admin can upload, pick preset, or remove for any user.
4. Audit: the change is saved with `updated_at` only — no extra audit log in v1.

### Rules and limits
- Max upload size: 2 MB. Larger → inline error.
- Allowed formats: JPG, PNG, WEBP. Other → inline error.
- Only one avatar active per user. New upload replaces the previous file in storage.
- Self users can only change their own avatar. Admins can change any user's.
- Initials are still computed from the user's name and shown when no avatar is set.

### Connections
- **Supabase Storage** bucket `user-avatars` (public read for logged-in users).
- **Supabase Storage Image Transformation**: avatars are rendered with `?width=64&quality=80` for the small chips/avatars and `?width=256&quality=85` for the profile page. No Edge Function required.
- All avatar render sites switch to a shared `<UserAvatar />` component that reads `user.avatarUrl` and falls back to initials.

### Out of scope
*(none — items previously listed have been moved into scope.)*

### Data model
**users table** gains a column:
- `avatar_url text NULL` — when set, holds either a Supabase Storage public URL (uploaded photo) or a string of the form `preset:NAME` (one of: `purple`, `blue`, `green`, `amber`, `red`, `teal`, `pink`, `gray`).

**Storage bucket** `user-avatars`:
- Public read for any authenticated user.
- Write/delete restricted to:
  - The owner (user whose `id` matches the file name prefix).
  - Any user with `role = 'admin'`.
- Naming: `{user_id}/avatar.{ext}` (folder-per-user pattern so RLS uses `storage.foldername(name)[1]`). The previous file is overwritten on new upload.
- Image transformation enabled at request time via the URL params `?width=64&quality=80` (avatar chips) and `?width=256&quality=85` (profile page). Falls back to original size if the project tier doesn't support transforms.

**DBA verdict (2026-04-25):** Migration `supabase/migrations/20260425_user_avatar_url_and_storage.sql` applied to prod. Column added, bucket provisioned, 7 RLS policies in place (1 public read + 3 owner write/update/delete + 3 admin write/update/delete).

---

## Bug fix: avatarUrl not propagated to global users state (2026-04-26)

### Problem
The global `useWorkSuiteData` hook maps the `users` rows but silently drops the new `avatar_url` column. Every view that reads `wsUsers` / `users` from this hook (Vector Logic, Retro, Environments, AdminUsers) renders initials even after a user picked a photo or preset. The topbar `UserMenu` is unaffected because it goes through `useAuth`, which already maps `avatar_url → avatarUrl`.

### Fix
- Add `avatarUrl: (u as any).avatar_url ?? null` to the mapping in `apps/web/src/shared/hooks/useWorkSuiteData.ts`.
- Declare `avatar_url?: string | null` on `UserRow` in `apps/web/src/shared/domain/ports/UserPort.ts` for type cleanliness.
- Add `avatarUrl?: string | null` to the local `WSUser` interface in `KanbanView.tsx`.

### Expected behaviour after fix
- After a user picks/uploads an avatar, it shows immediately on their own kanban cards, in the detail modal, in the admin list, and in every other view consuming `wsUsers`.
- Other users' updated avatars become visible on the next reload of the global users list (next page load or navigation).

### Out of scope
- Realtime broadcast / multi-client sync of avatar changes.
- Active re-fetch of global users when **another** user changes their avatar.

**DBA verdict (2026-04-26):** no migration — pure mapping fix in the data hook plus type cleanup.

### Follow-up (2026-04-26 #2): same bug in the navbar's CURRENT_USER mapping
The navbar reads its user from a hand-rolled `CURRENT_USER` object built in `WorkSuiteApp.tsx:85-92` from `authUser`. That copy also dropped `avatarUrl`, so the topbar still showed initials. Fix: add `avatarUrl: authUser.avatarUrl ?? null` to the `CURRENT_USER` object so the avatar reaches the `UserMenu`.

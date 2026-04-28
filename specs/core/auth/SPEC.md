# Auth — Core Spec

> **Snapshot spec (2026-04-29).** Documenta el sistema de autenticación, sesión y roles. Sin esta capa no se podría reconstruir la app — todo lo demás depende de saber quién es el user actual y qué puede hacer.
>
> Para el rediseño visual del login screen ver `core/login/SPEC.md` separado.

## Overview

WorkSuite usa **Supabase Auth** como backend de identidad. La sesión vive en el browser (localStorage de Supabase JS) y un `AuthContext` propio expone el user actual + perfil enriquecido (rol, avatar, módulos visibles) al árbol de React.

Cada usuario tiene una row en `auth.users` (gestionada por Supabase) y una row paralela en `public.users` con metadata del workspace (rol, avatar, módulos, token Jira). El bootstrap de la app cruza ambas para entregar `{ user, token, isLoading }` a la app.

## Login flow

1. Usuario abre `/login`. `<PublicRoute>` chequea `useAuth().token`; si ya hay, redirige a `/jira-tracker/calendar`.
2. `<LoginPage />` (en `apps/web/src/modules/auth/LoginPage.tsx`) renderiza:
   - Email + password inputs.
   - Toggle "Remember me" (controla persistencia de la session).
   - Botones SSO (Google / Microsoft) si `sso_config.allow_google` / `allow_microsoft` están en `true`.
   - Botón "Sign in".
3. Click "Sign in" → `useAuth().login(email, password)` → `supabase.auth.signInWithPassword(...)` → si OK, dispara `loadUser(token)`.
4. `loadUser` resuelve `supabase.auth.getUser()` (vía Supabase) + `supabase.from('users').select('*').eq('id', user.id).single()` (perfil del workspace).
5. Maps `avatar_url → avatarUrl` (cleanup conocido) y setea `{ user, token, isLoading: false }`.
6. App ready. `<ProtectedRoute>` libera el render del shell.

Click en logout (UserMenu): `supabase.auth.signOut()` + reset del state local.

## Session persistence

- Supabase JS persiste el JWT en localStorage automáticamente.
- En cada montaje de `<AuthProvider>`, se llama `supabase.auth.getSession()`. Si retorna session, se carga el perfil. Si no, se queda en estado deslogueado.
- El JWT auto-renueva via Supabase (refresh token).

## Roles y permisos

### Modelo actual
La columna `users.role` (text) es la fuente principal de rol. Valores conocidos en el código:
- `admin` — super-poder. Puede entrar a `/admin`, ver datos sensibles de empleados, modificar config global, etc.
- (otros valores como `member`, `manager` aparecen en strings sueltos pero **no hay un enum estricto** — en código se compara siempre con `role === 'admin'`).

### Permisos derivados
Hay también una tabla `roles` y una FK `users.role_id` para un sistema más granular (RBAC), pero está **mayormente sin uso** en el código. La verificación real corre via `currentUser.role === 'admin'` literal.

### Permisos de módulo
- `users.modules` (jsonb default `["jt","hd","retro","deploy"]`) controla qué módulos ve el user en el AppSwitcher.
- No es un permiso de seguridad — es preferencia visual. RLS en cada módulo es la red real.

### Permisos de board (Vector Logic)
Vector Logic tiene su propio sistema en `vl_board_members` con `permission ∈ {use, edit}`. Documentado en `specs/modules/vector-logic/SPEC.md`.

### Permisos de equipo (Chrono / Retro)
Cada uno tiene su tabla `*_team_members` con `role` propio. Documentado en sus respectivos specs.

## RLS — patrón estándar

Cada tabla del workspace tiene RLS habilitada. El patrón:

- **SELECT** — usualmente `auth.uid() = user_id` para datos privados, o abierta a todos los autenticados para datos compartidos (boards, releases, environments).
- **INSERT** — siempre requiere que el `user_id`/`created_by` del row coincida con `auth.uid()`.
- **UPDATE/DELETE** — solo el dueño, o admin (chequeado via función `is_admin()` definida en migrations o via `EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')`).

Casos especiales:
- Vector Logic boards usan `SECURITY DEFINER` helpers (`vl_can_view_board`, `vl_can_edit_board`) para evitar recursión circular entre `vl_kanban_boards` y `vl_board_members`.
- Chrono Admin tiene un set propio de policies para que un user con rol RRHH/admin pueda ver fichajes de toda la empresa.

## SSO config

Tabla `sso_config` (singleton id=1):
- `allow_google` (bool), `allow_microsoft` (bool).
- `ad_group_id` / `ad_group_name` para AD-style group restriction.
- El flow real de SSO con Microsoft / Google está parcial — los providers se invocan via `supabase.auth.signInWithOAuth()` pero el mapeo a `users` row del workspace requiere lógica adicional que está pendiente de implementar completa.

## Auth-related entities

### `users` (workspace profile, FK 1:1 con `auth.users`)
Campos relevantes para auth:
- `id` (uuid, PK, FK a auth.users.id).
- `email` (text — duplicado de auth.users.email para queries).
- `name`, `role`, `role_id`, `active` (bool), `avatar_url`, `modules` (jsonb).
- `jira_api_token` (text — PAT de Jira del user).
- `desk_type` (text — para HotDesk, indica si tiene fixed seat o no).
- `created_at`.

### `roles` (poco usada, candidata a deprecación o expansión)
- `id`, `name`, otros atributos. Sin policies que la consulten activamente.

### `sso_config`
Documentada arriba.

## Estructura

```
apps/web/src/
├── modules/auth/
│   ├── container.ts
│   ├── domain/
│   │   ├── entities/AuthUser.ts
│   │   └── ports/AuthRepository.ts
│   ├── infra/
│   │   └── SupabaseAuthRepository.ts
│   └── LoginPage.tsx          # form de login
├── shared/
│   ├── auth/
│   │   ├── LoginPage.tsx      # versión legacy (reemplazada por la del module)
│   │   └── useAuth.ts         # re-export del hook
│   └── hooks/
│       └── useAuth.tsx        # AuthProvider + useAuth() — state global
└── AppRouter.tsx              # ProtectedRoute + PublicRoute
```

## Reglas y límites

- **Una sesión por user en este browser.** Multi-account no está soportado.
- **El JWT vive 1 hora** (default Supabase) y refresca automáticamente.
- **Logout** limpia localStorage de Supabase + el state local del provider.
- **Si el user es desactivado** (`users.active=false`), las RLS lo bloquean en next request — pero el client puede seguir mostrando datos cacheados hasta refresh.
- **Email verification** lo maneja Supabase Auth — no hay UI custom para confirmarlo (asume invite-flow).

## Conexiones

- **Supabase Auth** — todo el ciclo de auth.
- **Supabase Postgres** — tabla `users` enriquecida.
- **Module containers** — todos los repos de cada módulo asumen que `auth.uid()` es resolvible en RLS.
- **App Shell** — el `<AuthProvider>` envuelve todo en `main.tsx`.

## Out of scope (en este snapshot)

- 2FA / TOTP — no implementado.
- Magic link login — no expuesto en UI.
- Password reset flow — la UI no existe; depende del email automático de Supabase.
- Audit log de logins / acciones admin.
- Session timeout configurable por workspace.
- Forced logout cuando un admin desactiva al user (depende de RLS rejection en next request).
- Sistema RBAC granular real — la tabla `roles` está casi sin usar.
- Sign up self-service — el workspace es invite-only (admin crea desde `/admin → Users`).

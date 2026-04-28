# App Shell — Core Spec

> **Snapshot spec (2026-04-29).** Documenta la estructura global de la app — el "chrome" alrededor de cada módulo. Sin un App Shell coherente, los módulos no se podrían reconstruir como app integrada.

## Overview

El App Shell es el contenedor visual y funcional que envuelve a todos los módulos: topbar con AppSwitcher / búsqueda / notificaciones / theme toggle / language switch / UserMenu, layout responsive, routing, theme management (dark/light), i18n, error boundaries y la integración con `useAuth` para gating de rutas privadas.

`WorkSuiteApp.tsx` es el componente raíz una vez logueado. `AppRouter.tsx` decide quién puede ver qué (login pública / app privada). `main.tsx` es el bootstrap.

## Routing global

Definido en `apps/web/src/AppRouter.tsx`:

| Path | Componente | Protección |
|---|---|---|
| `/login` | `<LoginPage />` (envuelto en `PublicRoute` que redirige al app si ya hay token) | Pública — solo no logueados |
| `/jira-tracker/:view` | `<WorkSuiteApp />` con `view` resuelto desde URL | `ProtectedRoute` requiere token |
| `/jira-tracker` | redirige a `/jira-tracker/calendar` | — |
| `/hotdesk/:view` | `<WorkSuiteApp />` | Protected |
| `/hotdesk` | redirige a `/hotdesk/map` | — |
| `/retro` | `<WorkSuiteApp />` | Protected |
| `/deploy` | `<WorkSuiteApp />` | Protected |
| `/envtracker` | `<WorkSuiteApp />` | Protected |
| `/chrono` | `<WorkSuiteApp />` | Protected |
| `/chrono-admin` | `<WorkSuiteApp />` | Protected |
| `/vector-logic/*` | `<WorkSuiteApp />` (atrapa subpaths: `/board/:id[/gantt]`, `/backlog`, `/detections`, `/chat`) | Protected |
| `/profile` | `<WorkSuiteApp />` | Protected |
| `/admin` | `<WorkSuiteApp />` (renderiza `AdminShell` con `?mod=` y `?tab=` query params) | Protected |
| `/ui-kit` | `<UIKit />` standalone | Protected |
| `/` | redirige a `/jira-tracker/calendar` | — |
| `*` | redirige a `/jira-tracker/calendar` | — |

`<ProtectedRoute>`: si `useAuth().isLoading` muestra splash; si no hay token, redirige a `/login`.
`<PublicRoute>`: inverso — si hay token, redirige a `/jira-tracker/calendar`.

## Topbar

Renderizada en `WorkSuiteApp.tsx` arriba de todo, fija. Componentes:

| Posición | Componente | Hace |
|---|---|---|
| Izquierda | **AppSwitcher** | Grid de íconos por módulo. Click cambia route. Lee `users.modules` (jsonb) para ocultar módulos que el user oculta. Cada módulo tiene color de marca (Vector Logic accent, Jira Tracker blue, etc.). |
| Centro | (vacío en current shell — espacio reservado para búsqueda global futuro) | |
| Derecha | Locale switcher | Toggle ES/EN. Persiste en localStorage via `@worksuite/i18n`. |
| Derecha | World clock chip | Hora + ciudad del user (lee `vl_user_settings.home_timezone` de Vector Logic, fallback browser). |
| Derecha | **NotificationsBell** | Badge con count. Click abre dropdown con notificaciones de `notifications` table. |
| Derecha | Theme toggle | Sun/Moon. Cambia `data-theme="dark|light"` en `<html>` y persiste. |
| Derecha | **UserMenu** | Avatar del user. Click abre dropdown: Profile, Settings (admin), Logout. |

## Theme system

- 2 themes: `dark` (default) y `light`. Variable controlada via `data-theme` en `<html>`.
- Tokens definidos en `apps/web/src/WorkSuiteApp.css` con bloques `:root` (dark default) y `[data-theme="light"]` (overrides).
- 3 tipos de tokens:
  - **Color tokens** — `--bg`, `--sf`, `--sf2`, `--sf3`, `--bd`, `--ac`, `--tx`, `--green`, `--purple`, `--amber`, `--red`, etc.
  - **Typography tokens** — `--fs-2xs` … `--fs-display` (8 escalones), `--icon-xs` … `--icon-lg`, `--lh-tight/normal/loose`.
  - **Specialized tokens** — `--ac-grad`, `--ac-soft`, `--login-hero-gradient`, etc.
- Se preserva el theme en localStorage. CLAUDE.md prohíbe escribir hex literales en componentes — todo va por var().

## i18n

Implementado en `@worksuite/i18n`:
- Provider que envuelve la app.
- Locales en `packages/i18n/locales/{es,en}.json` (estructura nested por módulo, ej. `vectorLogic.fieldTitle`).
- Hook `useTranslation()` retorna `{ t, lang, setLang }`.
- `t(key, params?)` interpola `{var}` placeholders.
- `setLang(lang)` persiste en localStorage.

QA Agent verifica que ambos locales tengan las mismas keys (1500+ keys actualmente).

## Auth state

Provedor: `<AuthProvider>` en `apps/web/src/shared/hooks/useAuth.tsx`.
- Mantiene `{ user, token, isLoading, login, logout, refresh }`.
- En mount, lee `supabase.auth.getSession()`; si hay session, hace `supabase.from('users').select('*').eq('id', user.id)` para resolver el perfil + rol.
- Mapea `avatar_url → avatarUrl` (cleanup post-bug del 2026-04-26).
- `useAuth()` accesible globalmente.

## Global hooks compartidos

En `apps/web/src/shared/hooks/`:
- **`useAuth`** — sesión + perfil del user actual.
- **`useWorkSuiteData`** — lista de todos los users del workspace (para pickers, mentions, asignaciones). Cachea + revalida.
- **`useWorklogs`** — worklogs de Jira (compartido entre Jira Tracker, Chrono Admin Jira view).
- **`useHotDesk`** — datos compartidos de HotDesk (seats, reservations).
- **`useNotificaciones`** — feed de notificaciones global.

## Error boundaries / loading

- React Suspense para los lazy-loaded views (cada módulo viene como `lazy(() => import(...))`).
- Fallback genérico mientras carga (background `--bg`).
- No hay error boundary global — los errores de componentes individuales pueden romper la página entera. **Follow-up.**

## CSS root

`apps/web/src/WorkSuiteApp.css` es el archivo madre:
- Define `:root` y `[data-theme="light"]` con todos los tokens.
- Define clases globales `.topbar`, `.app-grid`, `.sidebar`, `.an-btn` (admin nav button), `.eh` (events header), etc.
- Tiene los keyframes globales (`fade-in`, `pulse-ring`, etc.).
- Cualquier cambio acá afecta toda la app — consultar antes de modificar.

## Conexiones

- **Supabase Auth** — login con email/password (Supabase Auth) o SSO (futuro — `sso_config` lista providers permitidos pero el flow real está pendiente).
- **`@worksuite/i18n`** — proveedor de traducciones.
- **Vercel** — el app se sirve desde `worksuite-phi.vercel.app`. Backend en `worksuite-api.vercel.app`.

## Estructura

```
apps/web/src/
├── main.tsx                  # bootstrap (createRoot + AuthProvider + I18nProvider)
├── AppRouter.tsx             # routes públicas / protegidas
├── WorkSuiteApp.tsx          # shell privado con topbar + lazy modules
├── WorkSuiteApp.css          # tokens + clases globales (un único archivo)
└── shared/
    ├── hooks/                # useAuth, useWorkSuiteData, etc.
    ├── auth/                 # legacy LoginPage location (real está en /modules/auth)
    ├── admin/                # AdminShell + secciones de admin
    └── ui/                   # UserMenu, AppSwitcher, NotificationsBell, etc.
```

## Out of scope (en este snapshot)

- Búsqueda global (la zona central de la topbar está vacía intencionalmente).
- Error boundary global con fallback amigable + reporting a Sentry/Vercel Logs.
- PWA / offline mode.
- Realtime presence (ver quién está conectado).
- Sistema de feature flags.
- Onboarding tour.
- Settings globales del user accesibles desde la topbar (hoy hay que ir a /profile o /admin).

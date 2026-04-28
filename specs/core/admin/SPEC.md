# Admin Panel — Core Spec

> **Snapshot spec (2026-04-29).** Documenta cómo está organizada la sección `/admin` y cómo cada módulo aporta su propia config. Sin este spec, un developer reconstruyendo la app no sabría dónde poner la config de cada módulo ni cómo se compone el shell admin.

## Overview

`/admin` es el shell único donde los administradores configuran todos los módulos de WorkSuite. Es accesible solo para users con `role='admin'`; un user normal que entra a la URL ve solo su sección personal de Jira (token).

El shell consiste en una sidebar con un nav-item por módulo administrable, y a la derecha el panel correspondiente del módulo seleccionado. La selección persiste en URL via `?mod=...` (deep linkable, ej. el "Configurar" del Vector Logic kebab navega directo a `/admin?mod=vectorlogic&tab=schema&typeId=...`).

## Estructura del shell

`apps/web/src/shared/admin/AdminShell.tsx`:

| Sidebar nav-item | `mod` | Componente | Para qué |
|---|---|---|---|
| Settings | `settings` | `AdminSettings.tsx` | Config global del workspace (sso, modules visibles default, etc.). |
| Users | `users` | `AdminUsers.tsx` | CRUD de usuarios del workspace (crear, editar rol, desactivar, cambiar avatar). |
| Roles & Perms | `roles` | `AdminRoles.tsx` | CRUD de la tabla `roles` (ver Auth spec). |
| HotDesk | `hotdesk` | `AdminHotDesk.tsx` (+ `AdminBlueprint.tsx` para editor de plantas) | Config de HotDesk: edificios, plantas, blueprints, asignaciones fijas, bloqueos, `hotdesk_config`. |
| Jira Config | `jiraconfig` | inline en `AdminSettings.tsx` (sección) | Config de la integración Jira (base URL, usuario sistema). |
| SSO | `sso` | inline en `AdminSettings.tsx` (sección) | `sso_config` toggles + AD group. |
| Retro Teams | `retroteams` | `AdminRetroTeamsShell.tsx` | CRUD de teams de retro + miembros. |
| Deploy Config | `deploy` | `AdminDeployConfig.tsx` | Versionado, statuses, repo groups, subtask config, filtros Jira para Deploy Planner. |
| Environments | `envtracker` | `AdminEnvTrackerSection.tsx` | CRUD entornos, statuses de reserva, política global, filtros Jira. |
| Chrono | `chrono` | `ChronoConfigSection.tsx` (de chrono-admin) | Config global de Chrono (jornada, tolerancias, geo whitelist) — la sección es una pieza compartida con el módulo `chrono-admin` standalone. |
| Vector Logic | `vectorlogic` | `AdminVectorLogic.tsx` | Sub-shell con tabs: Settings, States, Workflows (Canvas Designer), Schema (Task Entities), Assignment, Email Rules, AI Rules, MCP. |

UI Kit accesible desde un botón al pie del sidebar (abre `/ui-kit` en nueva pestaña).

## URL deep-linking

`AdminShell` lee `useSearchParams()` y mapea:
- `?mod=<id>` → tab activa de la sidebar.
- Default: `mod=settings`.
- Cada sub-shell (ej. `AdminVectorLogic`) puede leer params adicionales: `?tab=` para sub-tab, `?typeId=` para preselección. Se documenta en cada módulo.

Cambiar `mod` desde la sidebar pushea la URL via `setSearchParams`. Esto permite que rutas externas (un kebab desde Vector Logic) abran admin directamente en la sección correcta.

## Patrón de composición

Cada módulo escribe su sección admin **dentro de `apps/web/src/shared/admin/`** (no en `apps/web/src/modules/<module>/ui/`) — convención del proyecto. La sección importa el container del módulo y reusa los repos para evitar duplicar lógica de DB.

Ejemplo: `AdminVectorLogic.tsx` importa `taskTypeRepo`, `workflowRepo`, etc. desde `vector-logic/container.ts` y monta sub-views como `<SchemaBuilderView />` que también vive en `modules/vector-logic/ui/views/`.

**Excepción:** `chrono-admin` es un módulo entero separado (`apps/web/src/modules/chrono-admin/`) porque tiene mucha más superficie que un panel de admin (vistas día por equipo, fichajes, ficha de empleado, informes, etc.). Una pequeña sección `<ChronoConfigSection />` se reusa en `/admin → mod=chrono` para los settings globales.

## Permisos

- **Solo `users.role === 'admin'`** ve la sidebar completa.
- **Un user no-admin** que entra a `/admin` ve únicamente la sección de su token Jira personal (`PersonalJiraToken`), sin el shell. Esto se hace en `AdminShell.tsx:28-39` con un early return.

## Files modificados al agregar un nuevo módulo admin

Cuando un módulo nuevo necesita una sección de admin:
1. Crear `apps/web/src/shared/admin/AdminMyModule.tsx` (o sub-componentes en una carpeta).
2. Importar repos desde `apps/web/src/modules/my-module/container.ts`.
3. Editar `AdminShell.tsx` agregando el nav-item al array `NAV` + el render condicional.
4. Si necesita deep-linking con sub-tabs / params, leer `useSearchParams()` dentro y respetar la convención `?tab=` / `?<entityId>=`.

## Estructura

```
apps/web/src/shared/admin/
├── index.ts
├── AdminShell.tsx              # shell + sidebar + URL sync
├── AdminSettings.tsx           # mod=settings (con secciones inline)
├── AdminUsers.tsx              # mod=users
├── AdminRoles.tsx              # mod=roles
├── AdminHotDesk.tsx            # mod=hotdesk
├── AdminBlueprint.tsx          # editor visual de blueprints (usado dentro de AdminHotDesk)
├── AdminRetroTeamsShell.tsx    # mod=retroteams
├── AdminDeployConfig.tsx       # mod=deploy
├── AdminEnvTrackerSection.tsx  # mod=envtracker
└── AdminVectorLogic.tsx        # mod=vectorlogic (con sub-tabs)
```

`ChronoConfigSection` vive en `apps/web/src/modules/chrono-admin/ui/sections/` y se importa.

## Conexiones

- **Cada módulo expone su container** — el admin reusa los mismos repos.
- **Supabase RLS** — las queries que el admin hace (ver users de otra gente, editar config global) requieren que las policies acepten `EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')`. Está documentado en cada migration de cada módulo.
- **`@worksuite/ui`** — Modal, Btn, etc. Los específicos de admin viven en sus propios files.

## Out of scope (en este snapshot)

- Audit log de cambios admin (qué cambió, quién, cuándo).
- Multi-admin con permisos granulares (todos los admins son super-admin).
- Vista combinada de "Workspace Health" (uso de cada módulo, errores recientes, etc.).
- Export / import de la config completa del workspace.
- Modo lectura para un admin junior (read-only).
- Test mode / dry-run de cambios destructivos.

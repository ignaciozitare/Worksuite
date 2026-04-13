# WorkSuite

Plataforma unificada de utilidades de trabajo — Jira Tracker, HotDesk, RetroBoard, Deploy Planner, Environments, Chrono (Time Clock) y Chrono Admin (RRHH).

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| Backend | Node.js + Fastify + TypeScript (Vercel Functions) |
| Base de datos | Supabase (Postgres + Auth + RLS) |
| Jira | REST API v3 via JiraCloudAdapter |
| i18n | @worksuite/i18n (es/en) |
| UI Components | @worksuite/ui (GanttTimeline, JiraTicketSearch, StatusManager, DualPanelPicker, DateRangePicker, Btn, Modal, etc.) |
| Jira (frontend) | @worksuite/jira-service (search adapter + repo extraction util) |
| Deploy | Vercel (web + api auto-deploy on push to main) |
| Monorepo | npm workspaces |

## Estructura del monorepo

```
worksuite/
├── packages/
│   ├── shared-types/    ← Tipos TypeScript compartidos
│   ├── i18n/            ← Sistema de traducción (es/en)
│   ├── ui/              ← Componentes reutilizables (GanttTimeline, JiraTicketSearch, …)
│   ├── jira-client/     ← Cliente HTTP para Jira Cloud (usado por apps/api)
│   └── jira-service/    ← Servicio Jira de frontend (search adapter + utils)
├── apps/
│   ├── web/             ← React SPA (Vite)
│   │   └── src/
│   │       ├── modules/ ← jira-tracker, hotdesk, retro, deploy-planner,
│   │       │             environments, chrono, chrono-admin, profile, auth
│   │       └── shared/  ← admin, hooks, domain/ports, infra, lib, ui
│   └── api/             ← Fastify backend (hexagonal)
│       └── src/
│           ├── domain/         ← Interfaces puras
│           └── infrastructure/ ← Adapters (Supabase, Jira, HTTP routes)
└── docs/
```

## Módulos

| Módulo | Descripción |
|--------|------------|
| **Jira Tracker** | Imputación de horas, calendario, vista día, tareas (filtradas por rango), sidebar recientes, export CSV configurable con presets |
| **HotDesk** | Mapa de oficina, reservas de puesto, vista mensual, blueprints |
| **RetroBoard** | Retrospectivas estructuradas, kanban de accionables, historial |
| **Deploy Planner** | Releases, timeline Gantt, repo groups, subtareas (bugs/tests), métricas. Sidebar glass Stitch con nav items Material Symbols. Admin en tabs (Estados, Jira, Versiones, Repos, Subtareas) |
| **Environments** | Gestión de entornos con barra lateral (priority, disponibilidad), reservas, timeline, historial. Admin en tabs (Entornos, Estados, Filtro Jira, Política) |
| **Chrono** | Control horario: hero timer, bento stat cards, registros, fichajes incompletos, vacaciones, alarmas, informes. UI Stitch (Inter, Material Symbols, gradient buttons). Deep links vía `?view=` |
| **Chrono Admin (RRHH)** | Administración de empleados, equipos, aprobaciones, comparativa Jira vs fichaje, ficha encriptada (AES-256-GCM), informes CSV. UI Stitch con `ChronoStatCard` y tabs gradient |
| **Profile** | Página de perfil del usuario actual accesible desde el menú del avatar |

## Getting started

```bash
# 1. Instalar dependencias
npm install

# 2. Variables de entorno
# apps/web necesita: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_URL
# apps/api necesita: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET
# Edge Functions (Supabase dashboard → Functions → Secrets):
#   ENCRYPTION_KEY    ← clave maestra para AES-256-GCM de la ficha del empleado
#                       (server-side only, nunca llega al navegador)

# 3. Desarrollo local
npm run dev    # api + web en paralelo

# 4. Build
npm run build --workspace=apps/web

# 5. Tests (pure domain services)
npm run test --workspace=apps/web         # run once
npm run test:watch --workspace=apps/web   # watch mode
```

## Tests

Vitest runs against the pure domain services (`*.test.ts` next to the source).
No component tests yet — start with `RepoGroupService` and `SubtaskService` as
the pattern to follow. Adapters and repos are intentionally untested here; they
get covered by the Vercel preview smoke-test instead.

## Arquitectura

Hexagonal — ver [ARCHITECTURE.md](ARCHITECTURE.md) para detalles completos.

```
UI → Services/UseCases → Ports ← Infra (Supabase/Jira)
```

- 0 llamadas a `supabase.from()` fuera de `/infra/`
- 0 `fetch()` directos en UI — todo vía adapters
- Cada módulo: `domain/` + `infra/` + `ui/`

## Jira

La conexión se configura en Admin → Settings:
1. URL de Jira Cloud
2. Email de la cuenta
3. API Token (generar en id.atlassian.com)

Admin → Deploy Config permite:
- Mapear qué campo de Jira usar como Repository & Components
- Configurar tipos de subtareas (bug/test/other)
- Definir qué estados de Jira cierran cada tipo

## i18n

```tsx
import { useTranslation } from '@worksuite/i18n';
const { t } = useTranslation();
<button>{t('common.save')}</button>
```

Idioma se persiste en localStorage. Switchear con botones EN/ES en el topbar.

## Seguridad — Cifrado de datos sensibles

La ficha del empleado (`ch_ficha_empleado`) guarda campos sensibles encriptados con **AES-256-GCM**.
Encrypt/decrypt vive en una **Supabase Edge Function** (`ficha-empleado`), no en el navegador. La
clave maestra (`ENCRYPTION_KEY`) es un secret de Edge Functions y nunca llega al cliente. La función
también valida que el caller sea admin antes de leer/escribir.

Flujo:
```
UI → fichaRepo.getByUserId() → POST /functions/v1/ficha-empleado { action:'get', userId }
                              → Edge Function (verifica JWT + admin role)
                              → SELECT ch_ficha_empleado + decrypt
                              → JSON con datos en claro
```

Genera una clave aleatoria con:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

Configurar el secret: **Supabase Dashboard → Project Settings → Edge Functions → Secrets** →
`ENCRYPTION_KEY`.

⚠️ **No cambies la clave en producción** — los datos cifrados con la clave anterior quedarán ilegibles.
⚠️ **Guárdala en un gestor de secretos** (1Password, Bitwarden).

## Base de datos

Supabase Postgres. Schema completo en [ARCHITECTURE.md](ARCHITECTURE.md#base-de-datos-supabase).

Para ejecutar DDL:
```bash
export SUPABASE_ACCESS_TOKEN="..."
npx supabase db query --linked "ALTER TABLE ..."
```

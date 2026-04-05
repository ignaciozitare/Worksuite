# WorkSuite

Plataforma unificada de utilidades de trabajo — Jira Tracker, HotDesk, RetroBoard, Deploy Planner, Environments.

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| Backend | Node.js + Fastify + TypeScript (Vercel Functions) |
| Base de datos | Supabase (Postgres + Auth + RLS) |
| Jira | REST API v3 via JiraCloudAdapter |
| i18n | @worksuite/i18n (es/en) |
| UI Components | @worksuite/ui (GanttTimeline, JiraTicketSearch, StatusManager, Btn, Modal, etc.) |
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
│   │       ├── modules/ ← jira-tracker, hotdesk, retro, deploy-planner, environments
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
| **Jira Tracker** | Imputación de horas, calendario, vista día, tareas, sync con Jira |
| **HotDesk** | Mapa de oficina, reservas de puesto, vista mensual, blueprints |
| **RetroBoard** | Retrospectivas estructuradas, kanban de accionables, historial |
| **Deploy Planner** | Releases, timeline Gantt, repo groups, subtareas (bugs/tests), métricas |
| **Environments** | Gestión de entornos de despliegue, reservas con estados configurables, políticas, historial |

## Getting started

```bash
# 1. Instalar dependencias
npm install

# 2. Variables de entorno
# apps/web necesita: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_URL
# apps/api necesita: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET

# 3. Desarrollo local
npm run dev    # api + web en paralelo

# 4. Build
npm run build --workspace=apps/web
```

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

## Base de datos

Supabase Postgres. Schema completo en [ARCHITECTURE.md](ARCHITECTURE.md#base-de-datos-supabase).

Para ejecutar DDL:
```bash
export SUPABASE_ACCESS_TOKEN="..."
npx supabase db query --linked "ALTER TABLE ..."
```

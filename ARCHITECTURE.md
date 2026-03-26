# WorkSuite — Architecture

> Documento vivo. Actualizar con cada fase del refactor.

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| Backend | Node.js + Fastify + TypeScript |
| Base de datos | Supabase (Postgres + Auth + Edge Functions) |
| Deploy | Vercel (web + api como proyectos separados) |
| Monorepo | npm workspaces |

---

## Estructura del repositorio

```
worksuite/
├── packages/                    ← código compartido entre todas las apps
│   ├── shared-types/            ← tipos TypeScript de dominio
│   ├── i18n/                    ← sistema de traducción (es/en)
│   ├── ui/                      ← librería de componentes + tokens CSS
│   └── jira-client/             ← cliente HTTP para Jira Cloud API
│
└── apps/
    ├── web/                     ← React frontend
    │   └── src/
    │       ├── shared/
    │       │   ├── admin/       ← Panel admin (cross-cutting)
    │       │   ├── auth/        ← Login + useAuth
    │       │   ├── lib/         ← supabaseClient
    │       │   └── ui/          ← re-exports de @worksuite/ui
    │       └── modules/
    │           ├── jira-tracker/
    │           ├── hotdesk/
    │           ├── retro/
    │           └── deploy-planner/
    │
    └── api/                     ← Fastify backend
        └── src/
            ├── shared/          ← jiraConnection resolver
            ├── jira-tracker/    ← routes + domain
            └── deploy-planner/  ← routes + domain
```

---

## Arquitectura hexagonal por módulo

Cada módulo en `apps/web/src/modules/X/` sigue esta estructura:

```
modules/X/
├── domain/
│   ├── entities/      ← clases/tipos de dominio puro (sin frameworks)
│   ├── ports/         ← interfaces (contratos de repositorios)
│   └── useCases/      ← lógica de aplicación
├── infra/
│   └── supabase/      ← implementaciones de los puertos con Supabase
└── ui/
    └── *.tsx          ← componentes React (solo llaman a useCases)
```

**Regla de dependencias:**
```
ui → useCases → ports ← infra/supabase
```
- `domain/` no importa nada de `infra/` ni de `ui/`
- `ui/` no hace llamadas directas a Supabase
- `infra/` implementa los `ports/`

---

## Paquetes compartidos

### `@worksuite/shared-types`
Tipos TypeScript de dominio compartidos entre frontend y backend:
`WorksuiteUser`, `Blueprint`, `JiraIssue`, `RetroSession`, `Deployment`, etc.

### `@worksuite/i18n`
- Locales JSON en `locales/es.json` y `locales/en.json`
- Hook `useTranslation()` para componentes React
- `createTranslator(locale)` para código fuera de React
- Para añadir un idioma: crear `locales/XX.json` + añadir a `Locale` type

### `@worksuite/ui`
- Tokens CSS en `src/tokens/index.css` — dark/light mode vía variables `--ws-*`
- Componentes: `Btn`, `Avatar`, `Badge`, `Modal`, `Timeline`, `TimerBar`, `StatBox`
- **Regla**: ningún componente usa colores hardcodeados, solo variables `--ws-*`
- **Regla**: ningún componente importa Supabase ni lógica de dominio

### `@worksuite/jira-client`
- `JiraClient` — adaptador HTTP único para Jira Cloud REST API v3
- Usado por `apps/api/src/jira-tracker/` Y `apps/api/src/deploy-planner/`
- **Un solo cliente compartido** — JiraTracker y DeployPlanner no reimplementan auth

---

## Integración Jira — cómo funciona el token compartido

```
apps/api/src/shared/jiraConnection.ts
  └── resolveJiraClient(userId, supabase)
        ├── Si el usuario tiene jira_api_token → usa su token personal
        └── Si no → usa el token del admin (jira_connections tabla)

apps/api/src/jira-tracker/routes.ts
  └── import { resolveJiraClient } from '../shared/jiraConnection'
  └── import { createJiraClient }  from '@worksuite/jira-client'

apps/api/src/deploy-planner/routes.ts
  └── import { resolveJiraClient } from '../shared/jiraConnection'  ← misma función
  └── import { createJiraClient }  from '@worksuite/jira-client'    ← mismo cliente
```

---

## Internacionalización

```tsx
// En cualquier componente:
import { useTranslation } from '@worksuite/i18n';

function MyComponent() {
  const { t } = useTranslation();
  return <button>{t('common.save')}</button>;
}

// Estructura de claves:
// common.*        — acciones y estados genéricos
// auth.*          — login/logout
// nav.*           — navegación principal
// admin.*         — panel de administración
// jiraTracker.*   — módulo Jira Tracker
// hotdesk.*       — módulo HotDesk
// retro.*         — módulo RetroBoard
// deployPlanner.* — módulo Deploy Planner
```

---

## Design system

Importar tokens en el entry point de la app:
```tsx
// apps/web/src/main.tsx
import '@worksuite/ui/tokens';
```

Variables disponibles en todo el CSS:
```css
/* Superficies */   --ws-bg, --ws-surface, --ws-surface-2
/* Texto */         --ws-text, --ws-text-2, --ws-text-3
/* Bordes */        --ws-border, --ws-border-2
/* Estado */        --ws-green, --ws-red, --ws-amber, --ws-blue
/* Módulos */       --ws-jira, --ws-hotdesk, --ws-retro, --ws-deploy
/* Tipografía */    --ws-font-sans, --ws-font-heading
/* Espaciado */     --ws-space-{1-8}
/* Radio */         --ws-radius-{sm,md,lg,xl,full}
```

---

## Historial de fases

| Fase | Estado | Descripción |
|------|--------|-------------|
| 0 | ✅ Completo | Scaffolding monorepo: packages/, tsconfig, workspaces |
| 1 | ✅ Completo | `packages/ui` + `packages/i18n` + `packages/jira-client` + `packages/shared-types` |
| 2 | ⏳ Pendiente | Extraer dominio HotDesk |
| 3 | ⏳ Pendiente | Extraer dominio JiraTracker |
| 4 | ⏳ Pendiente | Extraer Admin a `shared/admin/` |
| 5 | ⏳ Pendiente | Extraer dominio Retro |
| 6 | ⏳ Pendiente | Scaffolding Deploy Planner |

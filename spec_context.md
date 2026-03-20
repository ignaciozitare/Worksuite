# WorkSuite — Software Design Document (SDD)
> **Versión:** 2.0 · **Última actualización:** Marzo 2026  
> **Propósito:** Fuente única de verdad para agentes de IA y desarrolladores. Leer completo antes de generar o modificar código. Actualizar en cada iteración significativa.

---

## 1. Visión del producto

WorkSuite es una plataforma interna que unifica dos herramientas de trabajo diario:

| Módulo | Descripción |
|---|---|
| **Jira Tracker** | Imputación de horas contra issues de Jira Cloud con sincronización manual |
| **HotDesk** | Reserva de puestos de oficina por día con mapa SVG y vista tabla mensual |

Usuarios objetivo: equipos técnicos medianos (5–50 personas) con instancia propia de Jira Cloud.

---

## 2. Stack tecnológico

| Capa | Tecnología | Versión | Notas |
|---|---|---|---|
| Frontend | React + Vite + TypeScript | 18 / 5 / 5.4 | SPA, sin SSR |
| Backend | Fastify + TypeScript | 4 / 5.4 | Node ESM, arquitectura hexagonal |
| Base de datos | Supabase Postgres | 15 | Con RLS habilitado |
| Auth | Supabase Auth + JWT propio | — | JWT firmado por backend |
| Jira | REST API v3 | — | Basic Auth: email + API token por usuario |
| Deploy frontend | Vercel SPA | — | Proyecto: `worksuite` |
| Deploy backend | Vercel Serverless | — | Proyecto: `worksuite-api`, root: `apps/api` |
| Tipos compartidos | `@worksuite/shared-types` | workspace | Resuelto por alias Vite, sin compilar |

---

## 3. Estructura del repositorio

Un único repo GitHub (`ignaciozitare/Worksuite`) con dos proyectos Vercel.

```
worksuite/                              ← raíz del repo
├── vercel.json                         ← config deploy FRONTEND
├── package.json                        ← workspaces root
├── tsconfig.base.json
├── spec_context.md                     ← este archivo
│
├── apps/
│   ├── api/                            ← BACKEND Fastify
│   │   ├── vercel.json                 ← config deploy BACKEND (root: apps/api)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   ├── api/
│   │   │   └── index.ts               ← handler Vercel Serverless
│   │   └── src/
│   │       ├── app.ts                 ← Fastify factory (singleton)
│   │       ├── server.ts              ← entry point solo dev local
│   │       ├── domain/
│   │       │   ├── worklog/
│   │       │   │   ├── Worklog.ts
│   │       │   │   ├── IWorklogRepository.ts
│   │       │   │   └── IJiraApi.ts
│   │       │   └── hotdesk/
│   │       │       ├── HotDesk.ts
│   │       │       └── IHotDeskRepository.ts
│   │       ├── application/
│   │       │   ├── worklog/
│   │       │   │   ├── LogWorklog.ts
│   │       │   │   └── DeleteWorklog.ts
│   │       │   └── hotdesk/
│   │       │       ├── MakeReservation.ts
│   │       │       └── ReleaseReservation.ts
│   │       └── infrastructure/
│   │           ├── http/
│   │           │   ├── authRoutes.ts
│   │           │   ├── worklogRoutes.ts
│   │           │   ├── hotdeskRoutes.ts
│   │           │   └── jiraRoutes.ts
│   │           ├── jira/
│   │           │   ├── JiraCloudAdapter.ts
│   │           │   └── MockJiraAdapter.ts
│   │           └── supabase/
│   │               ├── SupabaseWorklogRepo.ts
│   │               └── SupabaseHotDeskRepo.ts
│   │
│   └── web/                           ← FRONTEND React
│       ├── package.json
│       ├── vite.config.ts
│       ├── tsconfig.json
│       ├── index.html
│       └── src/
│           ├── WorkSuiteApp.tsx       ← componente raíz (~1630 líneas)
│           ├── AppRouter.tsx
│           ├── main.tsx
│           ├── modules/auth/
│           │   └── LoginPage.tsx
│           └── shared/
│               ├── hooks/useAuth.tsx
│               └── lib/api.ts
│
├── packages/
│   └── shared-types/src/index.ts
│
└── docs/
    ├── supabase-schema.sql
    ├── migration_jira_connections.sql
    └── migration_add_jira_worklog_id.sql
```

---

## 4. Arquitectura hexagonal (ports & adapters)

La dependencia siempre va hacia el centro. El dominio nunca importa infraestructura.

```
[ HTTP Routes ]
      ↓
[ Use Cases (Application) ]
      ↓
[ Domain + Puertos (interfaces) ]
      ↑
[ Adaptadores: Supabase, Jira, Mock ]
```

**Regla absoluta:** `domain/` y `application/` no pueden importar nada de `infrastructure/`.

---

## 5. Puertos de dominio

### `IJiraApi`
```typescript
interface IJiraApi {
  getProjects(): Promise<JiraProject[]>
  getIssues(projectKey: string): Promise<JiraIssue[]>
  addWorklog(issueKey: string, seconds: number, startedAt: string, comment?: string): Promise<JiraWorklogResult>
}
```
Implementaciones: `JiraCloudAdapter` (prod) · `MockJiraAdapter` (dev/tests)

### `IWorklogRepository`
```typescript
interface IWorklogRepository {
  save(worklog: Worklog): Promise<void>
  delete(worklogId: string, authorId: string): Promise<void>
  findByFilters(filters: WorklogFilters): Promise<Worklog[]>
  findById(id: string): Promise<Worklog | null>
}
```

### `IHotDeskRepository`
```typescript
interface IHotDeskRepository {
  getSeats(): Promise<Seat[]>
  getReservations(from: string, to: string): Promise<SeatReservation[]>
  getFixedAssignments(): Promise<FixedAssignment[]>
  saveReservation(reservation: SeatReservation): Promise<void>
  deleteReservation(seatId: string, date: string, userId: string): Promise<void>
  upsertFixedAssignment(assignment: FixedAssignment): Promise<void>
  removeFixedAssignment(seatId: string): Promise<void>
}
```

---

## 6. API REST

**URL producción backend:** `https://worksuite-api-ignaciozitare-9429s-projects.vercel.app`  
**URL local:** `http://localhost:3001`  
**Auth:** `Authorization: Bearer <JWT>` en todas las rutas excepto `/auth/login` y `/health`

**Formato respuesta:**
```json
{ "ok": true,  "data": { ... } }
{ "ok": false, "error": { "code": "DOMAIN_ERROR", "message": "..." } }
```

### Auth
| Método | Ruta | Body | Descripción |
|---|---|---|---|
| POST | `/auth/login` | `{email, password}` | JWT propio + perfil |
| GET | `/auth/me` | — | Perfil del usuario autenticado |

### Worklogs
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/worklogs` | Crea worklog local — **no sincroniza Jira** |
| DELETE | `/worklogs/:id` | Solo owner o admin |
| GET | `/worklogs?from=&to=&authorId=&projectKeys=` | Admin ve todos; user solo los suyos |

### Jira (credenciales por usuario)
| Método | Ruta | Body | Descripción |
|---|---|---|---|
| GET | `/jira/connection` | — | Estado conexión del usuario |
| POST | `/jira/connection` | `{baseUrl, email, apiToken}` | Valida contra Jira antes de guardar |
| DELETE | `/jira/connection` | — | Elimina credenciales |
| GET | `/jira/projects` | — | Proyectos Jira del usuario |
| GET | `/jira/issues?project=X` | — | Issues de un proyecto |
| POST | `/jira/worklogs/:issueKey/sync` | `{worklogId, seconds, startedAt, description?}` | Sync a Jira + actualiza flag |

### HotDesk
| Método | Ruta | Body | Descripción |
|---|---|---|---|
| GET | `/hotdesk/map?date=` | — | Estado del mapa para un día |
| GET | `/hotdesk/table?year=&month=` | — | Todos los días del mes |
| POST | `/hotdesk/reservations` | `{seatId, dates[]}` | Reserva (soporta multidía) |
| DELETE | `/hotdesk/reservations/:seatId/:date` | — | Libera — owner o admin |

---

## 7. Base de datos (Supabase)

### Tablas principales

```sql
public.users (
  id uuid PK → auth.users,  name text,  email text UNIQUE,
  role text CHECK(admin|user) DEFAULT user,
  desk_type text CHECK(none|hotdesk|fixed) DEFAULT hotdesk,
  avatar text,  active boolean DEFAULT true,  created_at timestamptz
)

public.worklogs (
  id text PK,  issue_key text,  issue_summary text,  issue_type text,
  epic_key text,  epic_name text,  project_key text,
  author_id uuid → users,  author_name text,
  date date,  started_at time,  seconds int CHECK(>0 AND <=86400),
  description text,  synced_to_jira boolean DEFAULT false,
  jira_worklog_id text NULL,  created_at timestamptz
)

public.seats (id text PK, zone text, label text, x int, y int)

public.seat_reservations (
  id text PK,  seat_id text → seats,  user_id uuid → users,
  user_name text,  date date,  created_at timestamptz,
  UNIQUE(seat_id, date)
)

public.fixed_assignments (
  seat_id text PK → seats,  user_id uuid → users,  user_name text
)

public.jira_connections (
  user_id uuid PK → auth.users,  base_url text,  email text,
  api_token text,  projects text[] DEFAULT '{}',
  connected_at timestamptz,  updated_at timestamptz
)
```

### RLS

| Tabla | Lectura | Escritura |
|---|---|---|
| `users` | pública | propio o admin |
| `worklogs` | propio o admin | insert propio; delete propio o admin |
| `seats` | pública | solo admin |
| `seat_reservations` | pública | insert propio; delete propio o admin |
| `fixed_assignments` | pública | solo admin |
| `jira_connections` | propio o service_role | propio o service_role |

---

## 8. Deploy y variables de entorno

### Frontend — proyecto Vercel `worksuite`
- **Root dir:** `.` (raíz del repo)
- **Build:** `npm install --prefix apps/web && npm run build --prefix apps/web`
- **Output:** `apps/web/dist`

```
VITE_SUPABASE_URL      = https://hmuzkfvfqabdvbolpihg.supabase.co
VITE_SUPABASE_ANON_KEY = <anon key>
VITE_API_URL           = https://worksuite-api-ignaciozitare-9429s-projects.vercel.app
```

### Backend — proyecto Vercel `worksuite-api`
- **Root dir:** `apps/api`
- **Handler:** `api/index.ts` adapta Fastify para Vercel Serverless
- **Singleton:** `src/app.ts` devuelve instancia Fastify cacheada entre invocaciones

```
SUPABASE_URL              = https://hmuzkfvfqabdvbolpihg.supabase.co
SUPABASE_SERVICE_ROLE_KEY = <service role key — nunca en frontend>
JWT_SECRET                = <string aleatorio ≥32 chars>
ALLOWED_ORIGIN            = https://worksuite-ignaciozitare-9429s-projects.vercel.app
```

> No hay variables `JIRA_*`. Las credenciales Jira son por usuario y viven en `jira_connections`.

---

## 9. Frontend — WorkSuiteApp.tsx

Componente raíz único (~1630 líneas). Decisión deliberada para fase prototipo.

### Estado principal
```typescript
wls: WorklogsMap              // worklogs de Supabase, agrupados por fecha
hd: HdState                   // { fixed: Record<seatId,userId>, reservations[] }
users: MockUserUI[]           // ⚠️ MOCK — pendiente conectar a Supabase
jiraIssues: MockIssue[]       // de /jira/issues o MOCK_ISSUES como fallback
jiraProjects: {key,name}[]    // de /jira/projects o MOCK_PROJECTS como fallback
lang: string                  // es | en — persiste en localStorage
theme: string                 // dark | light — persiste en localStorage
```

### Patrón rollback (obligatorio en todos los handlers de escritura)
```typescript
const snapshot = { ...state }
setState(optimisticValue)
try {
  await supabase.from(...).operation()
  showToast(t('saved'))
} catch (e) {
  setState(snapshot)           // rollback
  showToast(t('errorSaving'), 'err')
}
```

### Flujo de carga `loadAll()`
1. Paralelo: `worklogs` + `seat_reservations` + `fixed_assignments` de Supabase
2. `GET /jira/projects` con JWT del usuario
3. Si hay proyectos → `GET /jira/issues?project=X` (prefiere `ANDURIL`)
4. Si Jira falla → silencioso, usa datos mock

---

## 10. Autenticación

1. Login → `POST /auth/login` → backend verifica con Supabase Auth → devuelve JWT propio
2. JWT propio firmado con `JWT_SECRET` (contiene `sub`, `role`, `name`)
3. Frontend guarda JWT en contexto React (`useAuth`)
4. Llamadas a Supabase desde frontend: cliente Supabase con anon key + RLS
5. Llamadas al backend: `Authorization: Bearer <JWT propio>`
6. Backend usa `service_role_key` → bypasea RLS → puede leer `jira_connections` de cualquier usuario

### `useAuth` — detalles críticos
- `loadUser` es `useCallback` con deps `[]` — evita stale closure
- Efecto de inicialización usa `loadUserRef` (ref estable)
- `login()` declara `loadUser` en su dep array

---

## 11. Reglas de negocio

### Jira Tracker
- `TimeSpent`: acepta `2h`, `1h 30m`, `45m`, `1.5` — máximo 86400s (24h) por entrada
- `Worklog.create()` lanza si `issueKey` vacío o fecha no es `YYYY-MM-DD`
- Sincronización a Jira siempre manual y explícita — `POST /worklogs` nunca sincroniza
- Si sync falla → worklog local permanece con `synced_to_jira: false`

### HotDesk
- Sin reservas en sábado ni domingo
- Puestos con `fixed_assignment` no pueden ser reservados
- UNIQUE (`seat_id`, `date`) — una reserva por puesto por día
- Re-reservar el propio puesto es idempotente (permitido)
- Solo owner o admin pueden liberar una reserva

---

## 12. Convenciones

| Regla | Detalle |
|---|---|
| TypeScript strict | `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns` |
| ESM puro | imports locales del backend con extensión `.js` |
| Hexagonal | nunca importar `infrastructure/` desde `domain/` o `application/` |
| Rollback | snapshot + rollback en todos los handlers de escritura del frontend |
| onConflict v2 | `{ onConflict: ['col1', 'col2'] }` — array, no string |
| Sin @ts-nocheck | prohibido en todo el codebase |
| Scripts en Node.js | nunca Python para manipular archivos del proyecto |
| Archivos completos | los agentes entregan el archivo completo, nunca fragmentos |

---

## 13. Tests

**Framework:** Vitest

| Capa | Estrategia |
|---|---|
| `domain/` | Tests puros, sin I/O, sin mocks de infra |
| `application/` | Puertos mockeados con `vi.fn()` |
| `infrastructure/` | Excluida del coverage automático |

| Test | Cubre |
|---|---|
| `domain/worklog/__tests__/Worklog.test.ts` | `TimeSpent.parse/format`, `Worklog.create` |
| `domain/hotdesk/__tests__/HotDesk.test.ts` | `ReservationService.canReserve/canRelease/isWeekend` |
| `application/worklog/__tests__/LogWorklog.test.ts` | `LogWorklog.execute` — validaciones, persistencia |

---

## 14. Decisiones de arquitectura (ADR)

| ADR | Decisión |
|---|---|
| 001 | Arquitectura hexagonal — dominio puro, puertos, adaptadores |
| 002 | Vercel + Supabase — deploy sin ops para prototipo |
| 003 | Dos proyectos Vercel, un repo GitHub |
| 004 | `shared-types` resuelto por alias Vite, sin compilar en el deploy |
| 005 | Credenciales Jira por usuario en `jira_connections`, sin env vars globales |
| 006 | Sincronización Jira manual y explícita — nunca automática |
| 007 | `WorkSuiteApp.tsx` monolítico durante prototipo — separar en módulos es trabajo pendiente |

---

## 15. Backlog técnico

| Prioridad | Tarea |
|---|---|
| 🔴 Alta | Conectar `users` a Supabase real (actualmente `MOCK_USERS`) |
| 🔴 Alta | Tests de integración contra Supabase test project |
| 🟡 Media | Paginación en `GET /worklogs` |
| 🟡 Media | Separar `WorkSuiteApp.tsx` en módulos (`jira-tracker/`, `hotdesk/`, `admin/`) |
| 🟡 Media | Sync bulk Jira — re-sincronizar todos los worklogs pendientes |
| 🟡 Media | Cargar issues de múltiples proyectos Jira, no solo el primero |
| 🟢 Baja | Notificaciones email/Slack al confirmar reserva |
| 🟢 Baja | Auto-release de reservas al final del día |

---

## 16. Instrucciones para agentes de IA

Antes de escribir código:

1. Leer este documento completo
2. Identificar la capa afectada (domain / application / infrastructure / web)
3. Respetar la dirección de dependencias — nunca infra → dominio
4. Si cambia un puerto → actualizar TODOS los adaptadores y tests
5. Entregar archivos completos — sin fragmentos ni diffs
6. Añadir test para cambios en `domain/` o `application/`
7. Aplicar patrón rollback en handlers de escritura del frontend
8. Imports ESM con `.js` en el backend
9. `onConflict` como `string[]` en Supabase v2
10. **Actualizar `spec_context.md`** si se añaden rutas, tablas, módulos o ADRs

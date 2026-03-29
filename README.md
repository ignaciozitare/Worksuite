# WorkSuite

Unified work utilities platform — Jira Tracker + HotDesk.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + TypeScript |
| Backend | Fastify + TypeScript (Vercel Functions) |
| Database | Supabase (Postgres + Auth + RLS) |
| Jira | REST API v3 (Mock adapter for dev) |
| Testing | Vitest + Testing Library |
| Deploy | Vercel + Supabase |

## Monorepo structure

```
worksuite/
├── apps/
│   ├── api/                    ← Fastify backend (hexagonal)
│   │   └── src/
│   │       ├── domain/         ← Pure business logic, zero deps
│   │       ├── application/    ← Use cases
│   │       └── infrastructure/ ← Adapters (Supabase, Jira, HTTP)
│   └── web/                    ← React frontend
│       └── src/
│           ├── modules/        ← jira-tracker, hotdesk, admin
│           └── shared/         ← components, hooks, lib
├── packages/
│   └── shared-types/           ← Domain types shared by api + web
└── docs/
    ├── specs/                  ← Living specifications per domain
    ├── adr/                    ← Architecture Decision Records
    └── api/                    ← OpenAPI contract
```

## Getting started

```bash
# 1. Install
npm install

# 2. Set env vars (copy and fill)
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# 3. Run tests
npm test

# 4. Dev server (api + web in parallel)
npm run dev
```

## Environment variables

See `docs/adr/002-vercel-supabase.md` for the full list.

## Supabase setup

1. Create a new Supabase project at https://supabase.com
2. Run the SQL from `docs/specs/jira-tracker.md` and `docs/specs/hotdesk.md` in the SQL editor
3. Copy the project URL and keys to your `.env` files

## Jira setup

When ready:
1. Generate an API token at https://id.atlassian.com/manage-profile/security/api-tokens
2. Set `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` in `apps/api/.env`
3. Switch the adapter in `apps/api/src/server.ts` from `MockJiraAdapter` to `JiraCloudAdapter`

## Documentation

- `docs/specs/jira-tracker.md` — Jira Tracker domain spec
- `docs/specs/hotdesk.md` — HotDesk domain spec  
- `docs/adr/` — Architecture decisions

## Restore `main` from an older Vercel deployment

If you promoted an old deployment in Vercel and want GitHub `main` to match that exact version:

1. Find the deployment's commit SHA in Vercel:
   - Open the deployment URL in Vercel
   - Go to **Source** / **Git Commit** details
   - Copy the full SHA (example: `abc123...`)
2. In your local clone, fetch `main` and create a safety backup branch:
   ```bash
   git fetch origin
   git checkout main
   git pull origin main
   git branch backup/main-before-rollback-$(date +%Y%m%d)
   ```
3. Move `main` to the deployment commit:
   ```bash
   git reset --hard <DEPLOYMENT_COMMIT_SHA>
   ```
4. Force-push with lease (safer than plain `--force`):
   ```bash
   git push --force-with-lease origin main
   ```
5. Verify:
   - GitHub `main` now points to the same commit
   - Vercel new production deployment should be created from that commit

> Tip: if the deployment was not linked to a Git commit (rare/manual deploy), export/download source from that deployment first and commit it manually, then push to `main`.

## Testing approach

- **Domain tests:** Pure unit tests, no I/O, no mocks needed
- **Use case tests:** Ports mocked with `vi.fn()`, no real DB or HTTP
- **Integration tests (future):** Against a Supabase test project
- **QA review:** After each feature iteration, bugs are filed with severity + repro steps

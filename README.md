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

## Fix production rollback: make GitHub `main` match a promoted Vercel deployment

For this deployment URL:

`https://vercel.com/ignaciozitare-9429s-projects/worksuite/9GVxFjjpnKGxLbvebmB92m5xh9Yu`

the direct solution is to move `main` to the **same commit SHA** used by that deployment, then push that SHA to GitHub.

### Exact commands to run

1. In Vercel, open the deployment above and copy the **Git Commit SHA** shown in the deployment details.
2. Run:

```bash
git fetch origin
git checkout main
git pull origin main
git branch backup/main-before-vercel-rollback-$(date +%Y%m%d)
git reset --hard <SHA_FROM_VERCEL_DEPLOYMENT>
git push --force-with-lease origin main
```

### Why this solves your request

- `git reset --hard <SHA>` makes local `main` exactly that old version.
- `git push --force-with-lease origin main` makes remote GitHub `main` point to the same commit.
- After push, GitHub `main` and your promoted Vercel version are aligned.

### Important edge case

If that deployment was created without a linked Git commit (manual upload/build artifact), there is no SHA to reset to. In that case, download/rebuild that source, commit it to `main`, and push normally.

## Testing approach

- **Domain tests:** Pure unit tests, no I/O, no mocks needed
- **Use case tests:** Ports mocked with `vi.fn()`, no real DB or HTTP
- **Integration tests (future):** Against a Supabase test project
- **QA review:** After each feature iteration, bugs are filed with severity + repro steps

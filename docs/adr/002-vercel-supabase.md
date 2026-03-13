# ADR-002 — Vercel + Supabase for initial deployment

**Date:** 2026-03-11  
**Status:** Accepted

## Context
We need a deployment platform that is low-ops for an initial prototype,
supports TypeScript/Node, and pairs well with a managed Postgres.

## Decision
- **Frontend (apps/web):** Vercel — zero config for Vite/React, preview deployments per PR
- **Backend (apps/api):** Vercel Serverless Functions — co-deployed, no separate infra
- **Database + Auth:** Supabase — managed Postgres, built-in Auth with JWT, Row Level Security, real-time subscriptions for future use

## Migration path
If we need long-running processes (reservation reminders, Jira sync jobs):
- Move `apps/api` to Railway or Fly.io
- Supabase stays, only the compute moves
- No domain or application code changes required (hexagonal architecture)

## Environment variables
```
# apps/api
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
JIRA_BASE_URL=           # e.g. https://yourcompany.atlassian.net
JIRA_EMAIL=
JIRA_API_TOKEN=
JWT_SECRET=

# apps/web
VITE_API_URL=
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

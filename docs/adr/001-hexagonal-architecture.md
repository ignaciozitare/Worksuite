# ADR-001 — Hexagonal Architecture (Ports & Adapters)

**Date:** 2026-03-11  
**Status:** Accepted

## Context
WorkSuite has two bounded contexts (JiraTracker, HotDesk) each with external dependencies:
Jira Cloud API, Supabase, and potentially Slack notifications in the future.
We need to be able to test domain logic without any infrastructure, and swap
implementations (e.g. MockJira → JiraCloud) without touching business logic.

## Decision
Use Hexagonal Architecture:
- **Domain layer:** Pure TypeScript classes, zero imports from frameworks or libs
- **Application layer:** Use cases that orchestrate domain objects, depend only on port interfaces
- **Infrastructure layer:** Adapters that implement ports (Supabase, Jira, HTTP)
- **Ports:** TypeScript interfaces defined in the domain, implemented in infrastructure

## Structure
```
domain/
  worklog/
    Worklog.ts          ← entity + value objects
    IWorklogRepository.ts ← port (interface)
    IJiraApi.ts          ← port (interface)
application/
  worklog/
    LogWorklog.ts        ← use case, depends on ports
infrastructure/
  jira/
    MockJiraAdapter.ts   ← implements IJiraApi
    JiraCloudAdapter.ts  ← implements IJiraApi
  supabase/
    SupabaseWorklogRepo.ts ← implements IWorklogRepository
```

## Consequences
- Domain tests run with zero I/O, no mocking of HTTP
- Adding a new adapter (e.g. Slack) does not touch domain or application code
- Each bounded context is independently testable and deployable

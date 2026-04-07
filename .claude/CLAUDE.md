#  Project Working Rules

## Design Principles
- Apply SOLID principles when they improve clarity, maintainability, and extensibility.
- Prioritize KISS: choose the simplest solution that correctly solves the problem.
- Avoid overengineering, unnecessary abstractions, and premature complexity.

## Architecture
- We always work with Hexagonal Architecture.
- Domain must not depend on Infrastructure or frameworks.
- Application contains use cases and ports.
- Infrastructure implements adapters and access to external systems.
- Do not place business logic in controllers, handlers, routers, or UI components.

## Shared Packages
- Any logic, service, or component that is reused across multiple modules must live in `packages/` as a shared package — not duplicated in each module.
- This includes: UI components (`@worksuite/ui`), translations (`@worksuite/i18n`), shared types (`@worksuite/shared-types`), external service clients (`@worksuite/jira-client`, `@worksuite/jira-service`), etc.
- Each shared package must follow the hexagonal architecture: domain (ports/entities) does not depend on infrastructure or frameworks.
- Before creating a new adapter, service, or utility in a module, check if it already exists in `packages/` or if it should be extracted there.
- This keeps the codebase clean, efficient, maintainable, and scalable.

## UI Components
- Reuse the existing component library (`packages/ui`) whenever possible.
- Do not create new components if an existing one can solve the need with reasonable changes.
- If a new component is created and it is reusable, add it to the component library following the project conventions.

## Before Writing Code
- First, briefly summarize what is going to be built.
- Then indicate which layer, module, or area of the system each piece belongs to.
- If a solution breaks the architecture or these principles, do not implement it that way; propose a compatible alternative instead.

## Quality
- Keep naming clear and consistent.
- Reuse existing project patterns when appropriate.
- Explain which files are created or modified.
- Propose or add tests when appropriate.

## Validation and Basic Security
- Validate inputs at the system boundaries.
- Do not trust data coming from users or external systems.
- Sanitize and validate data according to context.
- Do not hardcode secrets, tokens, or passwords.
- Protect sensitive data appropriately.

## Multi-language (i18n)
- All user-facing strings must use `t()` from `@worksuite/i18n` — never hardcode Spanish or English text in components.
- When creating or modifying any component, verify that all visible text uses translation keys.
- If new keys are needed, add them to both `packages/i18n/locales/es.json` and `packages/i18n/locales/en.json`.
- Before committing, check that the EN/ES switch works correctly on the affected views.

## Documentation
- If the architecture, project structure, or an important technical decision changes, update `ARCHITECTURE.md`.
- If installation, usage, commands, workflows, or developer-relevant structure changes, update `README.md`.
- Keep documentation aligned with the code.
- **`SPEC_CONTEXT.md` is a snapshot of the real project state.** Only update it once a change has been verified as **stable in production** (deployed, smoke-tested, no regressions reported by the user). Until then, keep changes in `ARCHITECTURE.md` / `README.md` only. When the user confirms a change is stable, sync `SPEC_CONTEXT.md` in the same commit.

## Pre-commit Checklist
**This checklist is mandatory and non-negotiable. Do not consider any task complete until every item below has been explicitly verified. Run each check and report the result before marking work as done.**

1. **Hexagonal architecture**: confirm no `supabase.from()` exists outside `/infra/`, and no `fetch()` in UI — all DB/API access goes through ports and adapters. If a violation is found, fix it before proceeding.
2. **i18n**: confirm no hardcoded user-facing strings — all text uses `t()` with keys present in both `es.json` and `en.json`. Add missing keys if needed.
3. **UI components**: confirm reusable components are in `packages/ui`, not duplicated inline.
4. **Documentation**: if structure or architecture changed, update `ARCHITECTURE.md` and `README.md` accordingly.
5. **Build passes**: run `npx vite build` and confirm it succeeds without errors. If it fails, fix it before finishing.
6. **No secrets**: confirm no tokens, keys, or passwords are hardcoded in any source file.

## Deployment Rules
- After committing, always push to `main` and verify the Vercel deploy succeeds (state = READY).
- If the deploy fails, fix it immediately and push again.
- Use `git push origin main` to trigger deploys. Vercel auto-deploys from the GitHub integration.
- If `git push` hangs or fails due to credentials, retry — do not leave commits unpushed.
- After pushing, verify the deploy via the Vercel MCP tool (`list_deployments`) and report the result.

## Working Style
- Be direct and practical.
- Prioritize simple, maintainable, and consistent solutions.
- If there are tradeoffs or uncertainties, explain them briefly.

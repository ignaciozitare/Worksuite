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

## UI Components
- Reuse the existing component library whenever possible.
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

## Internationalization (i18n)
- All user-facing strings must use `t()` from `@worksuite/i18n` — never hardcode Spanish or English text in components.
- When creating or modifying any component, verify that all visible text uses translation keys.
- If new keys are needed, add them to both `packages/i18n/locales/es.json` and `packages/i18n/locales/en.json`.
- Before committing, check that the EN/ES switch works correctly on the affected views.

## Documentation
- If the architecture, project structure, or an important technical decision changes, update `ARCHITECTURE.md`.
- If installation, usage, commands, workflows, or developer-relevant structure changes, update `README.md`.
- Keep documentation aligned with the code.

## Pre-commit Checklist
Before every commit, validate that:
1. **Hexagonal architecture**: no `supabase.from()` outside `/infra/`, no `fetch()` in UI — all DB/API access through ports and adapters.
2. **i18n**: no hardcoded user-facing strings — all text uses `t()` with keys in both es.json and en.json.
3. **UI components**: reusable components are in `packages/ui`, not duplicated inline.
4. **Documentation**: if structure or architecture changed, `ARCHITECTURE.md` and `README.md` are updated.
5. **Build passes**: `npx vite build` succeeds without errors.
6. **No secrets**: no tokens, keys, or passwords hardcoded in source files.

## Working Style
- Be direct and practical.
- Prioritize simple, maintainable, and consistent solutions.
- If there are tradeoffs or uncertainties, explain them briefly.

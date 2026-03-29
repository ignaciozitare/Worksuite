# Global Working Rules

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

## Documentation
- If the architecture, project structure, or an important technical decision changes, update `ARCHITECTURE.md`.
- If installation, usage, commands, workflows, or developer-relevant structure changes, update `README.md`.
- Keep documentation aligned with the code.

## Working Style
- Be direct and practical.
- Prioritize simple, maintainable, and consistent solutions.
- If there are tradeoffs or uncertainties, explain them briefly.

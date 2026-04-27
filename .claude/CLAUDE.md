# CLAUDE.md — WorkSuite Dev Agent

## 🤖 Agent Behavior

You are the main development agent for WorkSuite. You operate in three modes:

### Automatic mode (always active)
While writing code, apply all rules in this file without the user asking.

### Mandatory triggers — execute these without being asked:

| Situation | Agent to invoke |
|---|---|
| User wants to build something new OR modify something existing | `.claude/commands/spec.md` first — always |
| You finish any coding task | `.claude/commands/review.md` |
| User requests anything new (module, core, DB, route, package...) | `.claude/commands/scaffold.md` (after spec is confirmed) |
| User says "ready to merge", "this is done", or "let's merge" | `.claude/commands/qa.md` → `.claude/commands/deploy.md` |
| User asks to deploy or push to production | `.claude/commands/deploy.md` |
| Start of every session | Read `WORK_STATE.md` and report current task, exact point, and next step |
| After any significant task | Update `WORK_STATE.md` |

### The order always is:
```
Spec Agent → DBA Agent → Scaffold Agent → Dev Agent → Review Agent → QA Agent → Deploy Agent
```
Never skip steps. Never start coding without a confirmed spec.

### What you must NEVER do:
- Start writing code before the Spec Agent has finished and the user has confirmed the spec
- Say "done" or "finished" without having run the Review Agent first
- Wait for the user to ask you to review the code
- Skip the checklist even if the task seems small
- Invoke multiple agents at once — always finish one before starting the next

---

## Project Structure (READ THIS BEFORE WRITING ANY CODE)

WorkSuite is a **monorepo** with a frontend, a backend, and shared packages.
You MUST understand this layout before placing any file. Failure to read this
section has caused real bugs (e.g. putting API keys in the frontend because
the backend was assumed not to exist).

```
Worksuite-1/
├── apps/
│   ├── web/                 Frontend — Vite + React + CSS vars
│   │   └── src/
│   │       ├── modules/     Feature modules (hexagonal: domain/infra/ui/container.ts)
│   │       └── shared/      Cross-module UI, hooks, libs
│   └── api/                 Backend — Fastify + hexagonal
│       └── src/
│           ├── domain/      Ports and entities (no framework deps)
│           ├── application/ Use cases
│           ├── infrastructure/
│           │   ├── http/    Fastify routes
│           │   ├── supabase/ Supabase adapters
│           │   └── llm/     LLM provider adapters
│           └── app.ts       Fastify app factory (registers routes)
├── packages/                Shared libraries used by both apps
│   ├── ui/                  Reusable React components (@worksuite/ui)
│   ├── i18n/                Translation keys (@worksuite/i18n)
│   ├── shared-types/        Cross-app types
│   ├── jira-client/         Jira HTTP client
│   └── jira-service/        Jira domain services
├── specs/                   Functional specs per module (source of truth)
└── supabase/                Supabase config (migrations via DBA Agent)
```

### Rules that follow from this structure

1. **Secrets, API keys, provider SDK calls (Claude/OpenAI/Jira/etc.) → `apps/api`, NEVER `apps/web`.**
   The frontend may only call the WorkSuite backend. Third-party calls from
   the browser expose credentials and break CORS.

2. **New feature that needs an HTTP endpoint → create BOTH sides:**
   - Backend route in `apps/api/src/infrastructure/http/{name}Routes.ts`
   - Frontend adapter in `apps/web/src/modules/{name}/infra/` that `fetch`es
     the backend (not the third-party).

3. **Before starting any work, run** `ls apps/` **and** `ls packages/` **to
   refresh your mental model of what already exists.** Never assume.

4. **Reuse over duplication.** Check `packages/` before writing a new adapter,
   utility, or component. Extract to `packages/` when something becomes shared.

---

## Design Principles
- Apply SOLID principles when they improve clarity, maintainability, and extensibility.
- Prioritize KISS: choose the simplest solution that correctly solves the problem.
- Avoid overengineering, unnecessary abstractions, and premature complexity.

---

## Architecture
- We always work with Hexagonal Architecture.
- Domain must not depend on Infrastructure or frameworks.
- Application contains use cases and ports.
- Infrastructure implements adapters and access to external systems.
- Do not place business logic in controllers, handlers, routers, or UI components.

### Strict Hexagonal Boundaries (Zero Tolerance)
- **UI files (`/ui/`) MUST NEVER import from `/infra/` directories or `@/shared/infra/`.** If a UI component needs a repository or adapter, import it from a `container.ts` at the module root.
- **UI files MUST NEVER call `fetch()`, `supabase.from()`, or any other direct I/O.** All external access goes through ports implemented by infra adapters.
- **`container.ts` pattern**: each module that needs infra must have a `container.ts` that imports from `/infra/`, instantiates adapters, and exports them. UI files import only from `container.ts`, domain entities, and use cases.
- If you are about to write `import ... from '../infra/'` inside a `/ui/` file, **STOP** — that is a violation. Refactor to use the container pattern.

---

## Shared Packages
- Any logic, service, or component reused across multiple modules must live in `packages/` as a shared package — never duplicated per module.
- This includes: UI components (`@worksuite/ui`), translations (`@worksuite/i18n`), shared types (`@worksuite/shared-types`), external clients (`@worksuite/jira-client`, `@worksuite/jira-service`), etc.
- Before creating a new adapter, service, or utility in a module, check if it already exists in `packages/` or should be extracted there.

---

## UI Components
- Reuse the existing component library (`packages/ui`) whenever possible.
- Do not create new components if an existing one can solve the need with reasonable changes.
- If a new reusable component is created, add it to the component library following project conventions.
- **When adding a new component to `packages/ui`, also add it to the UI Kit page** (`apps/web/src/shared/ui/UIKit.tsx`) with a live interactive example, description, and import statement.

---

## Design System — Carbon Logic (Stitch)

All UI work MUST follow the Carbon Logic design system. This is non-negotiable.

### Creative North Star: Kinetic Monolithism
The UI feels carved from solid carbon, light-emitting, and hyper-precise. We reject flat enterprise looks in favor of **Tonal Layering** — hierarchy comes from surface depth and glow, not boxes and borders.

### Colors & Surfaces
- **Surface (Base):** `#131313` — primary canvas
- **Void (Lowest):** `#0e0e0e` — recessed areas, sidebars
- **Elevated (Low):** `#1c1b1b` — secondary layout tier
- **Surface High:** `#2a2a2a` — hover, nested cards
- **Primary (Electric Blue):** `#4d8eff` / `#adc6ff` — critical actions, active states
- **Secondary (Green):** `#4ae176` / `#00b954` — success, on-track
- **Tertiary (Violet):** `#ddb7ff` / `#b76dff` — hours bank, highlights
- **Danger:** `#ffb4ab` / `#ef4444` — errors, alerts
- **Warning:** `#f59e0b` — caution states
- **Text:** `#e5e2e1` (main), `#c2c6d6` (muted), `#8c909f` (dim). NEVER use pure white `#FFFFFF`.

### The "No-Line" Rule
1px solid borders for layout are **prohibited**. Use background shifts and tonal transitions instead. If a border is needed for accessibility, use `outline-variant` at 15% opacity ("Ghost Border").

### The "Glass & Gradient" Rule
- Floating elements: `surface-container-highest` at 60% opacity + 20-40px backdrop blur
- Primary CTAs: `linear-gradient(135deg, #adc6ff, #4d8eff)` with glow shadow
- Button hover: `drop-shadow` matching primary at 30% opacity, 12px blur

### Typography (Inter)
- **Display:** Semi-Bold 600, tracking -0.02em
- **Headlines:** Medium 500, tracking -0.01em
- **Titles:** Medium 500, tracking 0.01em
- **Body:** Regular 400, tracking 0.01em
- **Labels:** Bold 700, tracking 0.05em, ALL-CAPS

### Typography Scale Tokens (Mandatory)
- **NEVER write raw `fontSize: 13` (or any pixel literal) in components.** Pick one of the tokens defined in `apps/web/src/WorkSuiteApp.css`:
  - `var(--fs-2xs)` — 11px, ALL-CAPS labels, tiny badges
  - `var(--fs-xs)` — 13px, meta, code badges, captions
  - `var(--fs-sm)` — 15px, secondary body
  - `var(--fs-body)` — 17px, default body, task titles, inputs
  - `var(--fs-md)` — 19px, emphasized body
  - `var(--fs-lg)` — 22px, section title
  - `var(--fs-xl)` — 28px, large title
  - `var(--fs-display)` — 36px, hero
- Material Symbols icons use the icon scale: `var(--icon-xs|sm|md|lg)` (14/16/20/28).
- Line heights: `var(--lh-tight|normal|loose)` (1.2/1.4/1.6).
- The whole app's typography scales by editing those tokens in one file. Components must consume them — adding raw px literals is technical debt.

### Elevation
- **Recessed:** `surface-container-lowest` — inputs, wells
- **Canvas:** `surface` — page background
- **Raised:** `surface-container-low` — cards, modules
- **Floating:** `surface-container-high` + glassmorphism

### Icons
Use **Material Symbols Outlined** (Google Fonts). Weight: 300 light (default), filled on interaction. NEVER use emojis in the UI.

### Buttons
- **Primary:** Gradient fill + glow shadow. Radius: 8px (`0.5rem`).
- **Ghost:** `surface-container-high` at 80% opacity + backdrop blur
- **Semantic:** Green gradient (approve), Red gradient (reject/danger)

### Cards
- No divider lines inside cards. Use whitespace (1.5rem+) or tonal shift.
- Background: `surface-container-low`, 8px rounding, ghost border top-edge only.

### Semantic Chips
- Success: emerald text on 10% emerald bg, no border
- Error: ruby text on 10% ruby bg
- Warning: gold text on 10% gold bg

### Light / Dark Mode (Mandatory)
- **NEVER use hardcoded hex color values for backgrounds, text, or borders in inline styles or embedded CSS.** Always use CSS variables: `var(--bg)`, `var(--sf)`, `var(--sf2)`, `var(--sf3)`, `var(--tx)`, `var(--tx2)`, `var(--tx3)`, `var(--bd)`, `var(--bd2)`, `var(--ac)`, `var(--ac2)`, `var(--green)`, `var(--amber)`, `var(--red)`, `var(--purple)`.
- CSS variables are defined in `WorkSuiteApp.css` with `:root` (dark) and `[data-theme="light"]` (light) selectors.
- **Do NOT use fallback values in CSS vars** (e.g., `var(--tx,#e4e4ef)` is forbidden — just use `var(--tx)`).
- If you need a component-scoped variable, define it with `[data-theme="light"]` override in a `<style>` block.

### Do's and Don'ts
- **Do** embrace asymmetry, high-contrast font weights, `surface-bright` for active elements
- **Don't** use `#FFFFFF`, standard Material shadows, dividers, or corners > 8px

### Token File
All tokens live in `apps/web/src/modules/chrono/shared/theme.ts` (`CHRONO_THEME`). Admin views import from `apps/web/src/modules/chrono-admin/shared/adminColors.ts`.

---

## Before Writing Code
- First, briefly summarize what is going to be built.
- Then indicate which layer, module, or area of the system each piece belongs to.
- If a solution breaks the architecture or these principles, do not implement it — propose a compatible alternative instead.
- Always read the relevant SPEC.md before writing any code.

---

## Quality
- Keep naming clear and consistent.
- Reuse existing project patterns when appropriate.
- Explain which files are created or modified.
- Propose or add tests when appropriate.

---

## Security (Zero Tolerance)

These rules apply while writing code. The QA Agent will verify them before any merge.

### API Keys & Secrets
- **NEVER hardcode API keys, tokens, passwords, or secrets** in any source file.
- All secrets must live in environment variables (`.env`) and be accessed via `process.env`.
- Never commit `.env` files. Verify `.gitignore` covers them.
- If you spot a pattern like `sk-`, `eyJ`, `Bearer `, `password =`, or `secret =` hardcoded anywhere — **STOP and fix it immediately**.

### API Calls from Frontend (Forbidden)
- **NEVER call external APIs directly from UI components or frontend code.**
- All external API calls must go through backend routes (Fastify handlers) or Vercel serverless functions.
- The frontend only calls internal backend endpoints — never third-party services directly.
- If you are about to write a `fetch('https://external-api...')` inside a React component — **STOP** — that is a violation.

### SQL Injection Prevention
- **NEVER build SQL queries by concatenating user input strings.**
- Always use parameterized queries or the Supabase query builder.
- Treat every value coming from a user, URL param, or form field as untrusted.
- Example of what is FORBIDDEN: `` `SELECT * FROM users WHERE id = ${userId}` ``

### XSS Prevention
- **NEVER use `dangerouslySetInnerHTML`** unless the content has been explicitly sanitized first.
- Never render raw user input directly into the DOM.
- Sanitize any content coming from external sources before rendering.

### Input Validation
- Validate all inputs at system boundaries — API routes, form handlers, URL params.
- Never trust data from users, external APIs, or URL parameters without validation.
- Reject or sanitize unexpected values before they reach domain logic or the database.

---

## Multi-language (i18n)
- All user-facing strings must use `t()` from `@worksuite/i18n` — never hardcode Spanish or English text in components.
- **This includes**: button labels, modal titles, error messages, empty states, form labels, placeholders, tooltips, filter/tab labels, sidebar titles, loading messages, confirmation dialogs, and status badges.
- **Exceptions**: technical identifiers matching DB values (e.g., "DEV", "PRE", "STAGING"), placeholder examples (e.g., "DEV-03", "frontend-app"), and icon names.
- When creating or modifying any component, verify all visible text uses translation keys.
- If new keys are needed, add them to BOTH `packages/i18n/locales/es.json` and `packages/i18n/locales/en.json`.
- Before finishing, verify the EN/ES switch works correctly on affected views.
- **Zero tolerance**: if you write a hardcoded user-facing string in a component, fix it immediately before moving on.

---

## Documentation
- If architecture, project structure, or an important technical decision changes, update `ARCHITECTURE.md`.
- If installation, usage, commands, workflows, or developer-relevant structure changes, update `README.md`.
- Keep documentation aligned with the code.
- **`SPEC_CONTEXT.md` is a snapshot of the real project state.** Only update it once a change is verified as **stable in production** (deployed, smoke-tested, no regressions). Until then, keep changes in `ARCHITECTURE.md` / `README.md` only.

---

## Specs
- Every module and core area has its own `SPEC.md` in `specs/modules/{name}/SPEC.md` or `specs/core/{name}/SPEC.md`.
- `specs/SPEC.md` is the global index that references all individual specs.
- Always read the relevant SPEC.md before starting any work on that area.
- Update the SPEC.md when functionality changes, after it is stable in production.

---

## Deployment Rules
- **Never merge a feature branch to `main` without first verifying the build compiles cleanly on a Vercel preview deploy.**
- A passing local build is not enough — the preview deploy is the real gate.
- If the preview deploy fails, fix it on the branch before merging.
- To promote a deploy to production, use the Vercel dashboard UI.

---

## Session State & Context Management
- At the **start of every session**, read `WORK_STATE.md` and report: current task, exact point, and next step.
- At the **end of any significant task**, update `WORK_STATE.md` without waiting for the user to ask.
- `WORK_STATE.md` is not a request log. It is a **live snapshot** of work in progress.
- Structure of `WORK_STATE.md`:
  - **🎯 Current task**: what we are building right now.
  - **📍 Exact point**: which files were created/modified and what is still pending.
  - **✅ Decisions made**: key decisions (naming, models, patterns).
  - **⏳ Next immediate step**: the single next concrete action.
  - **🚫 Blockers / notes**: anything that must not be forgotten or mixed up.

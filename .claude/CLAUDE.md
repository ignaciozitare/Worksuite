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

### Strict Hexagonal Boundaries (Zero Tolerance)
- **UI files (`/ui/`) MUST NEVER import from `/infra/` directories or `@/shared/infra/`.** If a UI component needs a repository or adapter, import it from a `container.ts` at the module root that wires infrastructure and exports instances.
- **UI files MUST NEVER call `fetch()`, `supabase.from()`, or any other direct I/O.** All external access goes through ports implemented by infra adapters.
- **`container.ts` pattern**: each module that needs infra should have a `container.ts` that imports from `/infra/`, instantiates adapters, and exports them. UI files import only from `container.ts`, domain entities, and use-cases.
- If you are about to write `import ... from '../infra/'` inside a `/ui/` file, **STOP** — that is a violation. Refactor to use the container pattern.

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
- **When adding a new component to `packages/ui`, also add it to the UI Kit page** (`apps/web/src/shared/ui/UIKit.tsx`) with a live interactive example, description, and import statement. The UI Kit is accessible at `/ui-kit` from the Admin sidebar.

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
- CSS variables are defined in `WorkSuiteApp.css` with `:root` (dark) and `[data-theme="light"]` (light) selectors. All components inherit them automatically.
- **Do NOT use fallback values in CSS vars** (e.g., `var(--tx,#e4e4ef)` is forbidden — just use `var(--tx)`). The variables are always defined.
- Semantic/accent colors (e.g., status badges) may use rgba() for transparency but must derive the base from a CSS variable or a fixed semantic color that works in both themes.
- If you need a component-scoped variable, define it with `[data-theme="light"]` override in a `<style>` block.

### Do's and Don'ts
- **Do** embrace asymmetry, high-contrast font weights, `surface-bright` for active elements
- **Don't** use `#FFFFFF`, standard Material shadows, dividers, or corners > 8px

### Token File
All tokens live in `apps/web/src/modules/chrono/shared/theme.ts` (`CHRONO_THEME`). Admin views import from `apps/web/src/modules/chrono-admin/shared/adminColors.ts`.

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
- **This includes**: button labels, modal titles, error messages, empty states, form labels, placeholders, tooltips, filter/tab labels, sidebar titles, loading messages, confirmation dialogs, and status badges.
- **Exceptions**: technical identifiers that match DB values (e.g., "DEV", "PRE", "STAGING"), placeholder examples (e.g., "DEV-03", "frontend-app"), and icon names.
- When creating or modifying any component, verify that all visible text uses translation keys.
- If new keys are needed, add them to both `packages/i18n/locales/es.json` and `packages/i18n/locales/en.json`.
- Before committing, check that the EN/ES switch works correctly on the affected views.
- **Zero tolerance**: if you write a hardcoded user-facing string in a component, fix it immediately before moving on. Do not leave it as "debt".

## Documentation
- If the architecture, project structure, or an important technical decision changes, update `ARCHITECTURE.md`.
- If installation, usage, commands, workflows, or developer-relevant structure changes, update `README.md`.
- Keep documentation aligned with the code.
- **`SPEC_CONTEXT.md` is a snapshot of the real project state.** Only update it once a change has been verified as **stable in production** (deployed, smoke-tested, no regressions reported by the user). Until then, keep changes in `ARCHITECTURE.md` / `README.md` only. When the user confirms a change is stable, sync `SPEC_CONTEXT.md` in the same commit.

## Pre-commit Checklist
**This checklist is mandatory and non-negotiable. Do not consider any task complete until every item below has been explicitly verified. Run each check and report the result before marking work as done.**

1. **Hexagonal architecture** — run these checks on every modified file:
   - `grep -rn "from.*infra" apps/web/src/**/ui/**` → must return zero results. UI files must NOT import from `/infra/`. Use `container.ts` instead.
   - `grep -rn "supabase\.from\|\.from(" apps/web/src/**/ui/**` → must return zero results.
   - `grep -rn "fetch(" apps/web/src/**/ui/**` → must return zero results. All HTTP calls go through infra adapters.
   - If ANY violation is found, **fix it before proceeding**. Do not document it as "debt".
2. **i18n** — on every modified UI file:
   - Search for hardcoded Spanish/English strings (modal titles, button labels, error messages, loading text, empty states, form labels, tab labels).
   - Verify every user-visible string uses `t('key')`. If a new key is needed, add it to BOTH `es.json` and `en.json`.
   - If ANY hardcoded string is found, **fix it before proceeding**.
3. **Light/Dark mode** — on every modified UI file:
   - Search for hardcoded hex colors (`#131313`, `#1c1b1b`, `#e5e2e1`, `#8c909f`, `#0e0e0e`, `#2a2a38`, `#50506a`, `#424754`, `#c2c6d6`, `#4d8eff`).
   - Also search for CSS var fallbacks like `var(--tx,#e4e4ef)` — remove the fallback.
   - Replace with the appropriate CSS variable (`var(--bg)`, `var(--sf)`, `var(--tx)`, etc.).
   - If ANY hardcoded color is found, **fix it before proceeding**.
4. **UI components**: confirm reusable components are in `packages/ui`, not duplicated inline.
5. **Documentation**: if structure or architecture changed, update `ARCHITECTURE.md` and `README.md` accordingly.
6. **Build passes**: run `npx vite build` from `apps/web/` and confirm it succeeds without errors. If it fails, fix it before finishing.
7. **No secrets**: confirm no tokens, keys, or passwords are hardcoded in any source file.

## Deployment Rules
- **Never merge a feature branch to `main` without first verifying the build compiles cleanly on a Vercel preview deploy.**
- A passing local build is not enough — the preview deploy is the real gate.
- If the preview deploy fails, fix it on the branch before merging. Never promote a broken deploy.
- To promote a deploy to production, use the Vercel dashboard UI — there is no automated endpoint for this.

## Working Style
- Be direct and practical.
- Prioritize simple, maintainable, and consistent solutions.
- If there are tradeoffs or uncertainties, explain them briefly.

## Session State & Context Management

- At the **start of every session**, read `WORK_STATE.md` to understand the current task,
  where we left off, and what the immediate next step is.
- At the **end of any significant task** (or proactively if the context window is getting full),
  update `WORK_STATE.md` with the real current state — do not wait for the user to ask.
- `WORK_STATE.md` is not a log of requests. It is a **live snapshot** of the work in progress.
- Structure of `WORK_STATE.md`:
  - **🎯 Tarea en curso**: what we are building right now.
  - **📍 Punto exacto**: which files were created/modified and what is still pending.
  - **✅ Decisiones tomadas**: key decisions made (naming, models, patterns).
  - **⏳ Siguiente paso inmediato**: the single next concrete action.
  - **🚫 Bloqueos / notas**: anything that must not be forgotten or mixed up.

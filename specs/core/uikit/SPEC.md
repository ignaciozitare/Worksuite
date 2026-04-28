# UIKit / `@worksuite/ui` — Core Spec

> **Snapshot spec (2026-04-29).** Documenta el package `@worksuite/ui` — la librería de componentes compartidos entre módulos — y la página `/ui-kit` que sirve de brandbook vivo.

## Overview

`@worksuite/ui` es el paquete de componentes React reutilizables consumidos por todos los módulos. Cualquier primitiva visual (botón, modal, avatar, gantt, picker) que se necesita en más de un módulo vive aquí. Las reglas:

1. **Si lo necesitan dos módulos, va a `@worksuite/ui`.**
2. **Si está casi listo pero le falta una variante, se extiende con slots / props opt-in** — no se forkea (memoria `feedback_extend_dont_duplicate.md`).
3. **No hay business logic** — solo presentación + interacción genérica.
4. **Token-driven** — todos los colores / tamaños vienen de CSS vars (`--ac`, `--fs-*`). Nunca hex literals ni px directos.

## Componentes exportados

Desde `packages/ui/src/index.ts`:

| Componente | Para qué |
|---|---|
| **`Btn`** | Botón con variantes (`primary | ghost | danger | semantic`) y tamaños. Usa `--ac-grad` para gradient CTA. |
| **`Modal`** | Modal con backdrop blur + escape para cerrar + click-outside. Slot `titleAccessory` para inline content (ej. "Auto-saved" indicator). |
| **`ConfirmModal`** | Wrapper de Modal con título, mensaje, OK/Cancel. Soporta `danger`. |
| **`Avatar`, `Badge`, `StatBox`, `Divider`, `Chip`** | Atoms básicos. |
| **`UserAvatar`** | Avatar con fallback a iniciales si `avatarUrl` es null. Acepta presets `preset:purple` / `preset:blue` / etc. con gradientes coloreados. |
| **`DialogProvider` + `useDialog`** | Sistema imperativo `dialog.confirm(msg, opts)` / `dialog.alert(...)`. Render-anywhere. |
| **`GanttTimeline`** | Timeline horizontal con zoom (días/semanas/meses), drag-to-move, edge-resize, group frames, today line, weekend shading. Slots opt-in: `renderLabel`, `renderBarContent`, `showHeader`, `showHelpText`. |
| **`TimerBar`** | Barra de progreso con countdown — usada en Retro phases. |
| **`JiraTicketSearch`** | Autocomplete de tickets Jira (consume `JiraSearchPort` del consumer). |
| **`JiraTicketPicker`** | Lista pre-cargada + buscador + multiselect. |
| **`StatusManager`** | CRUD + drag-reorder de estados (presentacional, reutilizable). Usado en Deploy Planner, Environments, Vector Logic. |
| **`DualPanelPicker`** | Dual-panel selector con drag&drop, click-to-move, búsqueda, dedup automático. |
| **`DateRangePicker`** | Date range picker con calendar popover, max duration, opcionalmente time. |
| **`Card`** | Card primitiva con variantes. |
| **`MultiSelectDropdown`** | Dropdown multi-select con búsqueda. |
| **`BugIcon`** | Icon SVG inline para Bug task type. |

## CSS variables consumidas

Las componentes usan estos tokens de CSS (definidos en el app shell, no en el package):

- **Surface**: `--bg`, `--sf`, `--sf-low`, `--sf-lowest`, `--sf2`, `--sf3`, `--sf-bright`.
- **Border**: `--bd`, `--bd2`.
- **Accent**: `--ac`, `--ac2`, `--ac-strong`, `--ac-soft`, `--ac-dim`, `--ac-grad`, `--ac-on`, `--glow`.
- **Semantic**: `--green`, `--green-strong`, `--green-dim`, `--purple`, `--purple-strong`, `--purple-dim`, `--red`, `--red-dim`, `--amber`, `--amber-dim`, `--danger`, `--danger-strong`, `--tertiary`.
- **Text**: `--tx`, `--tx2`, `--tx3`.
- **Typography scale**: `--fs-2xs`, `--fs-xs`, `--fs-sm`, `--fs-body`, `--fs-md`, `--fs-lg`, `--fs-xl`, `--fs-display`.
- **Icon scale**: `--icon-xs`, `--icon-sm`, `--icon-md`, `--icon-lg`.
- **Line height**: `--lh-tight`, `--lh-normal`, `--lh-loose`.
- **Misc**: `--shadow`, `--r`, `--r2`, `--ease`, `--mono`, `--body`.

Todos tienen variantes para `[data-theme="light"]` definidas en `apps/web/src/WorkSuiteApp.css`.

**Forbidden:** `var(--x, fallback)` con fallback. CLAUDE.md lo prohíbe — el token tiene que existir en ambos themes.

## Brandbook UI: `/ui-kit`

Hay una página standalone en `apps/web/src/shared/ui/UIKit.tsx` (route `/ui-kit`) que documenta:
- Cada componente con ejemplos en vivo.
- Variantes y props.
- Dónde se usa actualmente.
- Color swatches.
- Typography scale visualizada.
- Iconos disponibles.

Cuando se agrega un componente nuevo a `packages/ui`, **debe** sumarse al UIKit.

## Reglas de diseño

Per CLAUDE.md "Carbon Logic" / "Stitch":
- No `1px solid` borders for layout — usar background shifts y tonal transitions ("No-Line Rule").
- No `#FFFFFF` puro — usar `--tx` (e4e4ef en dark).
- Glass + 20-40px backdrop blur para floating elements.
- Primary CTAs con gradient + glow shadow.
- Material Symbols Outlined para iconos (Google Fonts).
- Inter para body, Space Grotesk para títulos, JetBrains Mono / IBM Plex Mono para datos.

## Estructura del package

```
packages/ui/
├── package.json
├── src/
│   ├── index.ts                 # exports
│   ├── tokens/
│   │   └── index.css            # tokens redundantes para entorno standalone
│   └── components/
│       ├── Btn.tsx
│       ├── Modal.tsx
│       ├── ConfirmModal.tsx
│       ├── Atoms.tsx            # Avatar / Badge / StatBox / Divider / Chip
│       ├── Card.tsx
│       ├── UserAvatar.tsx
│       ├── DialogProvider.tsx
│       ├── GanttTimeline.tsx
│       ├── TimerBar.tsx
│       ├── JiraTicketSearch.tsx
│       ├── JiraTicketPicker.tsx
│       ├── StatusManager.tsx
│       ├── DualPanelPicker.tsx
│       ├── DateRangePicker.tsx
│       ├── MultiSelectDropdown.tsx
│       └── BugIcon.tsx
```

## Cómo agregar un componente nuevo

1. Crear `packages/ui/src/components/MyThing.tsx`.
2. Exportar desde `packages/ui/src/index.ts`.
3. Solo CSS vars (no hex). Solo `--fs-*` (no fontSize literal en px).
4. Agregar live example a `apps/web/src/shared/ui/UIKit.tsx`.
5. Si reemplaza un componente que vivía duplicado en algún módulo: borrar la copia y reusar el shared (memoria `feedback_use_existing_components.md`).

## Cómo extender un componente existente

Si un módulo necesita un comportamiento que el shared no cubre:
1. Identificar si es un caso de **slot** (consumer renderiza algo dentro) o **mode** (variante de comportamiento).
2. Slot: agregar prop `renderX?: (...) => ReactNode` con default que preserva comportamiento actual.
3. Mode: agregar prop `mode?: 'default' | 'newMode'` con default `'default'`.
4. **Backward compat obligatorio.** Otros consumers no se tocan.
5. Documentar en este SPEC.
6. Memoria: `feedback_extend_dont_duplicate.md`.

## Histórico — UIKit Brandbook + CSS Variable Alignment (2026-04-20)

Trabajo de alineación inicial: reemplazo de `--ws-*` references por las vars reales (`--sf`, `--tx`, `--ac`), reconstrucción de la página UIKit como brandbook completo, documentación de duplicados conocidos. Cambios pasaron por:
- `packages/ui/src/components/Btn.tsx`
- `packages/ui/src/components/Modal.tsx`
- `packages/ui/src/components/Atoms.tsx`
- `packages/ui/src/components/Card.tsx`
- `apps/web/src/shared/ui/UIKit.tsx`

Sin cambios de DB.

## Out of scope (en este snapshot)

- Storybook (la UIKit page hace un trabajo similar pero más limitado).
- Theme builder visual (los tokens se editan a mano en `WorkSuiteApp.css`).
- Component testing automatizado (Vitest config existe pero coverage es bajo).
- A11y audit completo (ARIA, focus trapping, screen reader testing).
- Versionado independiente del package (hoy es workspace-only, sin npm publish).
- RTL support.

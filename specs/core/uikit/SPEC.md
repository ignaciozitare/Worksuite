# UIKit Brandbook + CSS Variable Alignment

_Confirmed: 2026-04-20_

## Purpose
Align `packages/ui` components to the real CSS variables (`--sf`, `--tx`, `--ac`, etc.) and rebuild the UIKit page as a living brandbook that documents every component, where it's used, and known duplicates.

## Scope

### In scope
1. Replace all `--ws-*` references in packages/ui with real project variables
2. Rebuild UIKit page as comprehensive brandbook with all component families
3. Document where each component/class is used and flag duplicates

### Out of scope
- No module functionality changes
- No replacing components inside existing modules (future task, module by module)
- No database changes

## Files modified
- `packages/ui/src/components/Btn.tsx`
- `packages/ui/src/components/Modal.tsx`
- `packages/ui/src/components/Atoms.tsx`
- `packages/ui/src/components/Card.tsx`
- `apps/web/src/shared/ui/UIKit.tsx`

## Modelo de datos
> N/A — No database changes required.

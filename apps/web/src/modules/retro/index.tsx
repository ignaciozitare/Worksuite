// @ts-nocheck
// RetroBoard module barrel
// UI: RetroBoard.tsx is the main component (still at apps/web/src/RetroBoard.tsx
// during transition — will move to modules/retro/ui/ in Fase 5)
export { SupabaseRetroRepository } from "./infra/SupabaseRetroRepository";
export { CreateRetro }             from "./domain/useCases/CreateRetro";
export type { RetroSession, RetroTeam, RetroActionable } from "./domain/entities/RetroSession";
export type { RetroRepository }    from "./domain/ports/RetroRepository";

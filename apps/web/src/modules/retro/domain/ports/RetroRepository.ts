
import type { RetroTeam, RetroSession, RetroActionable } from "../entities/RetroSession";

export interface RetroRepository {
  getTeams(userId: string, isAdmin: boolean): Promise<RetroTeam[]>;
  getSessionHistory(teamIds: string[]): Promise<RetroSession[]>;
  saveSession(session: Omit<RetroSession, "id">): Promise<RetroSession>;
  saveActionables(sessionId: string, actionables: Omit<RetroActionable, "id">[]): Promise<void>;
  updateActionableStatus(id: string, status: RetroActionable["status"]): Promise<void>;
}


import type { RetroRepository }  from "../domain/ports/RetroRepository";
import type { RetroTeam, RetroSession, RetroActionable } from "../domain/entities/RetroSession";
import { supabase }              from "../../../shared/lib/supabaseClient";

export class SupabaseRetroRepository implements RetroRepository {
  async getTeams(userId: string, isAdmin: boolean): Promise<RetroTeam[]> {
    const [{ data: teams }, { data: members }] = await Promise.all([
      supabase.from("retro_teams").select("*"),
      supabase.from("retro_team_members").select("*"),
    ]);
    return (teams ?? [])
      .filter(t => isAdmin || (members ?? []).some(m => m.team_id === t.id && m.user_id === userId))
      .map(t => ({
        id: t.id, name: t.name, color: t.color, ownerId: t.owner_id,
        members: (members ?? []).filter(m => m.team_id === t.id).map(m => ({
          userId: m.user_id, role: m.role,
        })),
      }));
  }

  async getSessionHistory(teamIds: string[]): Promise<RetroSession[]> {
    const { data } = await supabase
      .from("retro_sessions")
      .select("*, retro_actionables(*)")
      .in("team_id", teamIds)
      .eq("status", "closed")
      .order("created_at", { ascending: false });
    return (data ?? []).map(s => ({
      id: s.id, name: s.name, teamId: s.team_id,
      status: s.status, phase: s.phase,
      votesPerUser: s.votes_per_user, phaseTimes: s.phase_times,
      createdBy: s.created_by, createdAt: s.created_at,
      stats: s.stats ?? {},
      actionables: (s.retro_actionables ?? []).map((a: Record<string,unknown>) => ({
        id: a.id, text: a.text, assignee: a.assignee,
        dueDate: a.due_date, status: a.status, priority: a.priority,
        retroName: s.name, teamId: s.team_id,
      })),
    }));
  }

  async saveSession(session: Omit<RetroSession, "id">): Promise<RetroSession> {
    const { data, error } = await supabase
      .from("retro_sessions")
      .insert({
        name: session.name, team_id: session.teamId,
        status: session.status, phase: session.phase,
        votes_per_user: session.votesPerUser,
        phase_times: session.phaseTimes,
        created_by: session.createdBy,
        stats: session.stats,
      })
      .select().single();
    if (error) throw error;
    return { ...session, id: data.id };
  }

  async saveActionables(sessionId: string, actionables: Omit<RetroActionable, "id">[]): Promise<void> {
    if (!actionables.length) return;
    const { error } = await supabase.from("retro_actionables").insert(
      actionables.map(a => ({
        session_id: sessionId, text: a.text, assignee: a.assignee,
        due_date: a.dueDate, status: a.status, priority: a.priority,
        team_id: a.teamId, retro_name: a.retroName,
      }))
    );
    if (error) throw error;
  }

  async updateActionableStatus(id: string, status: RetroActionable["status"]): Promise<void> {
    const { error } = await supabase.from("retro_actionables").update({ status }).eq("id", id);
    if (error) throw error;
  }
}

import type { SupabaseClient } from '@supabase/supabase-js';
import type { RetroTeamPort, TeamData, TeamMemberData } from '../domain/ports/RetroTeamPort';

export class SupabaseRetroTeamRepo implements RetroTeamPort {
  constructor(private readonly db: SupabaseClient) {}

  async findAllTeams(): Promise<TeamData[]> {
    const { data, error } = await this.db.from('retro_teams').select('*');
    if (error) throw error;
    return data || [];
  }

  async findAllMembers(): Promise<TeamMemberData[]> {
    const { data, error } = await this.db.from('retro_team_members').select('*');
    if (error) throw error;
    return data || [];
  }

  async createTeam(name: string, color: string): Promise<TeamData> {
    const { data, error } = await this.db
      .from('retro_teams')
      .insert({ name, color })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async deleteTeam(id: string): Promise<void> {
    const { error } = await this.db.from('retro_teams').delete().eq('id', id);
    if (error) throw error;
  }

  async addMember(teamId: string, userId: string, role: string): Promise<TeamMemberData> {
    const { data, error } = await this.db
      .from('retro_team_members')
      .insert({ team_id: teamId, user_id: userId, role })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async removeMember(teamId: string, userId: string): Promise<void> {
    const { error } = await this.db
      .from('retro_team_members')
      .delete()
      .eq('team_id', teamId)
      .eq('user_id', userId);
    if (error) throw error;
  }

  async updateMemberRole(teamId: string, userId: string, role: string): Promise<void> {
    const { error } = await this.db
      .from('retro_team_members')
      .update({ role })
      .eq('team_id', teamId)
      .eq('user_id', userId);
    if (error) throw error;
  }
}

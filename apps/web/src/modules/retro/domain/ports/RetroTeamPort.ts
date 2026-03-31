export interface TeamData {
  id: string;
  name: string;
  color: string;
  owner_id?: string;
  created_at?: string;
}

export interface TeamMemberData {
  team_id: string;
  user_id: string;
  role: string;
  joined_at?: string;
}

export interface RetroTeamPort {
  findAllTeams(): Promise<TeamData[]>;
  findAllMembers(): Promise<TeamMemberData[]>;
  createTeam(name: string, color: string): Promise<TeamData>;
  deleteTeam(id: string): Promise<void>;
  addMember(teamId: string, userId: string, role: string): Promise<TeamMemberData>;
  removeMember(teamId: string, userId: string): Promise<void>;
  updateMemberRole(teamId: string, userId: string, role: string): Promise<void>;
}

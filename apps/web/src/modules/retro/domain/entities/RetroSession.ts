
export type RetroPhase = "lobby"|"creating"|"grouping"|"voting"|"discussion"|"summary";
export type RetroCategory = "good"|"bad"|"change"|"stop";
export type RetroPriority = "minor"|"medium"|"major"|"critical"|"blocker";
export type RetroMemberRole = "owner"|"temporal"|"member";
export type ActionableStatus = "todo"|"inprogress"|"done"|"cancelled";

export interface RetroTeam {
  id:       string;
  name:     string;
  color:    string;
  ownerId?: string;
  members:  RetroTeamMember[];
}

export interface RetroTeamMember {
  userId: string;
  role:   RetroMemberRole;
  name?:  string;
  email?: string;
}

export interface RetroSession {
  id:           string;
  teamId:       string;
  name:         string;
  status:       "active" | "closed";
  phase:        RetroPhase;
  votesPerUser: number;
  phaseTimes:   Record<string, number>;
  createdBy:    string;
  createdAt:    string;
  stats:        { cards: number; withAction: number; votes: number };
  actionables?: RetroActionable[];
}

export interface RetroActionable {
  id:        string;
  text:      string;
  assignee:  string;
  dueDate?:  string;
  status:    ActionableStatus;
  priority:  RetroPriority;
  retroName: string;
  teamId:    string;
}

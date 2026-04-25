// ─── Module identifiers ───────────────────────────────────────────────────────
export type ModuleId = 'jira-tracker' | 'hotdesk' | 'retro' | 'deploy-planner';

// ─── User & Role ──────────────────────────────────────────────────────────────
export type AppRole = 'admin' | 'user';

export interface WorksuiteUser {
  id:        string;
  name:      string;
  email:     string;
  avatar:    string;       // 2-char initials (legacy default)
  avatarUrl?: string | null; // optional photo URL or `preset:NAME` (purple/blue/green/amber/red/teal/pink/gray)
  role:      AppRole;
  deskType:  DeskType;
  active:    boolean;
  modules:   ModuleId[];
}

export type DeskType = 'hotdesk' | 'fixed';

export interface WorksuiteRole {
  id:          string;
  name:        string;
  description: string;
  isSystem:    boolean;
  permissions: RolePermissions;
}

export interface RolePermissions {
  modules: ModuleId[];
  admin: {
    users?:         boolean;
    hotdeskConfig?: boolean;
    blueprint?:     boolean;
    settings?:      boolean;
    jiraConfig?:    boolean;
    sso?:           boolean;
    roles?:         boolean;
    retroTeams?:    boolean;
    retroSessions?: boolean;
  };
}

// ─── HotDesk ──────────────────────────────────────────────────────────────────
export interface Building {
  id:        string;
  name:      string;
  address?:  string;
  active:    boolean;
  createdAt: string;
}

export interface Blueprint {
  id:         string;
  buildingId: string;
  floorName:  string;
  floorOrder: number;
  layout:     LayoutItem[];
  updatedAt:  string;
}

export type LayoutItemType = 'desk' | 'circle' | 'zone' | 'room' | 'wall' | 'door' | 'window';

export interface LayoutItem {
  id:        string;
  type:      LayoutItemType;
  x:         number;
  y:         number;
  w:         number;
  h:         number;
  label?:    string;
  prefix?:   string;
  angle?:    number;
  double?:   boolean;
  pts?:      { x: number; y: number }[];
  disabled?: string[];
  occupants?: Record<string, string>;
}

export interface SeatReservation {
  id:       string;
  seatId:   string;
  date:     string;        // ISO YYYY-MM-DD
  userId:   string;
  userName: string;
}

export interface FixedAssignment {
  seatId:   string;
  userId:   string;
  userName: string;
}

// ─── Jira (shared between JiraTracker + DeployPlanner) ───────────────────────
export interface JiraConnection {
  userId:      string;
  baseUrl:     string;
  email:       string;
  connectedAt: string;
  updatedAt:   string;
}

export interface JiraProject {
  id:   string;
  key:  string;
  name: string;
}

export interface JiraIssue {
  id:       string;
  key:      string;
  summary:  string;
  status:   string;
  assignee: string | null;
  project:  string;
}

export interface JiraWorklog {
  id:          string;
  issueKey:    string;
  issueSummary:string;
  project:     string;
  seconds:     number;
  startedAt:   string;   // ISO
  description: string;
  syncedToJira:boolean;
  jiraWorklogId?: string;
}

// ─── RetroBoard ───────────────────────────────────────────────────────────────
export type RetroCategory = 'good' | 'bad' | 'change' | 'stop';
export type RetroPhase    = 'lobby' | 'creating' | 'grouping' | 'voting' | 'discussion' | 'summary';
export type RetroPriority = 'minor' | 'medium' | 'major' | 'critical' | 'blocker';
export type RetroMemberRole = 'owner' | 'temporal' | 'member';
export type ActionableStatus = 'todo' | 'inprogress' | 'done' | 'cancelled';

export interface RetroTeam {
  id:        string;
  name:      string;
  color:     string;
  ownerId?:  string;
  members:   RetroTeamMember[];
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
  status:       'active' | 'closed';
  phase:        RetroPhase;
  votesPerUser: number;
  phaseTimes:   Record<string, number>;
  createdBy:    string;
  createdAt:    string;
  stats:        RetroSessionStats;
}

export interface RetroSessionStats {
  cards:      number;
  withAction: number;
  votes:      number;
}

export interface RetroCard {
  id:          string;
  sessionId:   string;
  text:        string;
  category:    RetroCategory;
  authorId:    string;
  authorName:  string;
  parentCardId?: string;
  votes:       number;
  actionable:  string;
  assignee:    string;
  dueDate?:    string;
  priority:    RetroPriority;
  merged?:     RetroCard[];
}

export interface RetroActionable {
  id:         string;
  sessionId:  string;
  text:       string;
  assignee:   string;
  dueDate?:   string;
  status:     ActionableStatus;
  priority:   RetroPriority;
  teamId:     string;
  retroName:  string;
  createdAt:  string;
}

// ─── DeployPlanner (skeleton — ampliable) ────────────────────────────────────
export type DeployStatus = 'planned' | 'in-progress' | 'deployed' | 'rolled-back' | 'cancelled';
export type DeployEnv    = 'development' | 'staging' | 'production';

export interface Deployment {
  id:          string;
  name:        string;
  version:     string;
  environment: DeployEnv;
  status:      DeployStatus;
  jiraIssues:  string[];    // array of issue keys linked to this deploy
  plannedAt:   string;
  deployedAt?: string;
  createdBy:   string;
  notes?:      string;
}

export interface DeployPlan {
  id:          string;
  deploymentId:string;
  steps:       DeployStep[];
  createdAt:   string;
}

export interface DeployStep {
  id:          string;
  order:       number;
  title:       string;
  description: string;
  status:      'pending' | 'running' | 'done' | 'failed';
  assignee?:   string;
  duration?:   number;   // minutes
}

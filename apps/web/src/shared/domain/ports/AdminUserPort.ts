export interface AdminUserPort {
  updateJiraToken(userId: string, token: string | null): Promise<void>;
  getJiraToken(userId: string): Promise<string | null>;
  updateRole(userId: string, role: string): Promise<void>;
  updateActive(userId: string, active: boolean): Promise<void>;
  updateDeskType(userId: string, deskType: string): Promise<void>;
  updateModules(userId: string, modules: string[]): Promise<void>;
  createUser(payload: { name: string; email: string; password: string; role: string; desk_type: string }): Promise<any>;
}

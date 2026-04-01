export interface AdminUserPort {
  updateJiraToken(userId: string, token: string): Promise<void>;
  getJiraToken(userId: string): Promise<string | null>;
}

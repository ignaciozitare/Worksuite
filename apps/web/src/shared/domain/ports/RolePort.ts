export interface RoleData {
  id: string;
  name?: string;
  description?: string;
  permissions?: any;
  created_at?: string;
}

export interface RolePort {
  findAll(): Promise<RoleData[]>;
  create(role: Omit<RoleData, 'id' | 'created_at'>): Promise<RoleData>;
  remove(id: string): Promise<void>;
  updatePermissions(id: string, permissions: any): Promise<void>;
  updateDescription(id: string, description: string): Promise<void>;
}

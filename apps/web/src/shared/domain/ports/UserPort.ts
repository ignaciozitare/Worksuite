export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  desk_type: string;
  avatar: string;
  active: boolean;
  jira_api_token?: string;
  role_id?: string;
}

export interface UserPort {
  findAll(): Promise<UserRow[]>;
}

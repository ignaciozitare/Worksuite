export interface UserProfile {
  id:              string;
  name:            string;
  email:           string;
  avatar:          string | null;
  role:            string;
  active:          boolean;
  desk_type:       string;
  jira_api_token:  string | null;
  modules:         string[];
}

export interface IUserRepository {
  findById(id: string): Promise<UserProfile | null>;
  findByEmail(email: string): Promise<UserProfile | null>;
}

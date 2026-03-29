export interface AuthCredentials {
  email:    string;
  password: string;
}

export interface AuthResult {
  userId: string;
  email:  string;
}

export interface IAuthService {
  signIn(credentials: AuthCredentials): Promise<AuthResult>;
}

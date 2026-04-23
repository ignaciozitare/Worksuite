import type { UserSettings } from '../entities/UserSettings';

export interface IUserSettingsRepo {
  get(userId: string): Promise<UserSettings | null>;
  upsert(userId: string, patch: Partial<Omit<UserSettings, 'userId' | 'createdAt' | 'updatedAt'>>): Promise<UserSettings>;
}

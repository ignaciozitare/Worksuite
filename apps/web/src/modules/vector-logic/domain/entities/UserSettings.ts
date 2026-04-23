export interface UserSettings {
  userId: string;
  doneMaxDays: number;
  doneMaxCount: number;
  homeTimezone: string;
  homeCity: string | null;
  createdAt: string;
  updatedAt: string;
}

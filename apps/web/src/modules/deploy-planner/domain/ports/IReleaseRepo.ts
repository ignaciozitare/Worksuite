import type { Release, ReleaseStatus, ReleaseConfig } from '../entities/Release';

export interface IReleaseRepo {
  getAll():                                          Promise<Release[]>;
  getStatuses():                                     Promise<ReleaseStatus[]>;
  getConfig():                                       Promise<ReleaseConfig | null>;
  create(data: Omit<Release, 'id' | 'createdAt' | 'updatedAt'>): Promise<Release>;
  update(id: string, patch: Partial<Release>):       Promise<void>;
  delete(id: string):                                Promise<void>;
  updateTicketStatuses(id: string, map: Record<string, string>): Promise<void>;
  saveConfig(patch: Partial<ReleaseConfig>):         Promise<void>;
}

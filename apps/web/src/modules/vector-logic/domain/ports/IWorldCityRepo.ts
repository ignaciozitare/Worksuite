import type { WorldCity } from '../entities/WorldCity';

export interface IWorldCityRepo {
  list(userId: string): Promise<WorldCity[]>;
  create(draft: Omit<WorldCity, 'id' | 'createdAt'>): Promise<WorldCity>;
  update(id: string, patch: Partial<WorldCity>): Promise<void>;
  remove(id: string): Promise<void>;
  reorder(updates: Array<{ id: string; sortOrder: number }>): Promise<void>;
}

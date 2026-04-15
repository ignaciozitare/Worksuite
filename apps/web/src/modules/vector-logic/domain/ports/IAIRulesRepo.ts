import type { AIRule } from '../entities/AI';

export interface IAIRulesRepo {
  list(userId: string): Promise<AIRule[]>;
  create(rule: Omit<AIRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<AIRule>;
  update(id: string, patch: Partial<AIRule>): Promise<void>;
  remove(id: string): Promise<void>;
}

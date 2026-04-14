import type { Transition } from '../entities/Transition';

export interface ITransitionRepo {
  findByWorkflow(workflowId: string): Promise<Transition[]>;
  create(draft: Omit<Transition, 'id'>): Promise<Transition>;
  update(id: string, patch: Partial<Transition>): Promise<void>;
  remove(id: string): Promise<void>;
}

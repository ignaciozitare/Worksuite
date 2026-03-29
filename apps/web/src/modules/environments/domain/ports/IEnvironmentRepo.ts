import type { Environment } from '../entities/Environment';

export interface IEnvironmentRepo {
  getAll():                               Promise<Environment[]>;
  create(env: Omit<Environment, 'id'>):  Promise<Environment>;
  update(env: Environment):               Promise<void>;
}

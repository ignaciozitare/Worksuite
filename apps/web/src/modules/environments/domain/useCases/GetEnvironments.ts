import type { IEnvironmentRepo } from '../ports/IEnvironmentRepo';
import type { Environment }      from '../entities/Environment';

export class GetEnvironments {
  constructor(private repo: IEnvironmentRepo) {}

  async execute(): Promise<Environment[]> {
    const all = await this.repo.getAll();
    return all.sort((a, b) => a.name.localeCompare(b.name));
  }
}

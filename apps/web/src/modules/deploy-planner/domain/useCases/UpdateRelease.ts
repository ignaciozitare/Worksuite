import type { IReleaseRepo } from '../ports/IReleaseRepo';
import type { Release } from '../entities/Release';

export class UpdateRelease {
  constructor(private repo: IReleaseRepo) {}
  async execute(id: string, patch: Partial<Release>): Promise<void> {
    await this.repo.update(id, patch);
  }
}

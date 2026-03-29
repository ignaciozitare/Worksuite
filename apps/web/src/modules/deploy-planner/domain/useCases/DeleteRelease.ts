import type { IReleaseRepo } from '../ports/IReleaseRepo';

export class DeleteRelease {
  constructor(private repo: IReleaseRepo) {}
  async execute(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}

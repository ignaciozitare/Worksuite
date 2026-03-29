import type { IReleaseRepo } from '../ports/IReleaseRepo';
import type { Release, ReleaseStatus, ReleaseConfig } from '../entities/Release';

export interface ReleasesPageData {
  releases: Release[];
  statuses: ReleaseStatus[];
  config:   ReleaseConfig | null;
}

export class GetReleases {
  constructor(private repo: IReleaseRepo) {}
  async execute(): Promise<ReleasesPageData> {
    const [releases, statuses, config] = await Promise.all([
      this.repo.getAll(),
      this.repo.getStatuses(),
      this.repo.getConfig(),
    ]);
    return { releases, statuses, config };
  }
}

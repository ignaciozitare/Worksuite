import type { IReleaseRepo } from '../ports/IReleaseRepo';
import type { Release, ReleaseConfig } from '../entities/Release';

export class CreateRelease {
  constructor(private repo: IReleaseRepo) {}

  buildNumber(config: ReleaseConfig | null): string {
    const prefix = config?.prefix ?? 'v';
    const n      = config?.nextNumber ?? 1;
    return `${prefix}${n}.0.0`;
  }

  async execute(params: {
    releaseNumber: string;
    firstStatus:   string;
    createdBy:     string | null;
    config:        ReleaseConfig | null;
  }): Promise<Release> {
    const release = await this.repo.create({
      releaseNumber:  params.releaseNumber,
      description:    null,
      status:         params.firstStatus,
      startDate:      null,
      endDate:        null,
      ticketIds:      [],
      ticketStatuses: {},
      createdBy:      params.createdBy,
    });
    if(params.config?.id) {
      await this.repo.saveConfig({ nextNumber: (params.config.nextNumber ?? 1) + 1 });
    }
    return release;
  }
}

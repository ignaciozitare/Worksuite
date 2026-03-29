import type { IReleaseRepo } from '../ports/IReleaseRepo';

export class UpdateTicketStatuses {
  constructor(private repo: IReleaseRepo) {}
  async execute(releaseId: string, ticketKey: string, newStatus: string, current: Record<string, string>): Promise<Record<string, string>> {
    const updated = { ...current, [ticketKey]: newStatus };
    await this.repo.updateTicketStatuses(releaseId, updated);
    return updated;
  }
}

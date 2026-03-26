
import type { WorklogRepository } from "../ports/WorklogRepository";

interface SyncPort {
  syncWorklog(params: {
    issueKey:    string;
    worklogId:   string;
    seconds:     number;
    startedAt:   string;
    description: string;
  }): Promise<{ jiraWorklogId: string }>;
}

export class SyncToJira {
  constructor(
    private repo: WorklogRepository,
    private jiraSync: SyncPort,
  ) {}

  async execute(worklogId: string): Promise<void> {
    const worklogs = await this.repo.findMany({});
    const wl = worklogs.find(w => w.id === worklogId);
    if (!wl) throw new Error(`Worklog ${worklogId} not found`);
    if (wl.syncedToJira) return; // already synced

    const result = await this.jiraSync.syncWorklog({
      issueKey:    wl.issueKey,
      worklogId:   wl.id,
      seconds:     wl.seconds,
      startedAt:   wl.startedAt,
      description: wl.description,
    });

    await this.repo.markSynced(worklogId, result.jiraWorklogId);
  }
}

import type { IWorklogRepository } from '../../domain/worklog/IWorklogRepository.js';
import type { IJiraApi } from '../../domain/worklog/IJiraApi.js';

export interface DeleteWorklogInput {
  worklogId: string;
  requesterId: string;
  requesterRole: string;
}

export class DeleteWorklog {
  constructor(
    private readonly repo: IWorklogRepository,
    private readonly jiraApi: IJiraApi,
  ) {}

  async execute(input: DeleteWorklogInput): Promise<void> {
    const worklog = await this.repo.findById(input.worklogId);
    if (!worklog) throw new Error('Worklog not found');

    if (worklog.authorId !== input.requesterId && input.requesterRole !== 'admin') {
      throw new Error('No permission to delete this worklog');
    }

    if (worklog.toSnapshot().syncedToJira && worklog.toSnapshot().jiraWorklogId) {
      await this.jiraApi.deleteWorklog(worklog.issueKey, worklog.toSnapshot().jiraWorklogId!);
    }

    await this.repo.delete(input.worklogId, input.requesterId);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// USE CASE — DeleteWorklog
// Elimina el worklog de Supabase. Si estaba sincronizado a Jira, el worklog
// permanece en Jira (borrado remoto no implementado en esta versión).
// ─────────────────────────────────────────────────────────────────────────────

import type { IWorklogRepository } from '../../domain/worklog/IWorklogRepository.js';

export interface DeleteWorklogInput {
  worklogId:     string;
  requesterId:   string;
  requesterRole: string;
}

export class DeleteWorklog {
  constructor(private readonly repo: IWorklogRepository) {}

  async execute(input: DeleteWorklogInput): Promise<void> {
    const worklog = await this.repo.findById(input.worklogId);
    if (!worklog) throw new Error('Worklog not found');

    if (worklog.authorId !== input.requesterId && input.requesterRole !== 'admin') {
      throw new Error('No permission to delete this worklog');
    }

    await this.repo.delete(input.worklogId, input.requesterId);
  }
}

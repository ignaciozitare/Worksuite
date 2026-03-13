// ─────────────────────────────────────────────────────────────────────────────
// USE CASE — LogWorklog
// Orchestrates: validate → create domain entity → persist → optionally sync Jira
// ─────────────────────────────────────────────────────────────────────────────

import { Worklog, TimeSpent } from '../../domain/worklog/Worklog.js';
import type { IWorklogRepository } from '../../domain/worklog/IWorklogRepository.js';
import type { IJiraApi } from '../../domain/worklog/IJiraApi.js';

export interface LogWorklogInput {
  issueKey: string;
  issueSummary: string;
  issueType: string;
  epicKey: string;
  epicName: string;
  projectKey: string;
  authorId: string;
  authorName: string;
  date: string;
  startedAt: string;
  timeRaw: string;     // e.g. "2h", "1h 30m"
  description: string;
  syncToJira: boolean;
}

export interface LogWorklogOutput {
  worklogId: string;
  formattedTime: string;
  jiraWorklogId?: string;
}

export class LogWorklog {
  constructor(
    private readonly repo: IWorklogRepository,
    private readonly jiraApi: IJiraApi,
  ) {}

  async execute(input: LogWorklogInput): Promise<LogWorklogOutput> {
    const timeSpent = TimeSpent.parse(input.timeRaw);

    const worklog = Worklog.create({
      issueKey: input.issueKey,
      issueSummary: input.issueSummary,
      issueType: input.issueType,
      epicKey: input.epicKey,
      epicName: input.epicName,
      projectKey: input.projectKey,
      authorId: input.authorId,
      authorName: input.authorName,
      date: input.date,
      startedAt: input.startedAt,
      timeSpent,
      description: input.description,
      syncedToJira: false,
    });

    let jiraWorklogId: string | undefined;

    if (input.syncToJira) {
      const result = await this.jiraApi.logWork({
        issueKey: input.issueKey,
        timeSpentSeconds: timeSpent.seconds,
        started: `${input.date}T${input.startedAt}:00.000+0000`,
        comment: input.description || undefined,
      });
      jiraWorklogId = result.jiraWorklogId;
    }

    // Persist with jira sync info
    const finalWorklog = Worklog.reconstitute({
      ...worklog.toSnapshot(),
      syncedToJira: input.syncToJira,
      jiraWorklogId,
    });

    await this.repo.save(finalWorklog);

    return {
      worklogId: worklog.id.value,
      formattedTime: timeSpent.format(),
      jiraWorklogId,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// USE CASE — LogWorklog
// Guarda el worklog localmente. La sincronización a Jira es un paso
// separado que el usuario dispara desde la UI → POST /jira/worklogs/:key/sync
// ─────────────────────────────────────────────────────────────────────────────

import { Worklog, TimeSpent } from '../../domain/worklog/Worklog.js';
import type { IWorklogRepository } from '../../domain/worklog/IWorklogRepository.js';

export interface LogWorklogInput {
  issueKey:     string;
  issueSummary: string;
  issueType:    string;
  epicKey:      string;
  epicName:     string;
  projectKey:   string;
  authorId:     string;
  authorName:   string;
  date:         string;
  startedAt:    string;
  timeRaw:      string;   // e.g. "2h", "1h 30m"
  description:  string;
}

export interface LogWorklogOutput {
  worklogId:     string;
  formattedTime: string;
}

export class LogWorklog {
  constructor(private readonly repo: IWorklogRepository) {}

  async execute(input: LogWorklogInput): Promise<LogWorklogOutput> {
    const timeSpent = TimeSpent.parse(input.timeRaw);

    const worklog = Worklog.create({
      issueKey:     input.issueKey,
      issueSummary: input.issueSummary,
      issueType:    input.issueType,
      epicKey:      input.epicKey,
      epicName:     input.epicName,
      projectKey:   input.projectKey,
      authorId:     input.authorId,
      authorName:   input.authorName,
      date:         input.date,
      startedAt:    input.startedAt,
      timeSpent,
      description:  input.description,
      syncedToJira: false,
    });

    await this.repo.save(worklog);

    return {
      worklogId:     worklog.id.value,
      formattedTime: timeSpent.format(),
    };
  }
}

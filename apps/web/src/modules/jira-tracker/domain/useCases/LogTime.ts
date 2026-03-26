
import type { WorklogRepository } from "../ports/WorklogRepository";
import type { Worklog }           from "../entities/Worklog";

interface LogTimeInput {
  issueKey:     string;
  issueSummary: string;
  project:      string;
  seconds:      number;
  startedAt:    string;
  description:  string;
  authorId:     string;
  authorName:   string;
}

export class LogTime {
  constructor(private repo: WorklogRepository) {}

  async execute(input: LogTimeInput): Promise<Worklog> {
    if (input.seconds < 60) throw new Error("Minimum 1 minute");
    return this.repo.save({ ...input, syncedToJira: false });
  }
}

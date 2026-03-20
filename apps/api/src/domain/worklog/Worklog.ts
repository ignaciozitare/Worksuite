export class WorklogId {
  private constructor(readonly value: string) {}
  static generate(): WorklogId {
    return new WorklogId(`wl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  }
  static from(value: string): WorklogId {
    if (!value.trim()) throw new Error('WorklogId cannot be empty');
    return new WorklogId(value);
  }
}

export class TimeSpent {
  private constructor(readonly seconds: number) {}

  static fromSeconds(s: number): TimeSpent {
    if (s <= 0) throw new Error('Time spent must be positive');
    if (s > 86400) throw new Error('Time spent cannot exceed 24h in a single entry');
    return new TimeSpent(s);
  }

  static parse(raw: string): TimeSpent {
    const s = raw.trim().toLowerCase();
    const hm = s.match(/^(\d+(?:\.\d+)?)\s*h\s*(?:(\d+)\s*m)?$/);
    if (hm) {
      const secs = Math.round((parseFloat(hm[1]!) + (hm[2] ? parseInt(hm[2]) / 60 : 0)) * 3600);
      return TimeSpent.fromSeconds(secs);
    }
    const onlyM = s.match(/^(\d+)\s*m$/);
    if (onlyM) return TimeSpent.fromSeconds(parseInt(onlyM[1]!) * 60);
    const onlyH = s.match(/^(\d+(?:\.\d+)?)$/);
    if (onlyH) return TimeSpent.fromSeconds(Math.round(parseFloat(onlyH[1]!) * 3600));
    throw new Error(`Cannot parse time: "${raw}". Use formats: 2h, 1h 30m, 45m, 1.5`);
  }

  get hours(): number { return Math.round((this.seconds / 3600) * 100) / 100; }

  format(): string {
    const h = Math.floor(this.seconds / 3600);
    const m = Math.floor((this.seconds % 3600) / 60);
    if (!h) return `${m}m`;
    if (!m) return `${h}h`;
    return `${h}h ${m}m`;
  }
}

export interface WorklogProps {
  id: WorklogId;
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
  timeSpent: TimeSpent;
  description: string;
  syncedToJira: boolean;
  jiraWorklogId?: string;
}

export class Worklog {
  private constructor(private readonly props: WorklogProps) {}

  static create(props: Omit<WorklogProps, 'id'>): Worklog {
    if (!props.issueKey.trim()) throw new Error('Issue key is required');
    if (!props.date.match(/^\d{4}-\d{2}-\d{2}$/)) throw new Error('Invalid date format');
    return new Worklog({ ...props, id: WorklogId.generate() });
  }

  static reconstitute(props: WorklogProps): Worklog {
    return new Worklog(props);
  }

  get id(): WorklogId { return this.props.id; }
  get issueKey(): string { return this.props.issueKey; }
  get date(): string { return this.props.date; }
  get authorId(): string { return this.props.authorId; }
  get timeSpent(): TimeSpent { return this.props.timeSpent; }
  get projectKey(): string { return this.props.projectKey; }

  toSnapshot(): WorklogProps { return { ...this.props }; }
}

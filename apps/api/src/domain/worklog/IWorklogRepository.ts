import type { Worklog } from './Worklog.js';

export interface WorklogFilters {
  from: string;
  to: string;
  authorId?: string;
  projectKeys?: string[];
}

export interface IWorklogRepository {
  save(worklog: Worklog): Promise<void>;
  delete(worklogId: string, authorId: string): Promise<void>;
  findByFilters(filters: WorklogFilters): Promise<Worklog[]>;
  findById(id: string): Promise<Worklog | null>;
}

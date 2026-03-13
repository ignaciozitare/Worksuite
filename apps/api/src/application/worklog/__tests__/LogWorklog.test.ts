import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LogWorklog } from '../LogWorklog.js';
import type { IWorklogRepository } from '../../../domain/worklog/IWorklogRepository.js';
import type { IJiraApi } from '../../../domain/worklog/IJiraApi.js';

const makeRepo = (): IWorklogRepository => ({
  save: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(undefined),
  findByFilters: vi.fn().mockResolvedValue([]),
  findById: vi.fn().mockResolvedValue(null),
});

const makeJira = (): IJiraApi => ({
  getIssue: vi.fn().mockResolvedValue(null),
  searchIssues: vi.fn().mockResolvedValue([]),
  logWork: vi.fn().mockResolvedValue({ jiraWorklogId: 'jira-123' }),
  deleteWorklog: vi.fn().mockResolvedValue(undefined),
});

const validInput = {
  issueKey: 'PLAT-142',
  issueSummary: 'Refactor auth',
  issueType: 'Story',
  epicKey: 'PLAT-100',
  epicName: 'Security Q1',
  projectKey: 'PLAT',
  authorId: 'u1',
  authorName: 'Elena',
  date: '2026-03-11',
  startedAt: '09:00',
  timeRaw: '2h',
  description: 'worked on auth',
  syncToJira: false,
};

describe('LogWorklog use case', () => {
  let repo: IWorklogRepository;
  let jira: IJiraApi;
  let useCase: LogWorklog;

  beforeEach(() => {
    repo = makeRepo();
    jira = makeJira();
    useCase = new LogWorklog(repo, jira);
  });

  it('saves worklog and returns formatted time', async () => {
    const result = await useCase.execute(validInput);
    expect(result.formattedTime).toBe('2h');
    expect(result.worklogId).toMatch(/^wl-/);
    expect(repo.save).toHaveBeenCalledOnce();
  });

  it('does NOT call Jira when syncToJira=false', async () => {
    await useCase.execute({ ...validInput, syncToJira: false });
    expect(jira.logWork).not.toHaveBeenCalled();
  });

  it('calls Jira and returns jiraWorklogId when syncToJira=true', async () => {
    const result = await useCase.execute({ ...validInput, syncToJira: true });
    expect(jira.logWork).toHaveBeenCalledOnce();
    expect(result.jiraWorklogId).toBe('jira-123');
  });

  it('throws and does NOT save if time is invalid', async () => {
    await expect(
      useCase.execute({ ...validInput, timeRaw: 'banana' }),
    ).rejects.toThrow('Cannot parse time');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('throws and does NOT save if issue key is empty', async () => {
    await expect(
      useCase.execute({ ...validInput, issueKey: '' }),
    ).rejects.toThrow('Issue key is required');
    expect(repo.save).not.toHaveBeenCalled();
  });
});

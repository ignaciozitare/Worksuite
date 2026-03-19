import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LogWorklog } from '../LogWorklog.js';
import type { IWorklogRepository } from '../../../domain/worklog/IWorklogRepository.js';

const makeRepo = (): IWorklogRepository => ({
  save:           vi.fn().mockResolvedValue(undefined),
  delete:         vi.fn().mockResolvedValue(undefined),
  findByFilters:  vi.fn().mockResolvedValue([]),
  findById:       vi.fn().mockResolvedValue(null),
});

const validInput = {
  issueKey:     'PLAT-142',
  issueSummary: 'Refactor auth',
  issueType:    'Story',
  epicKey:      'PLAT-100',
  epicName:     'Security Q1',
  projectKey:   'PLAT',
  authorId:     'u1',
  authorName:   'Elena',
  date:         '2026-03-11',
  startedAt:    '09:00',
  timeRaw:      '2h',
  description:  'worked on auth',
};

describe('LogWorklog use case', () => {
  let repo: IWorklogRepository;
  let useCase: LogWorklog;

  beforeEach(() => {
    repo    = makeRepo();
    useCase = new LogWorklog(repo);
  });

  it('saves worklog and returns formatted time', async () => {
    const result = await useCase.execute(validInput);
    expect(result.formattedTime).toBe('2h');
    expect(result.worklogId).toMatch(/^wl-/);
    expect(repo.save).toHaveBeenCalledOnce();
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

  it('persists correct field values', async () => {
    await useCase.execute(validInput);
    const saved = (repo.save as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const snap  = saved.toSnapshot();
    expect(snap.issueKey).toBe('PLAT-142');
    expect(snap.authorId).toBe('u1');
    expect(snap.syncedToJira).toBe(false);
    expect(snap.timeSpent.seconds).toBe(7200);
  });
});

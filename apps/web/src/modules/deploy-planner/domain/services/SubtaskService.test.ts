import { describe, it, expect } from 'vitest';
import { SubtaskService } from './SubtaskService';
import type { SubtaskConfig } from '../ports/SubtaskConfigPort';
import type { JiraSubtask } from '../ports/SubtaskPort';

/**
 * Tests for the pure subtask-classification logic used by Deploy Planner's
 * release cards, detail view, history table and metrics.
 */

// ─── Fixture builders ───────────────────────────────────────────────────────

const cfg = (
  jira_issue_type: string,
  category: SubtaskConfig['category'],
  closed_statuses: string[] = [],
  test_type?: string,
): SubtaskConfig => ({ id: `cfg-${jira_issue_type}`, jira_issue_type, category, closed_statuses, test_type });

const sub = (overrides: Partial<JiraSubtask> = {}): JiraSubtask => ({
  key:            overrides.key            ?? 'AND-1',
  summary:        overrides.summary        ?? 'Example subtask',
  type:           overrides.type           ?? 'Bug',
  status:         overrides.status         ?? 'In Progress',
  statusCategory: overrides.statusCategory ?? 'In Progress',
  priority:       overrides.priority       ?? 'Medium',
  assignee:       overrides.assignee       ?? 'Alice',
  parentKey:      overrides.parentKey      ?? 'AND-100',
  relation:       overrides.relation       ?? 'subtask',
});

// ─── classify ──────────────────────────────────────────────────────────────

describe('SubtaskService.classify', () => {
  it('drops subtasks whose type is not configured', () => {
    const subs = [sub({ type: 'Story' }), sub({ type: 'Bug' })];
    const configs = [cfg('Bug', 'bug')];

    const result = SubtaskService.classify(subs, configs);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('Bug');
  });

  it('matches the config type case-insensitively', () => {
    const subs = [sub({ type: 'BUG' }), sub({ type: 'bug' })];
    const configs = [cfg('Bug', 'bug')];

    const result = SubtaskService.classify(subs, configs);
    expect(result).toHaveLength(2);
  });

  it('tags the subtask with the config category', () => {
    const subs = [sub({ type: 'Bug' }), sub({ type: 'Test' })];
    const configs = [cfg('Bug', 'bug'), cfg('Test', 'test', [], 'e2e')];

    const result = SubtaskService.classify(subs, configs);
    expect(result.find(s => s.type === 'Bug')?.category).toBe('bug');
    const testSub = result.find(s => s.type === 'Test');
    expect(testSub?.category).toBe('test');
    expect(testSub?.testType).toBe('e2e');
  });

  it('marks isClosed=true when the subtask status is in closed_statuses (case-insensitive)', () => {
    const subs = [
      sub({ key: 'A', status: 'Done' }),
      sub({ key: 'B', status: 'RESOLVED' }),
      sub({ key: 'C', status: 'In Progress' }),
    ];
    const configs = [cfg('Bug', 'bug', ['Done', 'Resolved'])];

    const result = SubtaskService.classify(subs, configs);
    expect(result.find(s => s.key === 'A')?.isClosed).toBe(true);
    expect(result.find(s => s.key === 'B')?.isClosed).toBe(true);
    expect(result.find(s => s.key === 'C')?.isClosed).toBe(false);
  });

  it('falls back to statusCategory=Done when closed_statuses is empty', () => {
    const subs = [
      sub({ key: 'A', status: 'Custom Done', statusCategory: 'Done' }),
      sub({ key: 'B', status: 'In Progress', statusCategory: 'In Progress' }),
    ];
    const configs = [cfg('Bug', 'bug', [])]; // no explicit closed list

    const result = SubtaskService.classify(subs, configs);
    expect(result.find(s => s.key === 'A')?.isClosed).toBe(true);
    expect(result.find(s => s.key === 'B')?.isClosed).toBe(false);
  });

  it('leaves testType undefined when the config has no test_type field', () => {
    const subs = [sub({ type: 'Test' })];
    const configs = [cfg('Test', 'test')];

    const result = SubtaskService.classify(subs, configs);
    expect(result[0].testType).toBeUndefined();
  });
});

// ─── count ─────────────────────────────────────────────────────────────────

describe('SubtaskService.count', () => {
  it('returns zero counters when the list is empty', () => {
    const counts = SubtaskService.count([]);
    expect(counts.bugs).toEqual({ open: 0, closed: 0, total: 0 });
    expect(counts.tests).toEqual({ open: 0, closed: 0, total: 0 });
    expect(counts.other).toEqual({ open: 0, closed: 0, total: 0 });
    expect(counts.testsByType).toEqual({});
  });

  it('splits open and closed per category', () => {
    const subs = SubtaskService.classify(
      [
        sub({ key: 'B1', type: 'Bug',  status: 'Done' }),
        sub({ key: 'B2', type: 'Bug',  status: 'In Progress' }),
        sub({ key: 'B3', type: 'Bug',  status: 'Done' }),
        sub({ key: 'T1', type: 'Test', status: 'In Progress' }),
        sub({ key: 'O1', type: 'Chore', status: 'Done' }),
      ],
      [
        cfg('Bug',   'bug',  ['Done']),
        cfg('Test',  'test', ['Done']),
        cfg('Chore', 'other', ['Done']),
      ],
    );

    const counts = SubtaskService.count(subs);
    expect(counts.bugs).toEqual({ open: 1, closed: 2, total: 3 });
    expect(counts.tests).toEqual({ open: 1, closed: 0, total: 1 });
    expect(counts.other).toEqual({ open: 0, closed: 1, total: 1 });
  });

  it('breaks down tests by testType', () => {
    const subs = SubtaskService.classify(
      [
        sub({ key: 'T1', type: 'Test E2E',  status: 'Done' }),
        sub({ key: 'T2', type: 'Test E2E',  status: 'In Progress' }),
        sub({ key: 'T3', type: 'Test Unit', status: 'Done' }),
      ],
      [
        cfg('Test E2E',  'test', ['Done'], 'e2e'),
        cfg('Test Unit', 'test', ['Done'], 'unit'),
      ],
    );

    const counts = SubtaskService.count(subs);
    expect(counts.testsByType.e2e).toEqual({ open: 1, closed: 1, total: 2 });
    expect(counts.testsByType.unit).toEqual({ open: 0, closed: 1, total: 1 });
    expect(counts.tests.total).toBe(3);
  });

  it('skips testsByType entries for tests without a testType', () => {
    const subs = SubtaskService.classify(
      [sub({ key: 'T1', type: 'Test', status: 'Done' })],
      [cfg('Test', 'test', ['Done'])], // no test_type
    );

    const counts = SubtaskService.count(subs);
    expect(counts.testsByType).toEqual({});
    expect(counts.tests.total).toBe(1);
  });
});

// ─── groupByParent ─────────────────────────────────────────────────────────

describe('SubtaskService.groupByParent', () => {
  it('groups classified subtasks by parentKey', () => {
    const subs = SubtaskService.classify(
      [
        sub({ key: 'B1', type: 'Bug', parentKey: 'AND-1' }),
        sub({ key: 'B2', type: 'Bug', parentKey: 'AND-1' }),
        sub({ key: 'B3', type: 'Bug', parentKey: 'AND-2' }),
      ],
      [cfg('Bug', 'bug')],
    );

    const grouped = SubtaskService.groupByParent(subs);
    expect(Object.keys(grouped).sort()).toEqual(['AND-1', 'AND-2']);
    expect(grouped['AND-1']).toHaveLength(2);
    expect(grouped['AND-2']).toHaveLength(1);
  });
});

// ─── groupByType ───────────────────────────────────────────────────────────

describe('SubtaskService.groupByType', () => {
  it('uses the category as key for bug/other, and `test:<testType>` for typed tests', () => {
    const subs = SubtaskService.classify(
      [
        sub({ key: 'B1', type: 'Bug' }),
        sub({ key: 'T1', type: 'Test E2E' }),
        sub({ key: 'T2', type: 'Test Unit' }),
        sub({ key: 'O1', type: 'Chore' }),
      ],
      [
        cfg('Bug',       'bug'),
        cfg('Test E2E',  'test', [], 'e2e'),
        cfg('Test Unit', 'test', [], 'unit'),
        cfg('Chore',     'other'),
      ],
    );

    const grouped = SubtaskService.groupByType(subs);
    expect(grouped['bug']).toHaveLength(1);
    expect(grouped['test:e2e']).toHaveLength(1);
    expect(grouped['test:unit']).toHaveLength(1);
    expect(grouped['other']).toHaveLength(1);
  });

  it('falls back to "test" (without suffix) when a test has no testType', () => {
    const subs = SubtaskService.classify(
      [sub({ key: 'T1', type: 'Test' })],
      [cfg('Test', 'test')],
    );

    const grouped = SubtaskService.groupByType(subs);
    expect(Object.keys(grouped)).toEqual(['test']);
  });
});

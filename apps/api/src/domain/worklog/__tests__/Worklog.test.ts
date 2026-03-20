import { describe, it, expect } from 'vitest';
import { TimeSpent, Worklog } from '../Worklog.js';

describe('TimeSpent', () => {
  describe('parse()', () => {
    it('parses "2h" -> 7200 seconds', () => { expect(TimeSpent.parse('2h').seconds).toBe(7200); });
    it('parses "1h 30m" -> 5400 seconds', () => { expect(TimeSpent.parse('1h 30m').seconds).toBe(5400); });
    it('parses "45m" -> 2700 seconds', () => { expect(TimeSpent.parse('45m').seconds).toBe(2700); });
    it('parses "1.5" -> 5400 seconds', () => { expect(TimeSpent.parse('1.5').seconds).toBe(5400); });
    it('throws for invalid input', () => { expect(() => TimeSpent.parse('banana')).toThrow('Cannot parse time'); });
    it('throws for zero', () => { expect(() => TimeSpent.fromSeconds(0)).toThrow('must be positive'); });
    it('throws for > 24h', () => { expect(() => TimeSpent.fromSeconds(86401)).toThrow('cannot exceed 24h'); });
  });
  describe('format()', () => {
    it('formats hours only', () => { expect(TimeSpent.fromSeconds(7200).format()).toBe('2h'); });
    it('formats minutes only', () => { expect(TimeSpent.fromSeconds(1800).format()).toBe('30m'); });
    it('formats hours and minutes', () => { expect(TimeSpent.fromSeconds(5400).format()).toBe('1h 30m'); });
  });
});

describe('Worklog.create()', () => {
  const base = {
    issueKey: 'PLAT-142', issueSummary: 'Refactor auth', issueType: 'Story',
    epicKey: 'PLAT-100', epicName: 'Security Q1', projectKey: 'PLAT',
    authorId: 'u1', authorName: 'Elena', date: '2026-03-11', startedAt: '09:00',
    timeSpent: TimeSpent.parse('2h'), description: '', syncedToJira: false,
  };
  it('creates with generated id', () => { expect(Worklog.create(base).id.value).toMatch(/^wl-/); });
  it('throws for empty issue key', () => { expect(() => Worklog.create({ ...base, issueKey: '' })).toThrow('Issue key is required'); });
  it('throws for invalid date', () => { expect(() => Worklog.create({ ...base, date: '11/03/2026' })).toThrow('Invalid date format'); });
});

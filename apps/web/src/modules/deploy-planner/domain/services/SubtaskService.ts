/**
 * SubtaskService — pure domain logic for classifying and counting subtasks.
 */

import type { SubtaskConfig, SubtaskCategory } from '../ports/SubtaskConfigPort';
import type { JiraSubtask } from '../ports/SubtaskPort';

export interface ClassifiedSubtask extends JiraSubtask {
  category: SubtaskCategory;
  testType?: string;
  isClosed: boolean;
}

export interface SubtaskCounters {
  bugs: { open: number; closed: number; total: number };
  tests: { open: number; closed: number; total: number };
  testsByType: Record<string, { open: number; closed: number; total: number }>;
  other: { open: number; closed: number; total: number };
}

export class SubtaskService {
  /**
   * Classify raw Jira subtasks using the admin config.
   * Only includes subtasks whose type is configured.
   */
  static classify(
    subtasks: JiraSubtask[],
    configs: SubtaskConfig[],
  ): ClassifiedSubtask[] {
    const configMap = new Map(configs.map(c => [c.jira_issue_type.toLowerCase(), c]));

    return subtasks
      .map(st => {
        const cfg = configMap.get(st.type.toLowerCase());
        if (!cfg) return null;

        const isClosed = cfg.closed_statuses.length > 0
          ? cfg.closed_statuses.some(s => s.toLowerCase() === st.status.toLowerCase())
          : st.statusCategory === 'Done';

        return {
          ...st,
          category: cfg.category,
          testType: cfg.test_type || undefined,
          isClosed,
        };
      })
      .filter(Boolean) as ClassifiedSubtask[];
  }

  /**
   * Count bugs, tests (by type), and other subtasks.
   */
  static count(classified: ClassifiedSubtask[]): SubtaskCounters {
    const bugs = { open: 0, closed: 0, total: 0 };
    const tests = { open: 0, closed: 0, total: 0 };
    const other = { open: 0, closed: 0, total: 0 };
    const testsByType: Record<string, { open: number; closed: number; total: number }> = {};

    for (const st of classified) {
      const counter = st.category === 'bug' ? bugs : st.category === 'test' ? tests : other;
      counter.total++;
      if (st.isClosed) counter.closed++;
      else counter.open++;

      if (st.category === 'test' && st.testType) {
        if (!testsByType[st.testType]) testsByType[st.testType] = { open: 0, closed: 0, total: 0 };
        testsByType[st.testType]!.total++;
        if (st.isClosed) testsByType[st.testType]!.closed++;
        else testsByType[st.testType]!.open++;
      }
    }

    return { bugs, tests, testsByType, other };
  }

  /**
   * Group subtasks by parent ticket key.
   */
  static groupByParent(classified: ClassifiedSubtask[]): Record<string, ClassifiedSubtask[]> {
    const groups: Record<string, ClassifiedSubtask[]> = {};
    for (const st of classified) {
      if (!groups[st.parentKey]) groups[st.parentKey] = [];
      groups[st.parentKey]!.push(st);
    }
    return groups;
  }

  /**
   * Group subtasks by category/type.
   */
  static groupByType(classified: ClassifiedSubtask[]): Record<string, ClassifiedSubtask[]> {
    const groups: Record<string, ClassifiedSubtask[]> = {};
    for (const st of classified) {
      const key = st.category === 'test' && st.testType ? `test:${st.testType}` : st.category;
      if (!groups[key]) groups[key] = [];
      groups[key]!.push(st);
    }
    return groups;
  }
}

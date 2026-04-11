// Pure date helpers used across Deploy Planner views.
// Extracted from DeployPlanner.tsx to keep the root component file lean.

export const today = new Date();

export const fmt = (d: Date | string): string =>
  (d instanceof Date ? d : new Date(d + 'T00:00:00')).toISOString().slice(0, 10);

export const addD = (iso: string, n: number): string => {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return fmt(d);
};

export const diffD = (a: string, b: string): number =>
  Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 864e5);

/**
 * Two date ranges overlap if: start1 <= end2 AND start2 <= end1.
 * If any date is missing, assume overlap (conservative).
 */
export const datesOverlap = (
  s1: string | null | undefined,
  e1: string | null | undefined,
  s2: string | null | undefined,
  e2: string | null | undefined,
): boolean => {
  if (!s1 || !e1 || !s2 || !e2) return true;
  return s1 <= e2 && s2 <= e1;
};

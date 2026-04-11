import { describe, it, expect } from 'vitest';
import {
  RepoGroupService,
  type RepoGroup,
  type ReleaseForGrouping,
  type TicketWithRepos,
} from './RepoGroupService';

/**
 * Tests for the pure repo-group domain logic used by Deploy Planner to decide:
 *   - which releases are "linked" through a shared repo group
 *   - whether a release can transition to a "done" status category
 *
 * These are the rules that gate the status-change dropdown in the UI, so they
 * are worth pinning down even though the rest of the module has no tests.
 */

// ─── Fixture builders ───────────────────────────────────────────────────────

const group = (id: string, name: string, repos: string[]): RepoGroup => ({ id, name, repos });

const rel = (
  id: string,
  ticketIds: string[],
  statusCategory: ReleaseForGrouping['statusCategory'] = 'backlog',
  status = 'Planned',
): ReleaseForGrouping => ({ id, ticketIds, status, statusCategory });

const ticket = (key: string, repos: string[]): TicketWithRepos => ({ key, repos });

// ─── findLinkedGroups ───────────────────────────────────────────────────────

describe('RepoGroupService.findLinkedGroups', () => {
  it('returns an empty array when no groups are provided', () => {
    const result = RepoGroupService.findLinkedGroups([], [rel('r1', ['t1'])], [ticket('t1', ['web'])]);
    expect(result).toEqual([]);
  });

  it('omits groups that only touch a single release', () => {
    const groups = [group('g1', 'frontend', ['web', 'admin'])];
    const releases = [rel('r1', ['t1']), rel('r2', ['t2'])];
    const tickets = [ticket('t1', ['web']), ticket('t2', ['api'])]; // t2 is NOT in the group

    const result = RepoGroupService.findLinkedGroups(groups, releases, tickets);
    expect(result).toEqual([]); // 1 release in group → filtered out (needs ≥2)
  });

  it('links 2+ releases that share a repo inside the same group', () => {
    const groups = [group('g1', 'frontend', ['web', 'admin'])];
    const releases = [
      rel('r1', ['t1']),
      rel('r2', ['t2']),
      rel('r3', ['t3']),
    ];
    const tickets = [
      ticket('t1', ['web']),     // in group
      ticket('t2', ['admin']),   // in group
      ticket('t3', ['api']),     // NOT in group
    ];

    const result = RepoGroupService.findLinkedGroups(groups, releases, tickets);
    expect(result).toHaveLength(1);
    const [linked] = result;
    expect(linked?.group.id).toBe('g1');
    expect(linked?.releaseIds).toEqual(['r1', 'r2']);
    expect(linked?.allDoneOrApproved).toBe(false);
  });

  it('marks allDoneOrApproved=true when every linked release is done/approved', () => {
    const groups = [group('g1', 'frontend', ['web'])];
    const releases = [
      rel('r1', ['t1'], 'done'),
      rel('r2', ['t2'], 'approved'),
    ];
    const tickets = [ticket('t1', ['web']), ticket('t2', ['web'])];

    const result = RepoGroupService.findLinkedGroups(groups, releases, tickets);
    expect(result).toHaveLength(1);
    expect(result[0]?.allDoneOrApproved).toBe(true);
  });

  it('marks allDoneOrApproved=false when at least one linked release is not done', () => {
    const groups = [group('g1', 'frontend', ['web'])];
    const releases = [
      rel('r1', ['t1'], 'done'),
      rel('r2', ['t2'], 'in_progress'),
    ];
    const tickets = [ticket('t1', ['web']), ticket('t2', ['web'])];

    const result = RepoGroupService.findLinkedGroups(groups, releases, tickets);
    expect(result[0]?.allDoneOrApproved).toBe(false);
  });

  it('detects releases that touch several repos inside the same group', () => {
    const groups = [group('g1', 'frontend', ['web', 'admin', 'mobile'])];
    const releases = [
      rel('r1', ['t1', 't2']),   // touches web AND mobile
      rel('r2', ['t3']),          // touches admin
    ];
    const tickets = [
      ticket('t1', ['web']),
      ticket('t2', ['mobile']),
      ticket('t3', ['admin']),
    ];

    const result = RepoGroupService.findLinkedGroups(groups, releases, tickets);
    expect(result[0]?.releaseIds).toEqual(['r1', 'r2']);
  });

  it('returns independent linked groups when multiple groups apply', () => {
    const groups = [
      group('g1', 'frontend', ['web']),
      group('g2', 'backend',  ['api']),
    ];
    const releases = [
      rel('r1', ['t1', 't3']),   // in both groups
      rel('r2', ['t2']),          // only frontend
      rel('r3', ['t4']),          // only backend
    ];
    const tickets = [
      ticket('t1', ['web']),
      ticket('t2', ['web']),
      ticket('t3', ['api']),
      ticket('t4', ['api']),
    ];

    const result = RepoGroupService.findLinkedGroups(groups, releases, tickets);
    expect(result).toHaveLength(2);
    expect(result.find(lg => lg.group.id === 'g1')?.releaseIds).toEqual(['r1', 'r2']);
    expect(result.find(lg => lg.group.id === 'g2')?.releaseIds).toEqual(['r1', 'r3']);
  });

  it('ignores ticket ids that are not present in the ticket list', () => {
    // Can happen when tickets are filtered out by the Jira sync
    const groups = [group('g1', 'frontend', ['web'])];
    const releases = [rel('r1', ['ghost', 't1']), rel('r2', ['t2'])];
    const tickets = [ticket('t1', ['web']), ticket('t2', ['web'])];

    const result = RepoGroupService.findLinkedGroups(groups, releases, tickets);
    expect(result[0]?.releaseIds).toEqual(['r1', 'r2']);
  });
});

// ─── canTransitionToDone ────────────────────────────────────────────────────

describe('RepoGroupService.canTransitionToDone', () => {
  it('allows the transition when the release is in no linked group', () => {
    const releases = [rel('r1', ['t1'])];
    const result = RepoGroupService.canTransitionToDone('r1', [], releases);
    expect(result.allowed).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it('blocks when a sibling in the same linked group is not done/approved', () => {
    const groups = [group('g1', 'frontend', ['web'])];
    const releases = [
      rel('r1', ['t1'], 'backlog'),
      rel('r2', ['t2'], 'in_progress', 'Staging'),
    ];
    const tickets = [ticket('t1', ['web']), ticket('t2', ['web'])];
    const linked = RepoGroupService.findLinkedGroups(groups, releases, tickets);

    const result = RepoGroupService.canTransitionToDone('r1', linked, releases);
    expect(result.allowed).toBe(false);
    expect(result.blockers).toEqual([
      { groupName: 'frontend', releaseId: 'r2', status: 'Staging' },
    ]);
  });

  it('allows the transition when every sibling is done or approved', () => {
    const groups = [group('g1', 'frontend', ['web'])];
    const releases = [
      rel('r1', ['t1'], 'backlog'),
      rel('r2', ['t2'], 'done'),
      rel('r3', ['t3'], 'approved'),
    ];
    const tickets = [
      ticket('t1', ['web']),
      ticket('t2', ['web']),
      ticket('t3', ['web']),
    ];
    const linked = RepoGroupService.findLinkedGroups(groups, releases, tickets);

    const result = RepoGroupService.canTransitionToDone('r1', linked, releases);
    expect(result.allowed).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it('aggregates blockers from multiple groups when the release belongs to both', () => {
    const groups = [
      group('g1', 'frontend', ['web']),
      group('g2', 'backend',  ['api']),
    ];
    const releases = [
      rel('r1', ['t-web', 't-api'], 'backlog'),
      rel('r2', ['t-web2'], 'in_progress', 'Staging'),   // blocker via g1
      rel('r3', ['t-api2'], 'in_progress', 'Merged to master'), // blocker via g2
    ];
    const tickets = [
      ticket('t-web', ['web']),
      ticket('t-api', ['api']),
      ticket('t-web2', ['web']),
      ticket('t-api2', ['api']),
    ];
    const linked = RepoGroupService.findLinkedGroups(groups, releases, tickets);

    const result = RepoGroupService.canTransitionToDone('r1', linked, releases);
    expect(result.allowed).toBe(false);
    expect(result.blockers).toHaveLength(2);
    expect(result.blockers.map(b => b.releaseId).sort()).toEqual(['r2', 'r3']);
  });

  it('does not report the release itself as a blocker', () => {
    const groups = [group('g1', 'frontend', ['web'])];
    const releases = [
      rel('r1', ['t1'], 'backlog'),
      rel('r2', ['t2'], 'done'),
    ];
    const tickets = [ticket('t1', ['web']), ticket('t2', ['web'])];
    const linked = RepoGroupService.findLinkedGroups(groups, releases, tickets);

    const result = RepoGroupService.canTransitionToDone('r1', linked, releases);
    // r1 is in the linked group but we're asking if r1 itself can transition;
    // only the other members matter.
    expect(result.blockers.find(b => b.releaseId === 'r1')).toBeUndefined();
  });
});

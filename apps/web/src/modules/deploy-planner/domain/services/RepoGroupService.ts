/**
 * RepoGroupService — pure domain logic for repository dependency groups.
 *
 * A group contains a set of repo names. When 2+ releases have tickets
 * whose repos overlap with the same group, those releases are "linked".
 *
 * Blocking rule: no linked release can move to a 'done' status category
 * unless ALL other linked releases are in 'done' or 'approved'.
 */

import type { StatusCategory } from '../ports/DeployConfigPort';

export interface RepoGroup {
  id: string;
  name: string;
  repos: string[];
}

export interface ReleaseForGrouping {
  id: string;
  ticketIds: string[];
  status: string;
  statusCategory: StatusCategory;
}

export interface TicketWithRepos {
  key: string;
  repos: string[];
}

export interface LinkedGroup {
  group: RepoGroup;
  releaseIds: string[];
  allDoneOrApproved: boolean;
}

export class RepoGroupService {
  /**
   * Find which releases are linked through each repo group.
   * Only returns groups that link 2+ releases.
   */
  static findLinkedGroups(
    groups: RepoGroup[],
    releases: ReleaseForGrouping[],
    tickets: TicketWithRepos[],
  ): LinkedGroup[] {
    const ticketMap = new Map(tickets.map(t => [t.key, t]));

    return groups
      .map(group => {
        const releaseIds = releases
          .filter(rel => {
            const relRepos = new Set(
              rel.ticketIds
                .map(k => ticketMap.get(k))
                .filter(Boolean)
                .flatMap(t => t!.repos)
            );
            return group.repos.some(r => relRepos.has(r));
          })
          .map(r => r.id);

        const allDoneOrApproved = releaseIds.every(id => {
          const rel = releases.find(r => r.id === id);
          return rel ? (rel.statusCategory === 'done' || rel.statusCategory === 'approved') : false;
        });

        return { group, releaseIds, allDoneOrApproved };
      })
      .filter(lg => lg.releaseIds.length >= 2);
  }

  /**
   * Check if a release can transition to a 'done' status category.
   * Allowed only if all other releases in shared groups are 'done' or 'approved'.
   */
  static canTransitionToDone(
    releaseId: string,
    linkedGroups: LinkedGroup[],
    releases: ReleaseForGrouping[],
  ): { allowed: boolean; blockers: { groupName: string; releaseId: string; status: string }[] } {
    const blockers: { groupName: string; releaseId: string; status: string }[] = [];

    for (const lg of linkedGroups) {
      if (!lg.releaseIds.includes(releaseId)) continue;

      for (const otherId of lg.releaseIds) {
        if (otherId === releaseId) continue;
        const other = releases.find(r => r.id === otherId);
        if (other && other.statusCategory !== 'done' && other.statusCategory !== 'approved') {
          blockers.push({
            groupName: lg.group.name,
            releaseId: otherId,
            status: other.status,
          });
        }
      }
    }

    return { allowed: blockers.length === 0, blockers };
  }
}

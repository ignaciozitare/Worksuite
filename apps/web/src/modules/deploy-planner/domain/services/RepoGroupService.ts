/**
 * RepoGroupService — pure domain logic for repository dependency groups.
 *
 * A group contains a set of repo names. When 2+ releases have tickets
 * whose repos overlap with the same group, those releases are "linked".
 * No linked release can move to a final status until ALL linked releases
 * in the group are deployed.
 */

export interface RepoGroup {
  id: string;
  name: string;
  repos: string[];
}

export interface ReleaseForGrouping {
  id: string;
  ticketIds: string[];
  status: string;
}

export interface TicketWithRepos {
  key: string;
  repos: string[];
}

export interface LinkedGroup {
  group: RepoGroup;
  releaseIds: string[];
  allDeployed: boolean;
}

export class RepoGroupService {
  /**
   * Find which releases are linked through each repo group.
   * A release is "in" a group if any of its tickets have repos that belong to the group.
   * Only returns groups that link 2+ releases.
   */
  static findLinkedGroups(
    groups: RepoGroup[],
    releases: ReleaseForGrouping[],
    tickets: TicketWithRepos[],
    isFinalStatus: (status: string) => boolean,
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

        const allDeployed = releaseIds.every(id => {
          const rel = releases.find(r => r.id === id);
          return rel ? isFinalStatus(rel.status) : false;
        });

        return { group, releaseIds, allDeployed };
      })
      .filter(lg => lg.releaseIds.length >= 2);
  }

  /**
   * Check if a release can transition to a final status.
   * Returns blockers: other releases in the same group that are NOT yet deployed.
   */
  static canTransitionToFinal(
    releaseId: string,
    linkedGroups: LinkedGroup[],
    releases: ReleaseForGrouping[],
    isFinalStatus: (status: string) => boolean,
  ): { allowed: boolean; blockers: { groupName: string; releaseId: string; status: string }[] } {
    const blockers: { groupName: string; releaseId: string; status: string }[] = [];

    for (const lg of linkedGroups) {
      if (!lg.releaseIds.includes(releaseId)) continue;

      for (const otherId of lg.releaseIds) {
        if (otherId === releaseId) continue;
        const other = releases.find(r => r.id === otherId);
        if (other && !isFinalStatus(other.status)) {
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

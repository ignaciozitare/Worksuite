/**
 * Shared view types for the Deploy Planner internal components.
 *
 * Tickets and status configuration come from the Jira sync (not the DB),
 * so they're shaped here to match what the root `DeployPlanner` actually
 * feeds into the leaf views. `Release` is re-exported as an alias of the
 * existing raw DB row type so everything in the views uses the same shape.
 */

import type { DeployReleaseRow } from '../../domain/ports/IDeployReleaseRawRepo';

/** A release row as consumed by the planning/timeline/history/metrics views. */
export type Release = DeployReleaseRow;

/**
 * A Jira ticket once the sync has normalized it. The `fields` bag is
 * intentionally loose because different Jira sites return different
 * custom field shapes.
 */
export interface DpTicket {
  key: string;
  summary: string;
  assignee: string;
  priority: string;
  type: string;
  status: string;
  repos: string[];
  fields?: Record<string, unknown>;
}

/** Entry of the `statusCfg` map (keyed by status name). */
export interface StatusCfgEntry {
  color: string;
  bg_color: string;
  border: string;
  is_final?: boolean;
  status_category?: 'backlog' | 'in_progress' | 'approved' | 'done';
  ord?: number;
}

/** `statusCfg` is a dictionary from status name → config. */
export type StatusCfg = Record<string, StatusCfgEntry>;

/** Repo group as the UI consumes it (camelCase id/name, array of repos). */
export interface RepoGroupView {
  id: string;
  name: string;
  repos: string[];
}

/** Dragged-ticket payload kept on the planning board. */
export interface DragState {
  key: string;
  fromId: string;
}

/** Version config passed to VersionPicker. */
export interface VersionCfg {
  prefix: string;
  separator: string;
  segments: { name: string; value: number }[];
}

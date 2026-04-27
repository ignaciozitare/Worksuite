import type { ITaskRepo } from '../domain/ports/ITaskRepo';
import type { Task } from '../domain/entities/Task';

export interface CloneTaskOptions {
  /** Override the cloned task's title. */
  title: string;
  /** Recursively clone direct children (and their children, up to 5 levels). */
  includeSubtasks: boolean;
  /** Copy `task.data` (schema fields, ToDos, checklists, etc.). */
  includeData: boolean;
  /** Copy `task.priority`. */
  includePriority: boolean;
  /** Copy `task.assigneeId`. */
  includeAssignee: boolean;
  /** Reserved for v2 — alarms aren't cloned in this version (no alarm port wired here). */
  includeAlarms: boolean;
  /** Reserved for v2 — comments aren't cloned in this version (no comment entity yet). */
  includeComments: boolean;
}

export type ResolveOpenStateFn = (taskTypeId: string) => string | null;

/**
 * Clone a task into a new row. The clone always lands in the OPEN state of
 * the task type's workflow — never in the source's current state — so two
 * copies of the same task never coexist mid-flow without the user picking
 * up the new one. If a workflow has no OPEN state, the clone is created
 * with `stateId = null` and the caller can surface a warning.
 *
 * Subtasks are cloned in parent-first order (we need the parent's id before
 * we can re-parent the children). The hierarchy depth cap of 5 levels — set
 * by Phase 5 — bounds the recursion naturally.
 *
 * The use case takes a `resolveOpenState` function rather than the workflow
 * / state ports so it stays decoupled from the workflow domain — the caller
 * (which usually has these in memory already) supplies the lookup.
 */
export class CloneTask {
  constructor(private taskRepo: ITaskRepo) {}

  async execute(
    sourceId: string,
    opts: CloneTaskOptions,
    currentUserId: string,
    resolveOpenState: ResolveOpenStateFn,
  ): Promise<Task> {
    const source = await this.taskRepo.findById(sourceId);
    if (!source) throw new Error('source task not found');

    const openStateId = resolveOpenState(source.taskTypeId);
    const clone = await this.cloneOne(source, opts, openStateId, currentUserId, source.parentTaskId);

    if (opts.includeSubtasks) {
      await this.cloneChildren(source.id, clone.id, opts, currentUserId, resolveOpenState);
    }

    return clone;
  }

  private async cloneOne(
    source: Task,
    opts: CloneTaskOptions,
    openStateId: string | null,
    currentUserId: string,
    parentTaskId: string | null,
  ): Promise<Task> {
    return this.taskRepo.create({
      taskTypeId: source.taskTypeId,
      stateId: openStateId,
      title: opts.title,
      data: opts.includeData ? { ...source.data } : {},
      assigneeId: opts.includeAssignee ? source.assigneeId : null,
      priority: opts.includePriority ? source.priority : null,
      dueDate: source.dueDate,
      parentTaskId,
      sortOrder: 0,
      createdBy: currentUserId,
    });
  }

  private async cloneChildren(
    sourceParentId: string,
    targetParentId: string,
    opts: CloneTaskOptions,
    currentUserId: string,
    resolveOpenState: ResolveOpenStateFn,
  ): Promise<void> {
    const children = await this.taskRepo.findChildren(sourceParentId);
    for (const child of children) {
      const childOpen = resolveOpenState(child.taskTypeId);
      const childClone = await this.cloneOne(
        child,
        { ...opts, title: child.title },
        childOpen,
        currentUserId,
        targetParentId,
      );
      await this.cloneChildren(child.id, childClone.id, opts, currentUserId, resolveOpenState);
    }
  }
}

/**
 * Cascade-delete a task and its full descendant tree, BFS from the root and
 * deleted leaves-first so the FK `vl_tasks.parent_task_id` (ON DELETE SET NULL)
 * never temporarily detaches grandchildren.
 *
 * The 5-level depth cap from Phase 5 keeps the recursion bounded — no
 * iteration limit is enforced here.
 */
export class DeleteTaskCascade {
  constructor(private taskRepo: ITaskRepo) {}

  async execute(taskId: string): Promise<void> {
    const ids = await this.collectDescendants(taskId);
    // Delete leaves first, then roots, in reverse-BFS order.
    for (let i = ids.length - 1; i >= 0; i--) {
      const id = ids[i];
      if (id) await this.taskRepo.remove(id);
    }
  }

  /** Returns [root, ...children, ...grandchildren] in BFS order. */
  private async collectDescendants(rootId: string): Promise<string[]> {
    const result: string[] = [rootId];
    const queue: string[] = [rootId];
    while (queue.length > 0) {
      const next = queue.shift()!;
      const children = await this.taskRepo.findChildren(next);
      for (const c of children) {
        result.push(c.id);
        queue.push(c.id);
      }
    }
    return result;
  }
}

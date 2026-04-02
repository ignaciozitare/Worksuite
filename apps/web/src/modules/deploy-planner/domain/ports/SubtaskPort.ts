export interface JiraSubtask {
  key: string;
  summary: string;
  type: string;          // issue type name (Bug, Test, etc.)
  status: string;        // Jira status name
  statusCategory: string; // Jira status category (To Do, In Progress, Done)
  priority: string;
  assignee: string;
  parentKey: string;     // parent issue key
  relation: 'subtask' | 'linked'; // how it relates to parent
}

export interface SubtaskPort {
  getSubtasks(parentKeys: string[]): Promise<JiraSubtask[]>;
}

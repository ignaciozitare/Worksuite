export type EmailRuleFilterType = 'label' | 'category' | 'sender' | 'domain' | 'all';

export interface EmailRuleFilter {
  type: EmailRuleFilterType;
  value: string;
}

export interface EmailRule {
  id: string;
  userId: string;
  name: string;
  isActive: boolean;
  filters: EmailRuleFilter[];
  actionTaskTypeId: string | null;
  actionPriorityName: string | null;
  actionAssigneeId: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

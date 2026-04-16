import type { EmailRule, EmailRuleFilter } from '../entities/EmailRule';
import type { EmailDetection, EmailDetectionStatus } from '../entities/EmailDetection';
import type { GmailConnectionStatus } from '../entities/GmailConnection';

export interface PollResult {
  listed: number;
  new: number;
  matched: number;
  auto_created: number;
  queued: number;
  failed: number;
  skipped_not_configured: boolean;
  error?: string;
}

export interface IGmailConnectionRepo {
  getStatus(): Promise<GmailConnectionStatus>;
  startOAuth(): Promise<string>;               // returns URL to redirect the browser to
  disconnect(): Promise<void>;
  updateSettings(patch: {
    pollingIntervalMinutes?: number;
    confidenceThreshold?: number;
    defaultPriorityId?: string | null;
    defaultTaskTypeId?: string | null;
    isActive?: boolean;
  }): Promise<void>;
  pollNow(): Promise<PollResult>;
}

export interface IEmailRuleRepo {
  list(): Promise<EmailRule[]>;
  create(draft: {
    name: string;
    filters: EmailRuleFilter[];
    actionTaskTypeId?: string | null;
    actionPriorityName?: string | null;
    actionAssigneeId?: string | null;
    sortOrder?: number;
    isActive?: boolean;
  }): Promise<EmailRule>;
  update(id: string, patch: {
    name?: string;
    filters?: EmailRuleFilter[];
    actionTaskTypeId?: string | null;
    actionPriorityName?: string | null;
    actionAssigneeId?: string | null;
    sortOrder?: number;
    isActive?: boolean;
  }): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface IEmailDetectionRepo {
  list(status?: EmailDetectionStatus): Promise<EmailDetection[]>;
  approve(id: string, overrides?: {
    title?: string;
    description?: string;
    taskTypeId?: string;
    priority?: string;
    dueDate?: string | null;
  }): Promise<{ taskId: string }>;
  reject(id: string): Promise<void>;
}

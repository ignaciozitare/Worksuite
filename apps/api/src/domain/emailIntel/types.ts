// Backend domain types mirroring the frontend entities. Kept intentionally
// minimal — the frontend has its own domain layer; this file is only for
// the API's internal typing of rows in and out of the repos.

export type EmailRuleFilterType = 'label' | 'category' | 'sender' | 'domain' | 'all';

export interface EmailRuleFilter {
  type: EmailRuleFilterType;
  value: string;
}

export interface EmailRule {
  id: string;
  user_id: string;
  name: string;
  is_active: boolean;
  filters: EmailRuleFilter[];
  action_task_type_id: string | null;
  action_priority_name: string | null;
  action_assignee_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type EmailDetectionStatus =
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'auto_created'
  | 'failed';

export interface EmailDetection {
  id: string;
  user_id: string;
  gmail_message_id: string;
  gmail_thread_id: string;
  gmail_received_at: string;
  from_email: string;
  from_name: string | null;
  subject: string | null;
  body_snippet: string | null;
  body_full: string | null;
  matched_rule_id: string | null;
  status: EmailDetectionStatus;
  confidence: number | null;
  proposed_title: string | null;
  proposed_description: string | null;
  proposed_task_type_id: string | null;
  proposed_priority: string | null;
  proposed_due_date: string | null;
  task_id: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface GmailConnection {
  id: string;
  user_id: string;
  email: string;
  refresh_token: string;     // encrypted at rest by apps/api
  access_token: string | null;
  token_expires_at: string | null;
  is_active: boolean;
  polling_interval_minutes: number;
  confidence_threshold: number;
  default_priority_id: string | null;
  default_task_type_id: string | null;
  last_polled_at: string | null;
  last_message_timestamp: string | null;
  created_at: string;
  updated_at: string;
}

/** Public summary safe to return to the browser (no tokens). */
export interface GmailConnectionSummary {
  email: string;
  is_active: boolean;
  polling_interval_minutes: number;
  confidence_threshold: number;
  default_priority_id: string | null;
  default_task_type_id: string | null;
  last_polled_at: string | null;
  created_at: string;
}

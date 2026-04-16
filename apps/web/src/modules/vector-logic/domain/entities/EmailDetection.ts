export type EmailDetectionStatus =
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'auto_created'
  | 'failed';

export interface EmailDetection {
  id: string;
  userId: string;
  gmailMessageId: string;
  gmailThreadId: string;
  gmailReceivedAt: string;
  fromEmail: string;
  fromName: string | null;
  subject: string | null;
  bodySnippet: string | null;
  bodyFull: string | null;
  matchedRuleId: string | null;
  status: EmailDetectionStatus;
  confidence: number | null;
  proposedTitle: string | null;
  proposedDescription: string | null;
  proposedTaskTypeId: string | null;
  proposedPriority: string | null;
  proposedDueDate: string | null;
  taskId: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Builds the Gmail thread URL for a detection. */
export function gmailThreadUrl(threadId: string): string {
  return `https://mail.google.com/mail/u/0/#inbox/${threadId}`;
}

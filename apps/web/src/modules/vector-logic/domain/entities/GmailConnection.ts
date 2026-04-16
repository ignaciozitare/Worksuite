export interface GmailConnectionSummary {
  email: string;
  isActive: boolean;
  pollingIntervalMinutes: number;
  confidenceThreshold: number;
  defaultPriorityId: string | null;
  defaultTaskTypeId: string | null;
  lastPolledAt: string | null;
  createdAt: string;
}

export interface GmailConnectionStatus {
  /** When null, the user has not connected Gmail yet. */
  connection: GmailConnectionSummary | null;
  /** Whether the server has GOOGLE_* env vars set. If false, the Connect button stays disabled. */
  oauthConfigured: boolean;
}

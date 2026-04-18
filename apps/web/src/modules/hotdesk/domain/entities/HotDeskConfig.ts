
export interface HotDeskConfig {
  id:                          string;
  confirmationEnabled:         boolean;
  confirmationDeadlineMinutes: number;
  businessDayStart:            string;   // e.g. "09:00"
  autoReleaseEnabled:          boolean;
  exemptRoles:                 string[];
}


export interface HotDeskConfig {
  id:                          string;
  confirmationEnabled:         boolean;
  confirmationDeadlineMinutes: number;
  businessDayStart:            string;   // e.g. "09:00"
  autoReleaseEnabled:          boolean;
  exemptRoles:                 string[];
  maxBookingDays:              number;   // how many days ahead users can book (default 14)
}

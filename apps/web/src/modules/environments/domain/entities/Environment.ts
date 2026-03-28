export type EnvCategory = 'DEV' | 'PRE' | 'STAGING';

export interface Environment {
  id:                     string;
  name:                   string;
  category:               EnvCategory;
  isLocked:               boolean;
  isArchived:             boolean;
  maxReservationDuration: number;   // hours
  color:                  string | null;
  url:                    string | null;
}

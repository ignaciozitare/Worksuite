/**
 * Reservation lifecycle categories. These drive behavior (filters, checkIn,
 * checkOut, overlap, history). Each row in syn_reservation_statuses has one
 * category; users may create multiple statuses under the same category.
 */
export type ReservationStatusCategory =
  | 'reserved'   // scheduled, not yet started
  | 'in_use'     // currently being used
  | 'completed'  // end state (success)
  | 'cancelled'  // end state (cancelled)
  | 'violation'; // policy violation — still active, flagged

export interface ReservationStatusData {
  id:              string;
  name:            string;
  color:           string;
  bg_color:        string;
  border:          string;
  ord:             number;
  status_category: ReservationStatusCategory;
}

/** Categories that count as "active" (visible by default, blocks overlap). */
export const ACTIVE_CATEGORIES: ReservationStatusCategory[] = ['reserved', 'in_use', 'violation'];

/** Categories that are final (end of lifecycle, saved to history). */
export const FINAL_CATEGORIES: ReservationStatusCategory[] = ['completed', 'cancelled'];

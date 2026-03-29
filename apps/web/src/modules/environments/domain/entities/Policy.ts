export interface Policy {
  id:                   number;
  booking_window_days:  number;   // max days ahead a reservation can start
  min_duration_hours:   number;
  allow_past_start:     boolean;
  business_hours_start: number;   // 0-23
  business_hours_end:   number;   // 0-23
}

export const DEFAULT_POLICY: Policy = {
  id:                   1,
  booking_window_days:  30,
  min_duration_hours:   1,
  allow_past_start:     false,
  business_hours_start: 8,
  business_hours_end:   20,
};

export function policyFromRow(row: Record<string, unknown>): Policy {
  return {
    id:                   row.id as number ?? 1,
    booking_window_days:  row.booking_window_days as number ?? 30,
    min_duration_hours:   row.min_duration_hours as number ?? 1,
    allow_past_start:     row.allow_past_start as boolean ?? false,
    business_hours_start: row.business_hours_start as number ?? 8,
    business_hours_end:   row.business_hours_end as number ?? 20,
  };
}

/** Validate a reservation against the policy. Returns an array of violation messages. */
export function validateAgainstPolicy(
  policy: Policy,
  start: string,
  end: string,
): string[] {
  const violations: string[] = [];
  const now = new Date();
  const s   = new Date(start);
  const e   = new Date(end);

  if (!policy.allow_past_start && s < now) {
    violations.push("La fecha de inicio no puede ser en el pasado.");
  }
  const windowLimit = new Date(now);
  windowLimit.setDate(windowLimit.getDate() + policy.booking_window_days);
  if (s > windowLimit) {
    violations.push(`No se puede reservar con más de ${policy.booking_window_days} días de antelación.`);
  }
  const durationH = (e.getTime() - s.getTime()) / 3_600_000;
  if (durationH < policy.min_duration_hours) {
    violations.push(`La duración mínima es ${policy.min_duration_hours}h.`);
  }
  if (e <= s) {
    violations.push("La fecha de fin debe ser posterior a la de inicio.");
  }
  return violations;
}

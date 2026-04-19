
import type { ConfigRepository } from "../domain/ports/ConfigRepository";
import type { HotDeskConfig }    from "../domain/entities/HotDeskConfig";
import { supabase }              from "../../../shared/lib/supabaseClient";

export class SupabaseConfigRepository implements ConfigRepository {
  async getConfig(): Promise<HotDeskConfig> {
    const { data, error } = await supabase
      .from("hotdesk_config")
      .select("*")
      .limit(1)
      .single();
    if (error) throw error;
    return {
      id:                          data.id,
      confirmationEnabled:         data.confirmation_enabled,
      confirmationDeadlineMinutes: data.confirmation_deadline_minutes,
      businessDayStart:            data.business_day_start,
      autoReleaseEnabled:          data.auto_release_enabled,
      exemptRoles:                 data.exempt_roles ?? [],
      maxBookingDays:              data.max_booking_days ?? 14,
    };
  }

  async updateConfig(patch: Partial<Omit<HotDeskConfig, "id">>): Promise<void> {
    // Map camelCase domain fields to snake_case DB columns
    const row: Record<string, unknown> = {};
    if (patch.confirmationEnabled !== undefined)         row.confirmation_enabled          = patch.confirmationEnabled;
    if (patch.confirmationDeadlineMinutes !== undefined)  row.confirmation_deadline_minutes = patch.confirmationDeadlineMinutes;
    if (patch.businessDayStart !== undefined)             row.business_day_start            = patch.businessDayStart;
    if (patch.autoReleaseEnabled !== undefined)           row.auto_release_enabled          = patch.autoReleaseEnabled;
    if (patch.exemptRoles !== undefined)                  row.exempt_roles                  = patch.exemptRoles;
    if (patch.maxBookingDays !== undefined)               row.max_booking_days              = patch.maxBookingDays;

    // Get existing config row id
    const { data: existing, error: fetchError } = await supabase
      .from("hotdesk_config")
      .select("id")
      .limit(1)
      .single();
    if (fetchError) throw fetchError;

    const { error } = await supabase
      .from("hotdesk_config")
      .update(row)
      .eq("id", existing.id);
    if (error) throw error;
  }
}

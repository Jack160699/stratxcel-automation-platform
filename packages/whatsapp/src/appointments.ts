import type { ServiceClient } from "./db.ts";

export interface CrmAppointmentRow {
  id: string;
  tenant_id: string;
  lead_id: string;
  requested_at: string;
  scheduled_for: string | null;
  confirmed_at: string | null;
  status: "requested" | "confirmed" | "cancelled" | "rescheduled" | "completed" | "no_show";
  notes: string | null;
  cancelled_reason: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Persisted Stratxcel-internal scheduling state only — no external calendar
 * integration exists in this repository (see docs/discovery), so this never
 * claims "added to your calendar" or sends a real calendar invite. Reminder
 * hooks are limited to persisting scheduled_for for a future job to read.
 */
export async function requestAppointment(
  supabase: ServiceClient,
  input: { tenantId: string; leadId: string; requestedFor?: Date | null; notes?: string | null }
): Promise<CrmAppointmentRow> {
  const { data, error } = await supabase
    .from("crm_appointments")
    .insert({
      tenant_id: input.tenantId,
      lead_id: input.leadId,
      scheduled_for: input.requestedFor?.toISOString() ?? null,
      notes: input.notes ?? null,
      status: "requested",
    })
    .select("*")
    .single();
  if (error) throw new Error(`requestAppointment: ${error.message}`);
  return data as CrmAppointmentRow;
}

export async function confirmAppointment(supabase: ServiceClient, tenantId: string, appointmentId: string, scheduledFor: Date): Promise<CrmAppointmentRow> {
  const { data, error } = await supabase
    .from("crm_appointments")
    .update({ status: "confirmed", scheduled_for: scheduledFor.toISOString(), confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", appointmentId)
    .eq("tenant_id", tenantId)
    .select("*")
    .single();
  if (error) throw new Error(`confirmAppointment: ${error.message}`);
  return data as CrmAppointmentRow;
}

export async function cancelAppointment(supabase: ServiceClient, tenantId: string, appointmentId: string, reason?: string): Promise<CrmAppointmentRow> {
  const { data, error } = await supabase
    .from("crm_appointments")
    .update({ status: "cancelled", cancelled_reason: reason ?? null, updated_at: new Date().toISOString() })
    .eq("id", appointmentId)
    .eq("tenant_id", tenantId)
    .select("*")
    .single();
  if (error) throw new Error(`cancelAppointment: ${error.message}`);
  return data as CrmAppointmentRow;
}

export async function rescheduleAppointment(supabase: ServiceClient, tenantId: string, appointmentId: string, newTime: Date): Promise<CrmAppointmentRow> {
  const { data, error } = await supabase
    .from("crm_appointments")
    .update({ status: "rescheduled", scheduled_for: newTime.toISOString(), confirmed_at: null, updated_at: new Date().toISOString() })
    .eq("id", appointmentId)
    .eq("tenant_id", tenantId)
    .select("*")
    .single();
  if (error) throw new Error(`rescheduleAppointment: ${error.message}`);
  return data as CrmAppointmentRow;
}

export async function listAppointmentsForTenant(supabase: ServiceClient, tenantId: string, limit = 100): Promise<CrmAppointmentRow[]> {
  const { data, error } = await supabase.from("crm_appointments").select("*").eq("tenant_id", tenantId).order("scheduled_for", { ascending: true, nullsFirst: false }).limit(limit);
  if (error) throw new Error(`listAppointmentsForTenant: ${error.message}`);
  return (data ?? []) as CrmAppointmentRow[];
}

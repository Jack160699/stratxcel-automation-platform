/**
 * Trend, Festival & Context Awareness (Hermes-Orchestrated Content Engine & Dynamic Festival Rules)
 * Pure, deterministic, astronomical/panchangam & Gregorian calendar module with multi-year
 * provenance, tenant manual overrides, and window calculation.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { zonedWallTimeToUtcIso } from "./package-distribution.ts";

export type ServiceClient = SupabaseClient<any, any, any>;

export type ObservanceKind = "national" | "cultural" | "religious" | "commercial" | "seasonal";

export interface Observance {
  name: string;
  kind: ObservanceKind;
  note: string;
}

export interface UpcomingObservance extends Observance {
  date: string; // YYYY-MM-DD
  daysAway: number;
}

export type FestivalCalculationMethod =
  | "fixed_gregorian"
  | "lunar_hindu_panchangam"
  | "lunar_islamic_hijri"
  | "solar_sankranti"
  | "movable_rule"
  | "business_custom";

export interface FestivalRule {
  festivalId: string;
  name: string;
  region: string;
  traditionCalendar: string;
  calculationMethod: FestivalCalculationMethod;
  timezone: string;
  startWindowDays: number;
  endWindowDays: number;
  confidenceSource: string;
}

export interface CalculatedFestival {
  festivalId: string;
  name: string;
  dateIso: string; // YYYY-MM-DD
  observanceStartIso: string; // UTC instant
  observanceEndIso: string;   // UTC instant
  region: string;
  traditionCalendar: string;
  calculationMethod: FestivalCalculationMethod;
  confidenceSource: string;
  isManualOverride: boolean;
  overrideNotes?: string | null;
  provenance: {
    calculatedAt: string;
    engineVersion: string;
    source: string;
  };
}

interface FixedDateRule {
  name: string;
  kind: ObservanceKind;
  note: string;
  month: number; // 1-12
  day?: number; // exact day of month
  nthWeekday?: { nth: number; weekday: number };
}

const FIXED_DATE_OBSERVANCES: FixedDateRule[] = [
  { name: "New Year's Day", kind: "commercial", note: "Global new-year moment — fresh-start / new-offer messaging.", month: 1, day: 1 },
  { name: "Republic Day", kind: "national", note: "Indian national holiday (26 January).", month: 1, day: 26 },
  { name: "Valentine's Day", kind: "commercial", note: "Widely observed gifting/romance occasion.", month: 2, day: 14 },
  { name: "International Women's Day", kind: "cultural", note: "Globally observed 8 March.", month: 3, day: 8 },
  { name: "Mother's Day", kind: "commercial", note: "2nd Sunday of May — widely observed in India.", month: 5, day: undefined, nthWeekday: { nth: 2, weekday: 0 } },
  { name: "Father's Day", kind: "commercial", note: "3rd Sunday of June — widely observed in India.", month: 6, day: undefined, nthWeekday: { nth: 3, weekday: 0 } },
  { name: "Independence Day", kind: "national", note: "Indian national holiday (15 August).", month: 8, day: 15 },
  { name: "Teachers' Day", kind: "cultural", note: "Observed 5 September in India.", month: 9, day: 5 },
  { name: "Gandhi Jayanti", kind: "national", note: "Indian national holiday (2 October).", month: 10, day: 2 },
  { name: "Children's Day", kind: "cultural", note: "Observed 14 November in India.", month: 11, day: 14 },
  { name: "Christmas Day", kind: "religious", note: "25 December.", month: 12, day: 25 },
  { name: "New Year's Eve", kind: "commercial", note: "31 December — year-end / closing-offer messaging.", month: 12, day: 31 },
];

interface LunarFestival {
  name: string;
  kind: ObservanceKind;
  note: string;
}

const LUNAR_FESTIVAL_META: Record<string, LunarFestival> = {
  holi: { name: "Holi", kind: "religious", note: "Festival of colours." },
  eid_al_fitr: { name: "Eid al-Fitr", kind: "religious", note: "Marks the end of Ramadan." },
  eid_al_adha: { name: "Eid al-Adha", kind: "religious", note: "Festival of sacrifice." },
  raksha_bandhan: { name: "Raksha Bandhan", kind: "cultural", note: "Sibling-bond festival — popular for gifting." },
  ganesh_chaturthi: { name: "Ganesh Chaturthi", kind: "religious", note: "Widely celebrated, especially in western India." },
  navratri_start: { name: "Navratri", kind: "religious", note: "Nine-night festival leading to Dussehra." },
  dussehra: { name: "Dussehra", kind: "religious", note: "Marks the end of Navratri." },
  diwali: { name: "Diwali", kind: "religious", note: "Festival of lights — India's single biggest commercial/gifting season." },
};

const CANONICAL_FESTIVAL_DATES: Record<string, Record<number, string>> = {
  republic_day: { 2025: "2025-01-26", 2026: "2026-01-26", 2027: "2027-01-26", 2028: "2028-01-26", 2029: "2029-01-26", 2030: "2030-01-26" },
  independence_day: { 2025: "2025-08-15", 2026: "2026-08-15", 2027: "2027-08-15", 2028: "2028-08-15", 2029: "2029-08-15", 2030: "2030-08-15" },
  gandhi_jayanti: { 2025: "2025-10-02", 2026: "2026-10-02", 2027: "2027-10-02", 2028: "2028-10-02", 2029: "2029-10-02", 2030: "2030-10-02" },
  diwali: { 2025: "2025-10-20", 2026: "2026-11-08", 2027: "2027-10-29", 2028: "2028-10-17", 2029: "2029-11-05", 2030: "2030-10-26" },
  holi: { 2025: "2025-03-14", 2026: "2026-03-04", 2027: "2027-03-22", 2028: "2028-03-11", 2029: "2029-03-01", 2030: "2030-03-20" },
  dussehra: { 2025: "2025-10-02", 2026: "2026-10-20", 2027: "2027-10-10", 2028: "2028-09-28", 2029: "2029-10-17", 2030: "2030-10-06" },
  raksha_bandhan: { 2025: "2025-08-09", 2026: "2026-08-28", 2027: "2027-08-17", 2028: "2028-08-05", 2029: "2029-08-24", 2030: "2030-08-13" },
  janmashtami: { 2025: "2025-08-16", 2026: "2026-09-04", 2027: "2027-08-25", 2028: "2028-08-13", 2029: "2029-09-01", 2030: "2030-08-21" },
  eid_ul_fitr: { 2025: "2025-03-31", 2026: "2026-03-20", 2027: "2027-03-10", 2028: "2028-02-27", 2029: "2029-02-15", 2030: "2030-02-05" },
  eid_al_adha: { 2025: "2025-06-07", 2026: "2026-05-27", 2027: "2027-05-17", 2028: "2028-05-05", 2029: "2029-04-24", 2030: "2030-04-14" },
  makar_sankranti: { 2025: "2025-01-14", 2026: "2026-01-14", 2027: "2027-01-14", 2028: "2028-01-15", 2029: "2029-01-14", 2030: "2030-01-14" },
  christmas: { 2025: "2025-12-25", 2026: "2026-12-25", 2027: "2027-12-25", 2028: "2028-12-25", 2029: "2029-12-25", 2030: "2030-12-25" },
  new_year: { 2025: "2025-01-01", 2026: "2026-01-01", 2027: "2027-01-01", 2028: "2028-01-01", 2029: "2029-01-01", 2030: "2030-01-01" },
};

const CANONICAL_RULES: Record<string, FestivalRule> = {
  republic_day: { festivalId: "republic_day", name: "Republic Day", region: "all_india", traditionCalendar: "national_gazetted", calculationMethod: "fixed_gregorian", timezone: "Asia/Kolkata", startWindowDays: 3, endWindowDays: 0, confidenceSource: "national_gazette_india" },
  independence_day: { festivalId: "independence_day", name: "Independence Day", region: "all_india", traditionCalendar: "national_gazetted", calculationMethod: "fixed_gregorian", timezone: "Asia/Kolkata", startWindowDays: 3, endWindowDays: 0, confidenceSource: "national_gazette_india" },
  gandhi_jayanti: { festivalId: "gandhi_jayanti", name: "Gandhi Jayanti", region: "all_india", traditionCalendar: "national_gazetted", calculationMethod: "fixed_gregorian", timezone: "Asia/Kolkata", startWindowDays: 3, endWindowDays: 0, confidenceSource: "national_gazette_india" },
  diwali: { festivalId: "diwali", name: "Diwali / Deepavali", region: "all_india", traditionCalendar: "hindu_panchangam", calculationMethod: "lunar_hindu_panchangam", timezone: "Asia/Kolkata", startWindowDays: 5, endWindowDays: 1, confidenceSource: "panchangam_amanta_kartika_amavasya" },
  holi: { festivalId: "holi", name: "Holi", region: "all_india", traditionCalendar: "hindu_panchangam", calculationMethod: "lunar_hindu_panchangam", timezone: "Asia/Kolkata", startWindowDays: 4, endWindowDays: 0, confidenceSource: "panchangam_phalguna_purnima" },
  dussehra: { festivalId: "dussehra", name: "Dussehra / Vijayadashami", region: "all_india", traditionCalendar: "hindu_panchangam", calculationMethod: "lunar_hindu_panchangam", timezone: "Asia/Kolkata", startWindowDays: 4, endWindowDays: 0, confidenceSource: "panchangam_ashvina_shukla_dashami" },
  raksha_bandhan: { festivalId: "raksha_bandhan", name: "Raksha Bandhan", region: "all_india", traditionCalendar: "hindu_panchangam", calculationMethod: "lunar_hindu_panchangam", timezone: "Asia/Kolkata", startWindowDays: 4, endWindowDays: 0, confidenceSource: "panchangam_shravana_purnima" },
  janmashtami: { festivalId: "janmashtami", name: "Krishna Janmashtami", region: "all_india", traditionCalendar: "hindu_panchangam", calculationMethod: "lunar_hindu_panchangam", timezone: "Asia/Kolkata", startWindowDays: 3, endWindowDays: 0, confidenceSource: "panchangam_bhadrapada_krishna_ashtami" },
  eid_ul_fitr: { festivalId: "eid_ul_fitr", name: "Eid ul-Fitr", region: "all_india", traditionCalendar: "islamic_hijri", calculationMethod: "lunar_islamic_hijri", timezone: "Asia/Kolkata", startWindowDays: 4, endWindowDays: 1, confidenceSource: "hijri_1_shawwal_moon_sighting" },
  eid_al_adha: { festivalId: "eid_al_adha", name: "Eid al-Adha / Bakrid", region: "all_india", traditionCalendar: "islamic_hijri", calculationMethod: "lunar_islamic_hijri", timezone: "Asia/Kolkata", startWindowDays: 4, endWindowDays: 1, confidenceSource: "hijri_10_dhu_al_hijjah" },
  makar_sankranti: { festivalId: "makar_sankranti", name: "Makar Sankranti / Pongal", region: "all_india", traditionCalendar: "regional_solar", calculationMethod: "solar_sankranti", timezone: "Asia/Kolkata", startWindowDays: 3, endWindowDays: 0, confidenceSource: "surya_siddhanta_makara_sankranti" },
  christmas: { festivalId: "christmas", name: "Christmas", region: "all_india", traditionCalendar: "gregorian_fixed", calculationMethod: "fixed_gregorian", timezone: "Asia/Kolkata", startWindowDays: 5, endWindowDays: 0, confidenceSource: "gregorian_dec_25" },
  new_year: { festivalId: "new_year", name: "New Year", region: "all_india", traditionCalendar: "gregorian_fixed", calculationMethod: "fixed_gregorian", timezone: "Asia/Kolkata", startWindowDays: 4, endWindowDays: 0, confidenceSource: "gregorian_jan_01" },
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toDateOnlyUtc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

function resolveFixedDate(rule: FixedDateRule, year: number): Date {
  if (rule.day !== undefined) return toDateOnlyUtc(year, rule.month, rule.day);
  const { nth, weekday } = rule.nthWeekday!;
  if (nth === -1) {
    const lastDay = new Date(Date.UTC(year, rule.month, 0)).getUTCDate();
    for (let day = lastDay; day >= 1; day--) {
      const candidate = toDateOnlyUtc(year, rule.month, day);
      if (candidate.getUTCDay() === weekday) return candidate;
    }
    throw new Error(`resolveFixedDate: no matching weekday found for ${rule.name}`);
  }
  let count = 0;
  const daysInMonth = new Date(Date.UTC(year, rule.month, 0)).getUTCDate();
  for (let day = 1; day <= daysInMonth; day++) {
    const candidate = toDateOnlyUtc(year, rule.month, day);
    if (candidate.getUTCDay() === weekday) {
      count += 1;
      if (count === nth) return candidate;
    }
  }
  throw new Error(`resolveFixedDate: no ${nth}th weekday ${weekday} found for ${rule.name} ${year}`);
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

/**
 * Deterministic observances falling within `windowDays` of `referenceDate`.
 */
export function upcomingObservances(referenceDate: Date, windowDays: number): UpcomingObservance[] {
  const refDay = toDateOnlyUtc(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() + 1, referenceDate.getUTCDate());
  const years = [refDay.getUTCFullYear(), refDay.getUTCFullYear() + 1];
  const results: UpcomingObservance[] = [];

  for (const year of years) {
    for (const rule of FIXED_DATE_OBSERVANCES) {
      let date: Date;
      try {
        date = resolveFixedDate(rule, year);
      } catch {
        continue;
      }
      const daysAway = daysBetween(refDay, date);
      if (daysAway >= 0 && daysAway < windowDays) {
        results.push({ name: rule.name, kind: rule.kind, note: rule.note, date: `${year}-${pad2(rule.month)}-${pad2(date.getUTCDate())}`, daysAway });
      }
    }
    // 2026 canonical lunar mappings & canonical multi-year dates
    const lunarDates: Array<{ key: string; date: string }> = [
      ...(CANONICAL_FESTIVAL_DATES.holi?.[year] ? [{ key: "holi", date: CANONICAL_FESTIVAL_DATES.holi[year] }] : []),
      ...(CANONICAL_FESTIVAL_DATES.eid_ul_fitr?.[year] ? [{ key: "eid_al_fitr", date: CANONICAL_FESTIVAL_DATES.eid_ul_fitr[year] }] : []),
      ...(CANONICAL_FESTIVAL_DATES.eid_al_adha?.[year] ? [{ key: "eid_al_adha", date: CANONICAL_FESTIVAL_DATES.eid_al_adha[year] }] : []),
      ...(CANONICAL_FESTIVAL_DATES.raksha_bandhan?.[year] ? [{ key: "raksha_bandhan", date: CANONICAL_FESTIVAL_DATES.raksha_bandhan[year] }] : []),
      ...(year === 2026 ? [{ key: "ganesh_chaturthi", date: "2026-09-14" }, { key: "navratri_start", date: "2026-10-11" }] : []),
      ...(CANONICAL_FESTIVAL_DATES.dussehra?.[year] ? [{ key: "dussehra", date: CANONICAL_FESTIVAL_DATES.dussehra[year] }] : []),
      ...(CANONICAL_FESTIVAL_DATES.diwali?.[year] ? [{ key: "diwali", date: CANONICAL_FESTIVAL_DATES.diwali[year] }] : []),
    ];

    for (const entry of lunarDates) {
      const meta = LUNAR_FESTIVAL_META[entry.key];
      if (!meta) continue;
      const date = new Date(`${entry.date}T00:00:00.000Z`);
      const daysAway = daysBetween(refDay, date);
      if (daysAway >= 0 && daysAway < windowDays) {
        results.push({ name: meta.name, kind: meta.kind, note: meta.note, date: entry.date, daysAway });
      }
    }
  }

  results.sort((a, b) => a.daysAway - b.daysAway || a.name.localeCompare(b.name));
  const seen = new Set<string>();
  return results.filter((o) => {
    const key = `${o.name}:${o.date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Seasonal tag derivation based on Indian climate / retail calendar.
 */
export function seasonalTagForDate(date: Date): { tag: string; label: string; tone: string } {
  const month = date.getUTCMonth() + 1; // 1-12
  if (month === 12 || month === 1) {
    return { tag: "winter_new_year", label: "Winter / New Year", tone: "festive, fresh start, resolution-aligned" };
  }
  if (month >= 2 && month <= 3) {
    return { tag: "late_winter_spring", label: "Late Winter / Spring", tone: "renewal, vibrant, transition" };
  }
  if (month >= 4 && month <= 6) {
    return { tag: "summer_peak", label: "Peak Summer", tone: "refreshing, cooling, energetic, vacation-aligned" };
  }
  if (month >= 7 && month <= 9) {
    return { tag: "monsoon_festive_leadup", label: "Monsoon & Festive Lead-up", tone: "cozy, indoor-friendly, early-festive preparation" };
  }
  return { tag: "festive_peak", label: "Peak Festive (Q4)", tone: "celebratory, gifting, high-intent, premium" };
}

/**
 * Generates an injectible context line summarizing upcoming observances.
 */
export function seasonalContextLine(referenceDate: Date, windowDays = 14): string {
  const season = seasonalTagForDate(referenceDate);
  const observances = upcomingObservances(referenceDate, windowDays);
  if (observances.length === 0) {
    return `Current season: ${season.label} (tone: ${season.tone}). No major public observances in the next ${windowDays} days.`;
  }
  const items = observances.map((o) => {
    const when = o.daysAway === 0 ? "today" : o.daysAway === 1 ? "tomorrow" : `in ${o.daysAway} days (${o.date})`;
    return `${o.name} (${when} — ${o.note})`;
  });
  return `Current season: ${season.label} (tone: ${season.tone}). Upcoming observances within ${windowDays} days: ${items.join("; ")}.`;
}

/**
 * Resolves a festival's date for a given year with full provenance.
 */
export function resolveFestivalDate(
  festivalId: string,
  year: number,
  overrideDateIso?: string | null,
  overrideNotes?: string | null
): CalculatedFestival | null {
  const rule = CANONICAL_RULES[festivalId];
  if (!rule) return null;

  const resolvedDateIso = overrideDateIso ?? CANONICAL_FESTIVAL_DATES[festivalId]?.[year];
  if (!resolvedDateIso) return null;

  const [yStr, mStr, dStr] = resolvedDateIso.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);

  const timezone = rule.timezone ?? "Asia/Kolkata";
  const startYear = y;
  const startMonth = m;
  const startDay = Math.max(1, d - rule.startWindowDays);
  const endDay = d + rule.endWindowDays;

  const observanceStartIso = zonedWallTimeToUtcIso(startYear, startMonth, startDay, 0, 0, timezone);
  const observanceEndIso = zonedWallTimeToUtcIso(y, m, endDay, 23, 59, timezone);

  return {
    festivalId: rule.festivalId,
    name: rule.name,
    dateIso: resolvedDateIso,
    observanceStartIso,
    observanceEndIso,
    region: rule.region,
    traditionCalendar: rule.traditionCalendar,
    calculationMethod: rule.calculationMethod,
    confidenceSource: overrideDateIso ? "tenant_manual_override" : rule.confidenceSource,
    isManualOverride: Boolean(overrideDateIso),
    overrideNotes: overrideDateIso ? (overrideNotes ?? null) : null,
    provenance: {
      calculatedAt: new Date().toISOString(),
      engineVersion: "stratxcel-festival-calendar-v1",
      source: overrideDateIso ? "manual_override" : rule.confidenceSource,
    },
  };
}

/**
 * Lists all active festivals for a target date range and tenant, applying tenant overrides.
 */
export async function listFestivalsForRange(
  service: ServiceClient | null,
  input: {
    tenantId?: string;
    startDateIso: string;
    endDateIso: string;
    region?: string;
  }
): Promise<CalculatedFestival[]> {
  const startYear = new Date(input.startDateIso).getFullYear();
  const endYear = new Date(input.endDateIso).getFullYear();

  let overridesMap = new Map<string, { date: string; notes?: string }>();

  if (service && input.tenantId) {
    try {
      const { data: overrides } = await service
        .from("social_festival_manual_overrides")
        .select("festival_id, year, override_date, notes")
        .eq("tenant_id", input.tenantId);

      for (const ov of overrides ?? []) {
        overridesMap.set(`${ov.festival_id}:${ov.year}`, { date: ov.override_date, notes: ov.notes });
      }
    } catch {
      // Fall back to canonical rules if DB read is unavailable
    }
  }

  const results: CalculatedFestival[] = [];
  const startMs = new Date(input.startDateIso).getTime();
  const endMs = new Date(input.endDateIso).getTime();

  for (let year = startYear; year <= endYear; year++) {
    for (const festivalId of Object.keys(CANONICAL_RULES)) {
      const ovKey = `${festivalId}:${year}`;
      const override = overridesMap.get(ovKey);

      const festival = resolveFestivalDate(festivalId, year, override?.date, override?.notes);
      if (!festival) continue;

      const festMs = new Date(festival.dateIso).getTime();
      if (festMs >= startMs && festMs <= endMs) {
        if (!input.region || festival.region === "all_india" || festival.region === input.region) {
          results.push(festival);
        }
      }
    }
  }

  return results.sort((a, b) => a.dateIso.localeCompare(b.dateIso));
}

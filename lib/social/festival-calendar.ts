/**
 * Trend, Festival & Context Awareness (Hermes-Orchestrated Content Engine
 * Hardening mission, Section 2). Before this module, "festival awareness"
 * existed only as a system-prompt instruction telling the Social Copilot
 * chat model to "natively understand" Indian festivals from its own general
 * knowledge (lib/social/agent/orchestrator.ts) -- fine for a human-in-the-
 * loop chat turn a person can correct, but the UNATTENDED automated Package
 * Autopilot pipeline (package-autopilot.ts) had no structured date lookup
 * at all. This is a real, deterministic, pure calendar module -- no
 * network, no AI call, fully unit-testable -- matching this codebase's
 * "never fabricate/guess" rule (see creative-brief.ts, package-business-
 * facts.ts, and every other real-facts module here).
 *
 * Two honestly-different data sources, by design:
 *
 *  - FIXED_DATE_OBSERVANCES: Gregorian-calendar-rule days (a fixed month/day,
 *    or a computable "Nth weekday of month" rule like Mother's Day). These
 *    are 100% deterministic for any year -- zero fabrication risk.
 *
 *  - LUNAR_FESTIVAL_DATES: major Indian festivals whose actual date moves
 *    every year against a lunar/lunisolar calendar (Diwali, Holi, Eid,
 *    Raksha Bandhan, Ganesh Chaturthi, Navratri) and CANNOT be reliably
 *    computed here -- they require a real, published panchang/calendar
 *    source. This module never guesses or approximates one: a year with no
 *    verified entry here simply contributes nothing for that festival,
 *    rather than a wrong date silently reaching a real customer's post.
 *    ⚠ PRODUCTION NOTE: the 2026 dates below are the implementer's own
 *    best-effort recollection at build time, NOT independently verified
 *    against an authoritative source (e.g. drikpanchang.com or India's
 *    official gazetted holiday calendar). Verify and correct before
 *    relying on lunar-festival awareness in real customer content --
 *    update only this table; nothing else needs to change.
 */

export type ObservanceKind = "national" | "cultural" | "religious" | "commercial" | "seasonal";

export interface Observance {
  name: string;
  kind: ObservanceKind;
  /** Short, factual note on why a business might reference this — never a
   * fabricated performance claim, just what the day actually is. */
  note: string;
}

export interface UpcomingObservance extends Observance {
  /** Real calendar date this observance falls on, in the requested year. */
  date: string; // YYYY-MM-DD
  /** Whole days between the reference date and this observance (0 = today). */
  daysAway: number;
}

interface FixedDateRule {
  name: string;
  kind: ObservanceKind;
  note: string;
  month: number; // 1-12
  day?: number; // exact day of month
  /** "Nth weekday of month" rule (e.g. 2nd Sunday of May = Mother's Day). weekday: 0=Sunday. nth: 1-5, -1 = last. */
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

/** ⚠ See file header — verify against a real published calendar before
 * relying on these in production. Populated with 2026 entries only; a
 * missing year contributes nothing (safe, not a crash, not a guess). */
const LUNAR_FESTIVAL_DATES: Record<number, Array<{ key: keyof typeof LUNAR_FESTIVAL_META; date: string }>> = {
  2026: [
    { key: "holi", date: "2026-03-04" },
    { key: "eid_al_fitr", date: "2026-03-20" },
    { key: "eid_al_adha", date: "2026-05-27" },
    { key: "raksha_bandhan", date: "2026-08-28" },
    { key: "ganesh_chaturthi", date: "2026-09-14" },
    { key: "navratri_start", date: "2026-10-11" },
    { key: "dussehra", date: "2026-10-20" },
    { key: "diwali", date: "2026-11-08" },
  ],
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toDateOnlyUtc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/** Resolves an "Nth weekday of month" rule (or a fixed day) into a real
 * calendar date for the given year. Pure arithmetic — never approximate. */
function resolveFixedDate(rule: FixedDateRule, year: number): Date {
  if (rule.day !== undefined) return toDateOnlyUtc(year, rule.month, rule.day);
  const { nth, weekday } = rule.nthWeekday!;
  if (nth === -1) {
    // Last matching weekday: start from the last day of the month and walk backward.
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
 * Real, deterministic observances falling within `windowDays` of
 * `referenceDate` (inclusive of today, exclusive of the far end). Checks
 * the reference year and the next year for observances near a year
 * boundary (e.g. New Year's Day from a late-December reference date).
 * Never invents a date: a lunar festival with no verified entry for the
 * relevant year is simply absent from the result, not approximated.
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
    for (const entry of LUNAR_FESTIVAL_DATES[year] ?? []) {
      const meta = LUNAR_FESTIVAL_META[entry.key];
      const date = new Date(`${entry.date}T00:00:00.000Z`);
      const daysAway = daysBetween(refDay, date);
      if (daysAway >= 0 && daysAway < windowDays) {
        results.push({ name: meta.name, kind: meta.kind, note: meta.note, date: entry.date, daysAway });
      }
    }
  }

  return results.sort((a, b) => a.daysAway - b.daysAway);
}

/**
 * Light, honest seasonal tagging by calendar month — never a fabricated
 * "trend," just a broad, factual Indian commercial-season label a business
 * owner would recognize. Kept deliberately generic (no invented statistics
 * or engagement claims).
 */
const SEASON_BY_MONTH: Record<number, string> = {
  1: "New Year / winter",
  2: "pre-spring",
  3: "spring / wedding season",
  4: "summer onset",
  5: "peak summer",
  6: "monsoon onset",
  7: "monsoon",
  8: "monsoon / festive lead-in",
  9: "post-monsoon / festive season",
  10: "festive season",
  11: "festive season / wedding season",
  12: "year-end / winter wedding season",
};

export function seasonalTagForDate(date: Date): string {
  return SEASON_BY_MONTH[date.getUTCMonth() + 1] ?? "";
}

/**
 * One short, human-readable context line for a creative brief — used by
 * package-autopilot.ts's per-item content preparation. Never asserts an
 * observance as certain beyond what's actually in the table; returns null
 * when there's nothing real within the window, so callers never fabricate
 * filler when there's genuinely no near-term occasion.
 */
export function seasonalContextLine(referenceDate: Date, windowDays: number): string | null {
  const observances = upcomingObservances(referenceDate, windowDays);
  const season = seasonalTagForDate(referenceDate);
  const parts: string[] = [];
  if (observances.length) {
    const described = observances
      .slice(0, 3)
      .map((o) => (o.daysAway === 0 ? `${o.name} (today)` : o.daysAway === 1 ? `${o.name} (tomorrow)` : `${o.name} (in ${o.daysAway} days, ${o.date})`));
    parts.push(`Upcoming occasion(s) worth considering if genuinely relevant to this business: ${described.join("; ")}.`);
  }
  if (season) parts.push(`Current season: ${season}.`);
  if (!parts.length) return null;
  return parts.join(" ");
}

/**
 * Customer journey — payment-first ₹999 Audit funnel:
 * Purchase → Your Business → Business Deep Dive → Goals → Audit → Report → Consultation.
 *
 * Every stage is derived from a real audit_orders row (the same row the
 * Razorpay webhook's atomic RPC transitions through pending_payment → paid
 * → in_review → completed) and a real consultation-request event. Nothing
 * is assumed complete, and payment success alone never implies the audit
 * itself is complete — only a genuine 'completed' status does that.
 *
 * Pure by design — the page fetches, this decides — so the truthfulness
 * rules are directly testable without a database.
 */

export type StageKey = "purchase" | "business" | "deep_dive" | "goals" | "audit" | "report" | "consultation";

/** Customer-facing vocabulary. No internal state names leak into the UI. */
export type StageStatus = "Not started" | "In progress" | "Ready" | "Needs attention" | "Complete";

export interface JourneyStage {
  key: StageKey;
  label: string;
  status: StageStatus;
  /** One plain sentence about where this stage actually stands. */
  detail: string;
  /** The single next thing to do here, or null when nothing is needed. */
  action: { label: string; href: string } | null;
}

export type AuditOrderStatus = "pending_payment" | "paid" | "in_review" | "completed" | "refunded" | "cancelled";

export interface AuditOrderInput {
  status: AuditOrderStatus;
  business_name: string | null;
  industry: string | null;
  website_url: string | null;
  deep_dive_answers: Record<string, unknown> | null;
  goals_answers: Record<string, unknown> | null;
  report_data: Record<string, unknown> | null;
}

export interface JourneyInput {
  account: { emailVerified: boolean } | null;
  order: AuditOrderInput | null;
  consultationRequested: boolean;
  freshAuditEligible?: boolean;
}

/** Fields that are always asked (unlike the conditional extras), so completion means these are answered. */
const DEEP_DIVE_CORE_FIELDS = ["idealCustomers", "majorProducts", "competitors", "leadSources", "differentiation"] as const;
const GOALS_CORE_FIELDS = ["successDefinition", "biggestObstacle", "topPriorities"] as const;

/** audit_orders' checkout-time placeholder — a business_name still equal to this means Phase 1 hasn't been touched. */
const BUSINESS_NAME_PLACEHOLDER = "Pending — completed in intake";

function filledCount(obj: Record<string, unknown> | null | undefined, keys: readonly string[]): number {
  if (!obj) return 0;
  let n = 0;
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) n++;
    else if (Array.isArray(v) && v.length > 0) n++;
  }
  return n;
}

const PAID_OR_LATER: AuditOrderStatus[] = ["paid", "in_review", "completed"];

export function deriveJourney(input: JourneyInput): JourneyStage[] {
  const order = input.order;

  // --- Purchase --------------------------------------------------------------
  const purchase: JourneyStage = !order
    ? input.freshAuditEligible
      ? {
          key: "purchase",
          label: "Purchase",
          status: "Complete",
          detail: "A complimentary Audit is ready to start.",
          action: { label: "Connect your business", href: "/app/audit" },
        }
      : {
          key: "purchase",
          label: "Purchase",
          status: "Not started",
          detail: "Start with the ₹999 AI Business Growth Audit.",
          action: { label: "Pay ₹999 & start", href: "/audit" },
        }
    : order.status === "pending_payment"
      ? {
          key: "purchase",
          label: "Purchase",
          status: "In progress",
          detail: "Your ₹999 payment hasn't been completed yet.",
          action: { label: "Resume payment", href: "/audit/checkout" },
        }
      : order.status === "refunded" || order.status === "cancelled"
        ? {
            key: "purchase",
            label: "Purchase",
            status: "Needs attention",
            detail: `Your audit order was ${order.status}.`,
            action: { label: "Request a consultation", href: "/contact?intent=consultation" },
          }
        : {
            key: "purchase",
            label: "Purchase",
            status: "Complete",
            detail: "Your ₹999 Audit is paid for.",
            action: null,
          };

  const paidOrLater = Boolean(order && PAID_OR_LATER.includes(order.status));

  const v1 = order?.deep_dive_answers && typeof order.deep_dive_answers === "object"
    ? (order.deep_dive_answers as { v1Experience?: { verified?: boolean; websiteUrl?: string } }).v1Experience
    : undefined;
  const v1Complete = Boolean(v1?.verified && v1?.websiteUrl);

  // --- Your Business -----------------------------------------------------
  const businessAnswered =
    v1Complete || (
    Boolean(order?.business_name && order.business_name !== BUSINESS_NAME_PLACEHOLDER) &&
    (Boolean(order?.industry) || Boolean(order?.website_url)));
  const businessStarted = Boolean(order?.business_name && order.business_name !== BUSINESS_NAME_PLACEHOLDER);
  const business: JourneyStage = !paidOrLater
    ? { key: "business", label: "Your Business", status: "Not started", detail: "Unlocks once your ₹999 Audit is paid for.", action: null }
    : businessAnswered
      ? { key: "business", label: "Your Business", status: "Complete", detail: "Your business basics are saved.", action: null }
      : {
          key: "business",
          label: "Your Business",
          status: businessStarted ? "In progress" : "Not started",
          detail: businessStarted ? "A few business details are still missing." : "Tell us about your business.",
          action: { label: businessStarted ? "Finish this section" : "Start", href: "/app/audit" },
        };

  // --- Business Deep Dive --------------------------------------------------
  const deepDiveFilled = v1Complete ? DEEP_DIVE_CORE_FIELDS.length : filledCount(order?.deep_dive_answers, DEEP_DIVE_CORE_FIELDS);
  const deepDive: JourneyStage = !businessAnswered
    ? { key: "deep_dive", label: "Business Deep Dive", status: "Not started", detail: "Unlocks after Your Business.", action: null }
    : deepDiveFilled === DEEP_DIVE_CORE_FIELDS.length
      ? { key: "deep_dive", label: "Business Deep Dive", status: "Complete", detail: "Your business deep dive is saved.", action: null }
      : {
          key: "deep_dive",
          label: "Business Deep Dive",
          status: deepDiveFilled > 0 ? "In progress" : "Not started",
          detail: deepDiveFilled > 0 ? `${deepDiveFilled} of ${DEEP_DIVE_CORE_FIELDS.length} questions answered.` : "A few questions about how your business actually runs.",
          action: { label: deepDiveFilled > 0 ? "Continue" : "Start", href: "/app/audit" },
        };
  const deepDiveComplete = deepDiveFilled === DEEP_DIVE_CORE_FIELDS.length;

  // --- Goals -----------------------------------------------------------------
  const goalsFilled = v1Complete ? GOALS_CORE_FIELDS.length : filledCount(order?.goals_answers, GOALS_CORE_FIELDS);
  const goals: JourneyStage = !deepDiveComplete
    ? { key: "goals", label: "Goals", status: "Not started", detail: "Unlocks after Business Deep Dive.", action: null }
    : goalsFilled === GOALS_CORE_FIELDS.length
      ? { key: "goals", label: "Goals", status: "Complete", detail: "Your goals are saved.", action: null }
      : {
          key: "goals",
          label: "Goals",
          status: goalsFilled > 0 ? "In progress" : "Not started",
          detail: goalsFilled > 0 ? `${goalsFilled} of ${GOALS_CORE_FIELDS.length} questions answered.` : "What would make this a success for you?",
          action: { label: goalsFilled > 0 ? "Continue" : "Start", href: "/app/audit" },
        };
  const goalsComplete = goalsFilled === GOALS_CORE_FIELDS.length;
  const intakeComplete = businessAnswered && deepDiveComplete && goalsComplete;

  // --- Audit -------------------------------------------------------------
  const audit: JourneyStage = !order
    ? { key: "audit", label: "Audit", status: "Not started", detail: "Unlocks after payment.", action: null }
    : order.status === "completed"
      ? { key: "audit", label: "Audit", status: "Complete", detail: "Your audit is finished.", action: null }
      : order.status === "in_review"
        ? { key: "audit", label: "Audit", status: "In progress", detail: "Your growth plan is being created.", action: null }
        : intakeComplete
          ? { key: "audit", label: "Audit", status: "Ready", detail: "Everything's in — you can start your audit.", action: { label: "Start My Audit", href: "/app/audit" } }
          : { key: "audit", label: "Audit", status: "Not started", detail: "Finish the three sections above first.", action: null };

  // --- Report --------------------------------------------------------------
  const hasReport = Boolean(order?.report_data && Object.keys(order.report_data).length > 0);
  const report: JourneyStage = !order || order.status === "pending_payment"
    ? { key: "report", label: "Report", status: "Not started", detail: "Appears once your audit is complete.", action: null }
    : order.status === "completed" && hasReport
      ? { key: "report", label: "Report", status: "Complete", detail: "Your audit report is ready to read.", action: { label: "Open report", href: "/app/audit" } }
      : order.status === "in_review"
        ? { key: "report", label: "Report", status: "In progress", detail: "Your report is being prepared.", action: null }
        : { key: "report", label: "Report", status: "Not started", detail: "Appears once your audit is complete.", action: null };

  // --- Consultation --------------------------------------------------------
  const consultation: JourneyStage = input.consultationRequested
    ? { key: "consultation", label: "Consultation", status: "Complete", detail: "You've requested your complimentary Audit Review. The team will be in touch.", action: null }
    : {
        key: "consultation",
        label: "Consultation",
        status: "Not started",
        detail: "Book your complimentary Audit Review to talk through the findings.",
        action: { label: "Book your Audit Review", href: "/contact?intent=consultation" },
      };

  return [purchase, business, deepDive, goals, audit, report, consultation];
}

/**
 * The one thing to do next: the first stage that isn't finished, preferring
 * an in-progress/not-started stage over one that's merely "Ready" so the
 * customer isn't nudged to start the audit while an earlier stage needs
 * fixing (e.g. a refunded purchase).
 */
export function nextAction(stages: JourneyStage[]): JourneyStage | null {
  return (
    stages.find((s) => s.action !== null && s.status !== "Complete" && s.status !== "Ready") ??
    stages.find((s) => s.action !== null && s.status !== "Complete") ??
    null
  );
}

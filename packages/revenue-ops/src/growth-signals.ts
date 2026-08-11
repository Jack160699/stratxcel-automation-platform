import type { ResponseTimeDiagnosis } from "./types.ts";

/** Map measured response diagnosis into workforce businessSignals for Hermes routing. */
export function toBusinessGrowthSignals(diagnosis: ResponseTimeDiagnosis): {
  monthlyInquiries?: number;
  medianResponseTimeHours?: number;
  crmFollowUpStrength?: "weak" | "moderate" | "strong";
  signalEvidenceIds: string[];
} {
  const signals: {
    monthlyInquiries?: number;
    medianResponseTimeHours?: number;
    crmFollowUpStrength?: "weak" | "moderate" | "strong";
    signalEvidenceIds: string[];
  } = { signalEvidenceIds: [...diagnosis.evidenceIds] };

  const inquiryProxy = diagnosis.newLeadsWaiting + diagnosis.unansweredLeads;
  if (inquiryProxy > 0) signals.monthlyInquiries = Math.max(inquiryProxy, diagnosis.sampleSize);
  if (diagnosis.medianResponseTimeHours !== null) {
    signals.medianResponseTimeHours = diagnosis.medianResponseTimeHours;
  }
  if (diagnosis.overdueFollowUps > 0 || diagnosis.unansweredLeads > 0) {
    signals.crmFollowUpStrength = "weak";
  } else if (diagnosis.sampleSize > 0 && (diagnosis.medianResponseTimeHours ?? 0) <= 2) {
    signals.crmFollowUpStrength = "strong";
  } else if (diagnosis.sampleSize > 0) {
    signals.crmFollowUpStrength = "moderate";
  }
  return signals;
}

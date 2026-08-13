import { AuditEntrySection } from "@/app/components/public/commercial/AuditEntrySection";

/** Matches the homepage audit framing so both entry points read as one offer. */
export function AuditFunnelCta() {
  return (
    <AuditEntrySection
      variant="compact"
      surface="solutions_audit_funnel"
      heading="Not sure where to start? Start with clarity."
    />
  );
}

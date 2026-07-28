import type { Metadata } from "next";
import { LegalDocument, LegalSection } from "../legal/LegalDocument";

export const metadata: Metadata = {
  title: "Privacy Policy — Stratxcel",
  description: "How Stratxcel collects, uses, stores, and protects personal data.",
};

export default function PrivacyPage() {
  return (
    <LegalDocument
      eyebrow="Legal"
      title="Privacy Policy"
      intro="This policy explains the information Stratxcel processes when you use our website, contact us, or use the Social Autopilot administration product."
    >
      <LegalSection title="Information we process">
        <p>We process information you submit, including contact-form details, administrator account details, Brand Brain content, drafts, campaigns, Copilot conversations, and files you attach to Copilot.</p>
        <p>When you connect a social account, we process platform account identifiers, granted permissions, encrypted access credentials, webhook events, publishing jobs, and performance metrics needed to provide the requested integration.</p>
        <p>We also receive ordinary technical information such as timestamps, request and audit records, error diagnostics, and basic usage analytics. We do not intentionally collect payment-card details through Social Autopilot.</p>
      </LegalSection>

      <LegalSection title="How we use information">
        <p>We use information to authenticate administrators, operate requested workflows, generate and store content, maintain integrations, secure and troubleshoot the service, prevent abuse, and respond to support or legal requests.</p>
        <p>Copilot may send the conversation and text from supported attachments to the configured AI provider when needed for the requested mission. Images and PDFs may be stored without being interpreted when no supported extraction capability is configured.</p>
      </LegalSection>

      <LegalSection title="Service providers and platforms">
        <p>We use infrastructure and service providers to run Stratxcel, including hosting, database, storage, authentication, analytics, and configured AI services. If you connect a social platform, information is also exchanged with that platform according to the permissions you grant and its own terms and privacy policy.</p>
        <p>We do not sell personal information. We may disclose information when necessary to operate the service, follow your instructions, protect the service or others, or comply with applicable law.</p>
      </LegalSection>

      <LegalSection title="Storage, security, and retention">
        <p>Copilot attachments are stored in private, owner-scoped storage. Access credentials are handled server-side and are not intentionally exposed in browser telemetry. No system is perfectly secure, but we use access controls, audit records, encryption for stored social tokens, and least-privilege product boundaries appropriate to the service.</p>
        <p>We retain information while an account or integration is active and as reasonably necessary for operations, security, dispute resolution, and legal obligations. Retention periods vary by data type. You may request deletion as described in our Data Deletion page.</p>
      </LegalSection>

      <LegalSection title="Your choices">
        <p>You can disconnect social integrations in the product, avoid attaching files, and request access, correction, or deletion through our contact form. We may need to verify the requester and may retain limited records where required for security or legal compliance.</p>
      </LegalSection>

      <LegalSection title="Changes">
        <p>We may update this policy as the service changes. We will update the date shown above and provide additional notice when required.</p>
      </LegalSection>
    </LegalDocument>
  );
}

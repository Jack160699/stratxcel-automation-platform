import type { Metadata } from "next";
import { LegalDocument, LegalSection } from "../legal/LegalDocument";

export const metadata: Metadata = {
  title: "Terms of Service — Stratxcel",
  description: "Terms governing use of Stratxcel services and Social Autopilot.",
};

export default function TermsPage() {
  return (
    <LegalDocument
      eyebrow="Legal"
      title="Terms of Service"
      intro="These terms govern access to Stratxcel websites, administration products, integrations, and related services. By using the service, you agree to these terms."
    >
      <LegalSection title="Accounts and authority">
        <p>You must provide accurate information, protect account credentials, and promptly report suspected unauthorized access. You may connect or manage an external account only when you have authority to do so and must follow that platform’s rules.</p>
      </LegalSection>

      <LegalSection title="Your content and instructions">
        <p>You retain your rights in content you submit. You grant Stratxcel the limited permission needed to host, process, transform, and transmit that content to provide the service and carry out your instructions.</p>
        <p>You are responsible for reviewing content, approvals, schedules, recipients, claims, and account selections before allowing an external action. AI-generated output may be incomplete or incorrect and is not professional legal, financial, or medical advice.</p>
      </LegalSection>

      <LegalSection title="Acceptable use">
        <p>You may not use the service to violate law or third-party rights; gain unauthorized access; distribute malware, spam, or deceptive content; evade platform restrictions; interfere with service operation; or attempt to extract credentials or confidential system instructions.</p>
      </LegalSection>

      <LegalSection title="Integrations and availability">
        <p>Third-party platforms and providers control their own APIs, permissions, limits, review processes, and availability. Features may stop working when a provider changes its service or revokes access. Stratxcel may modify, suspend, or discontinue features for security, compliance, maintenance, or product reasons.</p>
      </LegalSection>

      <LegalSection title="Fees">
        <p>Any paid work, subscription, usage charge, or implementation scope is governed by the pricing or written order presented to you. Unless a written agreement says otherwise, taxes and third-party provider charges are your responsibility.</p>
      </LegalSection>

      <LegalSection title="Disclaimers and responsibility">
        <p>The service is provided on an “as available” basis to the extent permitted by law. We do not guarantee uninterrupted operation, a particular business result, or that generated content will be suitable for every purpose.</p>
        <p>To the extent permitted by applicable law, Stratxcel is not liable for indirect, incidental, special, consequential, or punitive damages, or for losses caused by third-party platforms, your instructions, or content you approve. Rights that cannot legally be limited remain unaffected.</p>
      </LegalSection>

      <LegalSection title="Suspension, termination, and changes">
        <p>You may stop using the service and request account deletion. We may suspend access for security risks, non-payment, prohibited use, or legal requirements. We may update these terms, with notice where required; continued use after an effective update constitutes acceptance.</p>
      </LegalSection>
    </LegalDocument>
  );
}

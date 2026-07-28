import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument, LegalSection } from "../legal/LegalDocument";

export const metadata: Metadata = {
  title: "Data Deletion — Stratxcel",
  description: "How to disconnect integrations and request deletion of Stratxcel data.",
};

export default function DataDeletionPage() {
  return (
    <LegalDocument
      eyebrow="Privacy"
      title="Data Deletion"
      intro="You can disconnect a social integration or request deletion of data associated with your Stratxcel administrator account."
    >
      <LegalSection title="Disconnect a social account">
        <ol className="list-decimal space-y-2 pl-5">
          <li>Sign in to the Stratxcel administration product.</li>
          <li>Open Social Autopilot, then Integrations.</li>
          <li>Select Disconnect for the relevant social account.</li>
          <li>You may also remove Stratxcel from the connected platform’s own app and permission settings.</li>
        </ol>
        <p>Disconnecting stops new platform access through that connection. It does not automatically erase content and operational records already stored in Stratxcel.</p>
      </LegalSection>

      <LegalSection title="Request deletion">
        <p>Submit a request through the <Link href="/contact" className="font-semibold text-blue-700 hover:underline">Stratxcel contact form</Link>. Identify the administrator account and connected platform involved, but do not send passwords or access tokens.</p>
        <p>We will verify the request before deleting data. After verification, we will delete or de-identify the relevant account data and private Copilot attachments, and revoke or remove stored integration credentials, subject to limited retention required for fraud prevention, security, dispute resolution, or law.</p>
      </LegalSection>

      <LegalSection title="What to expect">
        <p>We will acknowledge the request through the contact channel you provide and explain any information needed to verify ownership. Completion time depends on the scope of the request and applicable obligations. Data held independently by a social platform must be managed through that platform.</p>
      </LegalSection>
    </LegalDocument>
  );
}

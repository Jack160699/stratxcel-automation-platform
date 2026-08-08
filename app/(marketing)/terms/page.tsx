import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument, LegalList, LegalSection } from "../legal/LegalDocument";

export const metadata: Metadata = { title: "Terms of Service — Stratxcel", description: "Terms governing Stratxcel websites, software, automation, domains, and services." };

export default function TermsPage() {
  return (
    <LegalDocument eyebrow="Legal" title="Terms & Conditions / Terms of Service" intro="These Terms form a binding agreement between you and Startxcel Solutions OPC Pvt Ltd, India, operating the Stratxcel brand (“Stratxcel”, “we”, “us”), for the websites, software, AI features, integrations, domains, implementation work, and related services we make available.">
      <LegalSection title="1. Acceptance, eligibility, and authority">
        <p>By accessing or using a Service, creating an account, accepting an order, or paying an invoice, you accept these Terms and the policies linked from them. If you act for an organization, you confirm that you can bind it. You must be legally capable of contracting and provide accurate, current information.</p>
        <p>Additional written orders, statements of work, plans, or product-specific terms may apply. If they conflict, the signed or expressly accepted order controls for that scope, followed by these Terms.</p>
      </LegalSection>
      <LegalSection title="2. Accounts, access, and client responsibility">
        <LegalList>
          <li>You must secure credentials, devices, API keys, connected accounts, and approval workflows, and notify us promptly of suspected compromise.</li>
          <li>You are responsible for users you authorize, the accuracy and legality of your instructions, and maintaining all permissions, notices, consents, licences, and lawful bases needed for your data and communications.</li>
          <li>You may connect, publish to, message through, or manage only accounts, recipients, domains, and content you are authorized to use.</li>
        </LegalList>
      </LegalSection>
      <LegalSection title="3. Orders, fees, taxes, subscriptions, and credits">
        <p>Prices, included usage, billing intervals, implementation scope, renewals, and third-party charges are those displayed at purchase or stated in the applicable order. Fees are due in the stated currency and time. Taxes, duties, bank fees, provider fees, domain charges, and usage overages are your responsibility unless expressly included.</p>
        <p>Where recurring billing is offered, you authorize the disclosed recurring charges until cancellation takes effect. Failed payment may cause feature restriction or suspension. Wallet balances, promotional credits, and service credits are not cash, cannot be transferred, and expire or are applied as disclosed, subject to mandatory law. The <Link className="font-semibold text-blue-700 hover:underline" href="/refund-cancellation">Refund & Cancellation Policy</Link> applies.</p>
      </LegalSection>
      <LegalSection title="4. Client content, data, and licence">
        <p>You retain ownership of content and data you provide. You grant us and our subprocessors a non-exclusive, worldwide, limited licence to host, copy, transform, generate from, display, transmit, and otherwise process that material only to operate, secure, support, and improve the Services as permitted by the <Link className="font-semibold text-blue-700 hover:underline" href="/privacy">Privacy Policy</Link>, your instructions, and applicable law.</p>
        <p>You represent that your material and instructions do not infringe rights or law. You are responsible for reviewing outputs, recipients, claims, schedules, spend, and external actions before approval. We may remove or disable material reasonably believed to create legal, security, platform, or third-party risk.</p>
      </LegalSection>
      <LegalSection title="5. AI, automation, messaging, and approvals">
        <p>AI output is probabilistic and may be incomplete, inaccurate, offensive, non-unique, or unsuitable. It is not legal, medical, accounting, investment, or other professional advice. You must conduct human review appropriate to the risk. Automated actions can have real external effects; configured approvals and limits do not replace your supervision.</p>
        <p>You must honour consent, opt-out, consumer, advertising, intellectual-property, confidentiality, and platform requirements. The <Link className="font-semibold text-blue-700 hover:underline" href="/acceptable-use">AI, Automation & Acceptable Use Policy</Link> is part of these Terms.</p>
      </LegalSection>
      <LegalSection title="6. Third-party services and domains">
        <p>Third-party platforms control their APIs, reviews, permissions, pricing, limits, content decisions, and uptime. Their terms apply independently. We are not responsible for their acts, outages, policy changes, suspensions, data handling, or charges. Domain registration, renewal, transfer, DNS, hosting, and website work are additionally governed by our <Link className="font-semibold text-blue-700 hover:underline" href="/domain-website-terms">Domain & Website Terms</Link> and <Link className="font-semibold text-blue-700 hover:underline" href="/third-party-providers">Third-Party Provider Notice</Link>.</p>
      </LegalSection>
      <LegalSection title="7. Stratxcel intellectual property">
        <p>We and our licensors retain all rights in the Services, software, designs, workflows, documentation, trademarks, and underlying technology. Except for the limited right to use the Services during the applicable term, no rights are transferred. You may provide feedback; we may use it without restriction or payment, without identifying confidential information.</p>
      </LegalSection>
      <LegalSection title="8. Confidentiality and security">
        <p>Each party must protect the other’s non-public confidential information with reasonable care and use it only for the relationship. Exceptions include information independently developed, lawfully received without restriction, publicly available without breach, or required to be disclosed by law. No security measure eliminates all risk; you must maintain backups and appropriate endpoint and account security.</p>
      </LegalSection>
      <LegalSection title="9. Suspension and termination">
        <p>We may limit or suspend access immediately for security threats, unlawful or prohibited use, non-payment, provider restrictions, legal requirements, material breach, or risk to others. You may stop using the Services and cancel as disclosed. On termination, access ends and outstanding amounts become due. Provisions that by nature should survive—including payment, ownership, confidentiality, disclaimers, indemnity, liability limits, and dispute terms—survive.</p>
      </LegalSection>
      <LegalSection title="10. Indemnity">
        <p>To the extent permitted by law, you will defend, indemnify, and hold harmless Stratxcel, its affiliates, personnel, and suppliers from third-party claims and reasonable losses arising from your content, instructions, connected accounts, recipients, products or services, unlawful use, breach of these Terms, or violation of another’s rights. We will give reasonable notice and cooperation; you may not settle in a way that admits fault or imposes obligations on us without consent.</p>
      </LegalSection>
      <LegalSection title="11. Disclaimers and limitation of liability">
        <p>To the maximum extent permitted by law, the Services are provided “as is” and “as available”. We disclaim implied warranties and do not guarantee uninterrupted availability, error-free output, regulatory compliance for your business, preservation of third-party access, or any revenue or business result.</p>
        <p>To the maximum extent permitted by law, Stratxcel is not liable for indirect, incidental, special, exemplary, punitive, or consequential loss, or loss of profits, revenue, goodwill, opportunity, data, or business interruption. Our aggregate liability arising from the affected Service will not exceed the fees you paid us for that Service during the three months immediately preceding the event giving rise to the claim. This does not exclude liability that cannot lawfully be excluded or limited, or mandatory consumer rights.</p>
      </LegalSection>
      <LegalSection title="12. Law, disputes, and general terms">
        <p>These Terms are governed by Indian law. Courts with competent jurisdiction at <strong>[PLACEHOLDER — verified registered-office city and state]</strong> will have exclusive jurisdiction, subject to mandatory consumer forums and non-waivable rights. Before proceedings, each party should give written notice and attempt good-faith resolution for 30 days.</p>
        <p>We may update these Terms for legal, security, provider, or product changes and will provide notice where required. You may not assign them without consent; we may assign them as part of restructuring, financing, or a transfer of the relevant business. Invalid provisions are narrowed or severed; failure to enforce is not waiver. These Terms and incorporated orders and policies are the agreement for their subject.</p>
      </LegalSection>
    </LegalDocument>
  );
}

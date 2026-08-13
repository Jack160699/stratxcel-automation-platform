import { loadEmailRuntimeConfig } from "../config.ts";
import { assertSafeHeaderValue } from "../recipient.ts";
import type { EmailEventType, RenderedEmail } from "../types.ts";
import { getEmailEventContract } from "../events.ts";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function str(payload: Record<string, unknown>, key: string, fallback = ""): string {
  const v = payload[key];
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return fallback;
}

function wrapHtml(opts: {
  preheader: string;
  title: string;
  bodyHtml: string;
  supportEmail: string;
}): string {
  const pre = escapeHtml(opts.preheader);
  const title = escapeHtml(opts.title);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Georgia,'Times New Roman',serif;color:#14212b;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${pre}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #d7dee5;">
          <tr>
            <td style="padding:28px 28px 8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#0b6e4f;">
              Stratxcel
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 8px;font-size:24px;line-height:1.3;font-weight:700;">
              ${title}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 28px;font-size:16px;line-height:1.55;color:#334155;">
              ${opts.bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 28px;border-top:1px solid #e5eaf0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#64748b;">
              This is a transactional message from Stratxcel. It does not guarantee revenue, ROAS, rankings, or outcomes.
              Questions? Reply to this email or contact <a href="mailto:${escapeHtml(opts.supportEmail)}" style="color:#0b6e4f;">${escapeHtml(opts.supportEmail)}</a>.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function wrapText(opts: { title: string; body: string; supportEmail: string }): string {
  return [
    "Stratxcel",
    "",
    opts.title,
    "",
    opts.body,
    "",
    "---",
    "This is a transactional message from Stratxcel. It does not guarantee revenue, ROAS, rankings, or outcomes.",
    `Support: ${opts.supportEmail}`,
  ].join("\n");
}

type TemplateBuilder = (payload: Record<string, unknown>, supportEmail: string) => {
  subject: string;
  preheader: string;
  title: string;
  bodyHtml: string;
  bodyText: string;
};

const BUILDERS: Record<string, TemplateBuilder> = {
  account_welcome: (p, support) => {
    const label = str(p, "accountLabel", "your account");
    return {
      subject: "Welcome to Stratxcel",
      preheader: "Your Stratxcel account is ready.",
      title: "Welcome to Stratxcel",
      bodyHtml: `<p>Hello,</p><p>Your Stratxcel account (<strong>${escapeHtml(label)}</strong>) is ready. Sign in to continue setup.</p><p>If you did not create this account, contact ${escapeHtml(support)}.</p>`,
      bodyText: `Hello,\n\nYour Stratxcel account (${label}) is ready. Sign in to continue setup.\n\nIf you did not create this account, contact ${support}.`,
    };
  },
  audit_delivered: (p) => {
    const business = str(p, "businessName", "your business");
    const reportUrl = str(p, "reportUrl", "");
    const ref = str(p, "auditOrderId", "");
    return {
      subject: `Your Business Growth Audit is ready — ${business}`,
      preheader: "Your Stratxcel Business Growth Audit report is ready to view.",
      title: "Your Audit is ready",
      bodyHtml: `<p>The Business Growth Audit for <strong>${escapeHtml(business)}</strong> is ready.</p>
<p>Open Stratxcel to read the report and next steps.</p>
${reportUrl ? `<p><a href="${escapeHtml(reportUrl)}" style="color:#0b6e4f;">View your Audit</a></p>` : ""}
<p>Reference: ${escapeHtml(ref)}</p>`,
      bodyText: `The Business Growth Audit for ${business} is ready.\n\n${reportUrl ? `View your Audit: ${reportUrl}\n` : ""}Reference: ${ref}`,
    };
  },
  audit_payment_receipt: (p) => {
    const product = str(p, "productName", "Business Audit");
    const amount = str(p, "amountLabel", "");
    const currency = str(p, "currency", "INR");
    const ref = str(p, "paymentReference", "");
    const paidAt = str(p, "paidAt", "");
    const nextStep = str(p, "nextStep", "Complete your audit intake when ready.");
    return {
      subject: `Payment receipt — ${product}`,
      preheader: `Receipt for your ${product} payment.`,
      title: "Payment receipt",
      bodyHtml: `<p>Thank you. We received your payment for <strong>${escapeHtml(product)}</strong>.</p>
<ul>
<li>Amount: ${escapeHtml(amount)} ${escapeHtml(currency)}</li>
<li>Reference: ${escapeHtml(ref)}</li>
<li>Date: ${escapeHtml(paidAt)}</li>
</ul>
<p>Next step: ${escapeHtml(nextStep)}</p>`,
      bodyText: `Thank you. We received your payment for ${product}.\n\nAmount: ${amount} ${currency}\nReference: ${ref}\nDate: ${paidAt}\n\nNext step: ${nextStep}`,
    };
  },
  subscription_activated: (p) => ({
    subject: `Subscription activated — ${str(p, "planName", "plan")}`,
    preheader: "Your Stratxcel subscription is active.",
    title: "Subscription activated",
    bodyHtml: `<p>Your <strong>${escapeHtml(str(p, "planName"))}</strong> subscription is now active.</p><p>Reference: ${escapeHtml(str(p, "subscriptionId"))}</p>`,
    bodyText: `Your ${str(p, "planName")} subscription is now active.\nReference: ${str(p, "subscriptionId")}`,
  }),
  subscription_payment_success: (p) => ({
    subject: `Payment received — ${str(p, "planName", "subscription")}`,
    preheader: "Subscription payment confirmed.",
    title: "Subscription payment received",
    bodyHtml: `<p>We received your payment for <strong>${escapeHtml(str(p, "planName"))}</strong>.</p>
<ul>
<li>Amount: ${escapeHtml(str(p, "amountLabel"))} ${escapeHtml(str(p, "currency", "INR"))}</li>
<li>Reference: ${escapeHtml(str(p, "paymentReference"))}</li>
</ul>`,
    bodyText: `We received your payment for ${str(p, "planName")}.\nAmount: ${str(p, "amountLabel")} ${str(p, "currency", "INR")}\nReference: ${str(p, "paymentReference")}`,
  }),
  subscription_payment_failed: (p) => ({
    subject: `Action needed — payment failed for ${str(p, "planName", "subscription")}`,
    preheader: "We could not process your subscription payment.",
    title: "Subscription payment failed",
    bodyHtml: `<p>We could not process a payment for <strong>${escapeHtml(str(p, "planName"))}</strong>.</p>
<p>Please update your payment method in Stratxcel to avoid service interruption.</p>
<p>Subscription reference: ${escapeHtml(str(p, "subscriptionId"))}</p>`,
    bodyText: `We could not process a payment for ${str(p, "planName")}.\nPlease update your payment method in Stratxcel.\nSubscription reference: ${str(p, "subscriptionId")}`,
  }),
  subscription_renewal_upcoming: (p) => ({
    subject: `Upcoming renewal — ${str(p, "planName", "subscription")}`,
    preheader: `Renewal scheduled for ${str(p, "renewalDate")}.`,
    title: "Upcoming renewal",
    bodyHtml: `<p>Your <strong>${escapeHtml(str(p, "planName"))}</strong> subscription renews on <strong>${escapeHtml(str(p, "renewalDate"))}</strong>.</p>`,
    bodyText: `Your ${str(p, "planName")} subscription renews on ${str(p, "renewalDate")}.`,
  }),
  subscription_renewed: (p) => ({
    subject: `Renewed — ${str(p, "planName", "subscription")}`,
    preheader: "Your subscription period was renewed.",
    title: "Subscription renewed",
    bodyHtml: `<p>Your <strong>${escapeHtml(str(p, "planName"))}</strong> subscription renewed successfully.</p>
<p>Current period ends: ${escapeHtml(str(p, "periodEnd"))}</p>`,
    bodyText: `Your ${str(p, "planName")} subscription renewed successfully.\nCurrent period ends: ${str(p, "periodEnd")}`,
  }),
  subscription_cancel_scheduled: (p) => ({
    subject: `Cancellation scheduled — ${str(p, "planName", "subscription")}`,
    preheader: `Access continues until ${str(p, "effectiveDate")}.`,
    title: "Cancellation scheduled",
    bodyHtml: `<p>Your <strong>${escapeHtml(str(p, "planName"))}</strong> subscription is scheduled to cancel.</p>
<p>Access remains available until ${escapeHtml(str(p, "effectiveDate"))}.</p>`,
    bodyText: `Your ${str(p, "planName")} subscription is scheduled to cancel.\nAccess remains available until ${str(p, "effectiveDate")}.`,
  }),
  subscription_cancelled: (p) => ({
    subject: `Cancelled — ${str(p, "planName", "subscription")}`,
    preheader: "Your subscription has been cancelled.",
    title: "Subscription cancelled",
    bodyHtml: `<p>Your <strong>${escapeHtml(str(p, "planName"))}</strong> subscription is now cancelled.</p>
<p>Reference: ${escapeHtml(str(p, "subscriptionId"))}</p>`,
    bodyText: `Your ${str(p, "planName")} subscription is now cancelled.\nReference: ${str(p, "subscriptionId")}`,
  }),
  invoice_or_receipt_ready: (p) => ({
    subject: `${str(p, "documentLabel", "Invoice")} ready`,
    preheader: "Your billing document is available.",
    title: str(p, "documentLabel", "Invoice") + " ready",
    bodyHtml: `<p>Your ${escapeHtml(str(p, "documentLabel", "invoice"))} is ready.</p>
<p>Reference: ${escapeHtml(str(p, "reference"))}</p>`,
    bodyText: `Your ${str(p, "documentLabel", "invoice")} is ready.\nReference: ${str(p, "reference")}`,
  }),
  approval_required: (p) => ({
    subject: `Approval needed — ${str(p, "missionTitle", "mission")}`,
    preheader: "A Stratxcel action is waiting for your approval.",
    title: "Approval required",
    bodyHtml: `<p><strong>${escapeHtml(str(p, "businessName", "Your business"))}</strong> needs approval before Stratxcel continues.</p>
<p>Mission: ${escapeHtml(str(p, "missionTitle"))}</p>
<p>${escapeHtml(str(p, "approvalSummary"))}</p>
${str(p, "expiresAt") ? `<p>Respond by: ${escapeHtml(str(p, "expiresAt"))}</p>` : ""}
<p><a href="${escapeHtml(str(p, "approvalUrl"))}" style="color:#0b6e4f;">Review in Stratxcel</a></p>
<p>No action has been executed yet.</p>`,
    bodyText: `${str(p, "businessName", "Your business")} needs approval before Stratxcel continues.\nMission: ${str(p, "missionTitle")}\n${str(p, "approvalSummary")}\n${str(p, "expiresAt") ? `Respond by: ${str(p, "expiresAt")}\n` : ""}Review: ${str(p, "approvalUrl")}\n\nNo action has been executed yet.`,
  }),
  mission_completed: (p) => ({
    subject: `Completed — ${str(p, "missionTitle", "mission")}`,
    preheader: "A Stratxcel mission finished successfully.",
    title: "Mission completed",
    bodyHtml: `<p>Mission <strong>${escapeHtml(str(p, "missionTitle"))}</strong> completed successfully.</p>
${str(p, "summary") ? `<p>${escapeHtml(str(p, "summary"))}</p>` : ""}
<p>Reference: ${escapeHtml(str(p, "missionId"))}</p>`,
    bodyText: `Mission ${str(p, "missionTitle")} completed successfully.\n${str(p, "summary") ? `${str(p, "summary")}\n` : ""}Reference: ${str(p, "missionId")}`,
  }),
  mission_failed: (p) => ({
    subject: `Attention needed — ${str(p, "missionTitle", "mission")}`,
    preheader: "A Stratxcel mission ended without success.",
    title: "Mission needs attention",
    bodyHtml: `<p>Mission <strong>${escapeHtml(str(p, "missionTitle"))}</strong> ended in a final failure state.</p>
<p>Status: ${escapeHtml(str(p, "failureKind", "FAILED_FINAL"))}</p>
${str(p, "safeSummary") ? `<p>${escapeHtml(str(p, "safeSummary"))}</p>` : ""}
<p>Reference: ${escapeHtml(str(p, "missionId"))}</p>`,
    bodyText: `Mission ${str(p, "missionTitle")} ended in a final failure state.\nStatus: ${str(p, "failureKind", "FAILED_FINAL")}\n${str(p, "safeSummary") ? `${str(p, "safeSummary")}\n` : ""}Reference: ${str(p, "missionId")}`,
  }),
  support_escalation_created: (p) => ({
    subject: `[${str(p, "priority", "normal").toUpperCase()}] Support escalation ${str(p, "referenceId")}`,
    preheader: "A human support escalation was created.",
    title: "Support escalation created",
    bodyHtml: `<p>A support escalation requires attention.</p>
<ul>
<li>Customer/tenant: ${escapeHtml(str(p, "tenantLabel", "n/a"))}</li>
<li>Priority: ${escapeHtml(str(p, "priority", "normal"))}</li>
<li>Reference: ${escapeHtml(str(p, "referenceId"))}</li>
</ul>
<p>${escapeHtml(str(p, "issueSummary"))}</p>
${str(p, "adminUrl") ? `<p><a href="${escapeHtml(str(p, "adminUrl"))}" style="color:#0b6e4f;">Open admin record</a></p>` : ""}`,
    bodyText: `A support escalation requires attention.\nCustomer/tenant: ${str(p, "tenantLabel", "n/a")}\nPriority: ${str(p, "priority", "normal")}\nReference: ${str(p, "referenceId")}\n\n${str(p, "issueSummary")}\n${str(p, "adminUrl") ? `Admin: ${str(p, "adminUrl")}` : ""}`,
  }),
  important_account_notice: (p) => ({
    subject: str(p, "noticeTitle", "Important account notice"),
    preheader: str(p, "noticeTitle", "Important account notice"),
    title: str(p, "noticeTitle", "Important account notice"),
    bodyHtml: `<p>${escapeHtml(str(p, "noticeBody"))}</p>`,
    bodyText: str(p, "noticeBody"),
  }),
};

export function renderEmailTemplate(
  eventType: EmailEventType,
  payload: Record<string, unknown>,
  options?: { supportEmail?: string }
): RenderedEmail {
  const contract = getEmailEventContract(eventType);
  const builder = BUILDERS[contract.templateKey];
  if (!builder) throw new Error(`UNKNOWN_TEMPLATE:${contract.templateKey}`);

  const config = loadEmailRuntimeConfig();
  const supportEmail = options?.supportEmail ?? config.supportEmail;
  const built = builder(payload, supportEmail);

  const subject = assertSafeHeaderValue(built.subject, "subject");
  return {
    templateKey: contract.templateKey,
    templateVersion: contract.templateVersion,
    subject,
    preheader: built.preheader,
    html: wrapHtml({
      preheader: built.preheader,
      title: built.title,
      bodyHtml: built.bodyHtml,
      supportEmail,
    }),
    text: wrapText({
      title: built.title,
      body: built.bodyText,
      supportEmail,
    }),
  };
}

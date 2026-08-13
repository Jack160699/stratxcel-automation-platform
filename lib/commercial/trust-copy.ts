export interface CustomerTrustClaim { id: string; headline: string; summary: string; detail?: string; evidence: string; }
export const CUSTOMER_TRUST_CLAIMS: CustomerTrustClaim[] = [
  { id: "tenant_isolation", headline: "Your business data stays separate", summary: "Each workspace is isolated so your data is not mixed with other businesses.", detail: "Row-level security policies enforce tenant boundaries.", evidence: "app/security/page.tsx" },
  { id: "secure_sessions", headline: "Your account stays protected", summary: "Sensitive access stays on secure servers — not exposed in the browser.", evidence: "app/security/page.tsx" },
  { id: "approvals", headline: "Important actions can wait for your approval", summary: "Publishing, spend, and outreach can pause until you approve them.", evidence: "packages/approvals/" },
  { id: "audit_trail", headline: "You can see what happened and when", summary: "Workspace activity produces inspectable records.", evidence: "packages/audit/" },
  { id: "connected_permissions", headline: "You control what Stratxcel can access", summary: "Connected accounts use scoped permissions you grant.", evidence: "lib/social/providers/" },
  { id: "privacy_controls", headline: "You can request data deletion", summary: "Deletion requests are handled through documented legal routes.", evidence: "app/(marketing)/data-deletion/page.tsx" },
  { id: "controlled_publishing", headline: "Nothing publishes without your rules", summary: "Social Autopilot stays inside your autonomy and approval settings.", evidence: "app/social-autopilot/page.tsx" },
  { id: "payment_security", headline: "Payments run through Razorpay", summary: "Card and UPI details are handled by Razorpay — not stored in app code.", evidence: "packages/payments-and-wallet/" },
  { id: "data_ownership", headline: "You own your business data", summary: "You remain the legal owner of your domain and business records.", evidence: "pricing FAQ" },
];
export interface TrustQuestion { id: string; question: string; answer: string; learnMoreHref?: string; }
export const TRUST_QUESTIONS: TrustQuestion[] = [
  { id: "data_private", question: "Is my business data private?", answer: "Yes. Each business gets its own workspace, kept separate from other clients.", learnMoreHref: "/security" },
  { id: "disconnect", question: "Can I disconnect my accounts?", answer: "Yes. Connected accounts can be disconnected from your workspace.", learnMoreHref: "/integrations" },
  { id: "auto_publish", question: "Will AI publish things without me knowing?", answer: "Not by default. Publishing can require your approval before anything goes live.", learnMoreHref: "/social-autopilot" },
  { id: "review_actions", question: "Can I review important actions?", answer: "Yes. Consequential work can pause for explicit approval.", learnMoreHref: "/how-it-works" },
  { id: "data_retention", question: "What happens to my data?", answer: "Your data stays yours. You can request deletion through our documented process.", learnMoreHref: "/privacy" },
  { id: "payments", question: "How do payments work?", answer: "The ₹999 audit is one-time via Razorpay. Monthly plans are confirmed separately.", learnMoreHref: "/pricing" },
];

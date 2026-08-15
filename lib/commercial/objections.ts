export interface ObjectionFaq { id: string; question: string; answer: string; }
export const JOURNEY_OBJECTIONS: ObjectionFaq[] = [
  { id: "for_my_business", question: "Is Stratxcel for a business like mine?", answer: "Built for local and small businesses managing content, search, leads, and follow-up in one place." },
  { id: "what_it_does", question: "What can Stratxcel actually help me do?", answer: "Research, content, social planning, search review, lead capture, and follow-up — with approval where it matters." },
  { id: "real_software", question: "Is this real software?", answer: "Yes — Brand Brain, workflows, lead tools, and integrations you can explore before paying." },
  { id: "need_ai", question: "Do I need to know AI?", answer: "No. Describe your business, review drafts, and approve what goes out." },
  { id: "manage_tools", question: "Do I need to manage all these tools myself?", answer: "No. Stratxcel reduces tool sprawl with staff-assisted activation for monthly plans." },
  { id: "start_small", question: "Can I start small?", answer: "Yes — start with a Free Instant Audit, explore the workspace, or activate Starter when ready." },
  { id: "existing_accounts", question: "Can Stratxcel work with accounts I already use?", answer: "Yes for Instagram, Facebook, LinkedIn, Google Search Console, WhatsApp Business, and more." },
  { id: "auto_post", question: "Will it automatically post or message customers?", answer: "Only within rules you set — approval can be required first." },
];
export const PRICING_OBJECTIONS: ObjectionFaq[] = [
  { id: "audit_flow", question: "How does the Business Growth Audit work?", answer: "Connect your website URL, confirm discovered details, and receive an instant evidence-backed 30/60/90-day roadmap — completely free." },
  { id: "ad_spend", question: "Are ad spend and domains included?", answer: "No. Subscriptions cover operating work; ad spend and domains are separate." },
  { id: "domain_ownership", question: "Who owns our website domain?", answer: "You remain the legal owner; Stratxcel configures DNS under your details." },
  { id: "upgrade", question: "Can we upgrade plans?", answer: "Yes — Starter to Growth to Business; Scale/Custom is quote-led." },
  { id: "staff_activation", question: "Why are monthly plans staff-activated?", answer: "Scope and integrations are confirmed before paid activation during closed beta." },
  { id: "audit_subscription", question: "Does the audit start a subscription?", answer: "No. The audit is 100% free; monthly execution plans are confirmed separately." },
];

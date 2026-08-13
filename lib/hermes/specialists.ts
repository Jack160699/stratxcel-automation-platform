export const HERMES_SPECIALISTS = [
  "research",
  "audit",
  "growth",
  "crm",
  "social",
  "content",
  "ads",
  "seo",
  "analytics",
  "customer_operations",
  "web_studio",
] as const;

export type HermesSpecialist = (typeof HERMES_SPECIALISTS)[number];

export function delegateHermesSpecialist(goal: string): HermesSpecialist {
  const value = goal.toLowerCase();
  if (/website|landing page|microsite|web studio|campaign page/.test(value)) return "web_studio";
  if (/audit|business health|evidence/.test(value)) return "audit";
  if (/\bseo\b|search console|discoverability/.test(value)) return "seo";
  if (/instagram|facebook|threads|linkedin|social post|publish/.test(value)) return "social";
  if (/content calendar|copy|caption|blog/.test(value)) return "content";
  if (/ads|advertising|campaign spend/.test(value)) return "ads";
  if (/lead|crm|inbox|whatsapp conversation/.test(value)) return "crm";
  if (/analytics|ga4|conversion|traffic/.test(value)) return "analytics";
  if (/competitor|research|market/.test(value)) return "research";
  if (/support|customer operations|handoff/.test(value)) return "customer_operations";
  return "growth";
}

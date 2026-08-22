import type { AgentActorContext } from "../agent-tenant-types.ts";
import { insertMessage, setSessionStatus } from "../repositories/agent.ts";
import { completeRun, recordRunEvent } from "../repositories/agent-runs.ts";
import { getBrandProfile } from "../repositories/brand.ts";
import { listAccounts } from "../repositories/accounts.ts";
import { PLAN_DEFINITIONS, PLAN_LIMITS, type PlanTier } from "@stratxcel/payments-and-wallet";

export interface PlanGrowthHandlerResult {
  handled: boolean;
  text?: string;
}

/**
 * Deterministic, plan-aware response handler for "What's my free plan include?",
 * "What plan am I on?", "Can you publish to Instagram?", and related subscription questions.
 */
export async function handleAccountPlanInquiryTurn(
  ctx: AgentActorContext,
  sessionId: string,
  runId: string,
  userPrompt: string,
  tenantId: string
): Promise<PlanGrowthHandlerResult> {
  const brand = await getBrandProfile(ctx).catch(() => null);
  const businessName = brand?.identity?.name?.trim() || "your business";

  // Query active subscription tier
  let activeTier: PlanTier = "free";
  try {
    const { data: sub } = await ctx.supabase
      .from("subscriptions")
      .select("plan_tier, status")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sub?.status === "active" && sub.plan_tier) {
      activeTier = sub.plan_tier as PlanTier;
    }
  } catch {
    // Fall back safely to "free"
  }

  const planDef = PLAN_DEFINITIONS[activeTier] || PLAN_DEFINITIONS.free;
  const isPublishQuestion = /\b(?:publish|post)\s+(?:this\s+)?to\s+(?:instagram|facebook|youtube)\b/i.test(userPrompt);

  let message = "";

  if (isPublishQuestion && activeTier === "free") {
    message = `Publishing directly to social platforms is not included on your current **Free** plan.

You can still use **Growth Assistant** and **Content Studio** to create, edit, customize, and download high-resolution posters and captions.

**To automate live publishing:**
• **Growth Plan** (₹9,999/mo) includes **25 scheduled posts/mo** across Instagram, Facebook, and YouTube, plus 1 Meta Ad campaign.
• **Business Plan** (₹19,999/mo) includes **50 scheduled posts/mo**, 3 Meta Ad campaigns, and 1,500 WhatsApp contacts.

[Upgrade to Growth →](/app/billing) · [Open Content Studio →](/app/content)`;
  } else if (activeTier === "free") {
    message = `You're currently on the **Free** plan for **${businessName}**.

**Included with your Free plan:**
• **Business Growth Audit**: 100-point local search, Google profile, and website audit
• **Brand Center & Brain**: Store identity, logo management, operating hours, and brand voice
• **Content Studio**: AI creative poster design, multilingual caption generation, and draft library
• **WhatsApp CRM**: WhatsApp phone number pairing and customer contact inbox
• **Website**: Instant \`.stratxcel.in\` live mobile website preview

**Current Usage:**
• Automated Social Publishing: **0 of 0** posts used (Draft & Manual Download active)
• Meta Ad Campaigns: **0 of 0** active

**Available with Growth Upgrade (₹9,999/mo):**
• **25 automated scheduled posts/mo** on Instagram, Facebook & YouTube
• **1 automated Meta Ad campaign** with budget management
• **500 WhatsApp customer contacts**
• **Custom domain connection** (\`yourbusiness.com\`) with automated SSL

[Upgrade to Growth →](/app/billing) · [View All Plans →](/app/billing)`;
  } else {
    const limits = PLAN_LIMITS[activeTier] || PLAN_LIMITS.growth;
    message = `You are on the **${planDef.publicName}** plan for **${businessName}**.

**Your Plan Entitlements:**
• **Social Posts**: Up to **${limits.social_posts}** automated posts per month
• **Meta Ad Campaigns**: **${limits.meta_ad_campaigns}** active ad campaigns
• **WhatsApp Contacts**: Up to **${limits.whatsapp_contacts.toLocaleString("en-IN")}** customer contacts
• **Website**: ${limits.website_maintenance ? "Custom domain hosting & maintenance included" : "Subdomain preview"}

[Manage Billing & Invoices →](/app/billing) · [Open Content Library →](/app/content)`;
  }

  await insertMessage(ctx, sessionId, "AGENT", message);
  await setSessionStatus(ctx, sessionId, "IDLE");
  await recordRunEvent(ctx, runId, { type: "RUN_COMPLETED", label: "Plan and entitlement breakdown", status: "SUCCESS" });
  await completeRun(ctx, runId, "COMPLETED");

  return { handled: true, text: message };
}

/**
 * Deterministic, context-aware growth advisor response for "What should I do this week?",
 * "Is hafte kya karun?", and top business actions.
 */
export async function handleWeeklyGrowthAdviceTurn(
  ctx: AgentActorContext,
  sessionId: string,
  runId: string,
  _userPrompt: string,
  _tenantId: string
): Promise<PlanGrowthHandlerResult> {
  const brand = await getBrandProfile(ctx).catch(() => null);
  const businessName = brand?.identity?.name?.trim() || "your business";
  const accounts = await listAccounts(ctx).catch(() => []);
  const googleConnected = accounts.some((a) => a.platform === "google" && a.status === "CONNECTED");
  const instagramConnected = accounts.some((a) => a.platform === "instagram" && a.status === "CONNECTED");

  const message = `Here are your **Top 3 Recommended Actions** for **${businessName}** this week:

1. **${googleConnected ? "Keep Google Business Listing Fresh" : "Connect Google Business Profile"}**
   ${
     googleConnected
       ? "Post this week's special offer and confirm your weekend operating hours to maximize nearby search ranking."
       : "Connect your Google Business account to sync store hours, reply to customer reviews, and boost local map discovery."
   }
   [${googleConnected ? "Review Audit Report →" : "Connect Google Business →"}](/app/audit)

2. **Prepare 2 Local Promotional Creatives**
   ${
     instagramConnected
       ? "Create a visual poster highlighting your top service or weekend promotion for Instagram and Facebook."
       : "Generate a festival/weekend promotional poster with compelling captions to share with your customers."
   }
   [Create New Poster →](/app/content) · [Plan Weekly Posts →](/app/social/copilot)

3. **Verify Brand Details & Logo in Brand Center**
   Ensure your business category, phone number, operating hours, and logo are up to date so AI generates accurate creatives.
   [Open Brand Center →](/app/brand)

Need help drafting any of these? Just type **"Create a weekend offer poster"** or **"Plan this week's posts"**!`;

  await insertMessage(ctx, sessionId, "AGENT", message);
  await setSessionStatus(ctx, sessionId, "IDLE");
  await recordRunEvent(ctx, runId, { type: "RUN_COMPLETED", label: "Weekly growth recommendation synthesis", status: "SUCCESS" });
  await completeRun(ctx, runId, "COMPLETED");

  return { handled: true, text: message };
}

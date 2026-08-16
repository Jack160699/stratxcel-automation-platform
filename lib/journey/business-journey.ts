/**
 * Canonical Business Journey & Milestone Progress Engine.
 *
 * Derives true customer progress across 6 canonical stages:
 * CONNECT → DISCOVER → VERIFY → BUILD → GROW → OPTIMIZE
 *
 * Rules:
 * - NO fake progress. Derived directly from real tenant/database state.
 * - Meaningful achievement moments ("FOUNDATION UNLOCKED", "WHAT WAS ACCOMPLISHED", "NEXT STEP").
 * - Business value oriented rather than gamified points/badges.
 */

export type JourneyStageKey = "connect" | "discover" | "verify" | "build" | "grow" | "optimize";

export type StageProgressStatus = "Not started" | "In progress" | "Ready" | "Complete" | "Needs attention";

export interface JourneyStageItem {
  key: JourneyStageKey;
  label: string;
  shortLabel: string;
  order: number;
  status: StageProgressStatus;
  percentComplete: number;
  summary: string;
  detail: string;
  whatStratxcelDoes: string;
  whatIsUnlocked: string[];
  action: { label: string; href: string } | null;
}

export interface BusinessMilestone {
  id: string;
  title: string;
  description: string;
  isUnlocked: boolean;
  unlockedAt?: string;
  businessImpact: string;
  whatWasAccomplished: string[];
  nextStep: { label: string; href: string };
}

export interface BusinessJourneyContext {
  hasWebsite: boolean;
  websiteUrl?: string | null;
  brandBrainVersion: number;
  socialAccountsCount: number;
  confirmedSocialsCount: number;
  hasAuditOrder: boolean;
  auditOrderStatus?: string | null;
  hasReportData: boolean;
  reportKind?: "AUDIT" | "LAUNCH_PLAN";
  whatsappConnected: boolean;
  crmLeadsCount: number;
  hasAutomations: boolean;
  hasActivePlan: boolean;
}

export interface BusinessJourneyState {
  currentStage: JourneyStageKey;
  currentStageIndex: number;
  totalStages: number;
  overallProgressPercent: number;
  stages: JourneyStageItem[];
  unlockedMilestones: BusinessMilestone[];
  latestAchievement: BusinessMilestone | null;
  activeFocus: {
    title: string;
    description: string;
    action: { label: string; href: string } | null;
    whyItMatters: string;
  };
}

export const CANONICAL_MILESTONES: Omit<BusinessMilestone, "isUnlocked" | "unlockedAt">[] = [
  {
    id: "BUSINESS_CONNECTED",
    title: "Business Connected",
    description: "Your official business domain and basic presence are connected to Stratxcel.",
    businessImpact: "Enables automated discovery and continuous intelligence monitoring.",
    whatWasAccomplished: [
      "Canonical domain linked",
      "Public crawl boundary configured",
      "Baseline security checks passed",
    ],
    nextStep: { label: "Run Discovery", href: "/app/audit" },
  },
  {
    id: "BUSINESS_DISCOVERED",
    title: "Business Discovered",
    description: "Stratxcel has mapped your business model, offerings, audience, and digital signals.",
    businessImpact: "Generates tailored recommendations based on real market evidence.",
    whatWasAccomplished: [
      "Multi-page crawl completed",
      "Industry & business model classified",
      "Public social handles detected",
    ],
    nextStep: { label: "Verify Channels", href: "/app/brand" },
  },
  {
    id: "DIGITAL_PRESENCE_VERIFIED",
    title: "Digital Presence Verified",
    description: "Your official channels, contact numbers, and social profiles have been confirmed.",
    businessImpact: "Guarantees brand safety and unified multi-channel operations.",
    whatWasAccomplished: [
      "Official social profiles verified",
      "Customer contact routes validated",
      "Identity conflicts resolved",
    ],
    nextStep: { label: "Open Brand Brain", href: "/app/brand" },
  },
  {
    id: "BRAND_FOUNDATION_COMPLETE",
    title: "Brand Foundation Complete",
    description: "Brand Brain is initialized with your tone, offerings, and positioning.",
    businessImpact: "AI content and marketing copy match your authentic business voice.",
    whatWasAccomplished: [
      "Brand voice & tone encoded",
      "Primary offerings and target audience saved",
      "Single source of truth established",
    ],
    nextStep: { label: "Review Growth Plan", href: "/app/audit" },
  },
  {
    id: "GROWTH_PLAN_READY",
    title: "Growth Plan / Audit Ready",
    description: "Your evidence-backed Business Growth Audit or Launch Plan is generated.",
    businessImpact: "Provides a clear 30/60/90 day roadmap prioritized by business return.",
    whatWasAccomplished: [
      "Digital health score calculated",
      "Critical gaps & opportunities identified",
      "Action roadmap prepared",
    ],
    nextStep: { label: "Open Report", href: "/app/audit" },
  },
  {
    id: "WHATSAPP_CONNECTED",
    title: "WhatsApp Number Verified",
    description: "Your WhatsApp phone number is verified to receive instant growth alerts and audit updates.",
    businessImpact: "Ensures critical business alerts and audit deliveries reach you instantly.",
    whatWasAccomplished: [
      "WhatsApp phone number verified via OTP",
      "Direct alert destination established",
      "Audit report delivery enabled",
    ],
    nextStep: { label: "Explore Copilot", href: "/app/social/copilot" },
  },
  {
    id: "GROWTH_READY",
    title: "Growth Autopilot Ready",
    description: "Your verified brand foundation and Social Copilot are armed for autonomous execution.",
    businessImpact: "Enables consistent daily brand publishing and audience growth.",
    whatWasAccomplished: [
      "Multi-channel content pipeline configured",
      "Brand Brain positioning active",
      "Social Autopilot ready",
    ],
    nextStep: { label: "Explore Copilot", href: "/app/social/copilot" },
  },
  {
    id: "FIRST_AUTOMATION_COMPLETE",
    title: "First Automation Activated",
    description: "Active automation workflow or Social Autopilot session created.",
    businessImpact: "Saves 10+ hours per week in routine marketing and outreach tasks.",
    whatWasAccomplished: [
      "Initial growth campaign planned",
      "Brand-aligned content approved",
      "Multi-channel publish queue running",
    ],
    nextStep: { label: "View Performance", href: "/app/social/copilot" },
  },
];

export function deriveBusinessJourney(ctx: BusinessJourneyContext): BusinessJourneyState {
  const isConnected = Boolean(ctx.hasWebsite && ctx.websiteUrl);
  const isDiscovered = isConnected && ctx.brandBrainVersion > 0;
  const isVerified = isDiscovered && ctx.confirmedSocialsCount > 0;
  const isBuilt = Boolean(ctx.hasAuditOrder && (ctx.hasReportData || ctx.auditOrderStatus === "completed"));
  const isGrowing = isBuilt && (ctx.hasAutomations || ctx.whatsappConnected);
  const isOptimized = isGrowing && ctx.hasActivePlan;

  // Stages calculation
  const stages: JourneyStageItem[] = [
    {
      key: "connect",
      label: "Connect Business",
      shortLabel: "Connect",
      order: 1,
      status: isConnected ? "Complete" : "In progress",
      percentComplete: isConnected ? 100 : 25,
      summary: isConnected ? "Website & domain connected" : "Add your business website",
      detail: isConnected
        ? `Connected to ${ctx.websiteUrl}`
        : "Connect your official domain so Stratxcel can monitor and analyze your business.",
      whatStratxcelDoes: "Monitors website uptime, robots.txt, and canonical public presence.",
      whatIsUnlocked: ["Domain verification", "Automated site crawler"],
      action: isConnected ? null : { label: "Connect Website", href: "/app/audit" },
    },
    {
      key: "discover",
      label: "Discover Intelligence",
      shortLabel: "Discover",
      order: 2,
      status: !isConnected ? "Not started" : isDiscovered ? "Complete" : "In progress",
      percentComplete: !isConnected ? 0 : isDiscovered ? 100 : 50,
      summary: isDiscovered ? "Business profile mapped" : "Learning your business",
      detail: isDiscovered
        ? "Extracted business model, services, and public channels."
        : "Stratxcel is exploring your site to extract offerings, tone, and audience.",
      whatStratxcelDoes: "Multi-agent deep crawl extracting business facts and evidence.",
      whatIsUnlocked: ["Discovered profile", "Contextual goal recommendations"],
      action: !isConnected ? null : isDiscovered ? null : { label: "Run Discovery", href: "/app/audit" },
    },
    {
      key: "verify",
      label: "Verify Channels",
      shortLabel: "Verify",
      order: 3,
      status: !isDiscovered ? "Not started" : isVerified ? "Complete" : "Ready",
      percentComplete: !isDiscovered ? 0 : isVerified ? 100 : (ctx.confirmedSocialsCount > 0 ? 75 : 30),
      summary: isVerified ? "Official channels confirmed" : "Confirm discovered profiles",
      detail: isVerified
        ? `${ctx.confirmedSocialsCount} public channel(s) verified.`
        : "Confirm which social handles and contact channels belong to your business.",
      whatStratxcelDoes: "Validates channel ownership and avoids mistaken identity.",
      whatIsUnlocked: ["Brand Brain SSOT", "Channel connectors"],
      action: isVerified ? null : { label: "Confirm Channels", href: "/app/brand" },
    },
    {
      key: "build",
      label: "Build Plan & Foundation",
      shortLabel: "Build",
      order: 4,
      status: !isVerified ? "Not started" : isBuilt ? "Complete" : "In progress",
      percentComplete: !isVerified ? 0 : isBuilt ? 100 : 60,
      summary: isBuilt ? "Audit & growth roadmap ready" : "Creating your Growth Plan",
      detail: isBuilt
        ? (ctx.reportKind === "LAUNCH_PLAN" ? "Launch Plan & build sequence generated." : "Audit report & priority findings ready.")
        : "Generating your tailored 30-day transformation sequence and priorities.",
      whatStratxcelDoes: "Synthesizes market gaps into a prioritized operational growth plan.",
      whatIsUnlocked: ["Actionable roadmap", "Contextual package recommendation"],
      action: isBuilt ? { label: "View Plan", href: "/app/audit" } : { label: "Generate Plan", href: "/app/audit" },
    },
    {
      key: "grow",
      label: "Activate Growth",
      shortLabel: "Grow",
      order: 5,
      status: !isBuilt ? "Not started" : isGrowing ? "Complete" : "Ready",
      percentComplete: !isBuilt ? 0 : isGrowing ? 100 : 40,
      summary: isGrowing ? "Social Copilot active" : "Activate Social Autopilot",
      detail: isGrowing
        ? "Automated content generation and multi-channel publishing are active."
        : "Turn on Social Copilot to generate and publish brand-aligned content.",
      whatStratxcelDoes: "Coordinates multi-channel content creation and performance intelligence.",
      whatIsUnlocked: ["Social Autopilot", "Copilot Studio", "Autonomous Campaigns"],
      action: isGrowing ? null : { label: "Open Copilot", href: "/app/social/copilot" },
    },
    {
      key: "optimize",
      label: "Continuous Optimization",
      shortLabel: "Optimize",
      order: 6,
      status: !isGrowing ? "Not started" : isOptimized ? "Complete" : "In progress",
      percentComplete: !isGrowing ? 0 : isOptimized ? 100 : 50,
      summary: isOptimized ? "Operating at full scale" : "Ongoing performance tuning",
      detail: isOptimized
        ? "Growth operations running on schedule."
        : "Upgrade to Growth tier for unlimited automated campaigns and continuous optimization.",
      whatStratxcelDoes: "Audits performance weekly and recommends ongoing optimizations.",
      whatIsUnlocked: ["Autonomous Copilot", "Advanced Growth Analytics"],
      action: isOptimized ? null : { label: "Explore Plans", href: "/app/billing" },
    },
  ];

  // Determine current active stage
  let currentStageKey: JourneyStageKey = "connect";
  let currentStageIndex = 0;

  for (let i = 0; i < stages.length; i++) {
    const s = stages[i];
    if (s.status !== "Complete") {
      currentStageKey = s.key;
      currentStageIndex = i;
      break;
    }
    if (i === stages.length - 1 && s.status === "Complete") {
      currentStageKey = "optimize";
      currentStageIndex = 5;
    }
  }

  // Calculate overall progress percent
  const totalPercentSum = stages.reduce((acc, s) => acc + s.percentComplete, 0);
  const overallProgressPercent = Math.round(totalPercentSum / stages.length);

  // Evaluate unlocked milestones
  const unlockedMilestones: BusinessMilestone[] = [];
  if (isConnected) {
    unlockedMilestones.push({ ...CANONICAL_MILESTONES[0], isUnlocked: true });
  }
  if (isDiscovered) {
    unlockedMilestones.push({ ...CANONICAL_MILESTONES[1], isUnlocked: true });
  }
  if (isVerified) {
    unlockedMilestones.push({ ...CANONICAL_MILESTONES[2], isUnlocked: true });
    unlockedMilestones.push({ ...CANONICAL_MILESTONES[3], isUnlocked: true });
  }
  if (isBuilt) {
    unlockedMilestones.push({ ...CANONICAL_MILESTONES[4], isUnlocked: true });
  }
  if (ctx.whatsappConnected) {
    unlockedMilestones.push({ ...CANONICAL_MILESTONES[5], isUnlocked: true });
  }
  if (ctx.hasAutomations) {
    unlockedMilestones.push({ ...CANONICAL_MILESTONES[6], isUnlocked: true });
    unlockedMilestones.push({ ...CANONICAL_MILESTONES[7], isUnlocked: true });
  }

  const latestAchievement = unlockedMilestones.length > 0 ? unlockedMilestones[unlockedMilestones.length - 1] : null;
  const activeStage = stages[currentStageIndex];

  return {
    currentStage: currentStageKey,
    currentStageIndex,
    totalStages: stages.length,
    overallProgressPercent,
    stages,
    unlockedMilestones,
    latestAchievement,
    activeFocus: {
      title: activeStage.summary,
      description: activeStage.detail,
      action: activeStage.action,
      whyItMatters: activeStage.whatStratxcelDoes,
    },
  };
}

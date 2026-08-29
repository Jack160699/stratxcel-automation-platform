/**
 * Content Opportunity Map (Mission G §7)
 *
 * Defines the comprehensive taxonomy of 20+ strategic content opportunity types
 * to ensure that a 28-day campaign is strategically rich and diverse, rather than
 * repeating the same generic promotional message 28 times.
 */

export type ContentOpportunityType =
  | "CUSTOMER_PAIN_POINT"
  | "CUSTOMER_QUESTION"
  | "COMMON_MISCONCEPTION"
  | "PURCHASE_OBJECTION"
  | "SERVICE_EDUCATION"
  | "PRODUCT_SPOTLIGHT"
  | "LOCAL_RELEVANCE"
  | "PROOF_OUTCOME"
  | "DEMONSTRATION"
  | "BEHIND_THE_SCENES"
  | "EXPERT_TIP"
  | "COMPARISON_GUIDE"
  | "USE_CASE"
  | "BEFORE_AFTER"
  | "STORY_NARRATIVE"
  | "COMMUNITY_SPOTLIGHT"
  | "SEASONAL_FESTIVAL"
  | "INTERACTIVE_POLL"
  | "CHECKLIST_GUIDE"
  | "MISTAKE_LESSON"
  | "FAQ_ANSWERED"
  | "PROCESS_TRANSPARENCY";

export interface OpportunityDefinition {
  type: ContentOpportunityType;
  label: string;
  description: string;
  strategicObjective: "ENGAGEMENT" | "AUTHORITY" | "LEADS" | "SALES" | "COMMUNITY" | "REACH" | "RETENTION";
  defaultHookStyle: string;
  defaultCtaStyle: string;
}

export const CONTENT_OPPORTUNITY_DEFINITIONS: Record<ContentOpportunityType, OpportunityDefinition> = {
  CUSTOMER_PAIN_POINT: {
    type: "CUSTOMER_PAIN_POINT",
    label: "Customer Pain Point & Relief",
    description: "Speaks directly to a frustrating problem or struggle the customer faces daily and shows how to resolve it.",
    strategicObjective: "LEADS",
    defaultHookStyle: "Identify the uncomfortable or costly daily friction your ideal customer experiences.",
    defaultCtaStyle: "Invite them to get in touch or book a solution to eliminate that headache.",
  },
  CUSTOMER_QUESTION: {
    type: "CUSTOMER_QUESTION",
    label: "Top Customer Question",
    description: "Answers a high-intent question buyers ask before purchasing or booking.",
    strategicObjective: "AUTHORITY",
    defaultHookStyle: "Open with the exact question customers ask most frequently.",
    defaultCtaStyle: "Encourage them to comment with their own questions or DM for personalized guidance.",
  },
  COMMON_MISCONCEPTION: {
    type: "COMMON_MISCONCEPTION",
    label: "Myth vs Reality",
    description: "Debunks a widespread false belief in the industry that causes poor purchasing decisions.",
    strategicObjective: "AUTHORITY",
    defaultHookStyle: "Challenge an assumption almost everyone believes in this category.",
    defaultCtaStyle: "Ask audience if they believed this myth and invite discussion.",
  },
  PURCHASE_OBJECTION: {
    type: "PURCHASE_OBJECTION",
    label: "Objection Handling",
    description: "Addresses hesitations around price, complexity, time, or perceived risk with transparent clarity.",
    strategicObjective: "LEADS",
    defaultHookStyle: "Acknowledge the #1 reason people hesitate before booking or buying.",
    defaultCtaStyle: "Provide a transparent reassurance or consultation step.",
  },
  SERVICE_EDUCATION: {
    type: "SERVICE_EDUCATION",
    label: "Service Deep-Dive",
    description: "Explains what goes into a specialized service and why professional execution matters.",
    strategicObjective: "AUTHORITY",
    defaultHookStyle: "Highlight the subtle details in execution that separate average work from excellence.",
    defaultCtaStyle: "Invite them to explore the service options or schedule an appointment.",
  },
  PRODUCT_SPOTLIGHT: {
    type: "PRODUCT_SPOTLIGHT",
    label: "Product Focus & Craft",
    description: "Highlights a signature item, ingredient, material, or design feature with sensory detail.",
    strategicObjective: "SALES",
    defaultHookStyle: "Focus on the single standout feature or ingredient that makes this offering unique.",
    defaultCtaStyle: "Invite them to taste, try, or order the featured product.",
  },
  LOCAL_RELEVANCE: {
    type: "LOCAL_RELEVANCE",
    label: "Local Community Connection",
    description: "Celebrates the specific neighborhood, local traditions, weather, or city landmarks.",
    strategicObjective: "COMMUNITY",
    defaultHookStyle: "Open with a relatable local observation or neighborhood mention.",
    defaultCtaStyle: "Invite locals to drop by or comment their favorite local spots.",
  },
  PROOF_OUTCOME: {
    type: "PROOF_OUTCOME",
    label: "Proof & Client Outcome",
    description: "Demonstrates tangible results, transformations, or customer feedback without hype.",
    strategicObjective: "LEADS",
    defaultHookStyle: "Present the concrete before/after result or milestone achieved.",
    defaultCtaStyle: "Invite the reader to achieve similar outcomes by getting in touch.",
  },
  DEMONSTRATION: {
    type: "DEMONSTRATION",
    label: "Live Demonstration",
    description: "Shows the product or service in action, solving a problem in real time.",
    strategicObjective: "AUTHORITY",
    defaultHookStyle: "Watch what happens when you apply this technique or product.",
    defaultCtaStyle: "Encourage saving the post or checking out the full demonstration.",
  },
  BEHIND_THE_SCENES: {
    type: "BEHIND_THE_SCENES",
    label: "Behind The Scenes & Standards",
    description: "Reveals the preparation, hygiene, sourcing, or unglamorous hard work that guarantees quality.",
    strategicObjective: "AUTHORITY",
    defaultHookStyle: "Take them behind closed doors to see how the work is actually prepared.",
    defaultCtaStyle: "Invite appreciation or comments on the team's craft.",
  },
  EXPERT_TIP: {
    type: "EXPERT_TIP",
    label: "Actionable Expert Tip",
    description: "Gives a practical, immediately useful piece of advice the customer can use today.",
    strategicObjective: "ENGAGEMENT",
    defaultHookStyle: "A simple, counter-intuitive tip that saves time, money, or frustration.",
    defaultCtaStyle: "Ask them to bookmark/save this tip for later use.",
  },
  COMPARISON_GUIDE: {
    type: "COMPARISON_GUIDE",
    label: "Comparison & Buyer Guide",
    description: "Compares options (Option A vs Option B) to help the buyer make an educated decision.",
    strategicObjective: "AUTHORITY",
    defaultHookStyle: "Which one should you choose? Here is the honest breakdown.",
    defaultCtaStyle: "Ask them which option fits their lifestyle in the comments.",
  },
  USE_CASE: {
    type: "USE_CASE",
    label: "Specific Use Case / Occasion",
    description: "Frames the offering around a specific occasion, mood, or lifestyle scenario.",
    strategicObjective: "SALES",
    defaultHookStyle: "Describe the exact situation where this offering is the perfect match.",
    defaultCtaStyle: "Suggest booking or ordering for their next occasion.",
  },
  BEFORE_AFTER: {
    type: "BEFORE_AFTER",
    label: "Transformation Journey",
    description: "Contrasts the starting condition with the finished result, explaining the steps in between.",
    strategicObjective: "LEADS",
    defaultHookStyle: "From messy and frustrating to clean and effortless: the transformation.",
    defaultCtaStyle: "Invite a consultation to plan their transformation.",
  },
  STORY_NARRATIVE: {
    type: "STORY_NARRATIVE",
    label: "Founder or Client Story",
    description: "Shares a human narrative about a real challenge overcome or lesson learned.",
    strategicObjective: "COMMUNITY",
    defaultHookStyle: "Start mid-action in a memorable story or milestone.",
    defaultCtaStyle: "Invite readers to share their own experiences.",
  },
  COMMUNITY_SPOTLIGHT: {
    type: "COMMUNITY_SPOTLIGHT",
    label: "Community & Regulars",
    description: "Celebrates long-time patrons, team members, or community milestones.",
    strategicObjective: "COMMUNITY",
    defaultHookStyle: "Spotlight a valued customer or dedicated team artisan.",
    defaultCtaStyle: "Invite warm messages or community greetings.",
  },
  SEASONAL_FESTIVAL: {
    type: "SEASONAL_FESTIVAL",
    label: "Seasonal & Festive Context",
    description: "Connects the business offering naturally to the current season, climate, or cultural celebration.",
    strategicObjective: "SALES",
    defaultHookStyle: "Acknowledge the seasonal mood or festive celebration underway.",
    defaultCtaStyle: "Invite pre-orders or festive bookings.",
  },
  INTERACTIVE_POLL: {
    type: "INTERACTIVE_POLL",
    label: "Interactive Debate / Poll",
    description: "Poses a fun, lighthearted question or preference debate to trigger lively engagement.",
    strategicObjective: "ENGAGEMENT",
    defaultHookStyle: "Ask a polarizing yet friendly choice: Option A or Option B?",
    defaultCtaStyle: "Tell us your vote in the comments below.",
  },
  CHECKLIST_GUIDE: {
    type: "CHECKLIST_GUIDE",
    label: "Step-by-Step Checklist",
    description: "Provides a structured checklist for an important task or seasonal preparation.",
    strategicObjective: "ENGAGEMENT",
    defaultHookStyle: "The ultimate 4-step checklist before you start.",
    defaultCtaStyle: "Save this post so you don't miss a step.",
  },
  MISTAKE_LESSON: {
    type: "MISTAKE_LESSON",
    label: "Costly Mistake to Avoid",
    description: "Warns about a common error people make when trying to do things without proper guidance.",
    strategicObjective: "AUTHORITY",
    defaultHookStyle: "The #1 mistake we see people make (and how to easily avoid it).",
    defaultCtaStyle: "Share with a friend who needs to hear this.",
  },
  FAQ_ANSWERED: {
    type: "FAQ_ANSWERED",
    label: "Quick FAQ Clarification",
    description: "Briskly explains a pricing, booking, or warranty policy with zero ambiguity.",
    strategicObjective: "LEADS",
    defaultHookStyle: "Got questions about our process? Here are direct answers.",
    defaultCtaStyle: "DM us if you have any additional questions.",
  },
  PROCESS_TRANSPARENCY: {
    type: "PROCESS_TRANSPARENCY",
    label: "Process Transparency",
    description: "Breaks down the 3-step workflow from first contact to flawless completion.",
    strategicObjective: "LEADS",
    defaultHookStyle: "Here is exactly what happens from the moment you reach out.",
    defaultCtaStyle: "Ready to get started? Send us a message today.",
  },
};

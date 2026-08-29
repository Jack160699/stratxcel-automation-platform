# StratXcel Social Autopilot — End-to-End Runtime Trace & Architecture

This document details the exact, canonical runtime execution path for every Social Autopilot content generation across all layers: UI, Server Action / API, Tenant & Brand Context, Intelligence, Creative Strategy, Prompt Building, Image Generation & Compositing, Quality Gates, Persistence, and Frontend Display.

---

## 1. Complete Generation Lifecycle Flow

```text
USER / SYSTEM ACTION
│
▼ [Trigger Point]
• Automatic Batch / Cron: `api/social/package-producer` / `api/social/worker`
• Tenant Onboarding / Resume: `api/platform/social/autopilot` -> `triggerImmediatePackagePreparation`
• Admin Direct Action: `app/admin/(shell)/social/actions.ts` -> `runTenantContentBackfillAction` / `forceRegeneratePackageItemImageAction`
• Client Manual Generate: `app/api/platform/social/autopilot/manual-generate`
│
▼ [Stage 1: Authorization & Multi-Tenant Resolution]
• File: `lib/social/package-autopilot.ts` -> `planPackagePeriod` & `prepareNearTermPackageItems`
• Input: `authorizationId`, `tenantId`, `clientUserId`
• Verification: RLS & `verifyQueueItemTenant` guarantee tenant isolation.
• Database: Reads `social_autopilot_authorizations` (plan tier, remaining units, state, timezone).
│
▼ [Stage 2: Canonical Brand Context & Intelligence Extraction]
• File: `lib/social/business-intelligence.ts` -> `deriveBusinessContentIntelligence`
• Input: `brand_brains.content`, `social_brand_profiles`, `package_business_facts` (verified facts)
• Output: `BusinessContentIntelligence`
  - Exact offerings & products (never hallucinated)
  - Audience psychology (primary worries, purchase hesitations, trust triggers, FAQs)
  - Positioning & local market geographic context
  - Brand voice (approved claims, tone, blocked phrases)
│
▼ [Stage 3: 28-Day Strategic Blueprint Resolution]
• File: `lib/social/campaign-strategy-planner.ts` -> `generate28DayCampaignPlan` / `getPlannedStrategyForDay`
• Input: `BusinessContentIntelligence`, `package_sequence` (day 1-28)
• Output: `PlannedDayStrategy`
  - `opportunityType` (Pain Point, Proof, Misconception, Behind The Scenes, Product Spotlight, etc.)
  - `customerProblem` (specific customer situation)
  - `uniqueAngle` & `hookStrategy`
  - `visualCategory` (close_up_detail, environment_space, human_interaction, service_demonstration, process, etc.)
  - `researchInsight`
│
▼ [Stage 4: Creative Brief Construction & Diversity Check]
• File: `lib/social/creative-brief.ts` -> `buildCreativeBrief`
• Input: Strategy, Verified Facts, Historical Captions/Concepts (excludes recent angles & rejected pillars)
• Output: `CreativeBrief`
  - Single primary concept angle
  - Mandatory business name & fact usage rules
  - Hard Anti-Template rule (zero generic SaaS buzzwords)
│
▼ [Stage 5: Visual Director Brief & Negative Constraint Enforcement]
• File: `lib/social/visual-director-prompt.ts` -> `buildVisualDirectorBrief`
• Provider Boundary: `packages/ai-runtime/src/media/image-prompt.ts` -> `buildProviderReadyImagePrompt`
• Negative Prompt Guard:
  - HARD MANDATORY NEGATIVE CONSTRAINT: DO NOT DRAW, RENDER, OR INVENT ANY TEXT, WORDS, LETTERS, SLOGANS, HEADLINES, LOGOS, OR BRAND MARKS ANYWHERE IN THIS IMAGE.
  - Authentic, editorial photography only with natural lighting and realistic composition.
  - Absolutely no fake logos, invented typography, poster banners, or text overlays.
│
▼ [Stage 6: AI Image Generation Provider Call]
• File: `lib/image-generation/service.ts` -> `processImageGenerationJob`
• Input: Prompt, aspect ratio (1:1), tenant ID, brand context
• Provider: Gemini / OpenAI (Preview/Production configured)
• Output: High-resolution clean raw photograph bitmap (Uint8Array)
│
▼ [Stage 7: Deterministic Logo Compositing & Overlay Architecture]
• File: `lib/brand/logo-variant-resolver.ts` -> `resolveLogoVariantBundle` / `resolveLegacyLogoImage`
• File: `lib/social/text-overlay-render.ts` -> `renderTextOverlay` & `buildCleanLogoWatermarkSvg`
• Behavior:
  - Real verified customer logo loaded from Brand Brain / BrandGrid durable asset storage.
  - Preserves exact aspect ratio and alpha transparency.
  - Positioned as a clean, elegant watermark in the safe margin.
  - If no real logo exists: renders zero fake marks (pure clean photo).
  - Social Autopilot Default (`IMAGE TEXT = NONE`): zero lower-third blue slabs, zero poster banners.
│
▼ [Stage 8: Customer Psychology Copy Generation & Quality Scoring Gate]
• File: `lib/social/generation-loop.ts` -> `runGenerationLoop`
• File: `lib/social/quality-score.ts` -> `scoreGeneratedContent`
• File: `lib/social/visual-quality-score.ts` -> `evaluateVisualQuality`
• Hard Failure Checks:
  - `GENERIC_COPY`: Rejects banned template filler words (*"AI-powered"*, *"data-driven"*, *"grow your business"*, *"we handle the rest"*, etc.)
  - `LOW_BUSINESS_SPECIFICITY`: Requires naming verified services/products/facts
  - `TEXT_OVERLOAD_POSTER_STYLE`: Rejects images with on-image text > 40 chars or massive banners
  - `FAKE_LOGO` / `WRONG_TENANT_ASSET`: Rejects hallucinated branding
• Pass Threshold: Composite Score >= 90 / 100
│
▼ [Stage 9: Autonomous Retry Loop with Dynamic Prompt Improvement]
• If Quality Gate Fails:
  - Attempt 1 failure logged (e.g. `GENERIC_COPY` or `REPETITIVE_ANGLE`)
  - Strategy adjusted: steers to different opportunity type, forces explicit verified fact, changes camera angle
  - Max bounded retries (capped to prevent infinite loops)
│
▼ [Stage 10: Canonical Persistence & Database Linking]
• Tables Written:
  - `image_generation_jobs`: `status = "READY"`, `selected_candidate_id`
  - `social_media_assets`: stores PNG bitmap in Supabase Storage with tenant scoping
  - `content_master`: parent content idea record
  - `content_variants`: platform-ready caption, hashtags, status
  - `social_content_variant_media`: links generated asset to variant
  - `social_autopilot_queue_items`: updates `variant_id`, `status = "PREPARED"`
│
▼ [Stage 11: API Response, Cache Invalidation & Frontend UI Display]
• Endpoint: `app/api/platform/social/autopilot/route.ts` (GET & POST) -> `revalidate = 0`, `dynamic = "force-dynamic"`
• Client Surfaces:
  - `/app/content` (`ContentLibraryClient.tsx`): Synchronizes `initialItems` on prop update, displays real image preview, concept, and layout.
  - `/app/content/autopilot` (`AutopilotDashboard.tsx`): Displays upcoming scheduled posts, quality score, concept label, and approval/publish actions.
  - Survives page refresh and navigation without reverting to stale records.
```

---

## 2. Canonical Generation Metadata Schema

Every generated creative is tracked by an immutable metadata contract:

```typescript
export interface CanonicalGenerationMetadata {
  generationId: string;
  tenantId: string;
  authorizationId?: string;
  queueItemId?: string;
  strategyDay: number;
  opportunityType: string;
  visualCategory: string;
  promptVersion: string;
  provider: string;
  model: string;
  qualityScore: number;
  qualityPassed: boolean;
  logoAssetId?: string | null;
  imageAssetId?: string;
  variantId?: string;
  status: "QUEUED" | "PROCESSING" | "READY" | "FAILED" | "PREPARED" | "PUBLISHED";
  createdAt: string;
  completedAt?: string;
}
```

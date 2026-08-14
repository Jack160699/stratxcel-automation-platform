import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { listMembershipsForUser } from "@/lib/tenants/repository";
import { brandBrainPresenceChanged, buildBrandBrainContentFromAuditIntake, isBrandBrainCurrentForAudit } from "@/lib/audit/brand-brain";
import { getCurrentBrandBrain, saveBrandBrainVersion } from "@stratxcel/brand-brain";
import { resolveAuditBudgetLimitUsd } from "@stratxcel/audit-engine";
import { AUDIT_CHANNEL_TYPES, sanitizeChannels } from "@/lib/audit/v1/channels";
import { discoverPublicBusiness } from "@/lib/audit/v1/discovery";
import { selectAdaptiveQuestions, adaptiveAnswersComplete, type DiscoveredBusinessProfile } from "@/lib/audit/v1/adaptive-questions";
import {
  CONNECT_DISCOVER_VERSION,
  emptyOnboardingState,
  parseOnboardingState,
  resumeStep,
  type AuditOnboardingState,
} from "@/lib/audit/v1/onboarding-state";
import { normalizeBusinessWebsiteInput, normalizeChannelValue, UnsafeBusinessUrlError } from "@/lib/audit/v1/url";
import { field } from "@/lib/audit/v1/provenance";
import { resolveCurrentAuditOrderId } from "@/lib/audit/current-pointer";
import { normalizeWhatsAppDestination } from "@/lib/audit/v1/e164";
import { upsertAuditWhatsAppDestination } from "@/lib/audit/v1/whatsapp-destination";
import type { AuditWhatsAppOnboardingDraft } from "@/lib/audit/v1/onboarding-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function context() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: Response.json({ error: "Not authenticated" }, { status: 401 }) };
  const memberships = await listMembershipsForUser(supabase, user.id);
  if (memberships.length === 0) return { error: Response.json({ error: "No workspace" }, { status: 403 }) };
  return { user, tenantId: memberships[0]!.tenant.id, service: getTenantServiceContext().supabase };
}

async function loadCurrentOrder(service: ReturnType<typeof getTenantServiceContext>["supabase"], tenantId: string) {
  const currentOrderId = await resolveCurrentAuditOrderId(service, tenantId);
  if (currentOrderId === null) return null;
  if (typeof currentOrderId === "string") {
    const { data } = await service.from("audit_orders").select("*").eq("id", currentOrderId).maybeSingle();
    return data;
  }
  const { data } = await service.from("audit_orders").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data;
}

async function persistWhatsAppDraft(
  service: ReturnType<typeof getTenantServiceContext>["supabase"],
  tenantId: string,
  userId: string,
  draft: unknown,
): Promise<AuditWhatsAppOnboardingDraft | undefined> {
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) return undefined;
  const row = draft as Record<string, unknown>;
  const countryIso = typeof row.countryIso === "string" ? row.countryIso : "";
  const nationalNumber = typeof row.nationalNumber === "string" ? row.nationalNumber : "";
  const consent = row.consent === true;
  if (!nationalNumber.trim()) {
    return { countryIso: countryIso || "IN", nationalNumber: "", consent: false };
  }
  const normalized = normalizeWhatsAppDestination(countryIso || "IN", nationalNumber);
  if (!normalized) {
    throw Object.assign(new Error("Enter a valid WhatsApp number including the correct country code."), { code: "INVALID_WHATSAPP" });
  }
  await upsertAuditWhatsAppDestination(service, {
    tenantId,
    userId,
    destination: normalized,
    consent,
    source: "audit_onboarding",
  });
  return { countryIso: normalized.countryIso, nationalNumber: normalized.nationalNumber, consent };
}

function mergeState(order: Record<string, unknown>, patch: Partial<AuditOnboardingState>): AuditOnboardingState {
  const current = parseOnboardingState(order.deep_dive_answers) ?? emptyOnboardingState();
  return { ...current, ...patch, updatedAt: new Date().toISOString() };
}

async function syncBrandBrainPresence(
  service: ReturnType<typeof getTenantServiceContext>["supabase"],
  input: { tenantId: string; userId: string; order: Record<string, unknown>; state: AuditOnboardingState },
): Promise<void> {
  if (!input.state.websiteUrl && input.state.channels.every((channel) => !channel.value)) return;
  const existingBrain = await getCurrentBrandBrain(service, input.tenantId);
  const mapped = {
    id: input.order.id,
    business_name: input.state.profile?.name?.value ?? input.order.business_name,
    industry: input.state.profile?.category?.value ?? input.order.industry,
    website_url: input.state.websiteUrl,
    social_links: input.state.channels.filter((channel) => channel.value).map((channel) => channel.value),
    deep_dive_answers: {
      intakeMeta: { questionnaireVersion: CONNECT_DISCOVER_VERSION, updatedAt: input.state.updatedAt },
      v1Experience: input.state,
    },
  };
  const next = buildBrandBrainContentFromAuditIntake(mapped, existingBrain?.content ?? null);
  if (!brandBrainPresenceChanged(existingBrain?.content ?? null, next)) return;
  await saveBrandBrainVersion(service, {
    tenantId: input.tenantId,
    content: next,
    createdBy: input.userId,
  });
}

async function persist(service: ReturnType<typeof getTenantServiceContext>["supabase"], order: Record<string, unknown>, state: AuditOnboardingState, extras: Record<string, unknown> = {}) {
  const deepDive = {
    ...(typeof order.deep_dive_answers === "object" && order.deep_dive_answers ? order.deep_dive_answers as Record<string, unknown> : {}),
    intakeMeta: { questionnaireVersion: CONNECT_DISCOVER_VERSION, updatedAt: state.updatedAt, lastStepId: state.step },
    v1Experience: state,
  };
  const profileName = state.profile?.name?.value;
  await service.from("audit_orders").update({
    deep_dive_answers: deepDive,
    website_url: state.websiteUrl || order.website_url,
    business_name: profileName && order.business_name === "Pending — completed in intake" ? profileName : order.business_name,
    social_links: state.channels.filter((channel) => !channel.notAvailable && channel.value).map((channel) => channel.value),
    updated_at: new Date().toISOString(),
    ...extras,
  }).eq("id", order.id);
}

export async function POST(request: Request) {
  const ctx = await context();
  if ("error" in ctx) return ctx.error;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "";
  const order = await loadCurrentOrder(ctx.service, ctx.tenantId);
  if (!order && action !== "start_fresh") {
    return Response.json({ error: "No Audit in progress" }, { status: 404 });
  }

  if (action === "start_fresh") {
    const { data, error } = await ctx.service.rpc("claim_fresh_product_grant_audit_v1", {
      p_tenant_id: ctx.tenantId,
      p_actor_user_id: ctx.user.id,
    });
    const claimed = data as { success?: boolean; audit_order_id?: string; reused?: boolean } | null;
    if (error || !claimed?.success) {
      return Response.json({ error: "A new free Audit is not available right now." }, { status: 409 });
    }
    return Response.json({ ok: true, auditOrderId: claimed.audit_order_id, reused: claimed.reused });
  }

  const current = order as Record<string, unknown>;
  if (current.status !== "paid" && current.status !== "in_review") {
    return Response.json({ error: "This Audit cannot be edited." }, { status: 409 });
  }

  try {
    if (action === "save_connect") {
      const websiteUrl = normalizeBusinessWebsiteInput(String(body.websiteUrl ?? ""));
      const channels = sanitizeChannels(body.channels).map((channel) => ({
        ...channel,
        value: channel.notAvailable ? "" : channel.value ? normalizeChannelValue(channel.type, channel.value) : "",
      }));
      const state = mergeState(current, { step: "connect", websiteUrl, channels });
      await persist(ctx.service, current, state);
      await syncBrandBrainPresence(ctx.service, { tenantId: ctx.tenantId, userId: ctx.user.id, order: current, state });
      return Response.json({ ok: true, state: { ...state, step: resumeStep(state) } });
    }

    if (action === "discover") {
      const websiteUrl = normalizeBusinessWebsiteInput(String(body.websiteUrl ?? parseOnboardingState(current.deep_dive_answers)?.websiteUrl ?? ""));
      const discovering = mergeState(current, { step: "discovering", websiteUrl });
      await persist(ctx.service, current, discovering);

      let profile: DiscoveredBusinessProfile = { websiteUrl };
      let coverage: Record<string, boolean> = {};

      try {
        const packet = await discoverPublicBusiness({ websiteUrl });
        profile = packet.profile;
        coverage = packet.coverage;
        try {
          await ctx.service.from("audit_discovery_snapshots").insert({
            audit_order_id: current.id,
            tenant_id: ctx.tenantId,
            website_url: packet.websiteUrl,
            packet,
          });
        } catch {
          // Non-fatal
        }
      } catch (err) {
        console.warn("Standard discovery error, recovering with Brand Brain context:", err);
        const brain = await getCurrentBrandBrain(ctx.service, ctx.tenantId).catch(() => null);
        if (brain?.content) {
          const c = brain.content;
          profile = {
            websiteUrl,
            name: typeof c.business_name === "string" && c.business_name ? field(c.business_name, "CUSTOMER_PROVIDED") : undefined,
            category: typeof c.industry === "string" && c.industry ? field(c.industry, "CUSTOMER_PROVIDED") : undefined,
            location: typeof c.location === "string" && c.location ? field(c.location, "CUSTOMER_PROVIDED") : undefined,
            offer: typeof c.description === "string" && c.description ? field(c.description, "CUSTOMER_PROVIDED") : undefined,
            positioning: typeof c.tone_of_voice === "string" && c.tone_of_voice ? field(c.tone_of_voice, "CUSTOMER_PROVIDED") : undefined,
          };
        }
      }

      const state = mergeState(current, {
        step: "verify",
        websiteUrl: profile.websiteUrl || websiteUrl,
        profile,
      });
      await persist(ctx.service, current, state, { website_url: state.websiteUrl });
      await syncBrandBrainPresence(ctx.service, { tenantId: ctx.tenantId, userId: ctx.user.id, order: current, state });
      return Response.json({
        ok: true,
        state,
        questions: selectAdaptiveQuestions(profile),
        coverage,
      });
    }

    if (action === "continue_anyway") {
      const existing = parseOnboardingState(current.deep_dive_answers) ?? emptyOnboardingState();
      const brain = await getCurrentBrandBrain(ctx.service, ctx.tenantId).catch(() => null);
      const c = brain?.content;
      const resolvedWebsite = typeof existing.websiteUrl === "string" && existing.websiteUrl.trim()
        ? existing.websiteUrl
        : typeof current.website_url === "string" && current.website_url.trim()
          ? current.website_url
          : typeof c?.website_url === "string" && c.website_url.trim()
            ? c.website_url
            : "";
      const profile: DiscoveredBusinessProfile = existing.profile ?? {
        websiteUrl: resolvedWebsite,
        name: typeof c?.business_name === "string" && c.business_name ? field(c.business_name, "CUSTOMER_PROVIDED") : field(typeof current.business_name === "string" ? current.business_name : "My Business", "CUSTOMER_PROVIDED"),
        category: typeof c?.industry === "string" && c.industry ? field(c.industry, "CUSTOMER_PROVIDED") : field(typeof current.industry === "string" ? current.industry : "", "CUSTOMER_PROVIDED"),
        location: typeof c?.location === "string" && c.location ? field(c.location, "CUSTOMER_PROVIDED") : undefined,
        offer: typeof c?.description === "string" && c.description ? field(c.description, "CUSTOMER_PROVIDED") : undefined,
        positioning: typeof c?.tone_of_voice === "string" && c.tone_of_voice ? field(c.tone_of_voice, "CUSTOMER_PROVIDED") : undefined,
      };
      const state = mergeState(current, {
        step: "verify",
        websiteUrl: resolvedWebsite,
        profile,
      });
      await persist(ctx.service, current, state);
      return Response.json({ ok: true, state, questions: selectAdaptiveQuestions(profile) });
    }

    if (action === "verify") {
      const existing = parseOnboardingState(current.deep_dive_answers) ?? emptyOnboardingState();
      const edits = body.profile && typeof body.profile === "object" ? body.profile as Record<string, unknown> : {};
      const profile = { ...existing.profile };
      for (const [key, value] of Object.entries(edits)) {
        if (typeof value === "string" && value.trim()) {
          (profile as Record<string, unknown>)[key] = field(value.trim(), "CUSTOMER_PROVIDED", undefined, true);
        }
      }
      const state = mergeState(current, { step: "questions", verified: true, profile });
      await persist(ctx.service, current, state, {
        business_name: profile.name?.value ?? current.business_name,
        industry: profile.category?.value ?? current.industry,
      });
      return Response.json({ ok: true, state, questions: selectAdaptiveQuestions(profile) });
    }

    if (action === "save_answers") {
      const existing = parseOnboardingState(current.deep_dive_answers) ?? emptyOnboardingState();
      const adaptiveAnswers = {
        ...existing.adaptiveAnswers,
        ...(body.answers && typeof body.answers === "object" ? body.answers as Record<string, string> : {}),
      };
      const questions = selectAdaptiveQuestions(existing.profile ?? {});
      const complete = adaptiveAnswersComplete(questions, adaptiveAnswers);
      let whatsappDelivery = existing.whatsappDelivery;
      try {
        const saved = await persistWhatsAppDraft(ctx.service, ctx.tenantId, ctx.user.id, body.whatsappDelivery ?? existing.whatsappDelivery);
        if (saved) whatsappDelivery = saved.nationalNumber ? saved : undefined;
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "INVALID_WHATSAPP") {
          return Response.json({ error: error instanceof Error ? error.message : "Enter a valid WhatsApp number." }, { status: 400 });
        }
        throw error;
      }
      const state = mergeState(current, {
        adaptiveAnswers,
        whatsappDelivery,
        step: complete ? "brain" : "questions",
      });
      await persist(ctx.service, current, state, {
        goals_answers: {
          primaryGoal: adaptiveAnswers.ninetyDayResult,
          successDefinition: adaptiveAnswers.ninetyDayResult,
          biggestObstacle: adaptiveAnswers.biggestGrowthProblem,
        },
      });
      return Response.json({ ok: true, state, complete });
    }

    if (action === "finalize") {
      const state = parseOnboardingState(current.deep_dive_answers);
      if (!state?.verified) return Response.json({ error: "Verify your business first." }, { status: 409 });
      const questions = selectAdaptiveQuestions(state.profile ?? {});
      if (!adaptiveAnswersComplete(questions, state.adaptiveAnswers)) {
        return Response.json({ error: "A few questions still need an answer." }, { status: 409 });
      }
      const existingBrain = await getCurrentBrandBrain(ctx.service, ctx.tenantId);
      const mappedOrder = {
        id: current.id,
        business_name: state.profile?.name?.value ?? current.business_name,
        industry: state.profile?.category?.value ?? current.industry,
        website_url: state.websiteUrl,
        social_links: state.channels.filter((channel) => channel.value).map((channel) => channel.value),
        deep_dive_answers: {
          intakeMeta: { questionnaireVersion: CONNECT_DISCOVER_VERSION, updatedAt: new Date().toISOString() },
          v1Experience: state,
          businessDescription: state.profile?.positioning?.value,
          location: state.profile?.location?.value,
          majorProducts: state.profile?.services?.value?.join("\n"),
          priorityOffering: state.adaptiveAnswers.priorityOffering || state.profile?.offer?.value,
          customerSegments: state.adaptiveAnswers.idealCustomer ? [state.adaptiveAnswers.idealCustomer] : [],
          reasonsChosen: state.profile?.differentiators?.value ?? [],
          biggestProblem: state.adaptiveAnswers.biggestGrowthProblem,
        },
        goals_answers: {
          primaryGoal: state.adaptiveAnswers.ninetyDayResult,
          successDefinition: state.adaptiveAnswers.ninetyDayResult,
        },
      };
      if (!isBrandBrainCurrentForAudit(mappedOrder, existingBrain?.content ?? {})) {
        await saveBrandBrainVersion(ctx.service, {
          tenantId: ctx.tenantId,
          content: buildBrandBrainContentFromAuditIntake(mappedOrder, existingBrain?.content ?? null),
          createdBy: ctx.user.id,
        });
      }
      const brain = await getCurrentBrandBrain(ctx.service, ctx.tenantId);
      if (process.env.AUDIT_AUTOMATION_ENABLED === "true" && brain) {
        const started = await ctx.service.rpc("start_automatic_audit_generation_v1", {
          p_audit_order_id: current.id,
          p_expected_tenant_id: ctx.tenantId,
          p_brand_brain_version: brain.current_version,
          p_budget_limit_usd: resolveAuditBudgetLimitUsd(),
        });
        const result = started.data as { success?: boolean } | null;
        if (started.error || result?.success !== true) {
          await ctx.service.from("audit_orders").update({ status: "in_review", updated_at: new Date().toISOString() }).eq("id", current.id);
        }
      } else {
        await ctx.service.from("audit_orders").update({ status: "in_review", updated_at: new Date().toISOString() }).eq("id", current.id);
      }
      const generating = mergeState(current, { step: "generating" });
      await persist(ctx.service, current, generating);
      return Response.json({ ok: true, started: true });
    }
  } catch (error) {
    if (error instanceof UnsafeBusinessUrlError) {
      return Response.json({ error: error.message, code: error.code }, { status: 400 });
    }
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "INVALID_WHATSAPP") {
      return Response.json({ error: error instanceof Error ? error.message : "Enter a valid WhatsApp number." }, { status: 400 });
    }
    console.error("audit onboarding failed", error instanceof Error ? error.message : error);
    return Response.json({ error: "Could not save this step. Please try again." }, { status: 500 });
  }

  return Response.json({ error: `Unknown action. Supported channels: ${AUDIT_CHANNEL_TYPES.join(", ")}` }, { status: 400 });
}

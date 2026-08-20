import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { createTenantAIRuntime, resolveTenantMonthSpendUsd, resolveTenantPlanTier } from "@stratxcel/ai-runtime";
import { recordAuditEvent } from "@stratxcel/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;
const ipRequestCounts = new Map<string, { count: number; expiresAt: number }>();

function checkRateLimit(clientIp: string): boolean {
  const now = Date.now();
  const entry = ipRequestCounts.get(clientIp);
  if (!entry || now > entry.expiresAt) {
    ipRequestCounts.set(clientIp, { count: 1, expiresAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }
  entry.count++;
  return true;
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id: siteProjectId } = await params;

    // Rate limit check
    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anonymous";
    if (!checkRateLimit(clientIp)) {
      return Response.json({ error: "Too many requests. Please wait a moment before sending another message." }, { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    const { message, conversationHistory = [], visitorEmail, visitorName } = body;

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return Response.json({ error: "message string is required" }, { status: 400 });
    }

    // Input length limit to prevent abuse and excessive token consumption
    if (message.length > 500) {
      return Response.json({ error: "Message exceeds maximum length of 500 characters." }, { status: 400 });
    }

    const sanitizedMessage = message.trim().slice(0, 500);

    const serviceDb = createSupabaseServiceClient();

    // 1. Fetch the website project and its agent config
    const { data: project } = await serviceDb
      .from("site_projects")
      .select("*, website_agents(*)")
      .eq("id", siteProjectId)
      .maybeSingle();

    if (!project) {
      return Response.json({ error: "Website project not found" }, { status: 404 });
    }

    const agent = Array.isArray(project.website_agents)
      ? project.website_agents[0]
      : project.website_agents;

    if (!agent) {
      return Response.json({ error: "AI agent is not configured for this website" }, { status: 400 });
    }

    const tenantId = project.tenant_id;

    // 2. Fetch products if ecommerce enabled for context grounding
    const { data: products } = await serviceDb
      .from("website_products")
      .select("name, price_cents, description, slug")
      .eq("site_project_id", siteProjectId)
      .eq("status", "active")
      .limit(10);

    const productContext = products && products.length > 0
      ? `\nAvailable Products in Catalog:\n` +
        products
          .map((p: { name: string; price_cents: number; description?: string }) =>
            `- ${p.name}: ₹${(p.price_cents / 100).toFixed(2)}${p.description ? ` (${p.description})` : ""}`)
          .join("\n")
      : "";

    // 3. Resolve AI runtime
    const [planTier, spentUsd] = await Promise.all([
      resolveTenantPlanTier(serviceDb as any, tenantId),
      resolveTenantMonthSpendUsd(serviceDb as any, tenantId),
    ]);

    const { runtime: aiRuntime, budgetEnvelope } = createTenantAIRuntime({
      tenantId,
      plan: planTier,
      spentUsdThisMonth: spentUsd,
      internalWriteClient: serviceDb,
    });

    const systemPrompt = `${agent.system_instructions || "You are an AI assistant."}\n${productContext}\n
If the user provides an email or wants follow-up, acknowledge it politely and note that a representative will reach out.`;

    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...conversationHistory.slice(-6).map((m: { role: string; content: string }) => ({
        role: m.role === "user" ? ("user" as const) : ("assistant" as const),
        content: m.content,
      })),
      { role: "user" as const, content: sanitizedMessage },
    ];

    const aiResult = await aiRuntime.execute({
      tenantId,
      taskClass: "SALES_CONVERSION",
      messages,
      budgetEnvelope,
      timeoutMs: 30_000,
    });

    const responseText = aiResult.ok
      ? aiResult.text
      : "I apologize, but I am currently unavailable. Please reach out to our team directly via our contact form.";

    // 4. Update agent conversation stats
    await serviceDb
      .from("website_agents")
      .update({
        conversation_count: (agent.conversation_count || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", agent.id);

    // 5. Track AI usage
    try {
      await serviceDb.from("website_usage_tracking").insert({
        site_project_id: siteProjectId,
        tenant_id: tenantId,
        event_type: "ai_agent_conversation",
        ai_input_tokens: aiResult.inputTokens || 0,
        ai_output_tokens: aiResult.outputTokens || 0,
        estimated_cost_usd: aiResult.estimatedCostUsd || 0,
        provider: aiResult.provider || "google",
        model: aiResult.model || "gemini-3.6-flash",
        metadata: { visitorEmail: visitorEmail || null },
      });
    } catch {
      // non-blocking
    }

    // 6. If visitor provided contact info, capture lead
    if (visitorEmail) {
      try {
        await serviceDb.from("leads").insert({
          tenant_id: tenantId,
          email: visitorEmail,
          name: visitorName || null,
          source: `website_agent:${project.name}`,
          status: "new",
        });
      } catch {
        // non-blocking
      }
    }

    return Response.json({
      reply: responseText,
      agentName: agent.name,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to process chat message";
    return Response.json({ error: msg }, { status: 500 });
  }
}

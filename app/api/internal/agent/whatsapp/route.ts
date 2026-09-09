import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { normalizePhoneNumber, sendOutboundWhatsAppToRecipient, type AgentChannelRecipientContext, type ServiceClient } from "@stratxcel/whatsapp";
import {
  isInternalAgentEndpointEnabled,
  verifyAgentChannelRequest,
  parseCommand,
  resolveWhatsAppPrincipal,
  touchPrincipalLastUsed,
  handleLinkCommand,
  handleWhoAmI,
  handleReset,
  handleConfirm,
  handleCancel,
  handleHelp,
  runAgentTurn,
  formatAgentReply,
} from "@stratxcel/agent-core";
import { createAgentCoreProviderAdapter } from "@/lib/agent-core/provider-adapter";
import { loadOwnerBrainKnowledge } from "@/lib/agent-core/owner-brain-context";
import { ALL_EXTRA_TOOLS } from "@/lib/agent-core/all-tools";
import { AGENT_FACTORY_TOOLS } from "@/lib/agent-core/agent-factory-tools";
import { resolveAgentDispatch } from "@/lib/agent-core/agent-dispatch";
import { decideWhatsAppSocialMission, downloadWhatsAppMedia, runWhatsAppSocialMission } from "@/lib/social/whatsapp-bridge";
import { createNormalizedAttachment } from "@stratxcel/hermes";
import {
  analyzeImage,
  analyzeDocumentFile,
  analyzeWebsiteLink,
  transcribeAudioFile,
  decomposeNaturalLanguageIntent,
  executeDecomposedPlan,
} from "@stratxcel/connectors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A real website analysis (analyze_website) makes several real, sequential
// HTTP fetches against a third-party host -- well past the 10s default.
// Vercel caps this to whatever the plan actually allows; this is a ceiling,
// not a promise every turn takes this long.
export const maxDuration = 60;

/** WhatsApp's full extra-tool set -- lib/agent-core/all-tools.ts's
 *  ALL_EXTRA_TOOLS, the ONE shared source of truth also used by Admin/
 *  Client Web Copilot (lib/agent-core/copilot-actions.ts), plus the Agent
 *  Factory governance tools. Used everywhere a tool set is needed below
 *  (capability listings AND the actual agent turn) so WHOAMI/HELP never
 *  claims a capability the turn itself doesn't have. A single shared array
 *  across both channels -- this file previously maintained its own,
 *  independent literal that had already drifted from copilot-actions.ts's
 *  (see all-tools.ts's header comment for the exact drift found and fixed
 *  2026-09-02). */
const EXTRA_TOOLS = [...ALL_EXTRA_TOOLS, ...AGENT_FACTORY_TOOLS];

/**
 * Private, HMAC-authenticated endpoint for the WhatsApp agent channel. NOT a
 * browser/client endpoint — called by the AWS WhatsApp worker
 * (apps/whatsapp-worker/src/agent-channel-router.ts), behind
 * WHATSAPP_AGENT_CHANNEL_ENABLED.
 *
 * Trust boundary: the caller supplies only channel FACTS (senderPhone,
 * providerMessageId, text, phoneBindingId, timestamp, messageType) — never
 * tenantId, role, or principal type. All of that is resolved server-side
 * from the sender's verified phone link (resolveWhatsAppPrincipal).
 *
 * OUTBOUND DELIVERY (Blocker A): every reply below — deterministic command
 * acks and real Agent turns alike — is actually sent over WhatsApp from
 * here, via the same hardened choke point (@stratxcel/whatsapp's
 * sendOutboundWhatsAppToRecipient, sharing its preflight/adapter/idempotency
 * machinery with sendOutboundWhatsAppMessage). The HTTP response back to the
 * worker is only ever a post-hoc report of what already happened — the
 * worker itself performs no Meta calls and needs no Meta credentials.
 */

interface AgentChannelRequestBody {
  senderPhone?: unknown;
  providerMessageId?: unknown;
  text?: unknown;
  phoneBindingId?: unknown;
  timestamp?: unknown;
  messageType?: unknown;
  mediaId?: unknown;
  mimeType?: unknown;
}

function validateBody(body: AgentChannelRequestBody): string | null {
  if (typeof body.senderPhone !== "string" || !body.senderPhone) return "senderPhone required";
  if (typeof body.providerMessageId !== "string" || !body.providerMessageId) return "providerMessageId required";
  if (typeof body.text !== "string") return "text required";
  if (body.text.length > 4000) return "text too large";
  if (body.phoneBindingId !== undefined && body.phoneBindingId !== null && typeof body.phoneBindingId !== "string") {
    return "phoneBindingId must be a string";
  }
  if (body.messageType !== undefined && body.messageType !== null && typeof body.messageType !== "string") {
    return "messageType must be a string";
  }
  if (body.mediaId !== undefined && body.mediaId !== null && typeof body.mediaId !== "string") return "mediaId must be a string";
  if (body.mimeType !== undefined && body.mimeType !== null && typeof body.mimeType !== "string") return "mimeType must be a string";
  return null;
}

const UNAVAILABLE_TEXT = "Stratxcel Agent is temporarily unavailable. Please try again shortly or use the dashboard.";

/** WhatsApp text messages are capped around 4096 chars — chunk with a
 *  little headroom and prefer breaking on whitespace over mid-word. */
function chunkForWhatsApp(text: string, maxLen = 4000): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > maxLen) {
    let cut = rest.lastIndexOf(" ", maxLen);
    if (cut <= 0) cut = maxLen;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

export async function POST(request: Request) {
  if (!isInternalAgentEndpointEnabled()) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const rawBody = await request.text();

  const auth = verifyAgentChannelRequest({
    rawBody,
    timestampHeader: request.headers.get("x-stratxcel-timestamp"),
    nonceHeader: request.headers.get("x-stratxcel-nonce"),
    signatureHeader: request.headers.get("x-stratxcel-signature"),
  });
  if (!auth.ok) {
    // PHASE HMAC requirement: replay gets a distinct status (409); every
    // other failure mode looks identical to the caller (401) — never
    // distinguish "not configured" from "bad signature".
    if (auth.reason === "replayed_nonce") {
      return Response.json({ error: "conflict" }, { status: 409 });
    }
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: AgentChannelRequestBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body || typeof body !== "object") return Response.json({ error: "invalid_body" }, { status: 400 });

  const schemaError = validateBody(body);
  if (schemaError) return Response.json({ error: schemaError }, { status: 400 });

  const senderPhone = body.senderPhone as string;
  const providerMessageId = body.providerMessageId as string;
  let text = (body.text as string) || "";
  const messageType = typeof body.messageType === "string" ? body.messageType : "text";
  const mediaId = typeof body.mediaId === "string" ? body.mediaId : null;
  const mimeType = typeof body.mimeType === "string" ? body.mimeType : null;
  const phoneBindingId = typeof body.phoneBindingId === "string" ? body.phoneBindingId : null;

  const normalizedPhoneRaw = normalizePhoneNumber(senderPhone);
  if (!normalizedPhoneRaw) return Response.json({ error: "invalid_sender_phone" }, { status: 400 });
  const normalizedPhone: string = normalizedPhoneRaw;

  const { supabase } = getTenantServiceContext();

  // Every reply below needs to know which WABA number to reply FROM — the
  // exact binding that received this inbound message (agent-channel-router.ts
  // always includes it). Without it there is nowhere safe to send a reply
  // from, so this degrades to "unavailable" (no send attempted at all)
  // rather than guessing a binding.
  if (!phoneBindingId) {
    return Response.json({ outcome: "unavailable", text: UNAVAILABLE_TEXT }, { headers: { "Cache-Control": "no-store" } });
  }
  // Re-bound to a definitely-non-null const: TS does not narrow a captured
  // outer variable's type across a nested closure, even one defined right
  // after the guard above.
  const verifiedPhoneBindingId: string = phoneBindingId;

  /**
   * Sends `text` over WhatsApp via the one hardened outbound choke point
   * (sendOutboundWhatsAppToRecipient) and returns the HTTP response the
   * worker gets back — a post-hoc report, since the send has already
   * happened by the time this returns. Splits into multiple messages (each
   * with its own idempotency-key suffix :0/:1/:2/...) only if `text`
   * exceeds WhatsApp's single-message limit. Empty `text` (e.g. a
   * duplicate-run no-op) sends nothing and reports an empty reply.
   */
  async function sendAgentReply(
    replyText: string,
    recipientContext: AgentChannelRecipientContext,
    options?: { principalTenantId?: string | null; agentRunId?: string | null; to?: string; interactiveButtons?: Array<{ id: string; title: string }> }
  ): Promise<Response> {
    if (!replyText) {
      return Response.json({ outcome: "reply", text: "" }, { headers: { "Cache-Control": "no-store" } });
    }
    const chunks = chunkForWhatsApp(replyText);
    for (let i = 0; i < chunks.length; i += 1) {
      const outcome = await sendOutboundWhatsAppToRecipient(supabase as ServiceClient, {
        phoneBindingId: verifiedPhoneBindingId,
        to: options?.to ?? normalizedPhone,
        body: chunks[i],
        idempotencyKey: `whatsapp_agent_reply:${providerMessageId}:${i}`,
        recipientContext,
        principalTenantId: options?.principalTenantId ?? null,
        agentRunId: options?.agentRunId ?? null,
        interactiveButtons: i === 0 ? options?.interactiveButtons : undefined,
      } as never);
      if (!outcome.ok) {
        // Send genuinely failed (kill switch, disabled integration, adapter
        // error, ...) — report honestly rather than claiming delivery.
        return Response.json({ outcome: "unavailable", text: UNAVAILABLE_TEXT }, { headers: { "Cache-Control": "no-store" } });
      }
    }
    return Response.json({ outcome: "reply", text: replyText }, { headers: { "Cache-Control": "no-store" } });
  }

  // PHASE 23: text-only v1. Non-text messages get a typed response and are
  // never analyzed — existing prospect media behavior is untouched because
  // this endpoint only ever runs for a message the worker already decided
  // to route here (behind the still-default-off feature flag).
  // Deterministic command parsing happens BEFORE principal resolution
  // matters for LINK specifically, because LINK is how an UNLINKED sender
  // becomes linked — see command-parser.ts's header comment for why this
  // ordering (parse before any LLM) is a security requirement in general.
  const parsed = parseCommand(text);

  if (parsed.kind === "link") {
    const reply = await handleLinkCommand(supabase, normalizedPhone, parsed.code, EXTRA_TOOLS);
    // No resolved principal yet at this exact instant (and no tenantId to
    // attribute an audit event to even for a client link — resolving it
    // again here would be redundant work for a one-line ack) — sent as an
    // unlinked_reply; the link itself is separately audited by
    // handleLinkCommand -> auditPrincipalLinked.
    return sendAgentReply(reply, { kind: "unlinked_reply" });
  }

  // A malformed LINK attempt ("LINK", "LINK ADMIN" with no/bad code) is
  // clearly a pairing attempt, not a sales inquiry — worth a helpful nudge
  // even for a still-unlinked sender, rather than silently falling through
  // to the prospect flow. The nudge text discloses nothing sender-specific.
  if (parsed.kind === "malformed" && parsed.attempted === "link") {
    return sendAgentReply(formatAgentReply({ text: "That LINK command doesn't look right. Send HELP for the exact format." }), { kind: "unlinked_reply" });
  }

  const resolution = await resolveWhatsAppPrincipal(supabase, normalizedPhone, "whatsapp");

  if (resolution.status !== "resolved") {
    // Covers BOTH "never linked" and "revoked" — the caller (AWS worker)
    // cannot distinguish the two, and neither creates a principal here.
    // The worker keeps this sender in the existing prospect/CRM flow.
    if (parsed.kind === "whoami") {
      return sendAgentReply(handleWhoAmI(resolution), { kind: "unlinked_reply" });
    }
    return Response.json({ outcome: "unlinked" }, { headers: { "Cache-Control": "no-store" } });
  }

  const principal = resolution.principal;
  await touchPrincipalLastUsed(supabase, normalizedPhone);
  const recipientContext: AgentChannelRecipientContext = { kind: "channel_principal", authUserId: principal.authUserId };
  const principalTenantId = principal.tenantId;

  // Agent Factory dispatch: "AGENT:<key>: <message>" routes this turn to a
  // dynamically-defined agent's narrower tool set. Checked before the
  // sx-social/social-mission heuristics below on purpose -- an explicit
  // dispatch prefix is unambiguous and must never be swallowed by the loose
  // keyword-based social-mission detector (a dispatched message's own text
  // could legitimately contain a word like "post"). A resolved dispatch
  // skips the social-mission branch entirely; parseCommand's own patterns
  // never match this prefix, so RESET/CONFIRM/CANCEL/WHOAMI/HELP below are
  // unaffected either way.
  const dispatch = await resolveAgentDispatch(supabase, text);
  if (dispatch.dispatchError) {
    return sendAgentReply(formatAgentReply({ text: dispatch.dispatchError }), recipientContext, { principalTenantId });
  }

  if (!dispatch.agentDefinitionKey && text.startsWith("sx-social:")) {
    const [, operation, token] = text.split(":", 3);
    if ((operation === "approve" || operation === "cancel") && token) {
      try {
        const decided = await decideWhatsAppSocialMission({ supabase, principal, token, operation });
        return sendAgentReply(decided.text, recipientContext, { principalTenantId });
      } catch {
        return sendAgentReply("This action expired or does not belong to your account. Open the latest preview and try again.", recipientContext, { principalTenantId });
      }
    }
    if (operation === "edit" && token) {
      const base = process.env.NEXT_PUBLIC_SITE_URL || "https://stratxcel.in";
      return sendAgentReply(`Edit this exact prepared mission: ${base}/api/social/copilot/whatsapp-handoff?token=${encodeURIComponent(token)}`, recipientContext, { principalTenantId });
    }
  }

  const isSocialMission =
    !dispatch.agentDefinitionKey &&
    (/\b(?:post\s+this|publish|post\s+kar|ready\s+karo)\b/i.test(text) ||
      ((messageType !== "text" || mediaId) && /\b(?:post|social|instagram|insta|facebook|threads|youtube|caption|carousel|reel)\b/i.test(text)));
  if (isSocialMission) {
    try {
      const result = await runWhatsAppSocialMission({ supabase, principal, normalizedPhone, phoneBindingId: verifiedPhoneBindingId, providerMessageId, kind: messageType, body: text, mediaId, mimeType });
      const controls = `\n\nView Preview: ${result.previewUrl}\nApprove · Edit · Cancel`;
      const response = await sendAgentReply(`${result.text}${controls}`, recipientContext, {
        principalTenantId,
        interactiveButtons: [
          { id: `sx-social:approve:${result.approveToken}`, title: result.shadowMode ? "Approve shadow" : "Approve" },
          { id: `sx-social:edit:${result.editToken}`, title: "Edit" },
          { id: `sx-social:cancel:${result.cancelToken}`, title: "Cancel" },
        ],
      });
      const responseBody = await response.json() as Record<string, unknown>;
      return Response.json({ ...responseBody, social: { previewUrl: result.previewUrl, approveToken: result.approveToken, editToken: result.editToken, cancelToken: result.cancelToken, shadowMode: result.shadowMode } }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      const reply = error instanceof Error && /credential|configured/i.test(error.message)
        ? "WhatsApp media is not configured for this workspace yet. Connect the media credential and try again."
        : error instanceof Error && /ambiguous/.test(error.message)
          ? "Your WhatsApp identity is linked to more than one client workspace. Open Stratxcel and select the correct workspace before trying again."
        : "I couldn't prepare that Social Copilot mission. Nothing was published. Please try again or use the dashboard.";
      return sendAgentReply(reply, recipientContext, { principalTenantId });
    }
  }

  // Multimodal Media Ingress (Part 1, 2, 5)
  if (messageType !== "text" || mediaId) {
    try {
      let mediaBuffer: Buffer;
      let effectiveMime = (mimeType as string) || (messageType === "image" ? "image/jpeg" : messageType === "video" ? "video/mp4" : messageType === "audio" || messageType === "voice" ? "audio/ogg" : "application/pdf");
      let mediaFilename = `whatsapp_${mediaId || Date.now()}.${messageType === "image" ? "jpg" : messageType === "video" ? "mp4" : messageType === "audio" || messageType === "voice" ? "ogg" : "pdf"}`;

      if (mediaId) {
        try {
          const downloaded = await downloadWhatsAppMedia(mediaId);
          mediaBuffer = downloaded.bytes;
          effectiveMime = downloaded.mimeType || effectiveMime;
          mediaFilename = downloaded.name || mediaFilename;
        } catch (dErr) {
          console.warn("[whatsapp-route] media download fallback:", dErr);
          mediaBuffer = Buffer.from(`WHATSAPP_INGRESS_MEDIA_${mediaId}`);
        }
      } else {
        mediaBuffer = Buffer.from(`WHATSAPP_INGRESS_MEDIA_${providerMessageId}`);
      }

      const attachment = createNormalizedAttachment({
        messageId: providerMessageId,
        channel: "whatsapp",
        mimeType: effectiveMime,
        filename: mediaFilename,
        tenantId: principalTenantId || "tenant-default",
        senderId: normalizedPhone,
        source: "inbound_upload",
        buffer: mediaBuffer,
      });

      if (messageType === "audio" || messageType === "voice" || effectiveMime.startsWith("audio/")) {
        const transcription = await transcribeAudioFile({ attachment });
        if (transcription.text && transcription.text.trim().length > 0) {
          text = transcription.text.trim();
          dispatch.userText = text;
          const audioParsed = parseCommand(text);
          if (audioParsed.kind === "whoami") {
            return sendAgentReply(handleWhoAmI(resolution, EXTRA_TOOLS), recipientContext, { principalTenantId });
          }
          if (audioParsed.kind === "help") {
            return sendAgentReply(handleHelp(principal, EXTRA_TOOLS), recipientContext, { principalTenantId });
          }
          if (audioParsed.kind === "reset") {
            const reply = await handleReset(supabase, principal);
            return sendAgentReply(reply, recipientContext, { principalTenantId });
          }
          if (audioParsed.kind === "confirm") {
            const { reply } = await handleConfirm(supabase, principal, audioParsed.code, EXTRA_TOOLS);
            return sendAgentReply(reply, recipientContext, { principalTenantId });
          }
          if (audioParsed.kind === "cancel") {
            const reply = await handleCancel(supabase, principal, audioParsed.code);
            return sendAgentReply(reply, recipientContext, { principalTenantId });
          }
        } else {
          return sendAgentReply(
            "I received your voice note, but couldn't transcribe the audio clearly. Could you record again or type your message?",
            recipientContext,
            { principalTenantId }
          );
        }
      } else if (messageType === "image" || effectiveMime.startsWith("image/")) {
        const hasSpecificInstructions = text && text.trim().length > 0 && !/^(?:hi|hello|hey|see\s+this|look|check\s+this)$/i.test(text.trim());
        if (!hasSpecificInstructions) {
          const reply = "I can work with this.\n\n1. Analyze Design\n2. Improve Visuals\n3. Use in Website";
          return sendAgentReply(reply, recipientContext, {
            principalTenantId,
            interactiveButtons: [
              { id: "action:image:analyze", title: "Analyze Design" },
              { id: "action:image:improve", title: "Improve Visuals" },
              { id: "action:image:website", title: "Use in Website" },
            ],
          });
        }

        const analysis = await analyzeImage({ attachment, query: text });
        const visualPoints = (analysis.visualElements || []).slice(0, 2).map((e) => `• ${e}`).join("\n");
        const reply = `🔍 *Visual Analysis: ${attachment.filename}*\n\n${analysis.summary}${visualPoints ? `\n\n${visualPoints}` : ""}\n\n1. Improve Visuals\n2. Create New Version\n3. Use in Website`;
        return sendAgentReply(reply, recipientContext, {
          principalTenantId,
          interactiveButtons: [
            { id: "action:image:improve", title: "Improve Visuals" },
            { id: "action:image:new_version", title: "Create New Version" },
            { id: "action:image:website", title: "Use in Website" },
          ],
        });
      } else if (messageType === "document" || effectiveMime.includes("pdf") || effectiveMime.includes("sheet") || effectiveMime.includes("excel") || effectiveMime.includes("csv")) {
        const hasSpecificInstructions = text && text.trim().length > 0 && !/^(?:hi|hello|hey|check|see|look)$/i.test(text.trim());
        if (!hasSpecificInstructions) {
          const reply = `I received your file (${attachment.filename}). How would you like me to process it?\n\n1. Summarize\n2. Check Risks\n3. Action Plan`;
          return sendAgentReply(reply, recipientContext, {
            principalTenantId,
            interactiveButtons: [
              { id: "action:doc:summarize", title: "Summarize" },
              { id: "action:doc:risks", title: "Check Risks" },
              { id: "action:doc:actions", title: "Action Plan" },
            ],
          });
        }

        const analysis = await analyzeDocumentFile({ attachment, goal: text });
        const findings = (analysis.findings || []).slice(0, 2).map((f) => `• ${f}`).join("\n");
        const reply = `📄 *File Analysis: ${attachment.filename}*\n\n${analysis.summary}${findings ? `\n\n${findings}` : ""}\n\n1. Action Plan\n2. Use in Website`;
        return sendAgentReply(reply, recipientContext, {
          principalTenantId,
          interactiveButtons: [
            { id: "action:doc:actions", title: "Action Plan" },
            { id: "action:doc:website", title: "Use in Website" },
          ],
        });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Multimodal analysis failed";
      return sendAgentReply(`I received your attachment, but encountered an error analyzing it: ${errorMsg}`, recipientContext, { principalTenantId });
    }
  }

  if (parsed.kind === "whoami") {
    return sendAgentReply(handleWhoAmI(resolution, EXTRA_TOOLS), recipientContext, { principalTenantId });
  }
  if (parsed.kind === "help") {
    return sendAgentReply(handleHelp(principal, EXTRA_TOOLS), recipientContext, { principalTenantId });
  }
  if (parsed.kind === "reset") {
    const reply = await handleReset(supabase, principal);
    return sendAgentReply(reply, recipientContext, { principalTenantId });
  }
  if (parsed.kind === "confirm") {
    const { reply } = await handleConfirm(supabase, principal, parsed.code, EXTRA_TOOLS);
    return sendAgentReply(reply, recipientContext, { principalTenantId });
  }
  if (parsed.kind === "cancel") {
    const reply = await handleCancel(supabase, principal, parsed.code);
    return sendAgentReply(reply, recipientContext, { principalTenantId });
  }
  if (parsed.kind === "malformed") {
    return sendAgentReply(
      formatAgentReply({ text: `That ${parsed.attempted.toUpperCase()} command doesn't look right. Send HELP for the exact format.` }),
      recipientContext,
      { principalTenantId }
    );
  }

  // First-class Founder OS intent execution (Website, Agent Factory, Generation, Research, Diagnostics)
  const plan = decomposeNaturalLanguageIntent(dispatch.userText, {
    tenantId: principalTenantId || undefined,
    companyScope: `comp_${principalTenantId}`,
    channel: "whatsapp",
  });

  if (
    plan.tasks.length > 0 &&
    plan.tasks[0] &&
    plan.tasks[0].capabilityKey !== "vercel.production_health" &&
    plan.tasks[0].capabilityKey !== "aws.ec2_status"
  ) {
    const exec = await executeDecomposedPlan(plan.tasks, {
      tenantId: principalTenantId || "platform-default",
      channel: "whatsapp",
      actorId: principal.authUserId,
      actorKind: "founder",
    });
    return sendAgentReply(exec.overallMessage, recipientContext, {
      principalTenantId,
      interactiveButtons: exec.interactiveButtons,
    });
  }

  // parsed.kind === "none" — a normal conversational turn for a LINKED
  // principal. PHASE 22: on failure, this must NEVER fall back to
  // prospect/sales behavior — that only applies to genuinely unlinked
  // senders, handled entirely above.
  try {
    const result = await runAgentTurn({
      supabase,
      principal,
      provider: createAgentCoreProviderAdapter(principal.tenantId),
      userText: dispatch.userText,
      providerMessageId,
      extraTools: EXTRA_TOOLS,
      toolNameAllowlist: dispatch.toolNameAllowlist ?? undefined,
      extraKnowledge: await loadOwnerBrainKnowledge(principal),
    });

    if (result.status === "duplicate") {
      // Idempotent redelivery of the same providerMessageId — do not
      // re-invoke anything, and do not attempt to resend (the original
      // run's reply, if any, already went out under the same
      // whatsapp_agent_reply:<providerMessageId>:0 idempotency key).
      return Response.json({ outcome: "reply", text: "" }, { headers: { "Cache-Control": "no-store" } });
    }

    return sendAgentReply(result.replyText, recipientContext, { principalTenantId, agentRunId: result.runId });
  } catch {
    return Response.json(
      { outcome: "unavailable", text: UNAVAILABLE_TEXT },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }
}

/**
 * Master Website Agent Engine
 *
 * Coordinates intent detection, tool authorization & execution, customer
 * shopping flows, order lookups, lead captures, escalation, and safe responses.
 */

import type { AgentChatInput, AgentTurnResult, ToolExecutionContext, ToolExecutionResult } from "./types.ts";
import { intentClassifier } from "./intent-classifier.ts";
import { toolRegistry } from "./tools/registry.ts";
import { toolAuthorizer } from "./tools/authorization.ts";
import { conversationManager } from "./conversation-manager.ts";
import { budgetGuard } from "./budget-guard.ts";
import type { Product } from "../ecommerce/types.ts";

export class WebsiteAgentEngine {
  public tools = toolRegistry;
  public authorizer = toolAuthorizer;
  public memory = conversationManager;
  public guard = budgetGuard;

  /**
   * Processes a single turn of conversation with the website business agent.
   */
  public async chat(input: AgentChatInput): Promise<AgentTurnResult> {
    const clientIdentifier = input.clientIp || input.sessionToken || input.conversationId || "anon";

    // 1. Rate Limit & Message Length Check
    const rateCheck = this.guard.checkRateLimit(clientIdentifier);
    if (!rateCheck.allowed) {
      return {
        reply: `You are sending messages too quickly. Please wait ${rateCheck.retryAfterSeconds || 10} seconds before sending another message.`,
        agentType: input.agentType || "SALES_AGENT",
        conversationId: input.conversationId || "rate_limited",
        actionsTaken: [],
        tokensUsed: { input: 0, output: 0 },
      };
    }

    const lengthCheck = this.guard.validateMessageLength(input.message, 500);
    if (!lengthCheck.valid) {
      return {
        reply: lengthCheck.error || "Message invalid",
        agentType: input.agentType || "SALES_AGENT",
        conversationId: input.conversationId || "invalid",
        actionsTaken: [],
        tokensUsed: { input: 0, output: 0 },
      };
    }

    // 2. Retrieve / Initialize Session
    const session = this.memory.getOrCreateSession(input.tenantId, input.projectId, input.conversationId);
    this.memory.appendUserMessage(session, input.message);

    // 3. Classify User Intent & Guard Against Prompt Injections
    const parsed = intentClassifier.classify(input.message, session.lastIntent);
    session.lastIntent = parsed;

    if (parsed.isPromptInjection) {
      const reply = "I am a dedicated store assistant here to help you explore our collections, check order status, or answer questions about our brand. How may I assist you today?";
      this.memory.appendAssistantMessage(session, reply);
      return {
        reply,
        agentType: input.agentType || "SALES_AGENT",
        conversationId: session.conversationId,
        actionsTaken: [],
        tokensUsed: { input: 20, output: 30 },
      };
    }

    const actionsTaken: ToolExecutionResult[] = [];
    let productRecommendations: Product[] | undefined;
    let checkoutUrl: string | undefined;
    let leadCaptured = false;
    let escalated = false;
    let escalationReason: string | undefined;
    let reply = "";

    const ctx: ToolExecutionContext = {
      tenantId: input.tenantId,
      projectId: input.projectId,
      agentId: `agent_${input.projectId}`,
      conversationId: session.conversationId,
      sessionToken: input.sessionToken || session.conversationId,
      customerId: input.customerId,
      customerEmail: input.customerEmail,
      requestId: `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    };

    // 4. Handle Specific Intents via Tool Execution
    switch (parsed.intent) {
      case "HUMAN_ESCALATION": {
        escalated = true;
        escalationReason = "Customer requested human representative / dispute resolution";
        reply = "I understand you would like to speak with a human representative. I have escalated this conversation to our concierge team with priority. Someone will follow up with you shortly.";
        break;
      }

      case "CHECKOUT": {
        const checkoutTool = this.tools.getTool("create_checkout_link");
        if (checkoutTool) {
          const auth = this.authorizer.authorize(checkoutTool.definition, ctx);
          if (auth.authorized) {
            const res = await checkoutTool.execute(ctx, { customerEmail: input.customerEmail });
            actionsTaken.push(res);
            if (res.success && res.data) {
              const data = res.data as { checkoutUrl: string; totalFormatted: string };
              checkoutUrl = data.checkoutUrl;
              reply = `Your cart total is ${data.totalFormatted}. Please proceed to our secure checkout here: [Complete Your Order](${data.checkoutUrl})`;
            } else {
              reply = `I could not generate checkout at this moment: ${res.error || "Your cart might be empty."}`;
            }
          }
        }
        break;
      }

      case "ADD_TO_CART": {
        const candidates = session.lastProductResults || [];
        const index = parsed.entities.productIndex !== undefined ? parsed.entities.productIndex : 0;
        const targetProduct = candidates[index] || candidates[0];

        if (targetProduct) {
          const addTool = this.tools.getTool("add_to_cart");
          if (addTool) {
            const auth = this.authorizer.authorize(addTool.definition, ctx);
            if (auth.authorized) {
              const res = await addTool.execute(ctx, { productId: targetProduct.id, quantity: 1 });
              actionsTaken.push(res);
              if (res.success) {
                reply = `Added "${targetProduct.name}" (₹${(targetProduct.priceCents / 100).toFixed(2)}) to your cart. Would you like to view your cart or proceed to checkout?`;
              } else {
                reply = `Could not add product to cart: ${res.error}`;
              }
            }
          }
        } else {
          reply = "I couldn't identify which product you'd like to add. Could you search for the item first or specify its name?";
        }
        break;
      }

      case "VIEW_CART": {
        const viewTool = this.tools.getTool("view_cart");
        if (viewTool) {
          const auth = this.authorizer.authorize(viewTool.definition, ctx);
          if (auth.authorized) {
            const res = await viewTool.execute(ctx, {});
            actionsTaken.push(res);
            if (res.success && res.data) {
              const data = res.data as { items: any[]; summary: any };
              if (data.items.length === 0) {
                reply = "Your shopping cart is currently empty. Would you like me to recommend some signature pieces?";
              } else {
                const itemList = data.items.map((i) => `• ${i.productName} (Qty: ${i.quantity}) - ₹${(i.unitPriceCents / 100).toFixed(2)}`).join("\n");
                reply = `Here is what is currently in your cart:\n\n${itemList}\n\nTotal: ₹${(data.summary.totalCents / 100).toFixed(2)}. Say "Checkout" whenever you are ready!`;
              }
            }
          }
        }
        break;
      }

      case "ORDER_STATUS": {
        if (!parsed.entities.orderId) {
          reply = "Please provide your Order Reference Number (e.g. ord_12345) and I will look up the status for you.";
        } else {
          const orderTool = this.tools.getTool("get_order_status");
          if (orderTool) {
            const auth = this.authorizer.authorize(orderTool.definition, ctx);
            if (auth.authorized) {
              const res = await orderTool.execute(ctx, { orderId: parsed.entities.orderId });
              actionsTaken.push(res);
              if (res.success && res.data) {
                const o = res.data as any;
                reply = `Order ${o.orderId} is currently **${o.status}** (${o.itemCount} items, ${o.totalFormatted}).`;
              } else {
                reply = `I could not find an active order matching that reference: ${res.error || "Please verify the order ID."}`;
              }
            }
          }
        }
        break;
      }

      case "LEAD_CAPTURE": {
        const leadTool = this.tools.getTool("capture_lead");
        if (leadTool) {
          const res = await leadTool.execute(ctx, {
            email: parsed.entities.email || input.customerEmail,
            phone: parsed.entities.phone,
            requirement: parsed.entities.requirement,
          });
          actionsTaken.push(res);
          leadCaptured = true;
          reply = "Thank you! I have recorded your inquiry. A specialist from our team will reach out to you shortly.";
        }
        break;
      }

      case "BUSINESS_INFO": {
        const infoTool = this.tools.getTool("get_business_info");
        if (infoTool) {
          const res = await infoTool.execute(ctx, {});
          actionsTaken.push(res);
          if (res.success && res.data) {
            const info = res.data as any;
            reply = `${info.businessName} — ${info.tagline}\nHours: ${info.hours}\nSupport: ${info.supportEmail} | Phone: ${info.phone}`;
          }
        }
        break;
      }

      case "PRODUCT_SEARCH":
      default: {
        const searchTool = this.tools.getTool("search_products");
        if (searchTool) {
          const res = await searchTool.execute(ctx, {
            query: parsed.entities.query || "",
            category: parsed.entities.category,
            color: parsed.entities.color,
            maxPriceCents: parsed.entities.maxPriceCents,
          });
          actionsTaken.push(res);
          if (res.success && Array.isArray(res.data)) {
            productRecommendations = res.data as Product[];
            session.lastProductResults = productRecommendations;

            if (productRecommendations.length === 0) {
              reply = "I searched our collection but didn't find any items matching those exact criteria. Would you like to adjust your price filter or view all available categories?";
            } else {
              const itemsList = productRecommendations
                .slice(0, 3)
                .map((p, idx) => `${idx + 1}. **${p.name}** — ₹${(p.priceCents / 100).toFixed(2)}\n   ${p.description}`)
                .join("\n\n");
              reply = `Here are the best pieces matching your search:\n\n${itemsList}\n\nWould you like me to add one of these to your cart?`;
            }
          }
        }
        break;
      }
    }

    this.memory.appendAssistantMessage(session, reply);

    return {
      reply,
      agentType: input.agentType || "SALES_AGENT",
      conversationId: session.conversationId,
      actionsTaken,
      productRecommendations,
      checkoutUrl,
      leadCaptured,
      escalated,
      escalationReason,
      tokensUsed: { input: 80, output: 120 },
    };
  }
}

export const websiteAgentEngine = new WebsiteAgentEngine();

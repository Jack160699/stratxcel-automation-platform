/**
 * Types & Contracts for AI Business Agent + Tool Execution Layer
 */

import type { Product, Order, Cart } from "../ecommerce/types.ts";

export type AgentType = "SALES_AGENT" | "BUSINESS_AGENT" | "SUPPORT_AGENT";

export type ToolPermission = "PUBLIC" | "CUSTOMER_SESSION" | "RESTRICTED";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  permissionLevel: ToolPermission;
  requiresConfirmation: boolean;
}

export interface ToolExecutionContext {
  tenantId: string;
  projectId: string;
  agentId: string;
  conversationId: string;
  sessionToken?: string;
  customerId?: string;
  customerEmail?: string;
  actorUserId?: string;
  requestId: string;
}

export interface ToolExecutionResult {
  tool: string;
  success: boolean;
  data?: unknown;
  error?: string;
  requiresConfirmation?: boolean;
}

export interface AgentContext {
  tenantId: string;
  projectId: string;
  agentType: AgentType;
  businessName: string;
  businessDescription: string;
  services: Array<{ title: string; description: string; price?: string }>;
  faqs: Array<{ question: string; answer: string }>;
  contactInfo: { email?: string; phone?: string; address?: string };
  brandTone?: string;
  sessionToken?: string;
  customerId?: string;
  customerEmail?: string;
}

export interface AgentChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCalls?: Array<{ tool: string; args: Record<string, unknown> }>;
  toolResult?: unknown;
  timestamp: string;
}

export interface AgentChatInput {
  tenantId: string;
  projectId: string;
  conversationId?: string;
  message: string;
  sessionToken?: string;
  customerId?: string;
  customerEmail?: string;
  agentType?: AgentType;
  clientIp?: string;
}

export interface AgentTurnResult {
  reply: string;
  agentType: AgentType;
  conversationId: string;
  actionsTaken: ToolExecutionResult[];
  productRecommendations?: Product[];
  checkoutUrl?: string;
  leadCaptured?: boolean;
  escalated?: boolean;
  escalationReason?: string;
  tokensUsed: { input: number; output: number };
}

/**
 * Conversation Manager
 *
 * Stores bounded conversation history per session, maintains follow-up entity memory,
 * and prunes historical turns to prevent excessive context expansion.
 */

import type { AgentChatMessage } from "./types.ts";
import type { ParsedUserIntent } from "./intent-classifier.ts";

export interface ConversationSession {
  conversationId: string;
  tenantId: string;
  projectId: string;
  messages: AgentChatMessage[];
  lastIntent?: any;
  lastProductResults?: any[];
  updatedAt: string;
}

export class ConversationManager {
  private sessions: Map<string, ConversationSession> = new Map();
  private maxHistoryMessages = 20;

  /**
   * Retrieves or creates a conversation session.
   */
  public getOrCreateSession(tenantId: string, projectId: string, conversationId?: string): ConversationSession {
    const id = conversationId || `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const existing = this.sessions.get(id);

    if (existing && existing.tenantId === tenantId) {
      return existing;
    }

    const session: ConversationSession = {
      conversationId: id,
      tenantId,
      projectId,
      messages: [],
      updatedAt: new Date().toISOString(),
    };

    this.sessions.set(id, session);
    return session;
  }

  /**
   * Appends user message and bounds history.
   */
  public appendUserMessage(session: ConversationSession, content: string): void {
    session.messages.push({
      role: "user",
      content,
      timestamp: new Date().toISOString(),
    });

    if (session.messages.length > this.maxHistoryMessages) {
      session.messages = session.messages.slice(-this.maxHistoryMessages);
    }
    session.updatedAt = new Date().toISOString();
  }

  /**
   * Appends assistant message.
   */
  public appendAssistantMessage(
    session: ConversationSession,
    content: string,
    toolCalls?: Array<{ tool: string; args: Record<string, unknown> }>
  ): void {
    session.messages.push({
      role: "assistant",
      content,
      toolCalls,
      timestamp: new Date().toISOString(),
    });

    if (session.messages.length > this.maxHistoryMessages) {
      session.messages = session.messages.slice(-this.maxHistoryMessages);
    }
    session.updatedAt = new Date().toISOString();
  }
}

export const conversationManager = new ConversationManager();

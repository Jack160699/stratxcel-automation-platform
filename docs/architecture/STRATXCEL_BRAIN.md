# Stratxcel Brain

The Stratxcel Brain is the shared context and reasoning layer above Agent Core. WhatsApp Admin Agent, Admin Web Copilot, and Client Web Copilot all use the same principal model, context builder, tool registry, Gemini provider adapter, tool loop, and memory repository. Sessions remain channel-specific.

Authorization is deterministic and precedes the Brain. A verified principal is resolved from a Supabase session or an active WhatsApp phone link. Platform roles and tenant membership remain authoritative. Department is descriptive only. An optional staff Agent profile can narrow the existing role ceiling but cannot add authority beyond it.

For each normal turn the Brain assembles:

- the verified principal and channel;
- effective tools and their risk classifications;
- bounded recent messages from the principal's active channel session;
- explicit scoped memories;
- deterministic existing tenant and Brand Brain context;
- a dynamic system prompt describing only resolved capabilities.

History, memory, knowledge, and authorization remain separate:

- History is recent channel-session conversation, capped at 20 messages and 12,000 characters with oldest-first trimming.
- Memory is explicit durable data in `agent_memories`; it supports personal, workspace, and owner-only agency scopes. Memory mutations follow channel policy and therefore require exact confirmation on WhatsApp.
- Knowledge is read from existing authorized tenant and Brand Brain records. Brain V1 does not introduce embeddings or another vector/AI provider.
- Authorization is the verified principal plus server-resolved tool filtering. The model never grants permissions.

Gemini Developer API remains the single provider. Its current implementation supports function calls, multiple calls in one response, and ordered tool-result rounds. Agent Core retains a four-round bound. WhatsApp low-risk mutations require confirmation; external/high-risk work remains dashboard-only. `CONFIRM <code>` executes only the stored action and normalized input.

Social Autopilot remains a specialized orchestration subsystem. The shared Brain reuses its existing Gemini provider and reads existing Brand Brain data, without replacing Social Autopilot's richer content-specific workflow.

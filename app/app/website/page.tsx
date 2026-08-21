"use client";

import { useEffect, useState } from "react";
import { useCurrentTenant } from "../CurrentTenantContext";
import { IntegrationStatus } from "../components/IntegrationStatus";
import { DisconnectedState } from "../components/DisconnectedState";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ErrorState } from "@/components/ui/Feedback";
import { SmartWebsiteCreator } from "@/components/site-builder/SmartWebsiteCreator";
import { CustomerDomainManager } from "@/components/site-builder/CustomerDomainManager";

interface WebsiteProject {
  id: string;
  name: string;
  slug: string;
  website_type: string;
  status: string;
  deployment_status: string;
  preview_subdomain: string;
  custom_domain?: string;
  production_url?: string;
  prompt?: string;
  pages?: Array<{ id: string; title: string; slug: string }>;
  created_at: string;
  website_agents?: Array<{ id: string; name: string; enabled: boolean; conversation_count: number }>;
}

export default function WebsitePage() {
  const { active } = useCurrentTenant();
  const tenantId = active?.tenantId;

  const [projects, setProjects] = useState<WebsiteProject[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Creation State
  const [showSmartCreator, setShowSmartCreator] = useState(false);

  // Edit / Revision State
  const [editInstruction, setEditInstruction] = useState("");
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);

  // Agent Chat State
  const [chatOpen, setChatOpen] = useState<string | null>(null);
  const [chatMessage, setChatMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<Array<{ role: string; content: string }>>([]);
  const [chatLoading, setChatLoading] = useState(false);

  async function loadProjects() {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/platform/website-factory?tenantId=${encodeURIComponent(tenantId)}`);
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Failed to load website projects");
        return;
      }
      setProjects(body.projects || []);
    } catch {
      setError("Network error loading website projects");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  async function handleApplyEdit(projectId: string) {
    if (!tenantId || !editInstruction.trim()) return;

    setEditingProjectId(projectId);
    setError(null);
    try {
      const res = await fetch(`/api/platform/website-factory/${projectId}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          instruction: editInstruction.trim(),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Failed to apply edit");
        return;
      }
      setEditInstruction("");
      await loadProjects();
    } catch {
      setError("Failed to apply website edit");
    } finally {
      setEditingProjectId(null);
    }
  }

  async function handleSendAgentChat(projectId: string) {
    if (!chatMessage.trim()) return;
    const userMsg = chatMessage.trim();
    setChatMessage("");
    setChatHistory((prev) => [...prev, { role: "user", content: userMsg }]);
    setChatLoading(true);

    try {
      const res = await fetch(`/api/platform/website-factory/${projectId}/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg,
          conversationHistory: chatHistory,
        }),
      });
      const body = await res.json();
      if (res.ok && body.reply) {
        setChatHistory((prev) => [...prev, { role: "assistant", content: body.reply }]);
      } else {
        setChatHistory((prev) => [...prev, { role: "assistant", content: body.error || "Agent unavailable." }]);
      }
    } catch {
      setChatHistory((prev) => [...prev, { role: "assistant", content: "Connection error." }]);
    } finally {
      setChatLoading(false);
    }
  }

  const primaryProject = projects?.[0] || null;

  return (
    <div data-sx-ui="new-website" className="sx-customer-app mx-auto flex w-full max-w-[720px] flex-col gap-6 pb-20 md:pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-sx-text">Website & Domain{active ? ` · ${active.name}` : ""}</h1>
          <p className="sx-hi text-xs text-sx-text-subtle">वेबसाइट और डोमेन</p>
        </div>
        {tenantId && projects && projects.length > 0 && (
          <Button variant="primary" size="sm" onClick={() => setShowSmartCreator(true)}>
            + Create Another Site
          </Button>
        )}
      </div>

      {error && <ErrorState message={error} onRetry={loadProjects} />}

      {/* Smart Website Creator Flow */}
      {(showSmartCreator || (!loading && (!projects || projects.length === 0))) && tenantId && (
        <Card className="p-2 sm:p-5">
          <div className="mb-3 flex items-center justify-between border-b border-sx-border px-2 pb-3 pt-1 sm:px-0">
            <div>
              <h2 className="text-[15px] font-semibold text-sx-text">Smart Website Creator</h2>
              <p className="text-xs text-sx-text-muted">Type what you want in Hindi, Hinglish, or English. Stratxcel will ask smart questions and build your site.</p>
            </div>
            {projects && projects.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setShowSmartCreator(false)}>
                ✕ Close
              </Button>
            )}
          </div>
          <SmartWebsiteCreator
            tenantId={tenantId}
            onClose={() => {
              setShowSmartCreator(false);
              loadProjects();
            }}
            onPublish={async () => {
              setShowSmartCreator(false);
              await loadProjects();
            }}
          />
        </Card>
      )}

      {/* Projects List */}
      <section className="flex flex-col gap-5">
        {loading && <p className="text-sm text-sx-text-subtle">Loading website projects…</p>}

        {!loading && (!projects || projects.length === 0) && (
          <div className="rounded-sx-md border border-dashed border-sx-border p-6 text-center">
            <p className="text-sm font-semibold text-sx-text">Website Factory Ready</p>
            <p className="mt-1 text-xs text-sx-text-muted">Use the Smart Website Creator above to build your first website.</p>
          </div>
        )}

        {projects?.map((proj) => {
          const isLive = proj.status === "live" || proj.deployment_status === "LIVE";
          const agent = proj.website_agents?.[0];

          const domainLabel = proj.custom_domain || `${proj.slug}.stratxcel.site`;
          return (
            <div key={proj.id} className="flex flex-col gap-4">
              {/* Website Live Card — StratXcel App reference hero treatment */}
              <Card className="overflow-hidden p-0">
                <div className="bg-gradient-to-br from-sx-accent-muted to-sx-accent/10 px-6 py-7 text-center">
                  <div className="mx-auto flex h-[60px] w-[60px] items-center justify-center rounded-sx-md bg-sx-surface-1 shadow-sm">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--sx-accent)" strokeWidth="2">
                      <path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" />
                    </svg>
                  </div>
                  <p className="mt-3 text-[16px] font-bold text-sx-text">{domainLabel}</p>
                  <div className="mt-1.5 flex items-center justify-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${isLive ? "bg-sx-success" : "bg-sx-text-subtle"}`} />
                    <span className={`text-xs font-semibold ${isLive ? "text-sx-success" : "text-sx-text-subtle"}`}>
                      {isLive ? "Live & Active" : proj.status.replace(/_/g, " ")}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-sx-text-subtle">Created {new Date(proj.created_at).toLocaleDateString()}</p>
                </div>

                {/* Quick actions — real starter prompts for the natural-language edit flow below, not decorative */}
                <div className="flex flex-col gap-1.5 p-4">
                  {[
                    { label: "Add Photos", prompt: "Add a photo gallery section showcasing the shop and products" },
                    { label: "Update Business Hours", prompt: "Update the business hours shown on the site" },
                    { label: "Edit Menu & Prices", prompt: "Update the products/services list and prices" },
                    { label: "Update WhatsApp Button", prompt: "Update the WhatsApp contact button" },
                  ].map((action) => (
                    <button
                      key={action.label}
                      type="button"
                      onClick={() => {
                        setEditingProjectId(proj.id);
                        setEditInstruction(action.prompt);
                        document.getElementById(`edit-instruction-${proj.id}`)?.focus();
                      }}
                      className="flex items-center justify-between rounded-sx-sm bg-sx-accent-muted px-3 py-2.5 text-left transition-colors hover:bg-sx-accent/15"
                    >
                      <span className="text-[14px] font-semibold text-sx-text">{action.label}</span>
                      <span className="text-sx-text-subtle">→</span>
                    </button>
                  ))}
                </div>

                <div className="flex flex-col gap-2 p-4 pt-0 sm:flex-row">
                  <a
                    href={`/app/website/${proj.id}/preview`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 rounded-sx-sm border border-sx-border bg-sx-surface-2 px-4 py-2.5 text-center text-xs font-semibold text-sx-text hover:bg-sx-surface-1 transition-colors"
                  >
                    Open Live Preview ↗
                  </a>
                  <a
                    href={proj.production_url || `https://${domainLabel}`}
                    target={isLive ? "_blank" : undefined}
                    rel="noreferrer"
                    aria-disabled={!isLive}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-sx-sm px-4 py-2.5 text-center text-xs font-bold transition-opacity ${
                      isLive ? "bg-sx-accent text-sx-accent-on hover:opacity-90" : "pointer-events-none bg-sx-surface-3 text-sx-text-subtle"
                    }`}
                  >
                    Visit Website 🌐
                  </a>
                </div>
              </Card>

              {/* Status Grid */}
              <div className="grid gap-3 sm:grid-cols-3">
                <IntegrationStatus
                  name="Live Domain"
                  state={proj.custom_domain ? "connected" : "disconnected"}
                  detail={proj.custom_domain ? `Connected: ${proj.custom_domain}` : "No custom domain connected"}
                />
                <IntegrationStatus
                  name="Hosting & SSL"
                  state={isLive ? "connected" : "disconnected"}
                  detail={isLive ? "Active HTTPS on Vercel" : "Deployment pipeline ready"}
                />
                <IntegrationStatus
                  name="AI Business Agent"
                  state={agent ? "connected" : "disconnected"}
                  detail={agent ? `${agent.name} (${agent.conversation_count || 0} chats)` : "No agent attached"}
                />
              </div>

              {/* Domain & Publishing Management */}
              {tenantId && (
                <CustomerDomainManager
                  tenantId={tenantId}
                  projectId={proj.id}
                  projectName={proj.name}
                  existingDomain={proj.custom_domain}
                  onDomainUpdated={() => loadProjects()}
                />
              )}

              {/* Natural Language Edit Bar */}
              <Card className="p-4">
                <label htmlFor={`edit-instruction-${proj.id}`} className="block text-xs font-semibold text-sx-text-muted mb-1.5">
                  Natural Language Website Editing
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    id={`edit-instruction-${proj.id}`}
                    value={editingProjectId === proj.id ? editInstruction : ""}
                    onChange={(e) => {
                      setEditingProjectId(proj.id);
                      setEditInstruction(e.target.value);
                    }}
                    placeholder="e.g. 'Make the homepage more premium', 'Add a testimonials section', 'Add products'"
                    className="flex-1 text-xs"
                  />
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={editingProjectId === proj.id && !editInstruction.trim()}
                    onClick={() => handleApplyEdit(proj.id)}
                  >
                    {editingProjectId === proj.id ? "Applying Revision…" : "Apply Edit 🪄"}
                  </Button>
                </div>
              </Card>

              {/* AI Agent Chat Modal / Accordion */}
              {agent && (
                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-sx-text">Embedded AI Business Agent ({agent.name})</span>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setChatOpen(chatOpen === proj.id ? null : proj.id);
                        if (chatOpen !== proj.id && chatHistory.length === 0) {
                          setChatHistory([{ role: "assistant", content: `Hi! I am ${agent.name}. How can I help with your website?` }]);
                        }
                      }}
                    >
                      {chatOpen === proj.id ? "Close Agent Test" : "Test Agent Chat 💬"}
                    </Button>
                  </div>

                  {chatOpen === proj.id && (
                    <div className="mt-4 rounded-sx-md border border-sx-border bg-sx-surface-1 p-4 flex flex-col gap-3">
                      <div className="max-h-60 overflow-y-auto flex flex-col gap-2 p-2 rounded-sx-sm bg-sx-surface-2 text-xs">
                        {chatHistory.map((m, idx) => (
                          <div key={idx} className={`p-2 rounded-sx-sm max-w-[80%] ${m.role === "user" ? "bg-sx-accent text-sx-accent-on self-end" : "bg-sx-surface-1 text-sx-text self-start"}`}>
                            {m.content}
                          </div>
                        ))}
                        {chatLoading && <div className="text-sx-text-subtle italic">Agent thinking…</div>}
                      </div>

                      <div className="flex gap-2">
                        <Input
                          value={chatMessage}
                          onChange={(e) => setChatMessage(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleSendAgentChat(proj.id)}
                          placeholder="Ask product questions, business details, or navigation…"
                          className="flex-1 text-xs"
                        />
                        <Button size="sm" variant="primary" disabled={chatLoading || !chatMessage.trim()} onClick={() => handleSendAgentChat(proj.id)}>
                          Send
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              )}

              <p className="px-1 text-[11px] text-sx-text-subtle">
                Production promotion requires approval — publishing always requires your explicit approval, verified payment confirmation, and passing automated QA checks.
              </p>
            </div>
          );
        })}
      </section>
    </div>
  );
}

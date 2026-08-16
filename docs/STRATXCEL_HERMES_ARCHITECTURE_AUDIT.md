# StratXcel Hermes Architecture Audit (Phase 0)

**Date**: 2026-08-16  
**Auditor**: Antigravity Assistant  
**Repository**: StratXcel Automation Platform  

---

## 1. Executive Summary

This repository is **NOT** a greenfield project. It contains a production-grade multi-tenant platform featuring:
- **Hermes Agent upstream integration** (`NousResearch/hermes-agent` v0.20.0 running on dedicated EC2 with hardened toolsets and private Streamable HTTP MCP bridge).
- **WorkforceCore** (`packages/workforce-core`) containing 25 specialized departments, 60+ roles, DAG execution, quality critics, and capability authorization.
- **Brand Brain** (`packages/brand-brain`, `lib/audit/brand-brain.ts`) with versioned tenant memory.
- **Audit Engine** (`packages/audit-engine`, `lib/audit/`) with crawler, quality scoring, first-party evidence, and WhatsApp report delivery.
- **Payments & Billing** (`packages/payments-and-wallet`, `lib/payments/`, `lib/billing/`) with Razorpay recurring subscriptions, GST, entitlement enforcement, and wallet ledger.
- **WhatsApp Infrastructure** (`packages/whatsapp`, `apps/whatsapp-worker`) with Cloud API adapter, templates, durable ack, auto-reply, and agent channel routing.

The goal is to extend and unify these components into an **autonomous AI growth operating system for SMBs**, strictly enforcing the separation of concerns:

```
CRAWLER / CONNECTORS  = FACTS
BRAND BRAIN           = BUSINESS UNDERSTANDING
AUDIT                 = PROBLEMS
REQUIREMENT ENGINE    = ACTUAL NEEDS
SERVICE ENGINE        = SOLUTIONS
COST BRAIN            = INTERNAL COST
PRICING BRAIN         = CUSTOMER PRICE
PLAN ENGINE           = CUSTOMER PACKAGE
HERMES                = REASONING + ORCHESTRATION
WORKFORCE             = EXECUTION
VALUE LEDGER          = PROOF OF WORK + OUTCOME
WHATSAPP COPILOT      = CUSTOMER INTERFACE
```

---

## 2. Detailed Inventory of Existing Systems

### 2.1 Hermes Integration (`packages/hermes/`, `lib/hermes/`, `apps/hermes-gateway/`, `infrastructure/hermes/`)
* **Upstream Engine**: `NousResearch/hermes-agent:latest` (v0.20.0).
* **API Surface**: HTTP API (`/v1/runs`, `/v1/runs/{id}`, `/v1/runs/{id}/stop`, `/v1/runs/{id}/approval`, `/health`).
* **Adapters**:
  - `DisabledHermesAdapter` (fail-closed, marks missions `BLOCKED`).
  - `MockHermesAdapter` (deterministic local dev).
  - `HermesHttpAdapter` (bearer token auth, polling up to `HERMES_RUN_MAX_MS`, token-scoped prompt injection).
* **Security & Tool Lockdown**:
  - Built-in toolsets on Hermes instance are disabled (`platform_toolsets.api_server: []`).
  - Tools are exposed via private Streamable HTTP MCP (`apps/hermes-gateway` at `/mcp`).
  - Two layers of auth: `STRATXCEL_MCP_BRIDGE_SECRET` at transport layer + signed HMAC mission token (`issueMissionToken` / `verifyMissionToken`) per call.
  - Controlled tools (`submit_publish_request`, `create_website_change_request`) are completely uncallable by Hermes.
* **Profiles**: `stratxcel-orchestrator`, `stratxcel-ceo`, `stratxcel-research`, `stratxcel-content`, `stratxcel-developer`, `stratxcel-seo`, `stratxcel-admin-growth`.
* **Telemetry & Mission Control**: `lib/hermes/mission-control.ts` collects telemetry from missions, queue jobs, worker heartbeats, kill switches, audit events, and provider usage.

### 2.2 Workforce Core (`packages/workforce-core/`)
* **25 Departments**: Executive, Strategy, Research, Brand, Creative, Content, Media, Social, SEO, Website, Advertising, Growth, Sales, CRM, WhatsApp, Conversion, Analytics, Reporting, Optimization, Quality, Compliance, Customer Success, Operations, Engineering, Finance.
* **Specialist Roles**: 60+ defined roles with purposes, accepted input artifacts, and output artifacts.
* **Execution & Planning**:
  - DAG engine (`execution/dag.ts`).
  - Hermes CEO delegator (`execution/ceo.ts`).
  - 30-day planner (`planning/thirty-day-planner.ts`).
  - Quality critic loops (`quality/critic.ts`, `quality/loop.ts`).
  - Capability authorization & execution (`lib/workforce/execute-capability.ts`).

### 2.3 Brand Brain (`packages/brand-brain/`, `lib/audit/brand-brain.ts`)
* Versioned storage (`brand_brains` pointer table + `brand_brain_versions` immutable rows).
* `buildBrandBrainContentFromAuditIntake()` transforms intake answers into structured Brand Brain.
* Compiler in Workforce (`packages/workforce-core/src/brand-context/compiler.ts`) generates brand slices for specialist agents.

### 2.4 Website Crawling & Intelligence (`packages/search-discovery/`, `lib/intelligence/`)
* `packages/search-discovery/src/crawler.ts`: Bounded crawler with SSRF protection, robots.txt, sitemap.xml discovery, maxPages, maxDepth, concurrency limits.
* `lib/intelligence/deep-scanner.ts`: Multi-page discovery crawler with extraction agents (Identity, Business, Audience, Brand, Social, Trust, Conversion, Tech).
* **Observation**: Two parallel crawling implementations exist that must be unified into one canonical Business Intelligence Website Pipeline.

### 2.5 Audit Engine (`packages/audit-engine/`, `packages/audit/`, `lib/audit/`)
* Live technical audit, quality scoring, first-party evidence, and report delivery via WhatsApp (`packages/whatsapp/src/outbound.ts`).
* Free audit default workflow in place.

### 2.6 Payments, Billing & Entitlements (`packages/payments-and-wallet/`, `lib/billing/`, `lib/payments/`)
* Plans: `free`, `starter`, `growth`, `business`, `scale` (historical: `launch`, `custom_growth`).
* Entitlements derivation and server-side RPC validation (`fulfill_razorpay_payment_v4`, `reconcile_and_fulfill_razorpay_payment_v4`).
* GST calculation (18% inclusive/exclusive).
* Wallet ledger and credit validation.

### 2.7 WhatsApp Infrastructure (`packages/whatsapp/`, `apps/whatsapp-worker/`)
* WhatsApp Cloud API adapter with template formatting, fallback rendering, phone normalization, consent checking, escalation, and durable webhook ack.
* Agent Channel Router connecting WhatsApp conversations to Agent Core.

### 2.8 AI Runtime & Cost Catalog (`packages/ai-runtime/`)
* Cost catalog (`COST_CATALOG`) with token rates, image unit rates, video second rates for Google Gemini, OpenAI, etc.
* Usage recording in `provider_usage_events` table.

---

## 3. Gap & Conflict Analysis

| Domain | Current Implementation | Issues / Conflicts / Gaps | Action Required |
|---|---|---|---|
| **Website Crawling** | Two crawlers: `search-discovery/crawler.ts` and `intelligence/deep-scanner.ts` | Disconnected extraction logic, redundant fetch loops, inconsistent timeout / sitemap handling | **Unify** into single canonical Website Intelligence Pipeline supporting SSRF protection, robots.txt, sitemap index, bounded crawl, JS/CMS resilience, structured facts |
| **Fact Evidence** | Mixed unstructured strings and partial provenance objects | Some fields lack standardized `{ value, source, evidence, confidence, observed_at }` format; risk of LLM hallucinations filling missing facts | **Enforce canonical Evidence Record schema** with `UNKNOWN` fallback rule |
| **Agent Registry** | Fragmented across `lib/hermes/specialists.ts` (11 specialists) and `workforce-core` (25 departments) | No unified registry declaring agent ID, permissions, allowed/forbidden tools, budget, schemas, retry/timeout | **Create Canonical StratXcel Agent Registry** mapping 21 agents to existing Hermes/Workforce delegation |
| **Requirements Engine** | Ad-hoc diagnosis in `workforce-core/src/planning/diagnosis.ts` | Lacks formal separation between Audit (problems) and Requirements (needs); lacks General Store low-digital heuristic | **Build dedicated Requirement Intelligence Engine** generating prioritized needs with evidence and impact |
| **Service Catalog** | `packages/missions/src/service-catalogue` contains mission templates | Hardcoded package assumptions; not normalized as modular services with unit costs, standard vs premium quality | **Create canonical modular Service Catalog** |
| **Cost & Pricing Brain** | AI runtime tracks actual costs; billing plans have fixed tiers | No deterministic forward calculation connecting Requirements → Services → Internal Cost → Market Pricing → Standard/Premium Plans | **Build Cost Brain + Pricing Brain + Plan Engine** ensuring AI never invents prices |
| **Value Ledger** | Fragmented across `mission_events`, `audit_events`, `provider_usage_events` | No unified lineage tracing Investment → Plan → Service → Mission → Deliverable → Result → Metric | **Build unified Value Ledger schema and service** |
| **WhatsApp Copilot** | Agent channel router handles messages | Needs explicit intent mapping for Ask, Command, Approve, Alert, Report while enforcing tenant entitlements | **Build Customer Copilot Agent** over existing WhatsApp stack |
| **Monthly Adaptation** | Standard 30-day recurring jobs | Needs calendar-month lifecycle: 26th report, 1st-3rd grace, 4th stop, 4th-5th renewal, idempotent requirement recalculation | **Implement Monthly Adaptive Lifecycle Engine** |

---

## 4. Dangerous Paths & Invariants

1. **No Hallucinated Facts**: If a crawler or connector cannot find a fact, its value MUST be `UNKNOWN` with confidence 0. Never allow an LLM prompt to fill in missing business details with generic assertions.
2. **No Invented Pricing**: Pricing MUST be calculated deterministically via rules and database config. LLMs must NEVER generate prices or discounts.
3. **Strict Server-Side Entitlements**: Execution agents and WhatsApp Copilot must NEVER execute services outside the customer's active paid plan entitlements.
4. **SSRF Guard**: All crawler fetches must resolve DNS and strictly reject private/internal IP ranges (IPv4 private subnets, loopback, link-local, IPv6 unicast/multicast).
5. **No Controlled Tool Bypassing**: `submit_publish_request` and `create_website_change_request` must remain StratXcel-controlled actions requiring explicit approval.

---

## 5. Migration Strategy

1. **Additive Schema Migrations**:
   - `business_evidence`: Normalized fact storage with provenance and confidence.
   - `business_requirements`: Computed tenant requirements snapshot.
   - `service_catalog_v2`: Normalized modular service catalog with cost models.
   - `plan_versions` & `plan_items`: Dynamic Standard/Premium plan proposals and active snapshots.
   - `value_ledger`: Immutable deliverable and outcome records.
2. **Zero Breaking Changes**: Preserve all existing tables (`tenants`, `missions`, `brand_brains`, `brand_brain_versions`, `approvals`, `payment_orders`, `subscriptions`, `audit_events`).
3. **Backward Compatibility**: Existing missions, audits, and billing subscriptions continue functioning without disruption.

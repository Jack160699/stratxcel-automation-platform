# StratXcel Hermes Architecture

## 1. Overview

StratXcel has evolved from an audit/automation tool into an **Autonomous AI Growth Operating System for Small and Medium Businesses (SMBs)**.

The system is powered by an upstream `NousResearch/hermes-agent` engine (v0.20.0) hosted on a dedicated private infrastructure, coordinated through a hardened MCP tool bridge and executed by the StratXcel Workforce (`@stratxcel/workforce-core`).

---

## 2. Core Architectural Separation of Concerns

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

### Invariants:
1. **The Crawler must not decide packages.**
2. **The Audit must not decide prices.**
3. **The AI must not invent prices.**
4. **The Customer Copilot must not bypass entitlements.**
5. **Agents must never execute services not included in the customer's active plan.**
6. **No hallucinated business facts:** Missing facts remain `UNKNOWN`.

---

## 3. End-to-End Customer Lifecycle

```
BUSINESS OWNER
    ↓
Enter website / WhatsApp identity
    ↓
Connect available business assets (Website, Google Business, Meta)
    ↓
Website Intelligence + Ingestion Pipeline extracts verified facts
    ↓
Brand Brain built & versioned
    ↓
Free personalized audit delivered to customer via WhatsApp
    ↓
Requirement Intelligence determines actual business needs
    ↓
Modular Service Mapping + Deterministic Cost Brain calculation
    ↓
Generate Recommended Premium Plan & Standard Alternative
    ↓
Customer chooses & pays
    ↓
Plan entitlements snapshotted & enforced server-side
    ↓
Hermes Orchestrator + Workforce execute missions autonomously
    ↓
Deliverables & proof of work recorded in Value Ledger
    ↓
Daily & weekly progress updates on WhatsApp
    ↓
Customer interacts with WhatsApp Copilot
    ↓
26th of month: Full Value Report + Adaptive Next-Month Recommendation
    ↓
1st–3rd: Grace period
    ↓
4th: Service stop if unpaid
    ↓
4th–5th: Renewal window
```

---

## 4. Upstream Hermes Engine & Tool Boundary

- **Engine**: `NousResearch/hermes-agent:latest` running on private EC2 (`stratxcel-hermes`).
- **Tool Boundary**: All 27 built-in host toolsets disabled (`platform_toolsets.api_server: []`).
- **Bridge**: Private Streamable HTTP MCP server in `apps/hermes-gateway` (`/mcp`).
- **Security**: Double authentication layer:
  1. `STRATXCEL_MCP_BRIDGE_SECRET` transport token.
  2. HMAC-signed mission capability token (`issueMissionToken`) with `allowedTools` check on every single invocation.
- **Controlled Tools**: `submit_publish_request` and `create_website_change_request` remain StratXcel-controlled and are uncallable by Hermes.

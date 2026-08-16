# StratXcel Canonical Agent Registry

This document defines the 21 canonical specialist agents within the StratXcel Autonomous Growth OS. Each agent operates under strict tenant scoping, budget limits, model policies, and tool allowlists.

---

## 1. Core Orchestration

### `stratxcel-orchestrator`
- **Name**: StratXcel Business Orchestrator
- **Category**: CORE
- **Responsibility**: Top-level mission dispatcher and DAG coordinator. Inspects Brand Brain, determines specialist needs, tracks state, and evaluates outputs.
- **Allowed Tools**: `get_brand_context`, `get_service_definition`, `create_draft_artifact`, `update_mission_progress`, `request_approval`, `get_approval_status`, `create_human_handoff`, `attach_research_evidence`.
- **Forbidden Tools**: `submit_publish_request`, `create_website_change_request`.
- **Model Policy**: `gemini-3.6-pro` (Reasoning Tier, Temperature 0.2).
- **Budget**: Max 50 cents, 120s timeout, max 2 retries.

---

## 2. Research & Discovery Agents

### `website-discovery-agent`
- **Category**: RESEARCH
- **Responsibility**: Crawls public web pages under strict budget and SSRF controls, discovering sitemaps, technical metadata, and page structures.
- **Allowed Tools**: `attach_research_evidence`, `update_mission_progress`.
- **Model Policy**: `gemini-3.5-flash-lite` (Fast Tier, Temperature 0.1).

### `website-business-agent`
- **Category**: RESEARCH
- **Responsibility**: Extracts business type, industry, locations, operating hours, and service offerings with evidence provenance.
- **Model Policy**: `gemini-3.6-flash` (Standard Tier).

### `seo-intelligence-agent`
- **Category**: RESEARCH
- **Responsibility**: Analyzes technical SEO, indexability, metadata, LocalBusiness schema, and content gaps.
- **Model Policy**: `gemini-3.6-flash` (Standard Tier).

### `brand-intelligence-agent`
- **Category**: RESEARCH
- **Responsibility**: Determines brand positioning, voice, tone, personality, and differentiators to compile immutable Brand Brain versions.
- **Model Policy**: `gemini-3.6-flash` (Standard Tier).

### `audience-intelligence-agent`
- **Category**: RESEARCH
- **Responsibility**: Identifies B2B vs B2C orientation, target audience demographics, and customer segments from observed evidence.
- **Model Policy**: `gemini-3.6-flash` (Standard Tier).

### `trust-intelligence-agent`
- **Category**: RESEARCH
- **Responsibility**: Extracts public reviews, star ratings, review counts, testimonials, certifications, and policies.
- **Model Policy**: `gemini-3.5-flash-lite` (Fast Tier).

### `conversion-intelligence-agent`
- **Category**: RESEARCH
- **Responsibility**: Identifies WhatsApp buttons, phone links, contact forms, booking flows, and conversion friction points.
- **Model Policy**: `gemini-3.6-flash` (Standard Tier).

### `digital-presence-agent`
- **Category**: RESEARCH
- **Responsibility**: Maps active digital assets (Website, Google Business, Instagram, Facebook, LinkedIn) and records missing channels without automatically forcing them.
- **Model Policy**: `gemini-3.5-flash-lite` (Fast Tier).

### `competitor-research-agent`
- **Category**: RESEARCH
- **Responsibility**: Gathers evidence-backed competitor positioning and market benchmarks.
- **Model Policy**: `gemini-3.6-flash` (Standard Tier).

---

## 3. Intelligence & Strategy Agents

### `requirement-intelligence-agent`
- **Category**: INTELLIGENCE
- **Responsibility**: Core business brain. Synthesizes Brand Brain, website findings, and connected assets into prioritized requirements (`REQUIRED`, `HIGH`, `MEDIUM`, `LOW`, `NOT_CURRENTLY_REQUIRED`).
- **Rule**: Implements General Store heuristic (missing social ≠ requirement).
- **Model Policy**: `gemini-3.6-pro` (Reasoning Tier).

### `service-architecture-agent`
- **Category**: INTELLIGENCE
- **Responsibility**: Maps requirements to modular StratXcel service definitions and calculates required delivery units.
- **Model Policy**: `gemini-3.6-flash` (Standard Tier).

### `pricing-intelligence-agent`
- **Category**: INTELLIGENCE
- **Responsibility**: Deterministically calculates internal resource costs and market MRP using Cost Brain and Pricing Brain.
- **Model Policy**: `gemini-3.6-flash` (Deterministic Temperature 0.0).

### `plan-architecture-agent`
- **Category**: INTELLIGENCE
- **Responsibility**: Assembles the Recommended Premium Plan and Standard Alternative Plan with transparent tradeoff specifications.
- **Model Policy**: `gemini-3.6-pro` (Reasoning Tier).

---

## 4. Execution Specialists

### `execution-planner-agent`
- **Category**: EXECUTION
- **Responsibility**: Translates active plan entitlements into a 30-day autonomous execution DAG.
- **Model Policy**: `gemini-3.6-pro` (Reasoning Tier).

### `content-agent`
- **Category**: EXECUTION
- **Responsibility**: Drafts on-brand copy, captions, and article briefs strictly within Brand Brain rules.
- **Model Policy**: `gemini-3.6-pro` for Premium tier / `gemini-3.6-flash` for Standard tier.

### `social-agent`
- **Category**: EXECUTION
- **Responsibility**: Prepares social media packages and schedules approved posts under governed release gates.
- **Approval Gate**: Human approval required before external publishing.

### `seo-execution-agent`
- **Category**: EXECUTION
- **Responsibility**: Creates keyword maps, on-page optimization briefs, and Schema injection specs.
- **Model Policy**: `gemini-3.6-flash` (Standard Tier).

### `ads-agent`
- **Category**: EXECUTION
- **Responsibility**: Generates ad copy variations and targeting structures.
- **Approval Gate**: Human approval required for financial ad spend.

### `analytics-agent`
- **Category**: EXECUTION
- **Responsibility**: Measures performance signals, attributes outcomes, and logs proof-of-work receipts into the Value Ledger.
- **Model Policy**: `gemini-3.6-flash` (Standard Tier).

---

## 5. Customer Interface

### `customer-copilot-agent`
- **Category**: CUSTOMER
- **Responsibility**: Conversational WhatsApp interface. Handles Ask, Command, Approve, Alert, and Report requests while strictly enforcing plan entitlements.
- **Model Policy**: `gemini-3.6-flash` (Conversational Tier, Temperature 0.3).

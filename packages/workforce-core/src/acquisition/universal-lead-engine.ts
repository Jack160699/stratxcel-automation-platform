/**
 * Universal Lead Acquisition & Enrichment Engine
 * StratXcel Autonomous Company OS - Workforce Core
 *
 * Core autonomous company pipeline:
 * OBJECTIVE
 * → MARKET UNDERSTANDING
 * → SOURCE SELECTION
 * → MULTI-SOURCE DISCOVERY
 * → NORMALIZATION
 * → IDENTITY RESOLUTION
 * → DEDUPLICATION
 * → DOMAIN/ENTITY VERIFICATION
 * → ENRICHMENT
 * → QUALIFICATION
 * → SCORING
 * → CRM
 * → OUTREACH ELIGIBILITY
 */

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type CanonicalLead,
  type LeadDiscoveryQuery,
  type LeadEnrichment,
  type LeadIdentity,
  type LeadQualification,
  type LeadSourceAdapter,
  type LeadSourceProvenance,
  type OutreachEligibility,
  type ProviderAvailabilityStatus,
  type RawDiscoveredLead,
  type UniversalDiscoveryExecutionResult,
} from "./types.ts";
import {
  buildLeadIdentity,
  canonicalizeDomain,
  generateIdentityHash,
  mergeLeadIdentity,
  normalizeCompanyName,
  normalizePhone,
} from "./identity-resolver.ts";
import { mergeWithDataPriority } from "./data-priority-merger.ts";
import { evaluateLeadQualification } from "./qualification-engine.ts";
import { evaluateOutreachEligibility } from "./outreach-gatekeeper.ts";
import { createDefaultSourceAdapters } from "./adapters/index.ts";

export interface UniversalEngineOptions {
  adapters?: LeadSourceAdapter[];
  supabaseClient?: SupabaseClient | null;
}

export class UniversalLeadEngine {
  private adapters: Map<string, LeadSourceAdapter> = new Map();
  private supabase: SupabaseClient | null;

  constructor(options?: UniversalEngineOptions) {
    const adapterList = options?.adapters || createDefaultSourceAdapters();
    for (const adapter of adapterList) {
      this.adapters.set(adapter.providerKey, adapter);
    }
    this.supabase = options?.supabaseClient || null;
  }

  /**
   * Returns live operational availability status for all registered providers.
   */
  async getProviderStatuses(): Promise<Record<string, ProviderAvailabilityStatus>> {
    const results: Record<string, ProviderAvailabilityStatus> = {};
    const checkPromises = Array.from(this.adapters.entries()).map(async ([key, adapter]) => {
      try {
        const status = await adapter.checkAvailability();
        results[key] = status;
      } catch (err: any) {
        results[key] = {
          providerKey: key,
          providerName: adapter.providerName,
          category: adapter.sourceCategory,
          state: "BLOCKED",
          accessMethod: adapter.accessMethod,
          authenticated: false,
          verificationEvidence: `Check failed: ${err.message}`,
        };
      }
    });

    await Promise.all(checkPromises);
    return results;
  }

  /**
   * Hermes Reasoning: Analyzes a natural language business objective
   * and derives target parameters, ICP criteria, and optimal source ordering.
   */
  reasonAboutSources(objective: string): {
    targetIndustry: string;
    targetGeography: string;
    targetOfferCategory: string;
    recommendedSources: string[];
    reasoningExplanation: string;
  } {
    const qLower = objective.toLowerCase();

    // 1. Geography extraction
    let targetGeography = "India";
    if (qLower.includes("raipur") && qLower.includes("chhattisgarh")) {
      targetGeography = "Raipur, Chhattisgarh";
    } else if (qLower.includes("raipur")) {
      targetGeography = "Raipur, Chhattisgarh";
    } else if (qLower.includes("bhilai")) {
      targetGeography = "Bhilai, Chhattisgarh";
    } else if (qLower.includes("chhattisgarh")) {
      targetGeography = "Chhattisgarh";
    } else if (qLower.includes("bangalore") || qLower.includes("bengaluru")) {
      targetGeography = "Bangalore, Karnataka";
    } else if (qLower.includes("karnataka")) {
      targetGeography = "Karnataka";
    }

    // 2. Industry / Category & Source Selection reasoning
    if (qLower.includes("solar")) {
      return {
        targetIndustry: "Renewable Energy / Captive Industrial Solar",
        targetGeography,
        targetOfferCategory: "SOLAR",
        recommendedSources: [
          "stratxcel_catalog",
          "google_places",
          "google_search",
          "company_websites",
          "indiamart",
          "justdial",
        ],
        reasoningExplanation:
          "Targeting commercial & industrial solar buyers with high daytime load. Priority sources: Grounded industrial catalog, Google Places/Maps local facilities, and official website verification.",
      };
    }

    if (qLower.includes("school") || qLower.includes("website") || qLower.includes("college") || qLower.includes("education")) {
      return {
        targetIndustry: "Education & Institutional Web Systems",
        targetGeography,
        targetOfferCategory: "INSTITUTIONAL_WEB",
        recommendedSources: [
          "stratxcel_catalog",
          "google_places",
          "google_search",
          "company_websites",
          "justdial",
        ],
        reasoningExplanation:
          "Targeting educational institutions needing digital transformation/websites. Priority sources: Verified education directory, Google Places local schools, and website crawler to inspect current web presence.",
      };
    }

    if (qLower.includes("mbbs") || qLower.includes("admission") || qLower.includes("medical")) {
      return {
        targetIndustry: "Medical Education Consultancy & Admissions",
        targetGeography,
        targetOfferCategory: "ADMISSIONS",
        recommendedSources: [
          "stratxcel_catalog",
          "google_search",
          "company_websites",
          "apollo",
        ],
        reasoningExplanation:
          "Targeting foreign medical admissions channels and NEET consultancy networks. Priority sources: Verified education agencies, Google Search SERP discovery, and website crawler.",
      };
    }

    if (qLower.includes("linkup") || qLower.includes("smb") || qLower.includes("crm") || qLower.includes("saas")) {
      return {
        targetIndustry: "Commercial Retail & Service SMBs",
        targetGeography,
        targetOfferCategory: "LINKUP_SAAS",
        recommendedSources: [
          "stratxcel_catalog",
          "google_places",
          "company_websites",
          "apollo",
          "google_search",
        ],
        reasoningExplanation:
          "Targeting SMBs losing inbound leads without unified WhatsApp CRM. Priority sources: Commercial SMB catalog, Google Places retail businesses, and website contact extraction.",
      };
    }

    // Default B2B commercial mix
    return {
      targetIndustry: "Commercial Enterprises",
      targetGeography,
      targetOfferCategory: "B2B_COMMERCIAL",
      recommendedSources: [
        "stratxcel_catalog",
        "google_places",
        "google_search",
        "company_websites",
      ],
      reasoningExplanation:
        "General B2B commercial objective. Executing multi-source discovery across grounded registry, Google Places, and live website crawler.",
    };
  }

  /**
   * Full Universal Lead Acquisition & Enrichment Pipeline.
   */
  async executeDiscovery(query: LeadDiscoveryQuery): Promise<UniversalDiscoveryExecutionResult> {
    const missionId = randomUUID();
    const tenantId = query.tenantId || "466e6195-a9f6-4576-8271-29fdae61c18a";
    const targetQuantity = query.targetQuantity || 10;
    const minScore = query.minQualificationScore || 40;

    // 1. Market Understanding & Dynamic Source Selection
    const reasoning = this.reasonAboutSources(query.objectiveText);
    const targetIndustry = query.targetIndustry || reasoning.targetIndustry;
    const targetGeography = query.targetGeography || reasoning.targetGeography;
    const targetOfferCategory = query.targetOfferCategory || reasoning.targetOfferCategory;

    // Filter allowed sources by reasoning or query override
    const candidateSources = query.allowedSources || reasoning.recommendedSources;

    // 2. Check Provider Availability
    const providerStatuses = await this.getProviderStatuses();
    const availableSources = candidateSources.filter((s) => {
      const st = providerStatuses[s];
      return st && (st.state === "VERIFIED" || st.state === "PARTIAL");
    });

    const sourcesQueried: string[] = [];
    const sourcesSucceeded: string[] = [];
    const sourcesFailed: string[] = [];

    // In-memory identity resolution map: hash -> CanonicalLead
    const canonicalMap = new Map<string, CanonicalLead>();
    // Fast secondary lookup indexes
    const phoneToHash = new Map<string, string>();
    const domainToHash = new Map<string, string>();

    let rawDiscoveredCount = 0;

    // 3. Multi-Source Discovery with Search Depth Control
    for (const sourceKey of availableSources) {
      // Check if we have gathered enough unique leads
      if (canonicalMap.size >= targetQuantity) {
        break;
      }

      const adapter = this.adapters.get(sourceKey);
      if (!adapter) continue;

      sourcesQueried.push(sourceKey);

      try {
        const remainingNeeded = targetQuantity - canonicalMap.size;
        const rawBatch = await adapter.discoverLeads({
          ...query,
          tenantId,
          targetIndustry,
          targetGeography,
          targetOfferCategory,
          targetQuantity: Math.max(remainingNeeded * 2, 5),
        });

        if (rawBatch.length > 0) {
          sourcesSucceeded.push(sourceKey);
          rawDiscoveredCount += rawBatch.length;

          // Process each discovered lead through identity resolution & deduplication
          for (const raw of rawBatch) {
            this.processDiscoveredLead(raw, canonicalMap, phoneToHash, domainToHash, tenantId);
          }
        }
      } catch (err: any) {
        console.warn(`[UniversalLeadEngine] Error querying ${sourceKey}:`, err.message);
        sourcesFailed.push(sourceKey);
      }
    }

    // 4. Enrichment Pass
    const websiteAdapter = this.adapters.get("company_websites");
    const apolloAdapter = this.adapters.get("apollo");

    for (const lead of canonicalMap.values()) {
      // Enrich via website crawler if website available
      if (websiteAdapter && lead.identity.websiteUrl && websiteAdapter.enrichLead) {
        try {
          const webEnrichment = await websiteAdapter.enrichLead(lead.identity);
          if (webEnrichment) {
            lead.enrichment = {
              ...lead.enrichment,
              ...webEnrichment,
              enrichmentSources: [...new Set([...lead.enrichment.enrichmentSources, "company_websites"])],
            };
          }
        } catch {
          // Best-effort website enrichment
        }
      }

      // Enrich via Apollo if active
      if (
        apolloAdapter &&
        providerStatuses.apollo?.state === "VERIFIED" &&
        lead.identity.canonicalDomain &&
        apolloAdapter.enrichLead
      ) {
        try {
          const apolloEnrichment = await apolloAdapter.enrichLead(lead.identity);
          if (apolloEnrichment) {
            lead.enrichment = {
              ...lead.enrichment,
              ...apolloEnrichment,
              enrichmentSources: [...new Set([...lead.enrichment.enrichmentSources, "apollo"])],
            };
          }
        } catch {
          // Best-effort Apollo enrichment
        }
      }
    }

    // 5. Qualification & Scoring Pass
    const qualifiedLeads: CanonicalLead[] = [];
    for (const lead of canonicalMap.values()) {
      const qualification = evaluateLeadQualification(
        lead.identity,
        lead.provenanceHistory,
        {
          targetIndustry,
          targetGeography,
          targetOfferCategory,
          minScoreThreshold: minScore,
        },
        {
          painPoint: lead.evidenceList.find((e) => e.claim.includes("signal") || e.claim.includes("Sighted"))?.claim,
          decisionMakerRole: lead.enrichment.executiveContacts?.[0]?.designation,
          estimatedDealValueInr: lead.qualification.estimatedDealValueInr,
        }
      );

      lead.qualification = qualification;
      lead.status = qualification.status;

      // 6. Outreach Eligibility Evaluation
      lead.outreachEligibility = evaluateOutreachEligibility(lead);

      qualifiedLeads.push(lead);
    }

    // Sort leads by qualification score descending
    qualifiedLeads.sort((a, b) => b.qualification.qualificationScore - a.qualification.qualificationScore);

    // 7. CRM Persistence (Preserves tenant isolation)
    let persistedCount = 0;
    if (this.supabase) {
      persistedCount = await this.persistLeadsToCrm(qualifiedLeads, tenantId, missionId);
    }

    // 8. Overlap Analysis
    let singleSourceLeads = 0;
    let multiSourceLeads = 0;
    const sourceOverlapCounts: Record<string, number> = {};

    for (const lead of qualifiedLeads) {
      if (lead.provenanceHistory.length > 1) {
        multiSourceLeads++;
      } else {
        singleSourceLeads++;
      }
      for (const prov of lead.provenanceHistory) {
        sourceOverlapCounts[prov.sourceKey] = (sourceOverlapCounts[prov.sourceKey] || 0) + 1;
      }
    }

    const topOverlappingSources = Object.entries(sourceOverlapCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([k, count]) => `${k} (${count})`);

    const executionSummary = `Universal Discovery Pipeline completed for objective "${query.objectiveText}". Sourced ${rawDiscoveredCount} raw records across ${sourcesSucceeded.length} active providers (${sourcesSucceeded.join(", ")}). Deterministically resolved into ${canonicalMap.size} unique canonical entities (${multiSourceLeads} multi-source deduplicated). ${qualifiedLeads.filter((l) => l.qualification.qualificationScore >= minScore).length} passed qualification threshold (${minScore}+). Persisted ${persistedCount} records into Supabase CRM under tenant ${tenantId}.`;

    return {
      missionId,
      tenantId,
      objective: query.objectiveText,
      targetQuantity,
      sourcesQueried,
      sourcesSucceeded,
      sourcesFailed,
      rawDiscoveredCount,
      deduplicatedCount: canonicalMap.size,
      verifiedCount: qualifiedLeads.filter((l) => l.qualification.status === "VERIFIED" || l.qualification.status === "QUALIFIED").length,
      qualifiedCount: qualifiedLeads.filter((l) => l.qualification.qualificationScore >= minScore).length,
      persistedCount,
      leads: qualifiedLeads.slice(0, targetQuantity),
      providerStatuses,
      executionSummary,
      overlapAnalysis: {
        singleSourceLeads,
        multiSourceLeads,
        topOverlappingSources,
      },
    };
  }

  /**
   * Deterministic Deduplication & Identity Merging.
   */
  private processDiscoveredLead(
    raw: RawDiscoveredLead,
    canonicalMap: Map<string, CanonicalLead>,
    phoneToHash: Map<string, string>,
    domainToHash: Map<string, string>,
    tenantId: string
  ): void {
    const rawDomain = canonicalizeDomain(raw.website);
    const rawPhone = normalizePhone(raw.phone);
    const rawHash = generateIdentityHash({
      companyName: raw.companyName,
      websiteUrl: raw.website,
      phone: raw.phone,
      city: raw.city,
    });

    // Determine if existing match exists in current batch
    let existingHash: string | undefined = undefined;
    if (canonicalMap.has(rawHash)) {
      existingHash = rawHash;
    } else if (rawDomain && domainToHash.has(rawDomain)) {
      existingHash = domainToHash.get(rawDomain);
    } else if (rawPhone && phoneToHash.has(rawPhone)) {
      existingHash = phoneToHash.get(rawPhone);
    }

    const nowIso = new Date().toISOString();

    if (existingHash && canonicalMap.has(existingHash)) {
      // Existing lead match found: Merge identity with Data Priority
      const existing = canonicalMap.get(existingHash)!;
      const mergedWithProvenance = mergeLeadIdentity(existing, raw);
      const mergedPriority = mergeWithDataPriority(mergedWithProvenance, {
        sourceKey: raw.sourceKey,
        companyName: raw.companyName,
        websiteUrl: raw.website,
        phone: raw.phone,
        email: raw.email,
        address: raw.address,
        city: raw.city,
        stateOrRegion: raw.stateOrRegion,
      });

      canonicalMap.set(existingHash, mergedPriority);

      // Update secondary lookup indexes
      if (rawPhone) phoneToHash.set(rawPhone, existingHash);
      if (rawDomain) domainToHash.set(rawDomain, existingHash);
    } else {
      // New distinct canonical lead
      const identity = buildLeadIdentity(raw);
      const leadId = randomUUID();

      const initialProvenance: LeadSourceProvenance = {
        sourceKey: raw.sourceKey,
        sourceName: raw.sourceName,
        sourceUrl: raw.sourceUrl,
        discoveredAt: nowIso,
        verificationMethod: raw.sourceKey.includes("catalog")
          ? "grounded_catalog"
          : raw.sourceKey.includes("google")
          ? "direct_api"
          : "html_scrape",
        confidence: raw.confidence || "HIGH",
        confidenceScore: raw.confidence === "VERIFIED" ? 1.0 : 0.85,
        deduplicationHash: identity.deduplicationHash,
        extractedFields: Object.keys(raw).filter((k) => raw[k as keyof RawDiscoveredLead] !== undefined),
        rawSnippet: raw.painPointOrSignal,
      };

      const newCanonicalLead: CanonicalLead = {
        id: leadId,
        tenantId,
        identity,
        provenanceHistory: [initialProvenance],
        evidenceList: [
          {
            id: randomUUID().slice(0, 8),
            claim: `Initial discovery on ${raw.sourceName} (${raw.companyName})`,
            field: "companyName",
            value: raw.companyName,
            sourceKey: raw.sourceKey,
            sourceUrl: raw.sourceUrl,
            confidence: raw.confidence || "HIGH",
            recordedAt: nowIso,
          },
        ],
        enrichment: {
          lastEnrichedAt: nowIso,
          enrichmentSources: [raw.sourceKey],
          ratingsScore: raw.rating,
          reviewCount: raw.reviewCount,
          executiveContacts: raw.contactPersonName
            ? [
                {
                  name: raw.contactPersonName,
                  designation: raw.decisionMakerRole || "Authorized Contact",
                  email: raw.email,
                  phone: raw.phone,
                  isPrimaryDecisionMaker: true,
                },
              ]
            : undefined,
        },
        qualification: {
          qualificationScore: 50,
          icpFitTier: "TIER_2_GROWTH",
          status: "DISCOVERED",
          signals: {
            geographyMatch: true,
            industryFit: true,
            scaleMatch: false,
            needOrProblemDetected: Boolean(raw.painPointOrSignal),
            decisionMakerIdentified: Boolean(raw.contactPersonName),
            contactabilityReady: Boolean(raw.phone || raw.email),
          },
          scoringBreakdown: [],
          summaryRationale: "Initial discovery staged for enrichment.",
          estimatedDealValueInr: 250000,
        },
        outreachEligibility: {
          isEligible: false,
          preferredChannel: raw.phone ? "whatsapp" : "email",
          consentState: "CONSENT_REQUIRED",
          whatsappOptInReady: false,
          reason: "Pending final qualification.",
        },
        status: "DISCOVERED",
        source: "hermes_research",
        createdAt: nowIso,
        updatedAt: nowIso,
        lastVerifiedAt: nowIso,
      };

      canonicalMap.set(rawHash, newCanonicalLead);
      if (identity.normalizedPhone) phoneToHash.set(identity.normalizedPhone, rawHash);
      if (identity.canonicalDomain) domainToHash.set(identity.canonicalDomain, rawHash);
    }
  }

  /**
   * Persists canonical leads and audit events into Supabase CRM.
   */
  private async persistLeadsToCrm(
    leads: CanonicalLead[],
    tenantId: string,
    missionId: string
  ): Promise<number> {
    if (!this.supabase) return 0;

    let persisted = 0;
    for (const lead of leads) {
      try {
        const payloadMetadata = {
          identityHash: lead.identity.deduplicationHash,
          companyName: lead.identity.companyName,
          canonicalDomain: lead.identity.canonicalDomain,
          facilityAddress: lead.identity.facilityAddress,
          city: lead.identity.city,
          stateOrRegion: lead.identity.stateOrRegion,
          provenanceHistory: lead.provenanceHistory,
          evidenceList: lead.evidenceList,
          enrichment: lead.enrichment,
          qualification: lead.qualification,
          outreachEligibility: lead.outreachEligibility,
          missionId,
        };

        // Check if lead already exists in CRM by phone
        let existingId: string | null = null;
        if (lead.identity.normalizedPhone) {
          const { data: existing } = await this.supabase
            .from("crm_leads")
            .select("id, metadata")
            .eq("tenant_id", tenantId)
            .eq("normalized_phone", lead.identity.normalizedPhone)
            .maybeSingle();

          if (existing) {
            existingId = existing.id;
          }
        }

        const dbStatus = lead.qualification.qualificationScore >= 50 ? "QUALIFIED" : "NEW";

        if (existingId) {
          // Update existing lead in CRM with enriched provenance
          await this.supabase
            .from("crm_leads")
            .update({
              contact_name: lead.enrichment.executiveContacts?.[0]?.name || lead.identity.companyName,
              contact_email: lead.identity.primaryEmail,
              status: dbStatus,
              metadata: payloadMetadata,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingId)
            .eq("tenant_id", tenantId);

          // Record lead update event in audit_events
          await this.supabase.from("audit_events").insert({
            tenant_id: tenantId,
            actor_kind: "agent",
            action: "crm.lead_multi_source_enrichment",
            target_type: "crm_lead",
            target_id: existingId,
            metadata: {
              provenanceCount: lead.provenanceHistory.length,
              sources: lead.provenanceHistory.map((p) => p.sourceKey),
              score: lead.qualification.qualificationScore,
              missionId,
            },
          });

          persisted++;
        } else {
          // Insert new canonical lead into CRM
          const { data: inserted, error: insertErr } = await this.supabase
            .from("crm_leads")
            .insert({
              id: lead.id,
              tenant_id: tenantId,
              source: "import",
              status: dbStatus,
              contact_name: lead.enrichment.executiveContacts?.[0]?.name || lead.identity.companyName,
              contact_phone: lead.identity.primaryPhone,
              contact_email: lead.identity.primaryEmail,
              normalized_phone: lead.identity.normalizedPhone,
              metadata: payloadMetadata,
            })
            .select("id")
            .single();

          if (!insertErr && inserted) {
            await this.supabase.from("audit_events").insert({
              tenant_id: tenantId,
              actor_kind: "agent",
              action: "crm.lead_discovered_and_qualified",
              target_type: "crm_lead",
              target_id: inserted.id,
              metadata: {
                companyName: lead.identity.companyName,
                provenanceCount: lead.provenanceHistory.length,
                sources: lead.provenanceHistory.map((p) => p.sourceKey),
                score: lead.qualification.qualificationScore,
                missionId,
              },
            });
            persisted++;
          }
        }
      } catch (dbErr) {
        console.warn("[UniversalLeadEngine] CRM persistence error:", dbErr);
      }
    }

    return persisted;
  }
}

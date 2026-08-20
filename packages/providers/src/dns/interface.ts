/**
 * DNS Provider Interface & Mock Adapter
 */

import type { CapabilityHealthResult } from "../config/health.ts";

export interface DNSRecord {
  id?: string;
  type: "A" | "AAAA" | "CNAME" | "TXT" | "MX";
  name: string;
  value: string;
  ttl?: number;
  proxied?: boolean;
}

export interface SetRecordInput {
  domain: string;
  record: DNSRecord;
}

export interface DNSProvider {
  name: string;
  getRecords: (domain: string) => Promise<DNSRecord[]>;
  setRecord: (input: SetRecordInput) => Promise<{ success: boolean; recordId: string }>;
  healthCheck: () => Promise<CapabilityHealthResult>;
}

export class MockDNSProvider implements DNSProvider {
  public name = "mock_dns";
  private records: Map<string, DNSRecord[]> = new Map();

  public async getRecords(domain: string): Promise<DNSRecord[]> {
    return this.records.get(domain) || [
      { type: "A", name: "@", value: "76.76.21.21", ttl: 300 },
      { type: "CNAME", name: "www", value: "cname.vercel-dns.com", ttl: 300 },
    ];
  }

  public async setRecord(input: SetRecordInput): Promise<{ success: boolean; recordId: string }> {
    const list = this.records.get(input.domain) || [];
    const recordId = `rec_${Date.now()}`;
    list.push({ ...input.record, id: recordId });
    this.records.set(input.domain, list);
    return { success: true, recordId };
  }

  public async healthCheck(): Promise<CapabilityHealthResult> {
    return {
      capability: "dns",
      provider: this.name,
      status: "READY",
      isReady: true,
      lastCheckedAt: new Date().toISOString(),
    };
  }
}

export const mockDNSProvider = new MockDNSProvider();

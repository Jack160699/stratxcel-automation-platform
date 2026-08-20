/**
 * Comprehensive Automated Tests for Customer-Owned Domain Connection System
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  normalizeDomainInput,
  generateDnsInstructions,
  inspectDomainDns,
  verifyDomainDns,
  CustomerDomainManager,
  REGISTRAR_GUIDANCE_MAP,
} from "../domains/index.ts";

describe("Customer-Owned Domain Connection System", () => {
  describe("1. Domain Input Validation & Normalization", () => {
    it("normalizes clean apex domain", () => {
      const res = normalizeDomainInput("mybrand.com");
      assert.equal(res.valid, true);
      assert.equal(res.normalized, "mybrand.com");
      assert.equal(res.isApex, true);
      assert.equal(res.apexDomain, "mybrand.com");
    });

    it("normalizes www subdomain", () => {
      const res = normalizeDomainInput("www.mybrand.com");
      assert.equal(res.valid, true);
      assert.equal(res.normalized, "www.mybrand.com");
      assert.equal(res.isApex, false);
      assert.equal(res.apexDomain, "mybrand.com");
    });

    it("normalizes ccTLD second level domains like .co.in", () => {
      const res = normalizeDomainInput("aurafashion.co.in");
      assert.equal(res.valid, true);
      assert.equal(res.normalized, "aurafashion.co.in");
      assert.equal(res.isApex, true);
      assert.equal(res.apexDomain, "aurafashion.co.in");
    });

    it("strips https scheme and uppercase letters safely", () => {
      const res = normalizeDomainInput("https://MyBrand.IN/");
      assert.equal(res.valid, true);
      assert.equal(res.normalized, "mybrand.in");
      assert.equal(res.isApex, true);
    });

    it("rejects URLs with subpaths", () => {
      const res = normalizeDomainInput("mybrand.com/products/tshirts");
      assert.equal(res.valid, false);
      assert.match(res.error || "", /without slashes or subpages/i);
    });

    it("rejects URLs with query strings or hash fragments", () => {
      const res = normalizeDomainInput("mybrand.com?ref=stratxcel");
      assert.equal(res.valid, false);
      assert.match(res.error || "", /invalid characters/i);
    });

    it("rejects port numbers", () => {
      const res = normalizeDomainInput("http://mybrand.com:8080");
      assert.equal(res.valid, false);
      assert.match(res.error || "", /ports/i);
    });

    it("rejects IPv4, IPv6, loopback, and cloud metadata SSRF addresses", () => {
      const ipList = [
        "127.0.0.1",
        "169.254.169.254",
        "192.168.1.1",
        "10.0.0.1",
        "::1",
        "0.0.0.0",
      ];
      for (const ip of ipList) {
        const res = normalizeDomainInput(ip);
        assert.equal(res.valid, false, `Expected IP ${ip} to be rejected`);
      }
    });

    it("rejects localhost and internal test hostnames", () => {
      const hostnames = ["localhost", "local", "app.local", "server.internal", "dev.lan", "test.test"];
      for (const h of hostnames) {
        const res = normalizeDomainInput(h);
        assert.equal(res.valid, false, `Expected internal host ${h} to be rejected`);
      }
    });

    it("rejects invalid labels with leading/trailing hyphens and empty labels", () => {
      assert.equal(normalizeDomainInput("-brand.com").valid, false);
      assert.equal(normalizeDomainInput("brand-.com").valid, false);
      assert.equal(normalizeDomainInput("brand..com").valid, false);
      assert.equal(normalizeDomainInput("").valid, false);
      assert.equal(normalizeDomainInput("com").valid, false);
      assert.equal(normalizeDomainInput("brand.123").valid, false);
    });
  });

  describe("2. DNS Instructions Generator & Registrar Guidance", () => {
    it("generates apex A record and www CNAME for apex domain", () => {
      const instructions = generateDnsInstructions({
        domain: "aurafashion.com",
        provider: "godaddy",
        aRecordIp: "76.76.21.21",
        cnameTarget: "cname.vercel-dns.com",
      });

      assert.equal(instructions.domain, "aurafashion.com");
      assert.equal(instructions.isApex, true);
      assert.equal(instructions.records.length, 2);

      const aRec = instructions.records.find((r) => r.type === "A");
      assert.ok(aRec);
      assert.equal(aRec?.host, "@");
      assert.equal(aRec?.value, "76.76.21.21");

      const cnameRec = instructions.records.find((r) => r.type === "CNAME");
      assert.ok(cnameRec);
      assert.equal(cnameRec?.host, "www");
      assert.equal(cnameRec?.value, "cname.vercel-dns.com");

      assert.equal(instructions.provider, "godaddy");
      assert.ok(instructions.steps.length > 0);
      assert.ok(instructions.quickCopyItems.some((q) => q.value === "76.76.21.21"));
    });

    it("generates CNAME record for custom subdomain", () => {
      const instructions = generateDnsInstructions({
        domain: "shop.aurafashion.com",
        provider: "namecheap",
      });

      assert.equal(instructions.isApex, false);
      assert.equal(instructions.records.length, 1);
      assert.equal(instructions.records[0].type, "CNAME");
      assert.equal(instructions.records[0].host, "shop");
      assert.equal(instructions.records[0].value, "cname.vercel-dns.com");
    });

    it("provides step-by-step guidance for all supported registrars", () => {
      const registrars = ["godaddy", "namecheap", "hostinger", "cloudflare", "bigrock", "squarespace", "other"] as const;
      for (const reg of registrars) {
        const guidance = REGISTRAR_GUIDANCE_MAP[reg];
        assert.ok(guidance, `Missing guidance for ${reg}`);
        assert.ok(guidance.steps.length >= 4, `Guidance for ${reg} must have at least 4 clear steps`);
      }
    });
  });

  describe("3. DNS Inspection & Verification Engine", () => {
    it("inspects mock DNS records safely without modifying anything", async () => {
      const mockResolver = {
        resolve4: async () => ["76.76.21.21"],
        resolveCname: async () => ["cname.vercel-dns.com"],
        resolve6: async () => [],
        resolveNs: async () => ["ns1.godaddy.com", "ns2.godaddy.com"],
      };

      const inspection = await inspectDomainDns({
        domain: "aurafashion.com",
        dnsResolver: mockResolver,
      });

      assert.equal(inspection.domain, "aurafashion.com");
      assert.equal(inspection.detected, true);
      assert.deepEqual(inspection.currentA, ["76.76.21.21"]);
      assert.deepEqual(inspection.currentCNAME, ["cname.vercel-dns.com"]);
    });

    it("verifies matching DNS records successfully", async () => {
      const instructions = generateDnsInstructions({ domain: "aurafashion.com" });
      const mockResolver = {
        resolve4: async () => ["76.76.21.21"],
        resolveCname: async () => ["cname.vercel-dns.com"],
      };

      const result = await verifyDomainDns({
        domain: "aurafashion.com",
        expectedInstructions: instructions,
        dnsResolver: mockResolver,
      });

      assert.equal(result.status, "SUCCESS");
      assert.equal(result.sslReady, true);
      assert.match(result.friendlyMessage, /Domain connected successfully/i);
    });

    it("returns friendly pending message during DNS propagation", async () => {
      const instructions = generateDnsInstructions({ domain: "newbrand.com" });
      const mockResolver = {
        resolve4: async () => [],
        resolveCname: async () => [],
      };

      const result = await verifyDomainDns({
        domain: "newbrand.com",
        expectedInstructions: instructions,
        dnsResolver: mockResolver,
      });

      assert.equal(result.status, "PENDING");
      assert.equal(result.sslReady, false);
      assert.match(result.friendlyMessage, /propagating/i);
    });

    it("returns friendly explanation when A record is missing or points to wrong IP", async () => {
      const instructions = generateDnsInstructions({ domain: "oldserver.com" });
      const mockResolver = {
        resolve4: async () => ["1.2.3.4"], // Wrong IP
        resolveCname: async () => [],
      };

      const result = await verifyDomainDns({
        domain: "oldserver.com",
        expectedInstructions: instructions,
        dnsResolver: mockResolver,
      });

      assert.equal(result.status, "INCORRECT");
      assert.equal(result.sslReady, false);
      assert.match(result.friendlyMessage, /old server IP address/i);
    });
  });

  describe("4. Customer Domain Lifecycle Manager & Tenant Isolation", () => {
    const manager = new CustomerDomainManager();

    it("connects a customer-owned domain in DNS_CONFIG_REQUIRED status", async () => {
      manager.reset();
      const conn = await manager.connectDomain({
        tenantId: "tenant_alpha",
        siteProjectId: "proj_123",
        domain: "aurafashion.com",
        preferredRegistrar: "godaddy",
      });

      assert.ok(conn.id);
      assert.equal(conn.tenantId, "tenant_alpha");
      assert.equal(conn.siteProjectId, "proj_123");
      assert.equal(conn.normalizedDomain, "aurafashion.com");
      assert.equal(conn.status, "DNS_CONFIG_REQUIRED");
      assert.equal(conn.isPrimary, true);
    });

    it("verifies domain and transitions status with simulated DNS", async () => {
      manager.reset();
      const conn = await manager.connectDomain({
        tenantId: "tenant_alpha",
        siteProjectId: "proj_123",
        domain: "aurafashion.com",
      });

      const mockResolver = {
        resolve4: async () => ["76.76.21.21"],
        resolveCname: async () => ["cname.vercel-dns.com"],
      };

      const verified = await manager.verifyDomain({
        tenantId: "tenant_alpha",
        siteProjectId: "proj_123",
        domainId: conn.id,
        dnsResolver: mockResolver,
      });

      // Status should transition to VERIFIED or ACTIVE depending on Vercel auth token in env
      assert.ok(["VERIFIED", "SSL_PENDING", "ACTIVE"].includes(verified.status));
      assert.equal(verified.lastVerification?.status, "SUCCESS");
    });

    it("enforces tenant boundary — prevents Tenant B from verifying Tenant A domain", async () => {
      manager.reset();
      const conn = await manager.connectDomain({
        tenantId: "tenant_alpha",
        siteProjectId: "proj_123",
        domain: "aurafashion.com",
      });

      await assert.rejects(
        async () => {
          await manager.verifyDomain({
            tenantId: "tenant_beta", // Unauthorized tenant
            siteProjectId: "proj_123",
            domainId: conn.id,
          });
        },
        /Unauthorized/i
      );
    });

    it("disconnects domain safely without destroying site project", async () => {
      manager.reset();
      const conn = await manager.connectDomain({
        tenantId: "tenant_alpha",
        siteProjectId: "proj_123",
        domain: "aurafashion.com",
      });

      const disconnected = manager.disconnectDomain({
        tenantId: "tenant_alpha",
        siteProjectId: "proj_123",
        domainId: conn.id,
      });

      assert.equal(disconnected.status, "DISCONNECTED");
      assert.equal(disconnected.isPrimary, false);

      const remaining = manager.getProjectDomains("tenant_alpha", "proj_123");
      assert.equal(remaining.length, 0);
    });
  });
});

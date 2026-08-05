import assert from "node:assert/strict";
import {
  generate5PageSite,
  requestSiteRevision,
  approveAndPublishSite,
  checkSiteExportEligibility,
} from "../site-builder.ts";
import { SandboxDomainRegistrar } from "../registrar/sandbox.ts";
import { attachDomainToVercel } from "../vercel-domains.ts";

async function runWebsitesAndDomainsTests() {
  // 1. Controlled 5-page site generator
  const site = generate5PageSite({
    tenantId: "tenant_test_1",
    businessName: "Acme Dental Care",
    contactEmail: "info@acmedental.com",
  });

  assert.equal(site.pages.length, 5, "Site generator MUST output exactly 5 pages");
  assert.equal(site.pages[0].title, "Home");
  assert.equal(site.pages[1].title, "Services");
  assert.equal(site.pages[2].title, "About Us");
  assert.equal(site.pages[3].title, "Client Reviews");
  assert.equal(site.pages[4].title, "Contact Us");
  assert.equal(site.previewSubdomain, "acme-dental-care.stratxcel.site");

  // 2. Controlled 1-revision cycle enforcement
  const rev1 = requestSiteRevision(site, "Change primary header color to navy blue");
  assert.equal(rev1.status, "in_revision");
  assert.equal(rev1.revisionCount, 1);

  assert.throws(
    () => requestSiteRevision(rev1, "Second revision attempt"),
    (err: Error) => err.message.includes("1 revision cycle")
  );

  // 3. Approval and publish pipeline
  const published = approveAndPublishSite(rev1, "acmedental.com");
  assert.equal(published.status, "published");
  assert.equal(published.customDomain, "acmedental.com");

  // 4. Export unlock policy (requires 3 paid subscription months)
  assert.equal(checkSiteExportEligibility(0), false);
  assert.equal(checkSiteExportEligibility(2), false);
  assert.equal(checkSiteExportEligibility(3), true);
  assert.equal(checkSiteExportEligibility(6), true);

  // 5. Provider-neutral registrar & legal client ownership validation
  const registrar = new SandboxDomainRegistrar();
  const searchRes = await registrar.searchDomain("acmedental.com");
  assert.equal(searchRes.available, true);

  const regRes = await registrar.registerDomain({
    domainName: "acmedental.com",
    tenantId: "tenant_test_1",
    registrant: {
      name: "Dr. John Doe",
      email: "john@acmedental.com",
      phone: "+919876543210",
      country: "IN",
    },
  });

  assert.equal(regRes.success, true);
  assert.equal(regRes.status, "active");
  assert.equal(regRes.dnsRecords.length, 2);

  // Reject registration without legal client details
  await assert.rejects(
    () => registrar.registerDomain({ domainName: "test.com", tenantId: "t1", registrant: { name: "", email: "", phone: "", country: "IN" } }),
    (err: Error) => err.message.includes("Client legal registrant details")
  );

  // 6. Vercel domain attachment check
  const vercelRes = await attachDomainToVercel("acmedental.com");
  assert.equal(vercelRes.domain, "acmedental.com");
  assert.equal(vercelRes.verified, true);

  console.log("@stratxcel/websites-and-domains tests: ALL PASS");
}

runWebsitesAndDomainsTests();

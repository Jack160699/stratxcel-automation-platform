/**
 * Regression suite for a P1 finding from live E2E testing on 2026-08-23
 * (Website Factory pass): every one of page-planner.ts's website templates
 * that included a "testimonials" section fabricated a named reviewer and an
 * invented quote, with no real review data behind any of it -- for a
 * website about to be published live as the customer's own storefront.
 * Confirmed live on the real Stratxcel tenant's own generated
 * BUSINESS_WEBSITE site ("Elena Rostova — Director"). The SERVICE_BUSINESS
 * case was worse still: its quote hardcoded "Stratxcel" (the platform
 * itself, not `${brandName}`, unlike every other heading/subheading in this
 * file) thanking itself via a fake company ("David Chen — CEO, NexaTech")
 * -- nonsensical on every real customer's generated site regardless of
 * their actual business.
 *
 * Fix: no template in this file generates a "testimonials" section at all.
 * The mission rule is "real verified data, clearly marked placeholder, or
 * nothing" -- there is no real review data at generation time, so nothing
 * is what these templates now produce.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { planPageArchitecture } from "../generation/page-planner.ts";
import type { WebsiteType } from "../specification/schema.ts";

const ALL_WEBSITE_TYPES: WebsiteType[] = ["ECOMMERCE", "SERVICE_BUSINESS", "LANDING_PAGE", "BUSINESS_WEBSITE", "AI_BUSINESS"];

describe("No fabricated testimonials in any generated website template", () => {
  for (const websiteType of ALL_WEBSITE_TYPES) {
    it(`${websiteType} template never generates a testimonials section`, () => {
      const pages = planPageArchitecture(websiteType, { businessName: "Test Business" });
      for (const page of pages) {
        for (const section of page.sections) {
          assert.notEqual(
            section.type,
            "testimonials",
            `${websiteType}'s "${page.title}" page must not include a fabricated testimonials section`
          );
        }
      }
    });
  }

  it("no fabricated reviewer names or invented quotes survive anywhere in this file's output", () => {
    const knownFabrications = [
      "Elena Rostova",
      "David Chen",
      "NexaTech",
      "Sophia R.",
      "Marcus V.",
      "Loved by Over 50,000 Customers",
    ];
    for (const websiteType of ALL_WEBSITE_TYPES) {
      const pages = planPageArchitecture(websiteType, { businessName: "Test Business" });
      const serialized = JSON.stringify(pages);
      for (const fabrication of knownFabrications) {
        assert.ok(
          !serialized.includes(fabrication),
          `${websiteType} output must not contain the fabricated "${fabrication}"`
        );
      }
    }
  });

  it("SERVICE_BUSINESS template never hardcodes the word Stratxcel in place of the customer's real business name", () => {
    // The specific bug this regresses: a hardcoded "Stratxcel helped us..."
    // testimonial appeared on every customer's site regardless of their
    // actual business, because it used the literal string instead of
    // ${brandName} like every other heading in this file correctly does.
    const pages = planPageArchitecture("SERVICE_BUSINESS", { businessName: "Acme Consulting" });
    const serialized = JSON.stringify(pages);
    assert.ok(!serialized.includes("Stratxcel"), "a customer's generated website must never hardcode the platform's own name as if it were their business or a client testimonial about them");
  });
});
